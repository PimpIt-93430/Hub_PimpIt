// Lit le miroir Supabase (hub_purchase_orders), synchronisé depuis Airtable (commandes
// fournisseurs pin's) — les champs y sont déjà parsés (plus besoin de décoder le JSON `Articles`
// à la volée). Note : la synchronisation initiale est partielle (7 commandes sur 32 au
// 2026-08-25) — les commandes les plus volumineuses (gros réassorts avec 100+ articles) seront
// ajoutées dans une prochaine synchronisation.
import { creerClientSupabaseServeur } from './supabase/server';

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

export async function chargerCommandes(): Promise<CommandeFournisseur[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase
    .from('hub_purchase_orders')
    .select('*')
    .order('date_creation', { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.airtable_id as string,
    ref: (r.ref as string) ?? '',
    createdAt: (r.date_creation as string) ?? new Date().toISOString(),
    supplier: (r.supplier as string) ?? '',
    label: (r.label as string) ?? '',
    status: r.statut === 'recu' ? 'received' : 'pending',
    receivedAt: (r.date_reception as string) ?? null,
    items: (r.items as ArticleCommande[]) ?? [],
    nbArticles: (r.nb_articles as number) ?? 0,
    quantiteTotale: (r.quantite_totale as number) ?? 0,
  }));
}
