import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface HubSabotCustom {
  airtable_id: string;
  nom: string | null;
  sku_shopify: string | null;
  photo_url: string | null;
  shopify_product_id: string | null;
  pins_inclus_count: number | null;
  synced_at: string | null;
}

/** Lit le miroir Supabase (hub_sabots_custom), synchronisé depuis Airtable T_SABOTS_CUSTOM — plus
 * d'appel direct à Airtable ici (cf. script de synchronisation dans Pimp It Hub/scripts). */
export default async function SabotsCustomPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_sabots_custom').select('*').order('nom');
  const sabotsCustom = (data ?? []) as HubSabotCustom[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Sabots personnalisés</h1>
      <p className="mb-6 text-sm text-slate-400">
        {sabotsCustom.length} sabots personnalisés — depuis Supabase (synchronisé depuis Airtable).
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Photo</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">SKU Shopify</th>
              <th className="px-4 py-3">Pin&apos;s inclus</th>
            </tr>
          </thead>
          <tbody>
            {sabotsCustom.map((s) => {
              const nbPins = s.pins_inclus_count ?? 0;
              return (
                <tr key={s.airtable_id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5">
                    {s.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.photo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{s.nom ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{s.sku_shopify ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {nbPins > 0 ? `${nbPins} pin${nbPins > 1 ? "'s" : "'"}` : '—'}
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
