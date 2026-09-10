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
