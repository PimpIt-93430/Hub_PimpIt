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
    stockIncremente: Boolean(r.stock_incremente),
  }));
}

/** Cf. migration 0096 (App PIMP IT) : hub_pins et stock_pins (utilisée par l'app Pimp It) avaient
 * dérivé — 548 pins sur 691 avec un stock différent, jusqu'à 1300+ unités d'écart, faute de
 * synchro depuis la bascule Airtable. Le Hub lit désormais stock_pins directement (source de
 * vérité de l'app), mappé vers la même forme HubPinLite qu'avant pour ne pas toucher au reste du
 * code qui la consomme. */
export async function chargerPinsPourCommandes(): Promise<HubPinLite[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('stock_pins')
    .select('airtable_record_id, nom, sku_pimpit, sku_fournisseur, fournisseur, stock_general, seuil_cible, photo_url')
    .order('nom', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    airtable_id: r.airtable_record_id as string,
    name: r.nom as string,
    sku_pimpit: r.sku_pimpit as string | null,
    sku_fournisseur: r.sku_fournisseur as string | null,
    fournisseur: r.fournisseur as string | null,
    stock: r.stock_general as number | null,
    seuil_cible: r.seuil_cible as number | null,
    image_url: r.photo_url as string | null,
  }));
}
