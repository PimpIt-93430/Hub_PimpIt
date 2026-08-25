import { shopifyFetchAll } from '@/lib/shopify';

interface ProduitShopify {
  id: number;
  title: string;
  status: string;
  variants: { price: string; inventory_quantity: number }[];
}

function formatPrix(prix: string): string {
  return `${Number(prix).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`;
}

/** Lecture seule pour l'instant (cf. plan) — appelle directement l'API Admin Shopify avec les
 * mêmes identifiants que Shopify Pimp IT/admin, sans toucher à ce serveur ni au thème. */
export default async function ProduitsPage() {
  const produits = await shopifyFetchAll<ProduitShopify>('/products.json?limit=250', 'products');

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Produits Shopify</h1>
      <p className="mb-6 text-sm text-slate-400">
        {produits.length} produits — depuis Shopify, lecture seule pour l&apos;instant.
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
            {produits.map((p) => {
              const variante = p.variants?.[0];
              return (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{p.title}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.status === 'active' ? 'Actif' : p.status}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {variante ? formatPrix(variante.price) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {variante ? variante.inventory_quantity : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
