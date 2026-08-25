// Script ponctuel : lit Airtable + Shopify en direct (mêmes identifiants que .env.local) et génère
// un fichier SQL (upsert par airtable_id / shopify_id) à appliquer sur les tables hub_* de
// Supabase. Ne touche à aucune donnée existante — uniquement les tables hub_* créées pour le Hub.
// Pas de dépendance ajoutée : parse .env.local à la main (même approche que les scripts de
// vérification précédents), utilise fetch natif.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../sync-sql/', import.meta.url), { recursive: true });
function ecrireTable(nom, lignes) {
  if (lignes.length === 0) return;
  writeFileSync(new URL(`../sync-sql/${nom}.sql`, import.meta.url), `begin;\n${lignes.join('\n')}\ncommit;\n`);
}

const envRaw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const AIRTABLE_TOKEN = env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = env.AIRTABLE_BASE_ID;
const SHOPIFY_STORE = env.SHOPIFY_STORE;
const SHOPIFY_CLIENT_ID = env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = env.SHOPIFY_CLIENT_SECRET;

const AT_BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AT_HEADERS = { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };

async function atGetAll(tableId) {
  const records = [];
  let offset = null;
  do {
    const url = `${AT_BASE}/${tableId}?${offset ? `offset=${offset}` : ''}`;
    const res = await fetch(url, { headers: AT_HEADERS });
    if (!res.ok) throw new Error(`Airtable ${tableId} → ${res.status}: ${await res.text()}`);
    const data = await res.json();
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset);
  return records;
}

async function shopifyToken() {
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Shopify OAuth → ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function shopifyProducts(token) {
  const products = [];
  let url = `https://${SHOPIFY_STORE}/admin/api/2024-10/products.json?limit=250`;
  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) throw new Error(`Shopify products → ${res.status}: ${await res.text()}`);
    const data = await res.json();
    products.push(...(data.products ?? []));
    const link = res.headers.get('Link') ?? res.headers.get('link');
    const next = link?.split(',').find((p) => p.includes('rel="next"'));
    url = next ? next.match(/<([^>]+)>/)?.[1] ?? null : null;
  }
  return products;
}

function sqlStr(v) {
  if (v === undefined || v === null || v === '') return 'null';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlNum(v) {
  if (v === undefined || v === null || v === '') return 'null';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : 'null';
}
function sqlBool(v) {
  return v ? 'true' : 'false';
}
function sqlJson(v) {
  if (v === undefined || v === null) return "'null'::jsonb";
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
}
function sqlDate(v) {
  if (!v) return 'null';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'null' : `'${d.toISOString()}'`;
}

const TABLES = {
  PINS: 'tblxNvwokhuYLiCHw',
  PURCHASE_ORDERS: 'tblwszDDCrSFGCRcr',
  PACKS: 'tbl8xJuklbXeecpSZ',
  RECOS: 'tblv4Dk9I1jlVdh4x',
  TACHES: 'tblnFo2y8XOZJVk88',
  SABOTS: 'tblVlc7f3rtBXnh96',
  SABOTS_CUSTOM: 'tblsA5graojlvh11J',
  PRODUITS_COMPL: 'tblvrVNasXS6bv45G',
  CLIENTS: 'tblCPBnhqtPvoItVK',
};

const FOURNISSEURS_LABEL = { J: 'Fournisseur J', JO: 'Fournisseur J', W: "WU Pin's", Wu: "WU Pin's" };

const lines = [];
lines.push('-- Généré par scripts/generer-sql-sync.mjs — synchronisation Airtable/Shopify → hub_*');
lines.push('begin;');

console.log('Lecture Pin\'s…');
const pins = await atGetAll(TABLES.PINS);
if (pins.length) {
  lines.push('insert into public.hub_pins (airtable_id, name, sku_pimpit, sku_fournisseur, stock, seuil_cible, fournisseur, boite, synced_at) values');
  lines.push(
    pins
      .map((r) => {
        const f = r.fields;
        return `  (${sqlStr(r.id)}, ${sqlStr(f['Name'])}, ${sqlStr(f['SKU Pimpit'])}, ${sqlStr(f['SKU Fournisseur'])}, ${sqlNum(f['Stock'])}, ${sqlNum(f['Seuil cible'])}, ${sqlStr(f['Fournisseur'])}, ${sqlStr(f['Boite'])}, now())`;
      })
      .join(',\n') + '\n',
  );
  lines.push(
    'on conflict (airtable_id) do update set name=excluded.name, sku_pimpit=excluded.sku_pimpit, sku_fournisseur=excluded.sku_fournisseur, stock=excluded.stock, seuil_cible=excluded.seuil_cible, fournisseur=excluded.fournisseur, boite=excluded.boite, synced_at=now();',
  );
}

console.log('Lecture commandes fournisseurs…');
const commandes = await atGetAll(TABLES.PURCHASE_ORDERS);
if (commandes.length) {
  lines.push(
    'insert into public.hub_purchase_orders (airtable_id, ref, date_creation, supplier, label, statut, date_reception, items, nb_articles, quantite_totale, synced_at) values',
  );
  const rows = commandes.map((r) => {
    const f = r.fields;
    let items = [];
    let refFromArticles = '';
    try {
      const parsed = JSON.parse(f['Articles'] || '[]');
      if (Array.isArray(parsed)) items = parsed;
      else {
        items = parsed.items ?? [];
        refFromArticles = parsed.ref ?? '';
      }
    } catch {}
    const ref = refFromArticles || f['Référence'] || f['Reference'] || '';
    const supplierCode = f['Fournisseur'] || '';
    const statut = f['Statut'] === 'recu' ? 'recu' : 'en_attente';
    const nbArticles = items.length;
    const qteTotale = items.reduce((s, i) => s + (i.qty ?? 0), 0);
    return `  (${sqlStr(r.id)}, ${sqlStr(ref)}, ${sqlDate(f['Date'])}, ${sqlStr(supplierCode)}, ${sqlStr(f['Label'])}, ${sqlStr(statut)}, ${sqlDate(f['Date réception'])}, ${sqlJson(items)}, ${nbArticles}, ${qteTotale}, now())`;
  });
  lines.push(rows.join(',\n') + '\n');
  lines.push(
    'on conflict (airtable_id) do update set ref=excluded.ref, date_creation=excluded.date_creation, supplier=excluded.supplier, label=excluded.label, statut=excluded.statut, date_reception=excluded.date_reception, items=excluded.items, nb_articles=excluded.nb_articles, quantite_totale=excluded.quantite_totale, synced_at=now();',
  );
}

console.log('Lecture packs…');
const packs = await atGetAll(TABLES.PACKS);
if (packs.length) {
  lines.push(
    'insert into public.hub_packs (airtable_id, nom_du_pack, sku_shopify, photo_url, stock_max, probleme, qtes_pins, pins_inclus_count, synced_at) values',
  );
  const rows = packs.map((r) => {
    const f = r.fields;
    const photoUrl = f['Photo']?.[0]?.thumbnails?.small?.url ?? f['Photo']?.[0]?.url ?? null;
    let qtesPins = null;
    try {
      qtesPins = f['Qtes pins'] ? JSON.parse(f['Qtes pins']) : null;
    } catch {}
    return `  (${sqlStr(r.id)}, ${sqlStr(f['Nom du pack'])}, ${sqlStr(f['SKU Shopify'])}, ${sqlStr(photoUrl)}, ${sqlNum(f['Stock max'])}, ${sqlBool(f['Probleme'])}, ${sqlJson(qtesPins)}, ${(f['Pins inclus'] ?? []).length}, now())`;
  });
  lines.push(rows.join(',\n') + '\n');
  lines.push(
    'on conflict (airtable_id) do update set nom_du_pack=excluded.nom_du_pack, sku_shopify=excluded.sku_shopify, photo_url=excluded.photo_url, stock_max=excluded.stock_max, probleme=excluded.probleme, qtes_pins=excluded.qtes_pins, pins_inclus_count=excluded.pins_inclus_count, synced_at=now();',
  );
}

console.log('Lecture sabots…');
const sabots = await atGetAll(TABLES.SABOTS);
if (sabots.length) {
  lines.push('insert into public.hub_sabots (airtable_id, couleur, taille, stock, sku, inventory_item_id, synced_at) values');
  lines.push(
    sabots
      .map((r) => {
        const f = r.fields;
        return `  (${sqlStr(r.id)}, ${sqlStr(f['Couleur'])}, ${sqlStr(f['Taille'])}, ${sqlNum(f['Stock'])}, ${sqlStr(f['SKU'])}, ${sqlStr(f['Inventory Item ID'])}, now())`;
      })
      .join(',\n') + '\n',
  );
  lines.push(
    'on conflict (airtable_id) do update set couleur=excluded.couleur, taille=excluded.taille, stock=excluded.stock, sku=excluded.sku, inventory_item_id=excluded.inventory_item_id, synced_at=now();',
  );
}

console.log('Lecture sabots personnalisés…');
const sabotsCustom = await atGetAll(TABLES.SABOTS_CUSTOM);
if (sabotsCustom.length) {
  lines.push(
    'insert into public.hub_sabots_custom (airtable_id, nom, sku_shopify, photo_url, shopify_product_id, pins_inclus_count, synced_at) values',
  );
  const rows = sabotsCustom.map((r) => {
    const f = r.fields;
    const photoUrl = f['Photo']?.[0]?.thumbnails?.small?.url ?? f['Photo']?.[0]?.url ?? null;
    let nbPins = (f["Pin's inclus"] ?? []).length;
    if (typeof f['Qtes pins'] === 'string' && f['Qtes pins'].trim()) {
      try {
        const parsed = JSON.parse(f['Qtes pins']);
        if (Array.isArray(parsed)) {
          const total = parsed.reduce((s, item) => {
            const qty = typeof item === 'object' && item ? Number(item.qty ?? 0) : Number(item);
            return s + (Number.isFinite(qty) ? qty : 0);
          }, 0);
          if (total > 0) nbPins = total;
        }
      } catch {}
    }
    return `  (${sqlStr(r.id)}, ${sqlStr(f['Nom'])}, ${sqlStr(f['SKU Shopify'])}, ${sqlStr(photoUrl)}, ${sqlStr(f['Shopify Product ID'])}, ${nbPins}, now())`;
  });
  lines.push(rows.join(',\n') + '\n');
  lines.push(
    'on conflict (airtable_id) do update set nom=excluded.nom, sku_shopify=excluded.sku_shopify, photo_url=excluded.photo_url, shopify_product_id=excluded.shopify_product_id, pins_inclus_count=excluded.pins_inclus_count, synced_at=now();',
  );
}

console.log('Lecture produits complémentaires…');
const produitsCompl = await atGetAll(TABLES.PRODUITS_COMPL);
if (produitsCompl.length) {
  lines.push('insert into public.hub_produits_complementaires (airtable_id, nom, photo_url, prix, actif, description, synced_at) values');
  const rows = produitsCompl.map((r) => {
    const f = r.fields;
    const photoUrl = f['Photo']?.[0]?.thumbnails?.small?.url ?? f['Photo']?.[0]?.url ?? null;
    return `  (${sqlStr(r.id)}, ${sqlStr(f['Nom'])}, ${sqlStr(photoUrl)}, ${sqlNum(f['Prix'])}, ${sqlBool(f['Actif'])}, ${sqlStr(f['Description'])}, now())`;
  });
  lines.push(rows.join(',\n') + '\n');
  lines.push(
    'on conflict (airtable_id) do update set nom=excluded.nom, photo_url=excluded.photo_url, prix=excluded.prix, actif=excluded.actif, description=excluded.description, synced_at=now();',
  );
}

console.log('Lecture clients…');
const clients = await atGetAll(TABLES.CLIENTS);
if (clients.length) {
  lines.push(
    'insert into public.hub_clients (airtable_id, email, prenom, nom, telephone, ville, code_postal, source, date_inscription, nb_commandes, total_depense, synced_at) values',
  );
  const rows = clients.map((r) => {
    const f = r.fields;
    return `  (${sqlStr(r.id)}, ${sqlStr(f['Email'])}, ${sqlStr(f['Prénom'])}, ${sqlStr(f['Nom'])}, ${sqlStr(f['Téléphone'])}, ${sqlStr(f['Ville'])}, ${sqlStr(f['Code postal'])}, ${sqlStr(f['Source'])}, ${sqlDate(f['Date inscription'])}, ${sqlNum(f['Nb commandes'])}, ${sqlNum(f['Total dépensé'])}, now())`;
  });
  lines.push(rows.join(',\n') + '\n');
  lines.push(
    'on conflict (airtable_id) do update set email=excluded.email, prenom=excluded.prenom, nom=excluded.nom, telephone=excluded.telephone, ville=excluded.ville, code_postal=excluded.code_postal, source=excluded.source, date_inscription=excluded.date_inscription, nb_commandes=excluded.nb_commandes, total_depense=excluded.total_depense, synced_at=now();',
  );
}

console.log('Lecture tâches…');
const taches = await atGetAll(TABLES.TACHES);
if (taches.length) {
  lines.push('insert into public.hub_taches (airtable_id, titre, assigne_a, priorite, statut, date_limite, notes, synced_at) values');
  const rows = taches.map((r) => {
    const f = r.fields;
    const dateLimite = f['Date limite'] ? `'${f['Date limite']}'::date` : 'null';
    return `  (${sqlStr(r.id)}, ${sqlStr(f['Titre'])}, ${sqlStr(f['Assigné à'])}, ${sqlStr(f['Priorité'])}, ${sqlStr(f['Statut'])}, ${dateLimite}, ${sqlStr(f['Notes'])}, now())`;
  });
  lines.push(rows.join(',\n') + '\n');
  lines.push(
    'on conflict (airtable_id) do update set titre=excluded.titre, assigne_a=excluded.assigne_a, priorite=excluded.priorite, statut=excluded.statut, date_limite=excluded.date_limite, notes=excluded.notes, synced_at=now();',
  );
}

console.log('Lecture recommandations…');
const recos = await atGetAll(TABLES.RECOS);
if (recos.length) {
  lines.push('insert into public.hub_recommandations (airtable_id, auteur, message, categorie, synced_at) values');
  lines.push(
    recos
      .map((r) => {
        const f = r.fields;
        return `  (${sqlStr(r.id)}, ${sqlStr(f['Auteur'])}, ${sqlStr(f['Message'])}, ${sqlStr(f['Categorie'])}, now())`;
      })
      .join(',\n') + '\n',
  );
  lines.push('on conflict (airtable_id) do update set auteur=excluded.auteur, message=excluded.message, categorie=excluded.categorie, synced_at=now();');
}

console.log('Lecture produits Shopify…');
const token = await shopifyToken();
const produitsShopify = await shopifyProducts(token);
if (produitsShopify.length) {
  lines.push('insert into public.hub_produits_shopify (shopify_id, titre, statut, prix, stock, synced_at) values');
  const rows = produitsShopify.map((p) => {
    const variante = p.variants?.[0];
    return `  (${sqlStr(String(p.id))}, ${sqlStr(p.title)}, ${sqlStr(p.status)}, ${sqlNum(variante?.price)}, ${sqlNum(variante?.inventory_quantity)}, now())`;
  });
  lines.push(rows.join(',\n') + '\n');
  lines.push('on conflict (shopify_id) do update set titre=excluded.titre, statut=excluded.statut, prix=excluded.prix, stock=excluded.stock, synced_at=now();');
}

lines.push('commit;');

writeFileSync(new URL('../sync.sql', import.meta.url), lines.join('\n'));
console.log('OK → sync.sql généré.');
console.log({
  pins: pins.length,
  commandes: commandes.length,
  packs: packs.length,
  sabots: sabots.length,
  sabotsCustom: sabotsCustom.length,
  produitsCompl: produitsCompl.length,
  clients: clients.length,
  taches: taches.length,
  recos: recos.length,
  produitsShopify: produitsShopify.length,
});
