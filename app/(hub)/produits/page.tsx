import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface HubProduitShopify {
  shopify_id: string;
  titre: string | null;
  statut: string | null;
  prix: number | null;
  stock: number | null;
}

function formatPrix(prix: number): string {
  return `${prix.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`;
}

/** Lit le miroir Supabase (hub_produits_shopify), synchronisé depuis Shopify — plus d'appel
 * direct à l'API Admin Shopify ici (cf. script de synchronisation dans Pimp It Hub/scripts). */
export default async function ProduitsPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_produits_shopify').select('*').order('titre');
  const produits = (data ?? []) as HubProduitShopify[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Produits Shopify</h1>
      <p className="mb-6 text-sm text-slate-400">
        {produits.length} produits — depuis Supabase (synchronisé depuis Shopify).
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Produit</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3 text-right">Prix</th>
              <th className="px-4 py-3 text-right">Stock</th>
            </tr>
          </thead>
          <tbody>
            {produits.map((p) => (
              <tr key={p.shopify_id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-slate-800">{p.titre}</td>
                <td className="px-4 py-2.5 text-slate-500">{p.statut === 'active' ? 'Actif' : p.statut}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">
                  {p.prix != null ? formatPrix(p.prix) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-700">{p.stock ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
