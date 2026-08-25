import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { NouveauSabotCustomForm } from './NouveauSabotCustomForm';
import { SabotCustomRow } from './SabotCustomRow';

interface HubSabotCustom {
  airtable_id: string;
  nom: string | null;
  sku_shopify: string | null;
  photo_url: string | null;
  shopify_product_id: string | null;
  pins_inclus_count: number | null;
  synced_at: string | null;
}

/** Gestion complète sur Supabase (hub_sabots_custom) — Supabase est désormais la base d'origine du
 * Hub : créer/modifier/supprimer ici n'écrit que dans Supabase, pas dans Airtable (cf. actions.ts).
 * Les sabots personnalisés déjà synchronisés depuis Airtable restent affichés normalement. */
export default async function SabotsCustomPage() {
  const supabase = await creerClientSupabaseServeur();
  const [{ data }, { data: pins }] = await Promise.all([
    supabase.from('hub_sabots_custom').select('*').order('nom'),
    supabase.from('hub_pins').select('airtable_id, name').order('name'),
  ]);
  const sabotsCustom = (data ?? []) as HubSabotCustom[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Sabots personnalisés</h1>
      <p className="mb-6 text-sm text-slate-400">
        {sabotsCustom.length} sabots personnalisés — géré depuis Supabase.
      </p>

      <NouveauSabotCustomForm pins={pins ?? []} />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Photo</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">SKU Shopify</th>
              <th className="px-4 py-3">Pin&apos;s inclus</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sabotsCustom.map((s) => (
              <SabotCustomRow key={s.airtable_id} sabotCustom={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
