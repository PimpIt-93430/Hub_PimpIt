// Boxtal API v3 — colis (les lettres passeront par l'API La Poste directe une fois l'accès obtenu,
// cf. discussion 2026-08-28). Doc complète : App PIMP IT/assets/api-v3.json (spec OpenAPI donnée
// par l'utilisateur). Compte de PRODUCTION : toute commande créée par createShippingOrder() est
// réelle et facturée — ne JAMAIS appeler cette fonction en dehors d'un clic explicite de
// l'utilisateur sur une vraie expédition.
//
// L'API v3 n'a pas d'endpoint de devis/prix : le prix (deliveryPriceExclTax) n'est connu qu'APRÈS
// avoir créé et payé la commande (cf. schéma ShippingOrder). Impossible donc de "comparer les prix"
// avant de s'engager avec cette seule API — à confirmer avec l'utilisateur comment il veut gérer ça
// (ex. rester sur le site Boxtal pour comparer, puis ne créer ici que l'offre déjà choisie).

const BASE_URL = 'https://api.boxtal.com';
const ACCESS_KEY = process.env.BOXTAL_ACCESS_KEY!;
const SECRET_KEY = process.env.BOXTAL_SECRET_KEY!;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const basic = Buffer.from(`${ACCESS_KEY}:${SECRET_KEY}`).toString('base64');
  const res = await fetch(`${BASE_URL}/iam/account-app/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) throw new Error(`Boxtal auth ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cachedToken = data.accessToken;
  tokenExpiresAt = Date.now() + (data.expiresIn - 60) * 1000;
  return cachedToken!;
}

/** Message d'erreur lisible depuis une réponse Boxtal en échec (cf. discussion 2026-08-29 : un vrai
 * "422 Unprocessable Entity" masqué en "Boxtal API 422: Unprocessable Entity" générique — le corps
 * de réponse Boxtal utilise `errors: [{code, parameters: [{code, field, value}]}]` (cf. schéma Error
 * de api-v3.json), PAS `messages` comme le code précédent le supposait à tort, donc le vrai motif
 * (champ invalide, valeur refusée...) n'était jamais affiché. */
function extraireErreurBoxtal(data: unknown, res: Response): string {
  const erreurs = (data as { errors?: { code?: string; parameters?: { code?: string; field?: string; value?: string }[] }[] } | null)?.errors;
  if (!erreurs?.length) return res.statusText;
  return erreurs
    .map((e) => {
      const details = (e.parameters ?? [])
        .map((p) => [p.field, p.value].filter(Boolean).join('=') || p.code)
        .filter(Boolean)
        .join(', ');
      return details ? `${e.code} (${details})` : e.code;
    })
    .join(', ');
}

async function boxtalFetch<T = unknown>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Boxtal API ${res.status}: ${extraireErreurBoxtal(data, res)}`);
  }
  return data;
}

export interface ContentCategorie {
  id: string;
  label: string;
}

/** Liste en dur car peu volatile — chargée une fois, affichée pour choisir la catégorie de contenu
 * d'un envoi (obligatoire dans Package). "Bijoux fantaisie" (content:v1:40150) est le choix par
 * défaut naturel pour des pin's. */
export async function listerCategoriesContenu(): Promise<ContentCategorie[]> {
  const data = await boxtalFetch<{ content: ContentCategorie[] }>('/shipping/v3.1/content-category');
  return data.content;
}

export interface BoxtalContact {
  email: string;
  phone: string;
  company?: string;
  lastName: string;
  firstName: string;
}

export interface BoxtalLocation {
  city: string;
  number?: string;
  street: string;
  postalCode: string;
  countryIsoCode: string;
}

export interface BoxtalAddress {
  type: 'RESIDENTIAL' | 'BUSINESS';
  contact: BoxtalContact;
  location: BoxtalLocation;
  additionalInformation?: string;
}

export interface BoxtalPackage {
  type?: 'PARCEL' | 'LETTER' | 'PALLET';
  value: { value: number; currency: string };
  width: number;
  height?: number;
  length: number;
  weight: number;
  /** `description` est obligatoire côté Boxtal (schéma Content) malgré ce que suggérait une
   * première lecture de la doc — cf. discussion 2026-08-29, échec réel 422
   * "shipment.packages[0].content.description" sans ce champ. */
  content: { id: string; description: string };
  externalId?: string;
}

export interface CreateShippingOrderParams {
  shippingOfferCode: string;
  fromAddress: BoxtalAddress;
  toAddress: BoxtalAddress;
  packages: BoxtalPackage[];
  externalId?: string;
  labelType?: 'PDF_A4' | 'PDF_10x15';
  /** Point de proximité où le destinataire récupérera le colis (cf. discussion 2026-08-29) —
   * obligatoire pour une offre en point relais (ex. MONR-CpourToi), résolu via
   * chercherPointsRelais() ci-dessous. Le point choisi par le client via Sendcloud (widget
   * post-achat, stocké dans un metafield `sendcloud.service_point`) n'est PAS réutilisable ici :
   * c'est un id Sendcloud/transporteur, pas un code Boxtal — il faut chercher l'équivalent Boxtal. */
  pickupPointCode?: string;
}

export interface ShippingOrder {
  id: string;
  status: string;
  shipmentId: string;
  deliveryPriceExclTax?: { value: number; currency: string };
  estimatedDeliveryDate?: string;
}

/** Crée ET commande une expédition — RÉEL, FACTURÉ immédiatement (cf. en-tête du fichier). À
 * n'appeler que depuis une action explicite de l'utilisateur pour un envoi précis, jamais en test. */
export async function creerCommandeExpedition(params: CreateShippingOrderParams): Promise<ShippingOrder> {
  const data = await boxtalFetch<{ content: ShippingOrder }>('/shipping/v3.1/shipping-order', 'POST', {
    shippingOfferCode: params.shippingOfferCode,
    // Cf. discussion 2026-08-29 : "PDF_A4" imprime l'étiquette sur la moitié d'une feuille A4 (à
    // découper) — "PDF_10x15" imprime directement au format étiquette, sans papier à couper.
    labelType: params.labelType ?? 'PDF_10x15',
    shipment: {
      fromAddress: params.fromAddress,
      toAddress: params.toAddress,
      packages: params.packages,
      externalId: params.externalId,
      pickupPointCode: params.pickupPointCode,
    },
  });
  return data.content;
}

export interface PointRelais {
  code: string;
  nom: string;
  distanceMetres: number;
  adresse: string;
}

/** Le carrier_id Sendcloud d'un point Mondial Relay (ex. "FR19757", cf.
 * lib/shopify.ts recupererPointRelaisSendcloud) EST le code de proximité Boxtal (ex. "19757"), avec
 * juste un préfixe pays en plus — confirmé en session le 2026-08-29 en comparant directement les
 * deux : même point physique (LOCKER 24/7 LIDL, Draguignan), à 968m de l'adresse du client. Permet
 * de pré-sélectionner automatiquement le bon point Boxtal plutôt que de forcer une recherche
 * manuelle (cf. PanneauExpedition.tsx) — toujours vérifié contre chercherPointsRelais() avant
 * usage, jamais utilisé aveuglément (le format pourrait différer pour un autre réseau/transporteur
 * que Mondial Relay). */
export function codeBoxtalDepuisCarrierIdSendcloud(carrierId: string): string {
  return carrierId.replace(/^[A-Za-z]+/, '');
}

/** Points de proximité disponibles pour une offre d'expédition précise, triés du plus proche au
 * plus loin. Le point choisi ici doit être passé en `pickupPointCode` à creerCommandeExpedition()
 * pour une offre en point relais. */
export async function chercherPointsRelais(
  shippingOfferCode: string,
  adresse: { street: string; city: string; postalCode: string; countryIsoCode: string },
): Promise<PointRelais[]> {
  const params = new URLSearchParams({
    shippingOfferCode,
    operationType: 'ARRIVAL',
    street: adresse.street,
    city: adresse.city,
    postalCode: adresse.postalCode,
    countryIsoCode: adresse.countryIsoCode,
  });
  // Cf. discussion 2026-08-29 : la réponse réelle utilise `parcelPoint` (camelCase) — l'OpenAPI
  // fourni (NearbyParcelPointV2) documente `parcelpoint` en minuscules, ce qui ne correspond pas à
  // ce que Boxtal renvoie réellement (vérifié en direct sur ce compte).
  const data = await boxtalFetch<{
    content: { parcelPoint: { code: string; name: string; location: { street: string; city: string; postalCode: string } }; distanceFromSearchLocation: number }[];
  }>(`/shipping/v3.2/parcel-point-by-shipping-offer?${params}`);
  return data.content
    .map((p) => ({
      code: p.parcelPoint.code,
      nom: p.parcelPoint.name,
      distanceMetres: p.distanceFromSearchLocation,
      adresse: [p.parcelPoint.location.street, p.parcelPoint.location.postalCode, p.parcelPoint.location.city].filter(Boolean).join(', '),
    }))
    .sort((a, b) => a.distanceMetres - b.distanceMetres);
}

export async function recupererCommandeExpedition(id: string): Promise<ShippingOrder> {
  const data = await boxtalFetch<{ content: ShippingOrder }>(`/shipping/v3.1/shipping-order/${id}`);
  return data.content;
}

export interface ShippingDocument {
  url: string;
  type: 'LABEL' | 'PROFORMA' | 'CN23' | 'VOUCHER';
  format: 'PDF_A4' | 'PDF_10x15';
}

/** URLs signées (7 jours) des documents d'expédition — l'étiquette (LABEL) est ce qu'on veut
 * imprimer. Peut renvoyer une liste vide juste après la création : le document met parfois quelques
 * secondes à être généré côté Boxtal (à ré-essayer si besoin plutôt que d'échouer silencieusement). */
export async function listerDocumentsExpedition(id: string): Promise<ShippingDocument[]> {
  const data = await boxtalFetch<{ content: ShippingDocument[] }>(`/shipping/v3.1/shipping-order/${id}/shipping-document`);
  return data.content;
}

/** Annule une commande d'expédition — utile si une étiquette a été créée par erreur. Ne rembourse
 * pas forcément automatiquement selon les conditions Boxtal (non vérifié ici). */
export async function annulerCommandeExpedition(id: string): Promise<void> {
  await boxtalFetch(`/shipping/v3.1/shipping-order/${id}`, 'DELETE');
}

export interface SuiviExpedition {
  statut: string;
  estFinal: boolean;
  message: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

/** Suivi réel d'une expédition Boxtal (cf. discussion 2026-08-29 : Shopify ne reçoit jamais de mise
 * à jour de livraison pour ces envois — constaté sur la commande #26382, fulfillment.shipment_status
 * reste `null` alors que le colis a bien été livré). Nécessite l'id Boxtal de la commande
 * d'expédition (ShippingOrder.id, connu à la création — cf. lib/expeditions-boxtal.ts) ; ne
 * fonctionne donc que pour les étiquettes créées depuis cet outil, pas pour un envoi antérieur.
 * null si le suivi n'est pas encore disponible côté Boxtal (422 NoPackageTrackingFoundException). */
export async function recupererSuiviExpedition(id: string): Promise<SuiviExpedition | null> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/shipping/v3.1/shipping-order/${id}/tracking`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 422) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Boxtal API ${res.status}: ${extraireErreurBoxtal(data, res)}`);
  }
  const tracking = data?.content?.[0];
  if (!tracking) return null;
  return {
    statut: tracking.status,
    estFinal: Boolean(tracking.isFinal),
    message: tracking.message ?? null,
    trackingNumber: tracking.trackingNumber ?? null,
    trackingUrl: tracking.packageTrackingUrl ?? null,
  };
}
