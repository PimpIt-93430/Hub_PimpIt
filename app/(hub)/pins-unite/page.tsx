import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { shopifyFetch } from '@/lib/shopify';
import { NouveauProduitUniteForm } from './NouveauProduitUniteForm';

interface HubPin {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  stock: number | null;
}

/** Réplique l'écran "Pin's à rajouter sur le site" de l'ancien site : liste les pins encore
 * cochés "pas dans pin's unité" dans Supabase, et permet d'en créer un nouveau produit Shopify
 * "Pin's à l'unité" (cf. actions.ts) — remplace le flux Airtable + Shopify de l'ancien site,
 * Supabase étant désormais la base d'origine du Hub côté catalogue. */
export default async function PinsUnitePage() {
  const supabase = await creerClientSupabaseServeur();
  const { data: pinsARajouter } = await supabase
    .from('hub_pins')
    .select('airtable_id, name, sku_pimpit, stock')
    .eq('pas_dans_unite', true)
    .order('name');
  const { data: tousLesPins } = await supabase.from('hub_pins').select('airtable_id, name').order('name');

  let collections: { id: string; title: string; handle: string }[] = [];
  try {
    const data = await shopifyFetch('/custom_collections.json?limit=250');
    collections = (data.custom_collections ?? []).map((c: { id: number; title: string; handle: string }) => ({
      id: String(c.id),
      title: c.title,
      handle: c.handle,
    }));
  } catch (e) {
    console.warn('Collections Shopify indisponibles :', e instanceof Error ? e.message : e);
  }

  const pins = (pinsARajouter ?? []) as HubPin[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Pin&apos;s à l&apos;unité</h1>
      <p className="mb-6 text-sm text-slate-400">
        {pins.length} pin&apos;s pas encore ajoutés à un produit — crée un vrai produit Shopify
        depuis une sélection de pin&apos;s, comme sur l&apos;ancien site.
      </p>

      <NouveauProduitUniteForm pins={tousLesPins ?? []} collections={collections} />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">SKU Pimp It</th>
              <th className="px-4 py-3 text-right">Stock</th>
            </tr>
          </thead>
          <tbody>
            {pins.map((p) => (
              <tr key={p.airtable_id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-slate-800">{p.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{p.sku_pimpit ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{p.stock ?? 0}</td>
              </tr>
            ))}
            {pins.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  Tous les pin&apos;s sont déjà dans des produits.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
