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

export async function shopifyFetch(endpoint: string, method = 'GET', body: unknown = null) {
  const token = await getToken();
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

export async function shopifyFetchAll<T = unknown>(endpoint: string, key: string): Promise<T[]> {
  const token = await getToken();
  let results: T[] = [];
  let url: string | null = `${BASE_URL}${endpoint}`;

  while (url) {
    const res: Response = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) throw new Error(`Shopify API ${res.status}`);
    const data = await res.json();
    results = results.concat(data[key] ?? []);

    const link = res.headers.get('link') ?? '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return results;
}
