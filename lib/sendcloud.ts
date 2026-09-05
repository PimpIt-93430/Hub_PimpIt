// Sendcloud API v3 — remplace Boxtal (cf. discussion 2026-08-29 : "on va tout gérer avec le hub
// mais grâce à l'api de sendcloud", "et plus de boxtal"). Compte de PRODUCTION : toute commande
// créée par creerEtiquetteEnvoi() est réelle et facturée — ne JAMAIS appeler cette fonction en
// dehors d'un clic explicite de l'utilisateur sur une vraie expédition (même garde-fou que
// lib/boxtal.ts, conservé tel quel mais plus utilisé par le Hub).
//
// v2 (https://panel.sendcloud.sc/api/v2) est marquée "legacy, closed to new users" pour la
// création — toute cette intégration utilise v3 (doc complète : https://sendcloud.dev/api/v3/).
// Même authentification Basic (clé publique + secrète) que v2, vérifiée en direct le 2026-08-29.
//
// Découverte clé (cf. discussion) : le point relais réellement choisi par le client existe déjà —
// capté par le propre sélecteur post-achat de Sendcloud — lisible en lecture seule via GET /orders
// (recupererPointEtCarrierCommande ci-dessous). Pas besoin de le redemander ni de le deviner comme
// c'était le cas avec Boxtal.

const BASE_URL = 'https://panel.sendcloud.sc/api/v3';
const PUBLIC_KEY = process.env.SENDCLOUD_PUBLIC_KEY!;
const SECRET_KEY = process.env.SENDCLOUD_SECRET_KEY!;

function authHeader(): string {
  return `Basic ${Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64')}`;
}

/** Message d'erreur lisible depuis une réponse Sendcloud v3 en échec — format
 * `{errors: [{detail, status, source: {pointer}, code}]}`, différent du format Boxtal
 * `{errors: [{code, parameters}]}` (cf. lib/boxtal.ts). */
function extraireErreurSendcloud(data: unknown, res: Response): string {
  const erreurs = (data as { errors?: { detail?: string; code?: string; source?: { pointer?: string } }[] } | null)?.errors;
  if (!erreurs?.length) return res.statusText;
  return erreurs.map((e) => (e.source?.pointer ? `${e.detail ?? e.code} (${e.source.pointer})` : e.detail ?? e.code)).join(', ');
}

async function sendcloudFetch<T = unknown>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Sendcloud API ${res.status}: ${extraireErreurSendcloud(data, res)}`);
  }
  return data as T;
}

export interface SendcloudAddress {
  name: string;
  companyName?: string;
  addressLine1: string;
  houseNumber?: string;
  postalCode: string;
  city: string;
  countryIsoCode: string;
  email?: string;
  phone?: string;
}

function versAddressBody(a: SendcloudAddress) {
  return {
    name: a.name,
    company_name: a.companyName || undefined,
    address_line_1: a.addressLine1,
    house_number: a.houseNumber || undefined,
    postal_code: a.postalCode,
    city: a.city,
    country_code: a.countryIsoCode,
    email: a.email || undefined,
    phone_number: a.phone || undefined,
  };
}

export interface OptionExpedition {
  code: string;
  nom: string;
  transporteurCode: string;
  transporteurNom: string;
  pointRelaisRequis: boolean;
  /** null si le devis n'a pas pu être calculé pour ce poids/cette destination (cf. quote_error côté
   * API) — l'offre reste utilisable pour créer un envoi, juste sans prix affiché avant. */
  prix: { value: number; devise: string } | null;
}

/** Offres d'expédition disponibles pour un poids/une destination, avec prix en direct
 * (calculate_quotes: true) — remplace la grille tarifaire manuelle Boxtal (lib/boxtal-tarifs.ts),
 * plus besoin de la tenir à jour à la main. */
export async function listerOptionsExpedition(params: {
  fromAddress: SendcloudAddress;
  toAddress: SendcloudAddress;
  poidsKg: number;
  shippingOptionCode?: string;
}): Promise<OptionExpedition[]> {
  const data = await sendcloudFetch<{
    data: {
      code: string;
      name: string;
      carrier: { code: string; name: string };
      requirements: { is_service_point_required: boolean };
      quotes?: { price?: { total: { value: string; currency: string } } }[];
      quote_error?: unknown;
    }[];
  }>('/shipping-options', 'POST', {
    from_address: versAddressBody(params.fromAddress),
    to_address: versAddressBody(params.toAddress),
    // .toFixed(3) plutôt que String() — Sendcloud rejette (400) un poids à plus de 3 décimales, et
    // poidsKg vient souvent d'une division (grammes / 1000) qui produit de l'imprécision flottante
    // classique (ex. 0.018666666666666668) — cf. erreur "Decimal input should have no more than 3
    // decimal places" observée en prod sur /shipping-options.
    parcels: [{ weight: { value: params.poidsKg.toFixed(3), unit: 'kg' } }],
    calculate_quotes: true,
    shipping_option_code: params.shippingOptionCode,
  });
  return data.data.map((o) => ({
    code: o.code,
    nom: o.name,
    transporteurCode: o.carrier.code,
    transporteurNom: o.carrier.name,
    pointRelaisRequis: o.requirements.is_service_point_required,
    prix: o.quotes?.[0]?.price?.total ? { value: Number(o.quotes[0].price.total.value), devise: o.quotes[0].price.total.currency } : null,
  }));
}

export interface PointRelais {
  id: number;
  nom: string;
  adresse: string;
  distanceMetres: number | null;
  transporteurCode: string;
}

/** Points relais disponibles pour une adresse — utilisé seulement en secours pour laisser
 * l'utilisateur choisir manuellement (cf. PanneauExpedition.tsx) : normalement le point du client
 * est déjà connu via recupererPointEtCarrierCommande() ci-dessous. */
export async function chercherPointsRelais(
  adresse: { street: string; city: string; postalCode: string; countryIsoCode: string },
  carrierCode?: string,
): Promise<PointRelais[]> {
  const params = new URLSearchParams({
    country_code: adresse.countryIsoCode,
    address_street: adresse.street,
    address_postal_code: adresse.postalCode,
    address_city: adresse.city,
    radius: '10000',
  });
  if (carrierCode) params.set('carrier_code', carrierCode);
  const data = await sendcloudFetch<{
    data: { results: { id: number; name: string; carrier: { code: string }; address: { street: string; house_number?: string; postal_code: string; city: string }; distance: number | null }[] };
  }>(`/service-points?${params}`);
  return data.data.results.map((p) => ({
    id: p.id,
    nom: p.name,
    adresse: [p.address.street, p.address.house_number, p.address.postal_code, p.address.city].filter(Boolean).join(' '),
    distanceMetres: p.distance,
    transporteurCode: p.carrier.code,
  }));
}

/** Détail d'un point relais par son id Sendcloud — sert à afficher nom/adresse du point déjà connu
 * pour une commande (cf. recupererPointEtCarrierCommande, qui ne renvoie que l'id). */
export async function recupererPointRelais(id: number): Promise<PointRelais> {
  const data = await sendcloudFetch<{
    data: { id: number; name: string; carrier: { code: string }; address: { street: string; house_number?: string; postal_code: string; city: string } };
  }>(`/service-points/${id}`);
  return {
    id: data.data.id,
    nom: data.data.name,
    adresse: [data.data.address.street, data.data.address.house_number, data.data.address.postal_code, data.data.address.city].filter(Boolean).join(' '),
    distanceMetres: null,
    transporteurCode: data.data.carrier.code,
  };
}

export interface PointEtCarrierConnu {
  pointRelaisId: number | null;
  /** true si Sendcloud a rempli ce point tout seul (tag order "Service Point Auto-Assigned", cf.
   * discussion 2026-08-29) faute de sélection réelle du client via son sélecteur post-achat — dans
   * ce cas le point N'EST PAS un choix confirmé du client, à traiter comme "le plus proche par
   * défaut" (même statut qu'un point deviné avec Boxtal), pas comme une certitude. Vérifié en
   * comparant les commandes réelles (#26529…, tags vides, vrai choix client) à une commande de test
   * où aucune sélection n'avait été faite (#26593, ce tag présent). */
  autoAssigne: boolean;
}

/** Point relais déjà connu par Sendcloud pour cette commande Shopify (order_number, ex. "#26593")
 * — capté par son propre sélecteur post-achat au moment où le client fait son choix, cf. discussion
 * 2026-08-29 : GET /orders?order_number= renvoie `data: [...]` (pas `data: {results: [...]}`, doc
 * imprécise sur ce point — vérifié en direct) avec service_point_details.id. Pas de
 * shipping_option_code disponible ici (n'existe pas dans la réponse réelle, malgré ce que la doc
 * Sendcloud suggérait) — le choix de transporteur/offre reste résolu via les règles de livraison
 * (mot-clé du mode d'expédition Shopify), pas depuis cet endpoint. null si la commande n'est pas
 * (encore) connue de Sendcloud. */
export async function recupererPointEtCarrierCommande(orderNumber: string): Promise<PointEtCarrierConnu | null> {
  const params = new URLSearchParams({ order_number: orderNumber });
  const data = await sendcloudFetch<{
    data: { service_point_details?: { id?: string } | null; order_details?: { tags?: string[] } | null }[];
  }>(`/orders?${params}`);
  const commande = data.data[0];
  if (!commande?.service_point_details?.id) return null;
  return {
    pointRelaisId: Number(commande.service_point_details.id),
    autoAssigne: (commande.order_details?.tags ?? []).includes('Service Point Auto-Assigned'),
  };
}

export interface Envoi {
  id: string;
  parcelId: number;
  statutCode: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

export interface CreerEnvoiParams {
  fromAddress: SendcloudAddress;
  toAddress: SendcloudAddress;
  shippingOptionCode: string;
  poidsKg: number;
  dimensionsCm?: { longueur: number; largeur: number; hauteur: number };
  orderNumber?: string;
  /** Référence externe unique — Sendcloud refuse (409) une deuxième création avec la même valeur,
   * même garde-fou "jamais deux fois la même commande" que le externalId Boxtal. */
  externalReferenceId?: string;
  totalCommande?: { value: number; devise: string };
  pointRelaisId?: number;
}

/** Crée ET annonce un envoi Sendcloud RÉEL, FACTURÉ immédiatement — à n'appeler que depuis un clic
 * explicite de l'utilisateur pour un envoi précis, jamais en test (cf. en-tête du fichier). */
export async function creerEtiquetteEnvoi(params: CreerEnvoiParams): Promise<Envoi> {
  const data = await sendcloudFetch<{
    data: {
      id: string;
      parcels: { id: number; status: { code: string }; tracking_number?: string; tracking_url?: string }[];
    };
  }>('/shipments/announce', 'POST', {
    from_address: versAddressBody(params.fromAddress),
    to_address: versAddressBody(params.toAddress),
    ship_with: { type: 'shipping_option_code', properties: { shipping_option_code: params.shippingOptionCode } },
    order_number: params.orderNumber,
    external_reference_id: params.externalReferenceId,
    total_order_price: params.totalCommande ? { value: String(params.totalCommande.value), currency: params.totalCommande.devise } : undefined,
    // Cf. discussion 2026-08-29 : `to_service_point` est un champ RACINE de la requête (sibling de
    // to_address/from_address/ship_with/parcels), pas un champ du parcel — erreur trouvée après un
    // vrai échec 400 "A service point is required... (to_service_point)" sur la commande #26597
    // alors qu'un point avait bien été fourni : il était imbriqué dans parcels[0] et donc jamais lu
    // par Sendcloud, qui le considérait absent. Vérifié via la doc (shipment-request schema).
    ...(params.pointRelaisId ? { to_service_point: { id: String(params.pointRelaisId) } } : {}),
    parcels: [
      {
        // Cf. commentaire de listerOptionsExpedition ci-dessus — même correctif ici, sur la création
        // réelle de l'envoi cette fois (plus grave : un échec ici bloque une expédition facturable).
        weight: { value: params.poidsKg.toFixed(3), unit: 'kg' },
        dimensions: params.dimensionsCm
          ? { length: String(params.dimensionsCm.longueur), width: String(params.dimensionsCm.largeur), height: String(params.dimensionsCm.hauteur), unit: 'cm' }
          : undefined,
      },
    ],
  });
  const parcel = data.data.parcels[0];
  return {
    id: data.data.id,
    parcelId: parcel.id,
    statutCode: parcel.status.code,
    trackingNumber: parcel.tracking_number ?? null,
    trackingUrl: parcel.tracking_url ?? null,
  };
}

/** Relit un envoi déjà créé — statut/suivi mis à jour (utilisé par le cron, cf.
 * supabase/functions/envoyer-suivis-sendcloud). */
export async function recupererEnvoi(id: string): Promise<Envoi> {
  const data = await sendcloudFetch<{
    data: { id: string; parcels: { id: number; status: { code: string }; tracking_number?: string; tracking_url?: string }[] };
  }>(`/shipments/${id}`);
  const parcel = data.data.parcels[0];
  return {
    id: data.data.id,
    parcelId: parcel.id,
    statutCode: parcel.status.code,
    trackingNumber: parcel.tracking_number ?? null,
    trackingUrl: parcel.tracking_url ?? null,
  };
}

/** Annule un envoi — utile si une étiquette a été créée par erreur. Refusé (409) si déjà livré/
 * annulé ou après 42 jours (cf. doc Sendcloud). */
export async function annulerEnvoi(id: string): Promise<void> {
  await sendcloudFetch(`/shipments/${id}/cancel`, 'POST');
}

/** Étiquette PDF brute d'un colis — endpoint authentifié (pas d'URL signée ouvrable directement
 * contrairement à Boxtal), donc à proxyfier depuis une route Next.js plutôt que de mettre le lien
 * brut dans un <a href>. Cf. app/api/etiquette-sendcloud/[parcelId]/route.ts. */
export async function recupererDocumentEtiquette(parcelId: number): Promise<Uint8Array> {
  const res = await fetch(`${BASE_URL}/parcels/${parcelId}/documents/label`, {
    headers: { Authorization: authHeader(), Accept: 'application/pdf' },
  });
  if (!res.ok) throw new Error(`Sendcloud API ${res.status}: étiquette introuvable`);
  return new Uint8Array(await res.arrayBuffer());
}
