// Partagé entre PanneauExpedition.tsx (une commande) et PanneauImpressionMasse.tsx (plusieurs
// d'un coup) — même forme d'adresse expéditeur/destinataire, même valeur par défaut, même clé de
// stockage pour que l'adresse expéditeur saisie une fois serve aux deux écrans.
//
// Cf. discussion 2026-08-29 : migration Boxtal → Sendcloud — meilleureOffre() est devenue async
// (interroge listerOptionsExpedition en direct, plus de grille tarifaire statique locale) ; les
// deux appelants (CommandesShopifyClient.tsx pour la liste, PanneauImpressionMasse.tsx pour le
// lot) gèrent ça avec un cache en mémoire (cf. cacheOffres ci-dessous) pour ne pas refaire un appel
// réseau par commande à chaque rendu.
import { listerOptionsExpedition, type OptionExpedition, type SendcloudAddress } from '@/lib/sendcloud';
import { trouverCodeRegle, type RegleLivraison } from '@/lib/regles-livraison';
import type { AdresseLivraison, CommandeShopify } from '@/lib/shopify';

export const CLE_EXPEDITEUR = 'expedition-sendcloud:expediteur';

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
  entreprise: 'Pimp It',
  prenom: '',
  nom: '',
  email: 'team@pimpitstore.com',
  telephone: '',
  adresse1: '',
  ville: '',
  codePostal: '',
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

/** Type de livraison déduit du mode d'expédition Shopify (cf. bug constaté le 2026-08-29 : une
 * règle "domicile → Colissimo" avait choisi une offre en point relais, la moins chère du
 * transporteur, alors que le client avait choisi la livraison à domicile — il fallait aussi
 * respecter le type de livraison, pas seulement le transporteur). null = pas de préférence
 * détectée, ne filtre rien. */
function pointRelaisPrefere(moyenExpedition: string | null): boolean | null {
  if (!moyenExpedition) return null;
  const texte = moyenExpedition.toLowerCase();
  if (texte.includes('domicile') || texte.includes('home delivery')) return false;
  if (texte.includes('relais') || texte.includes('retrait') || texte.includes('point delivery') || texte.includes('pickup')) return true;
  return null;
}

/** Meilleure offre pour une commande (cf. discussion 2026-08-28/29) : l'offre exacte d'une règle de
 * livraison si son mot-clé correspond au mode de livraison du client, sinon la moins chère parmi
 * les offres disponibles pour ce poids/cette destination. Contrairement à l'ancienne version
 * (Boxtal, grille tarifaire statique), interroge Sendcloud en direct — async, undefined tant que ce
 * n'est pas calculable (adresse manquante, aucune offre trouvée, erreur réseau) plutôt qu'un état
 * "pays sans grille" qui n'a plus de sens ici (Sendcloud n'a pas de notion de grille déposée par
 * pays). */
export async function meilleureOffre(
  cmd: CommandeShopify,
  regles: RegleLivraison[],
  poidsGrammes: number,
  estLeger: boolean,
  expediteur: Expediteur,
): Promise<(OptionExpedition & { viaRegle: boolean }) | undefined> {
  const paysIso = clePaysIso(cmd);
  const destinataire = adresseLivraisonVersDestinataire(cmd.adresseLivraison, cmd.email);
  if (!paysIso || !destinataireExploitable(destinataire) || !destinataireExploitable(expediteur)) return undefined;

  const codeRegle = trouverCodeRegle(regles, cmd.moyenExpedition, estLeger);
  const poidsKg = poidsGrammes / 1000;
  const cle = `${codeRegle ?? '*'}|${poidsKg}|${paysIso}|${expediteur.paysCode}`;
  let promesse = cacheOffres.get(cle);
  if (!promesse) {
    promesse = listerOptionsExpedition({
      fromAddress: versSendcloudAddress(expediteur),
      toAddress: versSendcloudAddress(destinataire),
      poidsKg,
      shippingOptionCode: codeRegle ?? undefined,
    }).catch(() => []);
    cacheOffres.set(cle, promesse);
  }

  const options = await promesse;
  if (options.length === 0) return undefined;

  if (codeRegle) {
    const parRegle = options.find((o) => o.code === codeRegle);
    return parRegle ? { ...parRegle, viaRegle: true } : undefined;
  }

  // Pas de règle (ou règle dont le code n'existe pas du tout) : on retombe sur le moins cher, en ne
  // filtrant par type de livraison que si ça laisse au moins une offre — un mode Shopify mal reconnu
  // ne doit jamais faire disparaître toutes les offres, juste ne pas affiner le choix.
  const preference = pointRelaisPrefere(cmd.moyenExpedition);
  const filtrees = preference === null ? options : options.filter((o) => o.pointRelaisRequis === preference);
  const candidates = filtrees.length > 0 ? filtrees : options;
  const triees = [...candidates].sort((a, b) => (a.prix?.value ?? Infinity) - (b.prix?.value ?? Infinity));
  return { ...triees[0], viaRegle: false };
}
