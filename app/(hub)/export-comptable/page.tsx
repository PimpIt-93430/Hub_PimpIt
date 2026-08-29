import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { exigerAdmin } from '@/lib/roles';
import { dateEnISO } from '../planning/dateUtils';
import { ExportComptableClient } from './ExportComptableClient';

/** Export mensuel pour la compta (cf. discussion 2026-08-28) : par personne, les jours de congé
 * pris, les heures du dimanche (sauf "ne pas compter les heures du dimanche"), les heures école et
 * les heures travaillées. Toujours calculé en direct depuis le planning/les congés réels — jamais
 * de cache : la compta doit voir l'état à jour au moment de l'export. Réservée aux admins (cf.
 * lib/roles.ts) : salaires/heures nominatives, pas pour le rôle "local". */
export default async function ExportComptablePage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  await exigerAdmin();
  const { mois } = await searchParams;
  // `mois` est toujours une date ISO complète (YYYY-MM-DD, le 1er du mois) — même format que
  // moisPrecedent/moisSuivant côté client (ExportComptableClient.tsx), jamais "YYYY-MM" seul.
  const debut = mois ? new Date(`${mois}T00:00:00`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const debutMois = new Date(debut.getFullYear(), debut.getMonth(), 1);
  const finMois = new Date(debut.getFullYear(), debut.getMonth() + 1, 0);
  const debutIso = dateEnISO(debutMois);
  const finIso = dateEnISO(finMois);

  const supabase = await creerClientSupabaseServeur();

  const [{ data: profils }, { data: informationsRh }, { data: shifts }, { data: conges }, { data: joursEcole }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, nom_complet, email, role, type_contrat')
        .eq('actif', true)
        .order('nom_complet', { ascending: true }),
      supabase.from('informations_rh').select('profile_id, exclure_heures_dimanche'),
      supabase
        .from('planning_shifts')
        .select('profile_id, date, heure_debut, heure_fin, pause_debut, pause_fin')
        .gte('date', debutIso)
        .lte('date', finIso),
      supabase
        .from('conges')
        .select('profile_id, date_debut, date_fin, type, statut')
        .lte('date_debut', finIso)
        .gte('date_fin', debutIso),
      supabase.from('jours_ecole_alternant').select('profile_id, date').gte('date', debutIso).lte('date', finIso),
    ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Export comptable</h1>
      <p className="mb-6 text-sm text-slate-400">
        Heures et jours de congé du mois, par personne — modifiable avant export. Pas enregistré en base, mais
        conservé dans ce navigateur.
      </p>

      <ExportComptableClient
        moisIso={debutIso}
        profils={profils ?? []}
        informationsRh={informationsRh ?? []}
        shifts={shifts ?? []}
        conges={conges ?? []}
        joursEcole={joursEcole ?? []}
      />
    </div>
  );
}
