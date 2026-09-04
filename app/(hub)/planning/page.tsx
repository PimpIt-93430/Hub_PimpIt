import { determinerRoleHub } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { dateEnISO, dateDepuisISO, joursDeLaSemaine } from './dateUtils';
import { PlanningClient } from './PlanningClient';
import type { Conge, JourEcoleAlternant, PlanningShift, PopUp, Profile } from './types';

/** Réplique l'écran Calendrier admin (vue desktop web) de l'app Pimp It
 * (App PIMP IT/app/(app)/admin/calendrier.tsx + src/components/calendrier/*) — mêmes tables
 * réelles (planning_shifts, conges, jours_ecole_alternant, profil_pop_ups), pas un miroir hub_*.
 * Semaine choisie via ?semaine= (lundi ISO de la semaine visée), le composant client change cette
 * query string pour naviguer — cette page (Server Component) refait alors le fetch pour la
 * nouvelle semaine. horaires_recurrents_profil/regles_horaires_ouverture ne sont pas chargés ici :
 * seule la génération auto (bouton "Générer", cf. actions.ts genererEtInsererPlanning) en a
 * besoin, et les refetch elle-même au moment de s'exécuter. */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string }>;
}) {
  const params = await searchParams;
  const { role } = await determinerRoleHub();
  // Rôle "comptable" (cf. lib/roles.ts, migration 0092) : mêmes données, mais sans les actions
  // d'édition côté client (cf. PlanningClient) — l'écriture reste de toute façon bloquée côté
  // serveur (exigerAccesEcriture) si jamais quelqu'un contournait l'UI.
  const lectureSeule = role === 'comptable';
  const supabase = await creerClientSupabaseServeur();

  const dateReference = params.semaine ? dateDepuisISO(params.semaine) : new Date();
  const jours = joursDeLaSemaine(dateReference);
  const dateDebut = dateEnISO(jours[0]);
  const dateFin = dateEnISO(jours[6]);

  const [{ data: popUps }, { data: profils }, { data: affectations }, { data: shifts }, { data: conges }, { data: joursEcole }] =
    await Promise.all([
      supabase
        .from('pop_ups')
        .select(
          'id, nom, couleur, actif, date_debut, matin_debut, matin_fin, matin_pause_debut, matin_pause_fin, apres_midi_debut, apres_midi_fin, apres_midi_pause_debut, apres_midi_pause_fin',
        )
        .eq('actif', true)
        .order('nom'),
      supabase
        .from('profiles')
        .select('id, nom_complet, email, role, type_contrat, couleur, heures_max_semaine, actif')
        .eq('actif', true)
        .order('nom_complet'),
      supabase.from('profil_pop_ups').select('profile_id, pop_up_id'),
      supabase.from('planning_shifts').select('*').gte('date', dateDebut).lte('date', dateFin),
      supabase.from('conges').select('*').lte('date_debut', dateFin).gte('date_fin', dateDebut),
      supabase.from('jours_ecole_alternant').select('id, profile_id, date').gte('date', dateDebut).lte('date', dateFin),
    ]);

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col">
      <PlanningClient
        lectureSeule={lectureSeule}
        semaineIso={dateDebut}
        popUps={(popUps ?? []) as PopUp[]}
        profils={(profils ?? []) as Profile[]}
        affectations={(affectations ?? []) as { profile_id: string; pop_up_id: string }[]}
        shifts={(shifts ?? []) as PlanningShift[]}
        conges={(conges ?? []) as Conge[]}
        joursEcole={(joursEcole ?? []) as JourEcoleAlternant[]}
      />
    </div>
  );
}
