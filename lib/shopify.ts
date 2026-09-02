// Port TypeScript de Shopify Pimp IT/admin/lib/shopify.js (fichier original non touché) — mêmes
// identifiants (SHOPIFY_STORE/CLIENT_ID/CLIENT_SECRET), même flux OAuth client-credentials avec
// cache de token 24h. shopifyFetch en écriture est désormais utilisé par les créations de
// produits (packs, sabots personnalisés) qui répliquent exactement le comportement de l'ancien
// site — ces appels créent de vrais produits, live, sur la boutique Shopify (confirmé par
// l'utilisateur).
const STORE = process.env.SHOPIFY_STORE!;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;
const API_VERSION = '2024-01';
const BASE_URL = `https://${STORE}/admin/api/${API_VERSION}`;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Impossible d'obtenir le token Shopify : ${res.status} — ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

// Débit partagé entre TOUS les appels REST Shopify du process (limite du plan : 2 requêtes/s) — un
// verrou global espace le démarrage des requêtes, et un 429 relance après le délai indiqué par
// Retry-After au lieu de planter l'écran. Nécessaire car le tableau de bord lance plusieurs
// ventesShopifyDepuis() en parallèle (Promise.all), chacune paginant sur plusieurs pages : sans
// throttle partagé le débit combiné dépasse largement la limite (cf. erreur 429 "Exceeded 2 calls
// per second", 2026-08-29).
let derniereRequeteShopify = 0;
let fileAttenteShopify: Promise<void> = Promise.resolve();
const DELAI_MIN_ENTRE_REQUETES_MS = 550;

async function attendreSonTour(): Promise<void> {
  const precedente = fileAttenteShopify;
  let liberer!: () => void;
  fileAttenteShopify = new Promise((resolve) => {
    liberer = resolve;
  });
  await precedente;
  const attente = DELAI_MIN_ENTRE_REQUETES_MS - (Date.now() - derniereRequeteShopify);
  if (attente > 0) await new Promise((r) => setTimeout(r, attente));
  derniereRequeteShopify = Date.now();
  liberer();
}

async function shopifyRawFetch(url: string, token: string): Promise<Response> {
  for (let tentative = 0; ; tentative++) {
    await attendreSonTour();
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (res.status === 429 && tentative < 5) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 2;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    return res;
  }
}

export async function shopifyFetch(endpoint: string, method = 'GET', body: unknown = null) {
  const token = await getToken();
  if (method === 'GET' && !body) {
    const res = await shopifyRawFetch(`${BASE_URL}${endpoint}`, token);
    if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  await attendreSonTour();
  const options: RequestInit = {
    method,
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function shopifyGraphQL<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`https://${STORE}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

const HS_CODE = '64029990';

/** Code douanier standard appliqué à tous les produits Pimp It — même valeur que l'ancien site. */
export async function setHsCode(inventoryItemId: number | string): Promise<void> {
  try {
    await shopifyFetch(`/inventory_items/${inventoryItemId}.json`, 'PUT', {
      inventory_item: { id: inventoryItemId, harmonized_system_code: HS_CODE },
    });
  } catch (e) {
    console.warn(`HS code error ${inventoryItemId}:`, e instanceof Error ? e.message : e);
  }
}

let cachedLeversProfileId: string | null = null;

async function getLeversProfileId(): Promise<string | null> {
  if (cachedLeversProfileId) return cachedLeversProfileId;
  const data = await shopifyGraphQL<{
    deliveryProfiles?: { edges?: { node: { id: string; name: string } }[] };
  }>(`query { deliveryProfiles(first:30) { edges { node { id name } } } }`);
  const found = (data.deliveryProfiles?.edges ?? []).find((e) => /l[ée]ger/i.test(e.node.name));
  if (found) cachedLeversProfileId = found.node.id;
  return cachedLeversProfileId;
}

/** Assigne le produit au profil d'expédition "Produits légers" — même logique que l'ancien site
 * (recherche par nom insensible à la casse/accents, échoue silencieusement si absent). */
export async function assignToLeversProfile(productId: number | string): Promise<void> {
  const profileId = await getLeversProfileId();
  if (!profileId) {
    console.warn('Profil "Produits légers" introuvable');
    return;
  }
  try {
    await shopifyGraphQL(
      `
      mutation deliveryProfileUpdate($id: ID!, $profile: DeliveryProfileInput!) {
        deliveryProfileUpdate(id: $id, profile: $profile) {
          profile { id }
          userErrors { field message }
        }
      }
    `,
      { id: profileId, profile: { productsToAssociate: [`gid://shopify/Product/${productId}`] } },
    );
  } catch (e) {
    console.warn('Shipping profile assign error:', e instanceof Error ? e.message : e);
  }
}

// ── Profils d'expédition ────────────────────────────────────────────────────
// Port de Shopify Pimp IT/admin/server.js (endpoints /api/shipping/profiles et
// /api/shipping/assign, lignes ~124-203) — même logique exacte : pagination GraphQL des
// deliveryProfiles, puis batch d'images produit via REST /products.json (100 ids max par appel).

export interface ProfilExpeditionVariant {
  id: string;
  gid: string;
  title: string;
  sku: string;
}

export interface ProfilExpeditionItem {
  productId: string;
  productGid: string;
  title: string;
  type: string;
  image: string;
  variants: ProfilExpeditionVariant[];
}

export interface ProfilExpedition {
  id: string;
  name: string;
  default: boolean;
  items: ProfilExpeditionItem[];
}

interface DeliveryProfilesGraphQLResponse {
  deliveryProfiles: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: {
      node: {
        id: string;
        name: string;
        default: boolean;
        profileItems: {
          edges: {
            node: {
              product: { id: string; title: string; productType: string | null };
              variants: { edges: { node: { id: string; title: string; sku: string | null } }[] };
            };
          }[];
        };
      };
    }[];
  };
}

/** Liste tous les profils d'expédition Shopify avec leurs produits/variantes assignés + une
 * image miniature par produit — même logique exacte que l'ancien site (server.js:125-185). */
export async function listDeliveryProfiles(): Promise<ProfilExpedition[]> {
  const profiles: ProfilExpedition[] = [];
  let cursor: string | null = null;

  do {
    const data: DeliveryProfilesGraphQLResponse = await shopifyGraphQL<DeliveryProfilesGraphQLResponse>(
      `
      query($cursor: String) {
        deliveryProfiles(first: 20, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            id name default
            profileItems(first: 250) {
              edges { node {
                product { id title productType }
                variants(first: 100) { edges { node { id title sku } } }
              } }
            }
          } }
        }
      }
    `,
      { cursor },
    );

    for (const { node } of data.deliveryProfiles.edges) {
      profiles.push({
        id: node.id,
        name: node.name,
        default: node.default,
        items: node.profileItems.edges.map(({ node: n }) => ({
          productId: n.product.id.replace('gid://shopify/Product/', ''),
          productGid: n.product.id,
          title: n.product.title,
          type: n.product.productType || '',
          image: '',
          variants: n.variants.edges.map(({ node: v }) => ({
            id: v.id.replace('gid://shopify/ProductVariant/', ''),
            gid: v.id,
            title: v.title,
            sku: v.sku || '',
          })),
        })),
      });
    }
    cursor = data.deliveryProfiles.pageInfo.hasNextPage ? data.deliveryProfiles.pageInfo.endCursor : null;
  } while (cursor);

  // Images via REST, par batch de 100 ids
  const allProdIds = [...new Set(profiles.flatMap((p) => p.items.map((i) => i.productId)))];
  const imageMap: Record<string, string> = {};
  for (let i = 0; i < allProdIds.length; i += 100) {
    const batch = allProdIds.slice(i, i + 100);
    const prods = await shopifyFetchAll<{ id: number | string; image?: { src?: string } }>(
      `/products.json?ids=${batch.join(',')}&fields=id,image&limit=250`,
      'products',
    );
    for (const p of prods) if (p.image?.src) imageMap[String(p.id)] = p.image.src;
  }
  for (const profile of profiles) for (const item of profile.items) item.image = imageMap[item.productId] || '';

  return profiles;
}

/** Déplace un produit (toutes ses variantes) vers un autre profil d'expédition — même logique
 * exacte que l'ancien site (server.js:187-203). */
export async function assignVariantsToProfile(variantGids: string[], profileId: string): Promise<void> {
  if (!variantGids.length || !profileId) throw new Error('variantGids et profileId requis');
  const data = await shopifyGraphQL<{
    deliveryProfileUpdate?: { profile?: { id: string; name: string }; userErrors?: { field: string[]; message: string }[] };
  }>(
    `
    mutation deliveryProfileUpdate($id: ID!, $profile: DeliveryProfileInput!) {
      deliveryProfileUpdate(id: $id, profile: $profile) {
        profile { id name }
        userErrors { field message }
      }
    }
  `,
    { id: profileId, profile: { variantsToAssociate: variantGids } },
  );
  const errs = data.deliveryProfileUpdate?.userErrors ?? [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(', '));
}

// ── Commandes ────────────────────────────────────────────────────────────
// Nouvel écran "Commandes Shopify" (cf. discussion 2026-08-27) : liste des commandes en direct
// depuis Shopify (pas de table Supabase à synchroniser — le statut d'expédition vient de Shopify
// lui-même pour l'instant ; l'utilisateur a prévu de le croiser avec les API transporteurs
// — La Poste, etc. — une fois qu'il y aura accès, mais ce n'est pas encore construit).

export type StatutExpeditionCommande =
  | 'a_creer'
  | 'partielle'
  | 'expediee'
  | 'en_transit'
  | 'tentative_echouee'
  | 'livree'
  | 'perdue'
  | 'annulee'
  | 'archivee';

export interface FulfillmentCommande {
  trackingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shipmentStatus: string | null;
  creeLe: string;
}

export interface LigneCommande {
  titre: string;
  variante: string | null;
  sku: string | null;
  quantite: number;
  /** Id produit Shopify (cf. discussion 2026-08-29 : "produit léger ou lourd") — sert à retrouver le
   * profil d'expédition du produit ("Produits Légers"/"Produits Lourds", cf.
   * lib/classification-produits.ts) pour choisir lettre vs colis. null si ligne sans produit associé
   * (article personnalisé supprimé, etc.). */
  productId: number | null;
}

export interface AdresseLivraison {
  prenom: string | null;
  nom: string | null;
  entreprise: string | null;
  telephone: string | null;
  adresse1: string | null;
  adresse2: string | null;
  ville: string | null;
  codePostal: string | null;
  paysCode: string | null;
}

export interface CommandeShopify {
  id: number;
  nom: string;
  creeLe: string;
  client: string;
  email: string | null;
  statutPaiement: string | null;
  statutExpedition: StatutExpeditionCommande;
  statutExpeditionBrut: string | null;
  totalPrix: string;
  devise: string;
  adresse: string | null;
  /** Champs bruts de l'adresse de livraison (cf. discussion 2026-08-28, intégration Boxtal) — la
   * chaîne `adresse` ci-dessus reste pour l'affichage, celle-ci sert à construire l'adresse
   * destinataire d'une étiquette d'expédition (lib/boxtal.ts). */
  adresseLivraison: AdresseLivraison | null;
  /** Texte brut du mode de livraison choisi au checkout (cf. discussion 2026-08-28 : "ce qui a
   * écrit genre home delivery") — ex. "Livraison à domicile", "Livraison en point relais Mondial
   * Relay...". Sert de base aux règles de livraison (transporteur préféré selon ce texte). */
  moyenExpedition: string | null;
  // Pas de poids ici : le champ Shopify line_items[].grams existe mais n'est pas renseigné sur ce
  // catalogue (vérifié en session le 2026-08-29 — ~1g par pin quel que soit le modèle, donc une
  // valeur non configurée, pas un vrai poids). Le vrai poids vient de stock_pins.poids_unitaire
  // (pesé par l'équipe, cf. migration 0056) — résolu via lib/poids-commandes.ts, pas ici.
  lignes: LigneCommande[];
  fulfillments: FulfillmentCommande[];
}

/** Déduit un statut d'expédition unique et lisible à partir des champs Shopify (fulfillment_status
 * de la commande + shipment_status du dernier fulfillment). Shopify n'a pas de statut "perdue"
 * natif : "failure" (le plus proche, renvoyé par les intégrations transporteur type Boxtal/La
 * Poste quand elles remontent un incident) est mappé dessus ; tout le reste passe tel quel.
 * `closedAt` (cf. discussion 2026-08-29, commande #26582 "archivée" à la main dans Shopify, à tort
 * décrite comme "supprimée") est distinct de `cancelledAt` — une commande archivée/clôturée sans
 * être annulée doit sortir de "pas encore créée" plutôt que d'y rester bloquée indéfiniment. */
function deriveStatutExpedition(
  cancelledAt: string | null,
  closedAt: string | null,
  fulfillmentStatus: string | null,
  dernierFulfillment: { shipment_status?: string | null } | undefined,
): StatutExpeditionCommande {
  if (cancelledAt) return 'annulee';
  if (fulfillmentStatus === 'partial') return 'partielle';
  if (fulfillmentStatus !== 'fulfilled') return closedAt ? 'archivee' : 'a_creer';

  switch (dernierFulfillment?.shipment_status) {
    case 'delivered':
      return 'livree';
    case 'failure':
      return 'perdue';
    case 'attempted_delivery':
      return 'tentative_echouee';
    case 'in_transit':
    case 'out_for_delivery':
    case 'confirmed':
    case 'label_printed':
    case 'label_purchased':
    case 'picked_up':
    case 'ready_for_pickup':
      return 'en_transit';
    default:
      return 'expediee';
  }
}

/** Commande mappée + `shopifyUpdatedAt` (champ `updated_at` brut Shopify, absent de CommandeShopify
 * qui reste tourné affichage) — sert de curseur à la synchro incrémentale du cache, cf.
 * lib/commandes-shopify-cache.ts. */
export interface CommandeShopifyAvecMaj extends CommandeShopify {
  shopifyUpdatedAt: string;
}

/** Mapping brut Shopify -> CommandeShopify, factorisé pour être partagé entre
 * listerCommandesRecentes (snapshot complet) et listerCommandesMiseAJourDepuis (incrémental, cf.
 * lib/commandes-shopify-cache.ts). */
function mapperCommandeShopify(o: Record<string, any>): CommandeShopifyAvecMaj {
  const fulfillments: FulfillmentCommande[] = (o.fulfillments ?? []).map((f: Record<string, any>) => ({
    trackingCompany: f.tracking_company || null,
    trackingNumber: f.tracking_number || null,
    trackingUrl: f.tracking_url || null,
    shipmentStatus: f.shipment_status || null,
    creeLe: f.created_at,
  }));
  const dernierFulfillment = (o.fulfillments ?? [])[o.fulfillments?.length - 1];

  const adresse = o.shipping_address
    ? [o.shipping_address.address1, o.shipping_address.zip, o.shipping_address.city, o.shipping_address.country]
        .filter(Boolean)
        .join(', ')
    : null;

  const adresseLivraison: AdresseLivraison | null = o.shipping_address
    ? {
        prenom: o.shipping_address.first_name || null,
        nom: o.shipping_address.last_name || null,
        entreprise: o.shipping_address.company || null,
        telephone: o.shipping_address.phone || o.phone || null,
        adresse1: o.shipping_address.address1 || null,
        adresse2: o.shipping_address.address2 || null,
        ville: o.shipping_address.city || null,
        codePostal: o.shipping_address.zip || null,
        paysCode: o.shipping_address.country_code || null,
      }
    : null;

  const nomClient =
    [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') ||
    o.shipping_address?.name ||
    o.email ||
    'Client';

  return {
    id: o.id,
    nom: o.name,
    creeLe: o.created_at,
    client: nomClient,
    email: o.email ?? null,
    statutPaiement: o.financial_status ?? null,
    statutExpedition: deriveStatutExpedition(o.cancelled_at, o.closed_at, o.fulfillment_status, dernierFulfillment),
    statutExpeditionBrut: dernierFulfillment?.shipment_status ?? null,
    totalPrix: o.total_price ?? '0.00',
    devise: o.currency ?? 'EUR',
    adresse,
    adresseLivraison,
    moyenExpedition: o.shipping_lines?.[0]?.title ?? null,
    lignes: (o.line_items ?? []).map((li: Record<string, any>) => ({
      titre: li.title,
      variante: li.variant_title || null,
      sku: li.sku || null,
      quantite: li.quantity,
      productId: li.product_id ?? null,
    })),
    fulfillments,
    shopifyUpdatedAt: o.updated_at,
  } satisfies CommandeShopifyAvecMaj;
}

/** Liste les commandes les plus récentes (toutes statuts confondus) — un seul appel REST (limite
 * Shopify 250/page), triées côté client par date décroissante : l'API n'a pas de paramètre "order"
 * fiable sur cet endpoint. Sert au backfill initial du cache (cf. lib/commandes-shopify-cache.ts) —
 * plus appelée directement par l'écran, qui passe maintenant par le cache. */
export async function listerCommandesRecentes(limite = 200): Promise<CommandeShopifyAvecMaj[]> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/orders.json?status=any&limit=${limite}`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const commandes = (data.orders ?? []) as Array<Record<string, any>>;

  return commandes.map(mapperCommandeShopify).sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1));
}

/** Commandes modifiées depuis `depuisIso` (créées OU mises à jour — `updated_at_min`, `status=any`
 * pour ne rater ni une nouvelle commande ni un changement de statut sur une ancienne), paginé via
 * l'en-tête Link comme ventesShopifyDepuis. Sert à la synchro incrémentale du cache : plus besoin
 * de retélécharger les 200 commandes à chaque visite, seulement ce qui a changé depuis la dernière
 * fois (cf. lib/commandes-shopify-cache.ts pour la marge de sécurité appliquée à `depuisIso`). */
export async function listerCommandesMiseAJourDepuis(depuisIso: string): Promise<CommandeShopifyAvecMaj[]> {
  const token = await getToken();
  let url: string | null = `${BASE_URL}/orders.json?status=any&updated_at_min=${encodeURIComponent(depuisIso)}&limit=250`;
  const resultats: CommandeShopifyAvecMaj[] = [];

  while (url) {
    const res: Response = await shopifyRawFetch(url, token);
    if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const o of data.orders ?? []) resultats.push(mapperCommandeShopify(o));

    const link = res.headers.get('link') ?? '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  return resultats.sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1));
}

/** Somme les commandes payées depuis `depuisIso`, séparées Shopify (source_name "web", boutique
 * en ligne) / TikTok Shop (source_name "tiktok" — canal de vente branché sur Shopify, mêmes
 * commandes, pas une plateforme séparée) — cf. tableau de bord Hub (2026-08-27) : les chiffres du
 * jour doivent inclure le en ligne, pas seulement les ventes en pop-up (SumUp/espèces). */
export async function ventesShopifyDepuis(depuisIso: string): Promise<{ shopify: number; tiktok: number }> {
  const token = await getToken();
  let shopify = 0;
  let tiktok = 0;
  let url: string | null =
    `${BASE_URL}/orders.json?status=any&financial_status=paid&created_at_min=${encodeURIComponent(depuisIso)}&fields=source_name,total_price&limit=250`;

  while (url) {
    const res: Response = await shopifyRawFetch(url, token);
    if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const o of data.orders ?? []) {
      const montant = Number(o.total_price) || 0;
      if (o.source_name === 'tiktok') tiktok += montant;
      else shopify += montant;
    }
    const link = res.headers.get('link') ?? '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  return { shopify, tiktok };
}

export async function shopifyFetchAll<T = unknown>(endpoint: string, key: string): Promise<T[]> {
  const token = await getToken();
  let results: T[] = [];
  let url: string | null = `${BASE_URL}${endpoint}`;

  while (url) {
    const res: Response = await shopifyRawFetch(url, token);
    if (!res.ok) throw new Error(`Shopify API ${res.status}`);
    const data = await res.json();
    results = results.concat(data[key] ?? []);

    const link = res.headers.get('link') ?? '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return results;
}

export interface PointRelaisSendcloud {
  idSendcloud: string;
  transporteur: string;
  carrierId: string;
}

/** Point relais choisi par le client via le widget Sendcloud post-achat (cf. discussion
 * 2026-08-29) — stocké dans un metafield d'order, pas dans les champs Shopify habituels. Donne un
 * id Mondial Relay/Sendcloud réel, mais PAS une adresse lisible, et PAS un code utilisable
 * directement par Boxtal (catalogue de points différent, vérifié en session : aucun des points
 * Boxtal les plus proches de l'adresse ne correspond à ce carrier_id). Sert uniquement de référence
 * pour vérifier à la main que le point Boxtal choisi correspond bien à celui du client — un appel
 * par commande ouverte, jamais en liste (200 commandes = 200 appels, trop coûteux). */
export async function recupererPointRelaisSendcloud(commandeId: number): Promise<PointRelaisSendcloud | null> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/orders/${commandeId}/metafields.json?namespace=sendcloud&key=sendcloud.service_point`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const metafield = data.metafields?.[0];
  if (!metafield) return null;

  const valeur = JSON.parse(metafield.value) as { id?: number | string; carrier?: string; carrier_id?: string };
  if (!valeur.id) return null;
  return {
    idSendcloud: String(valeur.id),
    transporteur: valeur.carrier ?? 'inconnu',
    carrierId: valeur.carrier_id ?? '',
  };
}

function trackingInfoInput(trackingNumber: string | null, trackingUrl: string | null, trackingCompany: string | null) {
  // Cf. discussion 2026-08-29 : champs omis plutôt que passés à `null` explicitement — plus sûr
  // vis-à-vis du schéma GraphQL de Shopify que de deviner si chaque champ accepte null.
  return trackingNumber || trackingUrl || trackingCompany
    ? {
        ...(trackingNumber ? { number: trackingNumber } : {}),
        ...(trackingUrl ? { url: trackingUrl } : {}),
        ...(trackingCompany ? { company: trackingCompany } : {}),
      }
    : undefined;
}

/** Marque la commande comme traitée sur Shopify (fulfillment) avec le suivi transporteur, juste
 * après la création réelle d'une étiquette Boxtal (cf. discussion 2026-08-29 : "à chaque fois que je
 * crée une commande ça envoie les informations de suivi à Shopify"). Envoie l'email "commande
 * expédiée" au client (confirmé par l'utilisateur) — via fulfillmentCreateV2 sur le premier
 * fulfillment order ouvert (une seule adresse d'expédition "Pimp-it" sur cette boutique, pas de
 * gestion multi-lieux à ce jour). trackingNumber/trackingUrl peuvent être absents si Boxtal ne les a
 * pas encore générés au moment de la création — le fulfillment est quand même créé (la commande
 * passe "traitée"), juste sans lien de suivi pour l'instant ; l'id du fulfillment créé est renvoyé
 * pour pouvoir lui pousser le suivi plus tard (cf. mettreAJourSuiviFulfillmentShopify ci-dessous). */
export async function creerFulfillmentShopify(params: {
  commandeShopifyId: number;
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingCompany: string | null;
}): Promise<{ fulfillmentId: string }> {
  const dataOrder = await shopifyGraphQL<{
    order: { fulfillmentOrders: { edges: { node: { id: string; status: string } }[] } } | null;
  }>(
    `query($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 10) { edges { node { id status } } }
      }
    }`,
    { id: `gid://shopify/Order/${params.commandeShopifyId}` },
  );

  const fulfillmentOrderId = dataOrder.order?.fulfillmentOrders.edges.find((e) => e.node.status === 'OPEN')?.node.id;
  if (!fulfillmentOrderId) throw new Error('Aucun fulfillment order ouvert pour cette commande');

  const data = await shopifyGraphQL<{
    fulfillmentCreateV2: { fulfillment: { id: string } | null; userErrors: { field: string[]; message: string }[] };
  }>(
    // Cf. discussion 2026-08-29 : "FulfillmentInput" (nom intuitif) n'est PAS le bon type attendu
    // par fulfillmentCreateV2 — Shopify renvoie une erreur de schéma explicite
    // ("FulfillmentV2Input" attendu), qui faisait échouer SILENCIEUSEMENT chaque création de
    // fulfillment depuis la mise en place de cette fonction (avalée par le try/catch appelant,
    // jamais surfacée) — confirmé en reproduisant l'appel en direct sur la commande #26590.
    `mutation($fulfillment: FulfillmentV2Input!) {
      fulfillmentCreateV2(fulfillment: $fulfillment) {
        fulfillment { id }
        userErrors { field message }
      }
    }`,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder: [{ fulfillmentOrderId }],
        trackingInfo: trackingInfoInput(params.trackingNumber, params.trackingUrl, params.trackingCompany),
        notifyCustomer: true,
      },
    },
  );

  const erreurs = data.fulfillmentCreateV2.userErrors;
  if (erreurs.length) throw new Error(erreurs.map((e) => e.message).join(', '));
  const fulfillmentId = data.fulfillmentCreateV2.fulfillment?.id;
  if (!fulfillmentId) throw new Error('fulfillmentCreateV2 sans id retourné');
  return { fulfillmentId };
}

// Cf. discussion 2026-08-29 : la mise à jour du suivi manquant vers Shopify tourne désormais en
// cron (Edge Function envoyer-suivis-boxtal, toutes les 24h) plutôt que depuis le Hub — logique
// équivalente réimplémentée en Deno, cf. supabase/functions/envoyer-suivis-boxtal/index.ts.
