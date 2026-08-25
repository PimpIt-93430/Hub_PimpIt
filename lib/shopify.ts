// Port TypeScript de Shopify Pimp IT/admin/lib/shopify.js (fichier original non touché) — mêmes
// identifiants (SHOPIFY_STORE/CLIENT_ID/CLIENT_SECRET), même flux OAuth client-credentials avec
// cache de token 24h. Lecture seule utilisée pour l'instant côté Hub (cf. plan) ; shopifyFetch en
// écriture reste disponible mais volontairement pas encore appelé.
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
