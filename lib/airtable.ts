// Port TypeScript de Shopify Pimp IT/admin/lib/airtable.js (fichier original non touché) — mêmes
// identifiants (AIRTABLE_TOKEN/AIRTABLE_BASE_ID), même comportement. atPost/atPatch/atDelete sont
// portés pour rester prêts, mais volontairement pas encore appelés depuis aucune route du Hub :
// première itération en lecture seule sur Airtable (cf. plan).
const TOKEN = process.env.AIRTABLE_TOKEN!;
const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const BASE = `https://api.airtable.com/v0/${BASE_ID}`;

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

export interface AirtableRecord<TFields = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: TFields;
}

export async function atGet<TFields = Record<string, unknown>>(
  tableId: string,
  params: Record<string, string | string[]> = {},
): Promise<AirtableRecord<TFields>[]> {
  // Airtable attend fields[] pour les tableaux, pas fields.
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (Array.isArray(val)) {
      for (const v of val) qs.append(`${key}[]`, v);
    } else {
      qs.append(key, val);
    }
  }

  const records: AirtableRecord<TFields>[] = [];
  let offset: string | null = null;

  do {
    const paginated: string = offset ? `${qs}&offset=${offset}` : qs.toString();
    const url = `${BASE}/${tableId}?${paginated}`;
    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`Airtable GET ${tableId} → ${res.status}: ${await res.text()}`);
    const data = await res.json();
    records.push(...(data.records ?? []));
    offset = data.offset ?? null;
  } while (offset);

  return records;
}

export async function atPatch(tableId: string, updates: { id: string; fields: Record<string, unknown> }[]) {
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    const res = await fetch(`${BASE}/${tableId}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ records: batch }),
    });
    if (!res.ok) throw new Error(`Airtable PATCH ${tableId} → ${res.status}: ${await res.text()}`);
  }
}

export async function atPost(tableId: string, records: { fields: Record<string, unknown> }[]) {
  const created: AirtableRecord[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(`${BASE}/${tableId}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ records: batch }),
    });
    if (!res.ok) throw new Error(`Airtable POST ${tableId} → ${res.status}: ${await res.text()}`);
    const data = await res.json();
    created.push(...(data.records ?? []));
  }
  return created;
}

export async function atDelete(tableId: string, recordId: string) {
  const res = await fetch(`${BASE}/${tableId}/${recordId}`, { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Airtable DELETE ${tableId}/${recordId} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// Table IDs connus (mêmes valeurs que Shopify Pimp IT/admin, cf. plan/exploration) — centralisés
// ici pour que les routes du Hub n'aient jamais à recopier un ID à la main.
export const TABLES = {
  PINS: 'tblxNvwokhuYLiCHw',
  PURCHASE_ORDERS: 'tblwszDDCrSFGCRcr',
  PACKS: 'tbl8xJuklbXeecpSZ',
  PARAMETRES: 'tblGETvyj6lX6rTov',
  RECOS: 'tblv4Dk9I1jlVdh4x',
  TACHES: 'tblnFo2y8XOZJVk88',
  SABOTS: 'tblVlc7f3rtBXnh96',
  SABOTS_CUSTOM: 'tblsA5graojlvh11J',
  PRODUITS_COMPL: 'tblvrVNasXS6bv45G',
  CLIENTS: 'tblCPBnhqtPvoItVK',
  COMMANDES: 'tbljHPfJHCRm9jrzt',
} as const;
