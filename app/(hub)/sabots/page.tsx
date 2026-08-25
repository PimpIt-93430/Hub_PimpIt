import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface HubSabot {
  airtable_id: string;
  couleur: string | null;
  taille: string | null;
  stock: number | null;
  sku: string | null;
  inventory_item_id: string | null;
  synced_at: string | null;
}

/** Lit le miroir Supabase (hub_sabots), synchronisé depuis Airtable T_SABOTS — plus d'appel direct
 * à Airtable ici (cf. script de synchronisation dans Pimp It Hub/scripts). */
export default async function SabotsPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_sabots').select('*').order('couleur').order('taille');
  const sabots = (data ?? []) as HubSabot[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Sabots</h1>
      <p className="mb-6 text-sm text-slate-400">
        {sabots.length} sabots — depuis Supabase (synchronisé depuis Airtable).
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Couleur</th>
              <th className="px-4 py-3">Taille</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Stock</th>
            </tr>
          </thead>
          <tbody>
            {sabots.map((s) => (
              <tr key={s.airtable_id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-slate-800">{s.couleur ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.taille ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.sku ?? '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{s.stock ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
