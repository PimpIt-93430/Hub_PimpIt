'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import type {
  Conge,
  DocumentEmploye,
  DroitEmploye,
  Fonctionnalite,
  FormRh,
  HoraireRecurrentProfil,
  InformationsRh,
  Role,
  TypeContrat,
} from './types';

/** Réplique l'écran admin Équipe de l'app Pimp It (EquipeEcranBase.tsx + equipe.web.tsx) — mêmes
 * tables réelles (profiles, informations_rh, horaires_recurrents_profil, conges,
 * documents_employe, droits_employe, profil_pop_ups), même Edge Function d'invitation, pas de
 * miroir hub_*. Client Supabase = session de l'admin connecté (RLS existante), pas de service role. */

// --- Nouvel employé (Edge Function inviter-employe, création immédiate sans email) ---

export async function creerEmploye(params: {
  email: string;
  nomComplet: string;
  role: Role;
  typeContrat: TypeContrat;
}): Promise<{ id: string }> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.functions.invoke('inviter-employe', {
    body: {
      email: params.email,
      nom_complet: params.nomComplet,
      role: params.role,
      type_contrat: params.typeContrat,
    },
  });
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
  return data as { id: string };
}

// --- profiles (type_contrat / heures_max_semaine s'enregistrent directement, pas via le bouton
// "Enregistrer" partagé avec informations_rh — comportement identique à l'app) ---

export async function modifierProfil(
  id: string,
  changes: { type_contrat?: TypeContrat; heures_max_semaine?: number | null },
) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('profiles').update(changes).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}

// --- informations_rh ---

export async function obtenirInformationsRh(profileId: string): Promise<InformationsRh | null> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('informations_rh').select('*').eq('profile_id', profileId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function enregistrerInformationsRh(form: FormRh & { profile_id: string }) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('informations_rh')
    .upsert({ ...form, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}

// --- horaires_recurrents_profil ---

export async function obtenirHorairesRecurrents(profileId: string): Promise<HoraireRecurrentProfil[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('horaires_recurrents_profil')
    .select('*')
    .eq('profile_id', profileId)
    .order('jour_semaine', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function enregistrerHoraireRecurrent(horaire: Omit<HoraireRecurrentProfil, 'id'> & { id?: string }) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('horaires_recurrents_profil')
    .upsert({ ...horaire, updated_at: new Date().toISOString() }, { onConflict: 'profile_id,jour_semaine,semaine_reference' });
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}

export async function supprimerHoraireRecurrent(id: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('horaires_recurrents_profil').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}

// --- conges ---

export async function obtenirConges(profileId: string): Promise<Conge[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('conges')
    .select('*')
    .eq('profile_id', profileId)
    .order('date_debut', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function supprimerConge(id: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('conges').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}

// --- documents_employe (bucket privé "documents-employes") ---

export async function obtenirDocuments(profileId: string): Promise<DocumentEmploye[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('documents_employe')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function uploaderDocument(params: {
  profileId: string;
  nomFichier: string;
  base64: string;
  contentType: string;
}) {
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');

  const chemin = `${params.profileId}/${Date.now()}-${params.nomFichier}`;
  const buffer = Buffer.from(params.base64, 'base64');

  const { error: erreurUpload } = await supabase.storage
    .from('documents-employes')
    .upload(chemin, buffer, { contentType: params.contentType });
  if (erreurUpload) throw new Error(erreurUpload.message);

  const { error } = await supabase.from('documents_employe').insert({
    profile_id: params.profileId,
    nom_fichier: params.nomFichier,
    chemin_stockage: chemin,
    uploaded_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}

export async function obtenirUrlDocument(cheminStockage: string): Promise<string> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.storage.from('documents-employes').createSignedUrl(cheminStockage, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function supprimerDocument(id: string, cheminStockage: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error: erreurStorage } = await supabase.storage.from('documents-employes').remove([cheminStockage]);
  if (erreurStorage) throw new Error(erreurStorage.message);

  // .select() force le renvoi des lignes supprimées : sans ça une RLS qui bloque silencieusement
  // la suppression ne remonte aucune erreur.
  const { data, error } = await supabase.from('documents_employe').delete().eq('id', id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/equipe');
}

// --- Accès Hub "comptable" (cf. migration 0092, lib/roles.ts) — flag direct sur profiles, pas une
// ligne droits_employe : c'est un accès Hub, pas un droit côté app mobile. ---

export async function definirAccesComptableHub(profileId: string, valeur: boolean) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('profiles').update({ hub_role_comptable: valeur }).eq('id', profileId);
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}

// --- droits_employe (Calendrier / Équipe) ---

export async function obtenirDroits(profileId: string): Promise<DroitEmploye[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('droits_employe').select('*').eq('profile_id', profileId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function ajouterDroit(params: { profileId: string; fonctionnalite: Fonctionnalite; popUpId: string | null }) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('droits_employe')
    .insert({ profile_id: params.profileId, fonctionnalite: params.fonctionnalite, pop_up_id: params.popUpId });
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}

export async function supprimerDroit(id: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('droits_employe').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}

// --- profil_pop_ups ("Lieux attribués", onglet Droits) ---

export async function ajouterLieuAttribue(profileId: string, popUpId: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('profil_pop_ups')
    .upsert({ profile_id: profileId, pop_up_id: popUpId }, { onConflict: 'profile_id,pop_up_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}

export async function retirerLieuAttribue(profileId: string, popUpId: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('profil_pop_ups').delete().eq('profile_id', profileId).eq('pop_up_id', popUpId);
  if (error) throw new Error(error.message);
  revalidatePath('/equipe');
}
