'use server';

import { revalidatePath } from 'next/cache';

import { exigerAdmin } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

export type TypeDepense = 'ponctuelle' | 'recurrente';
export type FrequenceDepense = 'mensuelle' | 'trimestrielle' | 'annuelle';

export interface DepenseFlux {
  id: string;
  libelle: string;
  montant: number;
  type: TypeDepense;
  date: string;
  frequence: FrequenceDepense | null;
  dateFin: string | null;
  note: string | null;
  creeParNom: string;
  /** Cette dépense représente un pop-up (ex. son loyer) — cf. retour utilisateur : "il faut juste
   * cocher si c'est un pop-up, ya des pop-up qui sont pas rentrés dans l'appli car on les a pas
   * encore fait" : simple case à cocher, indépendante de la table pop_ups réelle (pour pouvoir
   * repérer un pop-up pas encore ouvert). Aucun calcul dessus pour l'instant. */
  estPopUp: boolean;
}

export interface ParamsDepenseFlux {
  libelle: string;
  montant: number;
  type: TypeDepense;
  date: string;
  frequence: FrequenceDepense | null;
  dateFin: string | null;
  note: string;
  estPopUp: boolean;
}

export async function chargerDepensesFlux(): Promise<DepenseFlux[]> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('flux_tresorerie_depenses')
    .select('id, libelle, montant, type, date, frequence, date_fin, note, est_pop_up, createur:created_by(nom_complet, email)')
    .order('date', { ascending: true });
  if (error) throw new Error(error.message);

  type Ligne = {
    id: string;
    libelle: string;
    montant: number;
    type: TypeDepense;
    date: string;
    frequence: FrequenceDepense | null;
    date_fin: string | null;
    note: string | null;
    est_pop_up: boolean;
    createur: { nom_complet: string | null; email: string } | null;
  };

  return ((data ?? []) as unknown as Ligne[]).map((l) => ({
    id: l.id,
    libelle: l.libelle,
    montant: l.montant,
    type: l.type,
    date: l.date,
    frequence: l.frequence,
    dateFin: l.date_fin,
    note: l.note,
    estPopUp: l.est_pop_up,
    creeParNom: l.createur ? l.createur.nom_complet || l.createur.email : '—',
  }));
}

function versLigne(params: ParamsDepenseFlux) {
  const estRecurrente = params.type === 'recurrente';
  return {
    libelle: params.libelle.trim(),
    montant: params.montant,
    type: params.type,
    date: params.date,
    frequence: estRecurrente ? params.frequence : null,
    date_fin: estRecurrente ? params.dateFin || null : null,
    note: params.note.trim() || null,
    est_pop_up: params.estPopUp,
  };
}

export async function creerDepenseFlux(params: ParamsDepenseFlux): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');

  const { error } = await supabase.from('flux_tresorerie_depenses').insert({ ...versLigne(params), created_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath('/tresorerie');
}

/** Modifie une dépense déjà enregistrée — cf. retour utilisateur : "il faut pouvoir aussi
 * modifier les dépenses déjà mises" (seule la création/suppression existait jusqu'ici). */
export async function modifierDepenseFlux(id: string, params: ParamsDepenseFlux): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('flux_tresorerie_depenses').update(versLigne(params)).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}

export async function supprimerDepenseFlux(id: string): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('flux_tresorerie_depenses').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}

// ---- Recettes (cf. retour utilisateur du 2026-09-11 : "pour les recettes on a tous les pop up il
// faut qu'on mette un chiffre d'affaire moyen par jour et par mois HT et les charges variables...
// les revenus commencent au premier jour du loyer") ----

export interface RecetteFlux {
  id: string;
  popUpNom: string;
  caJourHt: number;
  caMoisHt: number;
  tauxChargesVariables: number;
  creeParNom: string;
}

export interface ParamsRecetteFlux {
  popUpNom: string;
  caJourHt: number;
  caMoisHt: number;
  tauxChargesVariables: number;
}

export async function chargerRecettesFlux(): Promise<RecetteFlux[]> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('flux_tresorerie_recettes')
    .select('id, pop_up_nom, ca_jour_ht, ca_mois_ht, taux_charges_variables, createur:created_by(nom_complet, email)')
    .order('pop_up_nom', { ascending: true });
  if (error) throw new Error(error.message);

  type Ligne = {
    id: string;
    pop_up_nom: string;
    ca_jour_ht: number;
    ca_mois_ht: number;
    taux_charges_variables: number;
    createur: { nom_complet: string | null; email: string } | null;
  };

  return ((data ?? []) as unknown as Ligne[]).map((l) => ({
    id: l.id,
    popUpNom: l.pop_up_nom,
    caJourHt: l.ca_jour_ht,
    caMoisHt: l.ca_mois_ht,
    tauxChargesVariables: l.taux_charges_variables,
    creeParNom: l.createur ? l.createur.nom_complet || l.createur.email : '—',
  }));
}

function versLigneRecette(params: ParamsRecetteFlux) {
  return {
    pop_up_nom: params.popUpNom.trim(),
    ca_jour_ht: params.caJourHt,
    ca_mois_ht: params.caMoisHt,
    taux_charges_variables: params.tauxChargesVariables,
  };
}

export async function creerRecetteFlux(params: ParamsRecetteFlux): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');

  const { error } = await supabase.from('flux_tresorerie_recettes').insert({ ...versLigneRecette(params), created_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath('/tresorerie');
}

export async function modifierRecetteFlux(id: string, params: ParamsRecetteFlux): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('flux_tresorerie_recettes').update(versLigneRecette(params)).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}

export async function supprimerRecetteFlux(id: string): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('flux_tresorerie_recettes').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}
