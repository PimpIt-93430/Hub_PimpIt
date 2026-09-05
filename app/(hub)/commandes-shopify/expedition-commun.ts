// Partagé entre PanneauExpedition.tsx (une commande) et PanneauImpressionMasse.tsx (plusieurs
// d'un coup) — même forme d'adresse expéditeur/destinataire, même valeur par défaut, même clé de
// stockage pour que l'adresse expéditeur saisie une fois serve aux deux écrans.
//
// Cf. discussion 2026-08-29 : migration Boxtal → Sendcloud — meilleureOffre() est devenue async
// (interroge listerOptionsExpedition en direct, plus de grille tarifaire statique locale) ; les
// deux appelants (CommandesShopifyClient.tsx pour la liste, PanneauImpressionMasse.tsx pour le
// lot) gèrent ça avec un cache en mémoire (cf. cacheOffres ci-dessous) pour ne pas refaire un appel
// réseau par commande à chaque rendu.
import type { AdresseLaPoste } from '@/lib/laposte';
import type { OptionExpedition, SendcloudAddress } from '@/lib/sendcloud';
import { trouverRegle, type RegleLivraison } from '@/lib/regles-livraison';
import type { AdresseLivraison, CommandeShopify } from '@/lib/shopify';
import { chargerOptionsExpedition } from './actions';

export const CLE_EXPEDITEUR = 'expedition-sendcloud:expediteur';

/** Chrome (et les autres navigateurs) bloquent la navigation directe vers une URL `data:` cliquée
 * en `target="_blank"` (restriction de sécurité) — la page reste blanche sans erreur visible. Il
 * faut convertir en `blob:` (créé côté client) pour que "Ouvrir l'étiquette" fonctionne vraiment —
 * utile pour La Poste (PDF renvoyé en base64, pas d'URL toute faite comme Sendcloud). */
export interface ResultatFusionPdfs {
  /** null si aucune étiquette n'a pu être récupérée (toutes en échec). */
  url: string | null;
  pagesFusionnees: number;
  echecs: number;
}

/** Fusionne plusieurs PDF (une URL par étiquette) en un seul, ouvrable via un unique lien <a> — cf.
 * PanneauImpressionMasse (juste après création) et PanneauHistoriqueEtiquettes (réimpression a
 * posteriori) : window.open() en boucle se heurte au bloqueur de popups du navigateur (un seul
 * appel autorisé par clic), remplacé par une fusion pdf-lib + un lien unique.
 *
 * Chaque étiquette est récupérée indépendamment (cf. incident 2026-09-05 : une commande
 * Sendcloud fraîchement créée peut renvoyer une erreur transitoire — label pas encore généré côté
 * transporteur — le temps que le navigateur la redemande juste après création ; le proxy
 * /api/etiquette-sendcloud répond alors en JSON d'erreur, pas en PDF). Avant, une seule étiquette
 * en échec faisait échouer `PDFDocument.load` et donc TOUTE la fusion, perdant même les étiquettes
 * déjà récupérées avec succès. Désormais une étiquette en échec est simplement ignorée (comptée
 * dans `echecs`) et la fusion continue avec le reste — cf. retour utilisateur du 2026-09-05 : "il
 * faut que quand c'est comme ça ça fusionne tout celles qui n'ont pas eu d'échec". */
export async function fusionnerPdfs(urls: string[]): Promise<ResultatFusionPdfs> {
  const { PDFDocument } = await import('pdf-lib');
  const fusion = await PDFDocument.create();
  let echecs = 0;
  for (const url of urls) {
    try {
      const reponse = await fetch(url);
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const octets = await reponse.arrayBuffer();
      const doc = await PDFDocument.load(octets);
      const pages = await fusion.copyPages(doc, doc.getPageIndices());
      for (const p of pages) fusion.addPage(p);
    } catch (e) {
      echecs++;
      console.warn(`Fusion PDF : étiquette ignorée (${url}) —`, e instanceof Error ? e.message : e);
    }
  }
  if (fusion.getPageCount() === 0) return { url: null, pagesFusionnees: 0, echecs };
  const octetsFusion = await fusion.save();
  const url = URL.createObjectURL(new Blob([octetsFusion.buffer as ArrayBuffer], { type: 'application/pdf' }));
  return { url, pagesFusionnees: fusion.getPageCount(), echecs };
}

export function base64VersBlobUrl(base64: string, type: string): string {
  const octets = atob(base64);
  const tableau = new Uint8Array(octets.length);
  for (let i = 0; i < octets.length; i++) tableau[i] = octets.charCodeAt(i);
  return URL.createObjectURL(new Blob([tableau], { type }));
}

// Bijoux fantaisie — description de contenu par défaut (Sendcloud ne demande pas de catégorie
// figée comme Boxtal, juste une description libre par article si besoin de douane).
export const DESCRIPTION_CONTENU_PAR_DEFAUT = 'Bijoux fantaisie';

// Poids/dimensions par défaut faute de mieux avant pesée réelle (cf. discussion 2026-08-28) — un
// petit colis de pin's. Modifiable au cas par cas dans PanneauExpedition.tsx.
export const POIDS_PAR_DEFAUT_KG = 0.2;
export const DIMENSIONS_PAR_DEFAUT = { longueur: 20, largeur: 15, hauteur: 5 };

export interface Expediteur {
  entreprise: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  adresse1: string;
  ville: string;
  codePostal: string;
  paysCode: string;
}

export const EXPEDITEUR_VIDE: Expediteur = {
  entreprise: 'Pimp It Store',
  prenom: '',
  nom: '',
  email: 'team@pimpitstore.com',
  telephone: '',
  adresse1: '3 rue des Carrières',
  ville: 'Epinay-sur-Seine',
  codePostal: '93800',
  paysCode: 'FR',
};

export function chargerExpediteur(): Expediteur {
  try {
    const sauvegarde = localStorage.getItem(CLE_EXPEDITEUR);
    return sauvegarde ? (JSON.parse(sauvegarde) as Expediteur) : EXPEDITEUR_VIDE;
  } catch {
    return EXPEDITEUR_VIDE;
  }
}

export function adresseLivraisonVersDestinataire(a: AdresseLivraison | null, email: string | null): Expediteur {
  return {
    entreprise: a?.entreprise ?? '',
    prenom: a?.prenom ?? '',
    nom: a?.nom ?? '',
    email: email ?? '',
    telephone: a?.telephone ?? '',
    adresse1: [a?.adresse1, a?.adresse2].filter(Boolean).join(' '),
    ville: a?.ville ?? '',
    codePostal: a?.codePostal ?? '',
    paysCode: a?.paysCode ?? 'FR',
  };
}

export function versSendcloudAddress(e: Expediteur): SendcloudAddress {
  return {
    name: [e.prenom, e.nom].filter(Boolean).join(' ') || e.entreprise || '—',
    companyName: e.entreprise || undefined,
    addressLine1: e.adresse1,
    postalCode: e.codePostal,
    city: e.ville,
    countryIsoCode: e.paysCode,
    email: e.email || undefined,
    phone: e.telephone || undefined,
  };
}

export function versAdresseLaPoste(e: Expediteur): AdresseLaPoste {
  return {
    nom: [e.prenom, e.nom].filter(Boolean).join(' ') || e.entreprise || '—',
    adresse: e.adresse1,
    complement: e.entreprise && (e.prenom || e.nom) ? e.entreprise : undefined,
    ville: e.ville,
    codePostal: e.codePostal,
    paysCode: e.paysCode,
    email: e.email,
    telephone: e.telephone,
  };
}

/** Adresse destinataire minimalement exploitable — rue, ville et code postal renseignés. Les
 * commandes sans ça (adresse Shopify incomplète) ne doivent pas être proposées en création
 * automatique. */
export function destinataireExploitable(d: Expediteur): boolean {
  return Boolean(d.adresse1 && d.ville && d.codePostal && d.paysCode);
}

/** true si le prix n'a pas pu être calculé (ex. code de règle qui ne correspond plus à aucune
 * offre Sendcloud disponible) — cf. prixInconnu Boxtal, même rôle mais désormais plus rare : la
 * plupart du temps le prix est en direct via listerOptionsExpedition. */
export function prixInconnu(offre: OptionExpedition): boolean {
  return offre.prix === null;
}

/** Cache mémoire des appels listerOptionsExpedition, clé = règle+poids+pays — évite de refaire un
 * appel réseau identique pour chaque commande de la liste/du lot qui partage ces paramètres (cf.
 * discussion 2026-08-29 : plus de grille tarifaire statique locale, donc chaque estimation
 * nécessite un vrai appel API). Vidé au rechargement de page — pas persistant, pas un problème vu
 * la volatilité normale des prix. */
const cacheOffres = new Map<string, Promise<OptionExpedition[]>>();

function clePaysIso(cmd: CommandeShopify): string | undefined {
  return cmd.adresseLivraison?.paysCode?.toUpperCase();
}

export type ResultatRoutage = { transporteur: 'laposte' } | { transporteur: 'sendcloud'; offre: OptionExpedition };

/** Résout la commande vers un transporteur, uniquement via une correspondance EXACTE dans les
 * règles de livraison (cf. retour utilisateur du 2026-09-05 : "il faudrait que tu mettes toutes les
 * possibilités shopify avec poids et destination et moi je match avec mes règles comme ça c'est
 * simple et tout le reste de la logique tu enlèves") — plus de mot-clé approximatif, plus de repli
 * "léger + France → La Poste par défaut", plus de "moins cher tous transporteurs confondus" : sans
 * règle exacte (mode de livraison, poids, destination), undefined, point final. Pour La Poste, pas
 * d'appel réseau (tarif contractuel fixe) ; pour Sendcloud, prix vérifié en direct — si le code de
 * la règle ne correspond plus à aucune offre réelle, undefined aussi (jamais une offre devinée). */
export async function resoudreExpedition(
  cmd: CommandeShopify,
  regles: RegleLivraison[],
  poidsGrammes: number,
  estLeger: boolean,
  expediteur: Expediteur,
): Promise<ResultatRoutage | undefined> {
  const paysIso = clePaysIso(cmd);
  const destinataire = adresseLivraisonVersDestinataire(cmd.adresseLivraison, cmd.email);
  if (!paysIso || !destinataireExploitable(destinataire) || !destinataireExploitable(expediteur)) return undefined;

  const regle = trouverRegle(regles, cmd.moyenExpedition, estLeger ? 'leger' : 'lourd', paysIso);
  if (!regle) return undefined;
  if (regle.transporteur === 'laposte') return { transporteur: 'laposte' };

  const poidsKg = poidsGrammes / 1000;
  const cle = `${regle.code}|${poidsKg}|${paysIso}|${expediteur.paysCode}`;
  let promesse = cacheOffres.get(cle);
  if (!promesse) {
    promesse = chargerOptionsExpedition({
      fromAddress: versSendcloudAddress(expediteur),
      toAddress: versSendcloudAddress(destinataire),
      poidsKg,
      shippingOptionCode: regle.code,
    }).catch((e) => {
      // Ne fait jamais planter l'appelant (undefined reste le contrat), mais logue la vraie cause
      // au lieu de l'avaler silencieusement — cf. retour utilisateur du 2026-09-04 (commande
      // #26963 : "aucune offre trouvée" alors que l'API Sendcloud répondait bien en direct, sans
      // moyen de savoir si c'était une vraie absence d'offre ou une erreur masquée).
      console.warn(`Sendcloud shipping-options échoué pour ${cle} :`, e instanceof Error ? e.message : e);
      return [];
    });
    cacheOffres.set(cle, promesse);
  }

  const options = await promesse;
  const offre = options.find((o) => o.code === regle.code);
  return offre ? { transporteur: 'sendcloud', offre } : undefined;
}
