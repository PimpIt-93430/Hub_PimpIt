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
