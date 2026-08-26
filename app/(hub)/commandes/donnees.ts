// Chargement des données "Commandes fournisseurs" — Server-only (utilise
// creerClientSupabaseServeur, qui importe next/headers). Séparé de lib/purchase-orders.ts pour
// que les types/constantes partagés restent importables depuis des Client Components sans casser
// le build webpack.
import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import type { ArticleCommande, CommandeFournisseur, HubPinLite, TypeCommande } from '@/lib/purchase-orders';

export async function chargerCommandes(): Promise<CommandeFournisseur[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('hub_purchase_orders')
    .select('*')
    .order('date_creation', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.airtable_id as string,
    ref: (r.ref as string) ?? '',
    createdAt: (r.date_creation as string) ?? new Date().toISOString(),
    supplier: (r.supplier as string) ?? '',
    label: (r.label as string) ?? '',
    status: r.statut === 'recu' ? 'received' : 'pending',
    receivedAt: (r.date_reception as string) ?? null,
    type: ((r.type as string) ?? 'normal') as TypeCommande,
    items: (r.items as ArticleCommande[]) ?? [],
    nbArticles: (r.nb_articles as number) ?? 0,
    quantiteTotale: Number(r.quantite_totale ?? 0),
  }));
}

export async function chargerPinsPourCommandes(): Promise<HubPinLite[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('hub_pins')
    .select('airtable_id, name, sku_pimpit, sku_fournisseur, fournisseur, stock, seuil_cible, image_url')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as HubPinLite[];
}
