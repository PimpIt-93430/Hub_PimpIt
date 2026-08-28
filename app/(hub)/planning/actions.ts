'use server';

import { revalidatePath } from 'next/cache';

import { genererPlanning } from '@/lib/generationPlanning';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import type { TypeConge } from './types';

/** Réplique src/api/planning.ts + src/api/conges.ts + la génération auto de
 * App PIMP IT/app/(app)/admin/calendrier.tsx (handleGenerer) — mêmes tables réelles
 * (planning_shifts, conges), même garde-fou : la génération auto ne supprime jamais que les
 * brouillons flagués genere_automatiquement=true, jamais un ajout manuel ni un créneau publié. */

async function idUtilisateurConnecte(supabase: Awaited<ReturnType<typeof creerClientSupabaseServeur>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');
  return user.id;
}

// --- planning_shifts ---

export interface NouveauShift {
  pop_up_id: string;
  profile_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  pause_debut: string | null;
  pause_fin: string | null;
  etiquette: string | null;
}

export async function creerShifts(lignes: NouveauShift[]) {
  if (lignes.length === 0) return;
  const supabase = await creerClientSupabaseServeur();
  const adminId = await idUtilisateurConnecte(supabase);
  const { error } = await supabase.from('planning_shifts').insert(
    lignes.map((l) => ({
      ...l,
      statut: 'brouillon' as const,
      genere_automatiquement: false,
      created_by: adminId,
    })),
  );
  if (error) throw new Error(error.message);
  revalidatePath('/planning');
}

export async function modifierShift(
  id: string,
  changes: {
    pop_up_id?: string;
    heure_debut?: string;
    heure_fin?: string;
    pause_debut?: string | null;
    pause_fin?: string | null;
    etiquette?: string | null;
  },
) {
  const supabase = await creerClientSupabaseServeur();
  // Un shift touché à la main ne doit plus jamais être considéré comme un simple brouillon
  // auto-généré : sinon une régénération ultérieure le supprime et le recrée depuis l'horaire
  // récurrent, écrasant la modification (cf. calendrier.tsx côté app).
  const { data, error } = await supabase
    .from('planning_shifts')
    .update({ ...changes, genere_automatiquement: false })
    .eq('id', id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/planning');
}

export async function supprimerShifts(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = await creerClientSupabaseServeur();
  // Une suppression bloquée par une policy RLS ne renvoie jamais d'erreur côté Supabase (0 ligne
  // affectée, réponse "succès" quand même) — .select() vérifie ce qui a vraiment été supprimé.
  const { data, error } = await supabase.from('planning_shifts').delete().in('id', ids).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length !== ids.length) {
    throw new Error('Suppression incomplète (droits insuffisants sur au moins un créneau).');
  }
  revalidatePath('/planning');
}

// --- conges ---

export async function creerConge(params: {
  profileId: string;
  dateDebut: string;
  dateFin: string;
  heureDebut: string | null;
  heureFin: string | null;
  type: TypeConge;
  note: string;
}) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('conges').insert({
    profile_id: params.profileId,
    date_debut: params.dateDebut,
    date_fin: params.dateFin,
    heure_debut: params.heureDebut,
    heure_fin: params.heureFin,
    type: params.type,
    note: params.note,
  });
  if (error) throw new Error(error.message);
  // Une absence doit empêcher la personne de travailler : retire tout créneau déjà planifié sur
  // la période concernée (manuel ou auto-généré), sinon elle resterait affichée comme travaillant
  // malgré l'absence déclarée (même règle que useGererConges().ajouter côté app).
  let requeteSuppression = supabase
    .from('planning_shifts')
    .delete()
    .eq('profile_id', params.profileId)
    .gte('date', params.dateDebut)
    .lte('date', params.dateFin);
  if (params.heureDebut && params.heureFin) {
    requeteSuppression = requeteSuppression.lt('heure_debut', params.heureFin).gt('heure_fin', params.heureDebut);
  }
  await requeteSuppression;
  revalidatePath('/planning');
}

export async function supprimerConge(id: string) {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('conges').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/planning');
}

// --- Génération automatique (bouton "Générer", cf. handleGenerer côté app — ici déclenchée à la
// main plutôt qu'en silence au montage, plus simple à raisonner côté Next.js) ---

export async function genererEtInsererPlanning(dateDebut: string, dateFin: string) {
  const supabase = await creerClientSupabaseServeur();
  const adminId = await idUtilisateurConnecte(supabase);

  const [
    { data: profiles, error: eProfiles },
    { data: horairesRecurrents, error: eHoraires },
    { data: horairesOuverture, error: eOuverture },
    { data: conges, error: eConges },
    { data: joursEcole, error: eEcole },
    { data: shiftsExistants, error: eShifts },
    { data: affectations, error: eAffectations },
    { data: popUps, error: ePopUps },
    { data: informationsRh, error: eRh },
  ] = await Promise.all([
    supabase.from('profiles').select('id, role, type_contrat, actif'),
    supabase.from('horaires_recurrents_profil').select('*'),
    supabase.from('regles_horaires_ouverture').select('*'),
    supabase.from('conges').select('*').lte('date_debut', dateFin).gte('date_fin', dateDebut),
    supabase.from('jours_ecole_alternant').select('profile_id, date').gte('date', dateDebut).lte('date', dateFin),
    supabase.from('planning_shifts').select('*').gte('date', dateDebut).lte('date', dateFin),
    supabase.from('profil_pop_ups').select('profile_id, pop_up_id'),
    supabase.from('pop_ups').select('id, date_debut'),
    supabase.from('informations_rh').select('profile_id, date_debut_contrat'),
  ]);
  const erreur = eProfiles || eHoraires || eOuverture || eConges || eEcole || eShifts || eAffectations || ePopUps || eRh;
  if (erreur) throw new Error(erreur.message);

  const mapAffectations = new Map<string, Set<string>>();
  for (const a of affectations ?? []) {
    const ensemble = mapAffectations.get(a.profile_id) ?? new Set<string>();
    ensemble.add(a.pop_up_id);
    mapAffectations.set(a.profile_id, ensemble);
  }

  const jours = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${dateDebut}T00:00:00`);
    d.setDate(d.getDate() + i);
    const jourSemaine = (d.getDay() + 6) % 7; // 0 = lundi
    const pad = (n: number) => String(n).padStart(2, '0');
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, jour_semaine: jourSemaine };
  });

  const resultat = genererPlanning({
    jours,
    profiles: profiles ?? [],
    horairesRecurrents: horairesRecurrents ?? [],
    horairesOuverture: horairesOuverture ?? [],
    conges: conges ?? [],
    joursEcole: joursEcole ?? [],
    shiftsExistants: shiftsExistants ?? [],
    mapAffectations,
    popUps: popUps ?? [],
    adminId,
    datesDebutContrat: informationsRh ?? [],
  });

  // Purement additif — ne supprime plus rien (cf. incident : ça supprimait puis recréait tous les
  // brouillons auto-générés de la semaine à chaque clic, donc ça écrasait aussi ceux qu'un admin
  // avait corrigés à la main entre-temps — même bug que generer-planning-auto côté App PIMP IT,
  // qui l'a révélé en l'appliquant sur 52 semaines d'un coup. `shiftsExistants`, chargé avant
  // l'appel à genererPlanning ci-dessus, fait déjà que seules les cases encore vides reçoivent un
  // nouveau créneau — tout ce qui existait déjà (généré, corrigé, ou publié) reste intact).
  if (resultat.shifts.length > 0) {
    const { error: eInsert } = await supabase.from('planning_shifts').insert(resultat.shifts);
    if (eInsert) throw new Error(eInsert.message);
  }

  revalidatePath('/planning');
  return { nombreCrees: resultat.shifts.length, alertes: resultat.alertes };
}
