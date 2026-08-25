import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface HubPin {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  sku_fournisseur: string | null;
  stock: number | null;
  seuil_cible: number | null;
  fournisseur: string | null;
  boite: string | null;
}

/** Lit le miroir Supabase (hub_pins), synchronisé depuis Airtable T_PINS — plus d'appel direct à
 * Airtable ici (cf. script de synchronisation dans Pimp It Hub/scripts). */
export default async function PinsPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_pins').select('*').order('name');
  const pins = (data ?? []) as HubPin[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Pin&apos;s</h1>
      <p className="mb-6 text-sm text-slate-400">
        {pins.length} pin&apos;s — depuis Supabase (synchronisé depuis Airtable).
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">SKU Pimp It</th>
              <th className="px-4 py-3">SKU Fournisseur</th>
              <th className="px-4 py-3">Fournisseur</th>
              <th className="px-4 py-3">Boîte</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Seuil cible</th>
            </tr>
          </thead>
          <tbody>
            {pins.map((p) => {
              const sousLeSeuil = (p.stock ?? 0) < (p.seuil_cible ?? 0);
              return (
                <tr key={p.airtable_id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{p.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.sku_pimpit ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.sku_fournisseur ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.fournisseur ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.boite ?? '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${sousLeSeuil ? 'text-amber-600' : 'text-slate-700'}`}>
                    {p.stock ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{p.seuil_cible ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
