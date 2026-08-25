import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { NouveauPackForm } from './NouveauPackForm';
import { PackRow } from './PackRow';

interface HubPack {
  airtable_id: string;
  nom_du_pack: string | null;
  sku_shopify: string | null;
  photo_url: string | null;
  stock_max: number | null;
  probleme: boolean | null;
  qtes_pins: Record<string, number> | null;
  pins_inclus_count: number | null;
  synced_at: string | null;
}

/** Gestion complète sur Supabase (hub_packs) — Supabase est désormais la base d'origine du Hub :
 * créer/modifier/supprimer ici n'écrit que dans Supabase, pas dans Airtable (cf. actions.ts). Les
 * packs déjà synchronisés depuis Airtable restent affichés normalement. */
export default async function PacksPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_packs').select('*').order('nom_du_pack');
  const packs = (data ?? []) as HubPack[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Packs de pin&apos;s</h1>
      <p className="mb-6 text-sm text-slate-400">{packs.length} packs — géré depuis Supabase.</p>

      <NouveauPackForm />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Photo</th>
              <th className="px-4 py-3">Nom du pack</th>
              <th className="px-4 py-3">SKU Shopify</th>
              <th className="px-4 py-3 text-right">Pins inclus</th>
              <th className="px-4 py-3 text-right">Qté totale</th>
              <th className="px-4 py-3 text-right">Stock max</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {packs.map((p) => (
              <PackRow key={p.airtable_id} pack={p} />
            ))}
            {packs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  Aucun pack.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
