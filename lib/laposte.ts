// La Poste API Postage (étiquettes Lettre Verte Suivie / Lettre Performance Suivie, cf.
// assets/La poste/CI - API Postage - 3125 - v1.5 - FR.pdf, envoyées par l'utilisateur le
// 2026-09-02) — sert les produits classés "léger" (cf. lib/classification-produits.ts), en
// remplacement de Sendcloud pour ces commandes-là.
//
// Compte de PRODUCTION depuis le 2026-09-03 (bascule recette -> prod, cf. email La Poste,
// compte applicatif P26102.HSO.HSO.PIMPITSTORE, base URL .../postage/v1 sans "External") :
// chaque étiquette générée est RÉELLE et FACTURÉE, plus de mode test. Annulable sous 7 jours et
// avant la fin du mois de génération (cf. annulerEtiquetteLettre ci-dessous).
//
// Authentification OAuth2 client_credentials via l'APIM La Poste (cf. Authentification APIM.pdf) :
// POST {LAPOSTE_TOKEN_URL} avec Basic (client_id:client_secret) -> access_token Bearer, valide 1h.
// Même idiome de cache mémoire que getToken() dans lib/shopify.ts.
const TOKEN_URL = process.env.LAPOSTE_TOKEN_URL!;
const API_URL = process.env.LAPOSTE_API_URL!;
const CLIENT_ID = process.env.LAPOSTE_CLIENT_ID!;
const CLIENT_SECRET = process.env.LAPOSTE_CLIENT_SECRET!;
const CONTRACT_NUMBER = process.env.LAPOSTE_CONTRACT_NUMBER!;
const CUST_ACC_NUMBER = process.env.LAPOSTE_CUST_ACC_NUMBER!;
const CUST_INVOICE = process.env.LAPOSTE_CUST_INVOICE!;

/** Tarif contractuel (€ HT, par envoi) communiqué par l'utilisateur le 2026-09-03 — l'API Postage
 * ne renvoie aucun prix à la création (contrairement à Sendcloud), donc pas d'autre source
 * possible que cette constante. Seule la Lettre Verte Suivie (K7) est utilisée en pratique (retour
 * utilisateur explicite : "il faut que lettre verte suivie le reste tu enlèves tout") — la
 * Performance Suivie (K8) reste supportée par l'API mais n'est plus proposée dans les écrans. */
export const PRIX_LETTRE_VERTE_SUIVIE_HT = 1.8;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Impossible d'obtenir le token La Poste : ${res.status} — ${await res.text()}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

/** Adresse au format La Poste (Bloc address du CI) — `add4` porte le numéro+libellé de voie
 * (seul champ obligatoire en plus de zipcode/town/countryCode), `add2` sert de complément
 * (bâtiment/étage/appartement) quand fourni. `countryCode` est un code ISO-3166 NUMÉRIQUE (France
 * = "250"), pas alpha — l'API ne couvre que la France métropolitaine + DOM (cf. CI, page 4). */
export interface AdresseLaPoste {
  nom: string;
  adresse: string;
  complement?: string;
  ville: string;
  codePostal: string;
  paysCode: string;
  email: string;
  telephone: string;
}

// Cf. retour utilisateur du 2026-09-05 : "je ne trouve pas les règles pour les dom afin de
// compléter pour les produits légers c'est lettre verte suivie" — les départements/territoires
// d'outre-mer (Guadeloupe, Martinique, Réunion, Guyane, Mayotte...) sont juridiquement la France et
// desservis par le réseau postal domestique de La Poste, contrairement aux transporteurs tiers
// agrégés par Sendcloud (Mondial Relay confirmé en direct comme NE desservant PAS ces destinations,
// cf. discussion du même jour) — envoyés avec le même countryCode que la métropole (250).
// ⚠ Non confirmé dans la documentation API Postage (CI - API Postage - 3125 - v1.5 - FR.pdf,
// aucune mention explicite de la couverture DOM pour le produit K7) — à vérifier avec un vrai envoi
// avant de faire confiance à ce chemin en masse.
const CODES_PAYS_NUMERIQUES: Record<string, string> = {
  FR: '250',
  GP: '250',
  MQ: '250',
  RE: '250',
  GF: '250',
  YT: '250',
};

function versAddressBlock(a: AdresseLaPoste) {
  const codeNumerique = CODES_PAYS_NUMERIQUES[a.paysCode.toUpperCase()];
  if (!codeNumerique) {
    throw new Error(
      `L'API La Poste ne couvre que la France (métropole + DOM) — pas d'envoi international possible avec ce produit (reçu "${a.paysCode}").`,
    );
  }
  return {
    name1: a.nom.slice(0, 38),
    ...(a.complement ? { add2: a.complement.slice(0, 38) } : {}),
    add4: a.adresse.slice(0, 38),
    zipcode: a.codePostal.slice(0, 9),
    town: a.ville.slice(0, 35),
    countryCode: codeNumerique,
  };
}

export type ProduitLettre = 'K7' | 'K8';

export interface EtiquetteLettre {
  orderId: string;
  itemId: string;
  itemIdChecksum: string;
  itemLabel: string;
  /** PDF de l'étiquette encodé en base64 — pas d'endpoint pour le retélécharger plus tard (cf. CI),
   * à conserver en base pour pouvoir la rouvrir (cf. lib/expeditions-laposte.ts). */
  visualOutputBase64: string;
}

interface ReponseErreur {
  errors?: { errorCode?: string; errorLabel?: string }[];
}

function extraireErreurLaPoste(data: ReponseErreur | null, res: Response): string {
  const erreurs = data?.errors;
  if (!erreurs?.length) return res.statusText;
  return erreurs.map((e) => e.errorLabel ?? e.errorCode).join(', ');
}

/** Génère une étiquette Lettre Verte Suivie (K7, J+3) ou Lettre Performance Suivie (K8, J+2) — cf.
 * POST {URL}/orders (CI section 4.2). `custPurchaseOrderNumber` sert de référence côté La Poste,
 * on y met le nom de commande Shopify pour pouvoir recouper. */
export async function creerEtiquetteLettre(params: {
  produit: ProduitLettre;
  poidsGrammes: number;
  expediteur: AdresseLaPoste;
  destinataire: AdresseLaPoste;
  reference: string;
}): Promise<EtiquetteLettre> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
    },
    body: JSON.stringify({
      order: {
        custPurchaseOrderNumber: params.reference,
        invoicing: {
          contractNumber: CONTRACT_NUMBER,
          custAccNumber: CUST_ACC_NUMBER,
          custInvoice: CUST_INVOICE,
        },
        offer: {
          masterOutputOptions: { firstVignettePosition: 1, visualFormatCode: 'rollA' },
          offerCode: '3125',
          products: [
            {
              productCode: params.produit,
              productOptions: {
                clientReference: { cref1: params.reference.slice(0, 32) },
                deliveryTrackingFlag: true,
                weight: Math.max(1, Math.round(params.poidsGrammes)),
              },
              sender: {
                address: versAddressBlock(params.expediteur),
                email: params.expediteur.email,
                phone: params.expediteur.telephone,
              },
              receiver: {
                address: versAddressBlock(params.destinataire),
                email: params.destinataire.email,
                phone: params.destinataire.telephone,
              },
            },
          ],
        },
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.errors?.length) {
    throw new Error(`La Poste API : ${extraireErreurLaPoste(data, res)}`);
  }

  const produit = data.order.offer.products[0];
  return {
    orderId: data.order.orderId,
    itemId: produit.smartdata.itemId,
    itemIdChecksum: produit.smartdata.itemIdChecksum,
    itemLabel: produit.smartdata.itemLabel,
    visualOutputBase64: data.order.offer.visualOutput,
  };
}

interface ReponseAnnulation {
  errors?: { errorCode?: string; errorLabel?: string }[];
  cancelResult?: {
    status: string;
    products?: { itemId: string; status: string; errors?: { errorCode?: string; errorLabel?: string }[] }[];
  };
}

/** Contrairement à la création (erreurs au niveau racine), l'annulation renvoie ses erreurs
 * imbriquées par produit dans `cancelResult.products[].errors` — vérifié en direct le 2026-09-02
 * (statut HTTP 422 + `cancelResult.status: "DONE"` au niveau racine mais chaque produit à
 * "REJECTED" avec son erreur propre, donc bien regarder les deux niveaux). */
function extraireErreurAnnulation(data: ReponseAnnulation | null, res: Response): string {
  const erreurRacine = data?.errors?.[0];
  if (erreurRacine) return erreurRacine.errorLabel ?? erreurRacine.errorCode ?? res.statusText;
  const erreurProduit = data?.cancelResult?.products?.find((p) => p.status !== 'DONE' && p.status !== 'CANCELLED')?.errors?.[0];
  if (erreurProduit) return erreurProduit.errorLabel ?? erreurProduit.errorCode ?? res.statusText;
  return res.statusText;
}

/** Annule une étiquette déjà générée — cf. POST {URL}/items/cancel (CI section 4.5). Possible
 * jusqu'à 7 jours après création, jamais après le mois précédent (cf. CI). */
export async function annulerEtiquetteLettre(itemId: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_URL}/items/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ cancelRequest: { products: [{ itemId }] } }),
  });

  const data: ReponseAnnulation | null = await res.json().catch(() => null);
  const produitStatut = data?.cancelResult?.products?.[0]?.status;
  const echec = !res.ok || Boolean(data?.errors?.length) || (produitStatut !== undefined && produitStatut !== 'DONE' && produitStatut !== 'CANCELLED');
  if (echec) {
    throw new Error(`La Poste API (annulation) : ${extraireErreurAnnulation(data, res)}`);
  }
}

// ---- Suivi (API trackedItemStatus, cf. "CI - API trackedItemStatus - v2.1 - FR.pdf") — permet de
// savoir si une lettre suivie a été livrée, pour sortir la commande du cache Commandes Shopify
// (cf. lib/commandes-shopify-cache.ts). Habilitation confirmée par La Poste le 2026-09-03.
//
// L'URL qu'ils ont donnée par email (apim-gw-vente-acc.net.INTRA.laposte.fr) est un nom de domaine
// interne La Poste, ne résout pas en DNS depuis l'extérieur — MAIS l'hôte externe habituel
// (.net.EXTRA.laposte.fr, même famille que l'API Postage) fonctionne bien, confirmé en direct le
// 2026-09-03 : le vrai souci n'était pas l'URL mais le CHEMIN — la v2 utilise
// GET /trackedItemStatus/v2/shipments?idships=... (query, pluriel), pas
// /trackedItemStatus/v1/suivi-unifie/idship/{id} (path, singulier) documenté dans la v1.1.
const SUIVI_URL = process.env.LAPOSTE_SUIVI_URL!;

/** Un seul suivi obligatoire garanti pour une lettre suivie : "mis en distribution" (MD2) — cf.
 * email La Poste du 2026-09-03. Pas d'attente d'un "distribué" (DI1/DI2) qui peut ne jamais
 * arriver pour ce produit ; `isFinal` (renvoyé par l'API) est le signal fiable qu'aucun nouvel
 * événement ne viendra, quel que soit le dernier statut atteint. */
export interface StatutSuivi {
  itemId: string;
  isFinal: boolean;
  dernierEvenementCode: string | null;
  dernierEvenementLibelle: string | null;
  erreur: string | null;
}

interface ReponseSuiviUnitaire {
  returnCode: number;
  returnMessage?: string;
  technicalMessage?: string;
  idShip?: string;
  shipment?: {
    idShip: string;
    isFinal: boolean;
    event?: { date: string; label: string; code: string }[];
  };
}

function versStatutSuivi(idDemande: string, reponse: ReponseSuiviUnitaire): StatutSuivi {
  if (!reponse.shipment) {
    return {
      itemId: idDemande,
      isFinal: false,
      dernierEvenementCode: null,
      dernierEvenementLibelle: null,
      erreur: reponse.returnMessage ?? `Code retour ${reponse.returnCode}`,
    };
  }
  const dernier = reponse.shipment.event?.[0] ?? null; // le plus récent en premier, cf. exemple CI
  return {
    itemId: reponse.shipment.idShip,
    isFinal: reponse.shipment.isFinal,
    dernierEvenementCode: dernier?.code ?? null,
    dernierEvenementLibelle: dernier?.label ?? null,
    erreur: null,
  };
}

/** Statut de suivi pour jusqu'à 10 numéros de suivi à la fois (limite de l'API) — appelant
 * responsable de découper si plus. `X-Forwarded-For` est documenté obligatoire ("adresse IP de
 * l'internaute demandeur") ; on n'a pas de vrai internaute ici (appel serveur à serveur), une
 * valeur placeholder est envoyée.
 *
 * Le statut HTTP de la réponse reflète le `returnCode` métier (ex. 404 pour "suivi pas encore
 * disponible", vérifié en direct le 2026-09-03) — PAS un échec technique. On ne lève une erreur
 * que si le corps n'est pas du JSON exploitable ; sinon on laisse `versStatutSuivi` interpréter le
 * contenu au cas par cas (shipment absent = pas d'erreur fatale, juste "pas encore de statut"). */
export async function chargerStatutsSuivi(itemIds: string[]): Promise<StatutSuivi[]> {
  if (itemIds.length === 0) return [];
  if (itemIds.length > 10) throw new Error('Maximum 10 numéros de suivi par appel.');

  const token = await getToken();
  const idsParam = itemIds.map(encodeURIComponent).join('%2C');
  const res = await fetch(`${SUIVI_URL}/shipments?idships=${idsParam}&lang=fr_FR`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'X-Forwarded-For': '90.0.0.1',
    },
  });

  const data = await res.json().catch(() => null);
  if (!data) {
    throw new Error(`La Poste API (suivi) : ${res.status} ${res.statusText}`);
  }

  const reponses: ReponseSuiviUnitaire[] = Array.isArray(data) ? data : [data];
  return itemIds.map((id, i) => versStatutSuivi(id, reponses[i] ?? { returnCode: 0, returnMessage: 'Pas de réponse' }));
}
