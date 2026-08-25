import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface HubReco {
  airtable_id: string;
  auteur: string | null;
  message: string | null;
  categorie: string | null;
}

/** Lit le miroir Supabase (hub_recommandations), synchronisé depuis Airtable T_RECOS — plus
 * d'appel direct à Airtable ici (cf. script de synchronisation dans Pimp It Hub/scripts). */
export default async function RecommandationsPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_recommandations').select('*');
  const recos = (data ?? []) as HubReco[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Recommandations</h1>
      <p className="mb-6 text-sm text-slate-400">
        {recos.length} recommandations — depuis Supabase (synchronisé depuis Airtable).
      </p>

      <div className="flex flex-col gap-2">
        {recos.map((r) => (
          <div key={r.airtable_id} className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">{r.auteur || 'Anonyme'}</p>
              {r.categorie && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {r.categorie}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-500">{r.message || '—'}</p>
          </div>
        ))}
        {recos.length === 0 && <p className="text-sm text-slate-400">Aucune recommandation.</p>}
      </div>
    </div>
  );
}
