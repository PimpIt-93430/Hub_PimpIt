import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { NouveauTacheForm } from './NouveauTacheForm';
import { TacheRow } from './TacheRow';

interface HubTache {
  airtable_id: string;
  titre: string | null;
  assigne_a: string | null;
  priorite: string | null;
  statut: string | null;
  date_limite: string | null;
  notes: string | null;
}

/** Gestion complète sur Supabase (hub_taches) — Supabase est désormais la base d'origine du Hub :
 * créer/modifier/supprimer ici n'écrit que dans Supabase, pas dans Airtable (cf. actions.ts). Les
 * tâches déjà synchronisées depuis Airtable restent affichées normalement. */
export default async function TachesPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase
    .from('hub_taches')
    .select('*')
    .order('date_limite', { ascending: true, nullsFirst: false });
  const taches = (data ?? []) as HubTache[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Tâches</h1>
      <p className="mb-6 text-sm text-slate-400">{taches.length} tâches — géré depuis Supabase.</p>

      <NouveauTacheForm />

      <div className="flex flex-col gap-2">
        {taches.map((t) => (
          <TacheRow key={t.airtable_id} tache={t} />
        ))}
        {taches.length === 0 && <p className="text-sm text-slate-400">Aucune tâche.</p>}
      </div>
    </div>
  );
}
