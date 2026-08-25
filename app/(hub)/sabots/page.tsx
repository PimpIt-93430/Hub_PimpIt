import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { NouveauSabotForm } from './NouveauSabotForm';
import { SabotRow } from './SabotRow';

interface HubSabot {
  airtable_id: string;
  couleur: string | null;
  taille: string | null;
  stock: number | null;
  sku: string | null;
  inventory_item_id: string | null;
  synced_at: string | null;
}

/** Gestion complète sur Supabase (hub_sabots) — Supabase est désormais la base d'origine du Hub :
 * créer/modifier/supprimer ici n'écrit que dans Supabase, pas dans Airtable (cf. actions.ts). Les
 * sabots déjà synchronisés depuis Airtable restent affichés normalement. */
export default async function SabotsPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_sabots').select('*').order('couleur').order('taille');
  const sabots = (data ?? []) as HubSabot[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Sabots</h1>
      <p className="mb-6 text-sm text-slate-400">{sabots.length} sabots — géré depuis Supabase.</p>

      <NouveauSabotForm />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Couleur</th>
              <th className="px-4 py-3">Taille</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sabots.map((s) => (
              <SabotRow key={s.airtable_id} sabot={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
