import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { NouveauRecommandationForm } from './NouveauRecommandationForm';
import { RecommandationRow } from './RecommandationRow';

interface HubReco {
  airtable_id: string;
  auteur: string | null;
  message: string | null;
  categorie: string | null;
}

/** Gestion complète sur Supabase (hub_recommandations) — Supabase est désormais la base d'origine
 * du Hub : créer/modifier/supprimer ici n'écrit que dans Supabase, pas dans Airtable (cf.
 * actions.ts). Les recommandations déjà synchronisées depuis Airtable restent affichées
 * normalement. */
export default async function RecommandationsPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_recommandations').select('*');
  const recos = (data ?? []) as HubReco[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Recommandations</h1>
      <p className="mb-6 text-sm text-slate-400">{recos.length} recommandations — géré depuis Supabase.</p>

      <NouveauRecommandationForm />

      <div className="flex flex-col gap-2">
        {recos.map((r) => (
          <RecommandationRow key={r.airtable_id} reco={r} />
        ))}
        {recos.length === 0 && <p className="text-sm text-slate-400">Aucune recommandation.</p>}
      </div>
    </div>
  );
}
