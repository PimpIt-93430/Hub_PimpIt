// Port TypeScript en lecture seule de la logique de parsing de
// Shopify Pimp IT/admin/lib/purchase-orders.js (fichier original non touché) — mêmes noms de
// champs Airtable, même format `Articles` (JSON encodé dans un champ texte). Pas encore de
// création/modification de commande depuis le Hub (cf. plan, phase suivante).
import { atGet, TABLES } from './airtable';

export const FOURNISSEURS: Record<string, { label: string; codes: string[] }> = {
  J: { label: 'Fournisseur J', codes: ['J', 'JO'] },
  W: { label: "WU Pin's", codes: ['W', 'Wu'] },
};

export interface ArticleCommande {
  airtableId?: string;
  name?: string;
  skuPimpit?: string;
  skuFournisseur?: string;
  stockActuel?: number;
  qty?: number;
}

export interface CommandeFournisseur {
  id: string;
  ref: string;
  createdAt: string;
  supplier: string;
  label: string;
  status: 'received' | 'pending';
  receivedAt: string | null;
  items: ArticleCommande[];
  nbArticles: number;
  quantiteTotale: number;
}

function parseRecord(r: { id: string; fields: Record<string, unknown> }): CommandeFournisseur {
  const f = r.fields as Record<string, string | undefined>;
  let items: ArticleCommande[] = [];
  let refFromArticles = '';
  try {
    const parsed = JSON.parse((f['Articles'] as string) || '[]');
    if (Array.isArray(parsed)) {
      items = parsed;
    } else {
      items = parsed.items ?? [];
      refFromArticles = parsed.ref ?? '';
    }
  } catch {
    // Champ vide ou format inattendu : on retombe sur une commande sans article plutôt que de
    // faire échouer tout l'affichage.
  }

  return {
    id: r.id,
    ref: refFromArticles || f['Référence'] || f['Reference'] || '',
    createdAt: f['Date'] || new Date().toISOString(),
    supplier: f['Fournisseur'] || '',
    label: f['Label'] || '',
    status: f['Statut'] === 'recu' ? 'received' : 'pending',
    receivedAt: f['Date réception'] ?? null,
    items,
    nbArticles: items.length,
    quantiteTotale: items.reduce((s, i) => s + (i.qty ?? 0), 0),
  };
}

export async function chargerCommandes(): Promise<CommandeFournisseur[]> {
  const rows = await atGet(TABLES.PURCHASE_ORDERS, {});
  return rows.map(parseRecord).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
