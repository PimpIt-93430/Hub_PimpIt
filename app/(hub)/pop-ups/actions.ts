'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

/** Réplique src/api/popUps.ts + src/api/reglesMetier.ts de l'app Pimp It (écran admin Pop-up,
 * app/(app)/admin/popups.tsx) — mêmes tables réelles (pop_ups, regles_horaires_ouverture,
 * profil_pop_ups), pas un miroir hub_*. */

const PALETTE_COULEURS = ['#6366F1', '#F97316', '#10B981', '#EC4899', '#0EA5E9', '#EAB308'];

export async function creerPopUp(params: {
  nom: string;
  heureOuverture: string;
  heureFermeture: string;
  dateDebut: string | null;
  dateFin: string | null;
}) {
  const supabase = await creerClientSupabaseServeur();
  const { count } = await supabase.from('pop_ups').select('id', { count: 'exact', head: true });
  const couleur = PALETTE_COULEURS[(count ?? 0) % PALETTE_COULEURS.length];

  const { data: popUp, error } = await supabase
    .from('pop_ups')
    .insert({ nom: params.nom, couleur, date_debut: params.dateDebut, date_fin: params.dateFin })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const heureOuverture = `${params.heureOuverture}:00`;
  const heureFermeture = `${params.heureFermeture}:00`;
  const horaires = Array.from({ length: 7 }, (_, jour_semaine) => ({
    pop_up_id: popUp.id,
    jour_semaine,
    heure_ouverture: heureOuverture,
    heure_fermeture: heureFermeture,
    actif: true,
  }));
  const { error: erreurHoraires } = await supabase.from('regles_horaires_ouverture').insert(horaires);
  if (erreurHoraires) throw new Error(erreurHoraires.message);

  revalidatePath('/pop-ups');
}

export async function renommerPopUp(id: string, nom: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('pop_ups').update({ nom }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/pop-ups');
}

export async function modifierDatesPopUp(id: string, dateDebut: string | null, dateFin: string | null) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('pop_ups').update({ date_debut: dateDebut, date_fin: dateFin }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/pop-ups');
}

export async function modifierCoordonneesPopUp(id: string, lat: number | null, lon: number | null) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('pop_ups').update({ lat, lon }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/pop-ups');
}

export async function modifierCreneauxPredefinisPopUp(
  id: string,
  creneaux: {
    matinDebut: string | null;
    matinFin: string | null;
    matinPauseDebut: string | null;
    matinPauseFin: string | null;
    apresMidiDebut: string | null;
    apresMidiFin: string | null;
    apresMidiPauseDebut: string | null;
    apresMidiPauseFin: string | null;
  },
) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('pop_ups')
    .update({
      matin_debut: creneaux.matinDebut,
      matin_fin: creneaux.matinFin,
      matin_pause_debut: creneaux.matinPauseDebut,
      matin_pause_fin: creneaux.matinPauseFin,
      apres_midi_debut: creneaux.apresMidiDebut,
      apres_midi_fin: creneaux.apresMidiFin,
      apres_midi_pause_debut: creneaux.apresMidiPauseDebut,
      apres_midi_pause_fin: creneaux.apresMidiPauseFin,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/pop-ups');
}

export async function supprimerPopUp(id: string) {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('pop_ups').delete().eq('id', id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/pop-ups');
}

export async function ajouterAffectationPopUp(profileId: string, popUpId: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('profil_pop_ups')
    .upsert({ profile_id: profileId, pop_up_id: popUpId }, { onConflict: 'profile_id,pop_up_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/pop-ups');
}

export async function retirerAffectationPopUp(profileId: string, popUpId: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('profil_pop_ups').delete().eq('profile_id', profileId).eq('pop_up_id', popUpId);
  if (error) throw new Error(error.message);
  revalidatePath('/pop-ups');
}

export async function chargerHorairesOuverture(popUpId: string) {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('regles_horaires_ouverture')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('jour_semaine');
  if (error) throw new Error(error.message);
  return data;
}

export async function enregistrerHoraireOuverture(regle: {
  pop_up_id: string;
  jour_semaine: number;
  heure_ouverture: string;
  heure_fermeture: string;
  actif: boolean;
}) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('regles_horaires_ouverture').upsert(regle, { onConflict: 'pop_up_id,jour_semaine' });
  if (error) throw new Error(error.message);
  revalidatePath('/pop-ups');
}
