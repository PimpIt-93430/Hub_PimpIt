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
  /** Pop-up réel dont cette dépense est le loyer/une charge — cf. retour utilisateur : "un petit
   * truc qui dit si c'est un loyer d'un pop-up, comme ça quand on fera les recettes on fera par
   * pop-up". Simple tag, aucun calcul dessus pour l'instant. */
  popUpId: string | null;
  popUpNom: string | null;
}

export async function chargerDepensesFlux(): Promise<DepenseFlux[]> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('flux_tresorerie_depenses')
    .select('id, libelle, montant, type, date, frequence, date_fin, note, pop_up_id, pop_up:pop_up_id(nom), createur:created_by(nom_complet, email)')
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
    pop_up_id: string | null;
    pop_up: { nom: string } | null;
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
    popUpId: l.pop_up_id,
    popUpNom: l.pop_up?.nom ?? null,
    creeParNom: l.createur ? l.createur.nom_complet || l.createur.email : '—',
  }));
}

export async function creerDepenseFlux(params: {
  libelle: string;
  montant: number;
  type: TypeDepense;
  date: string;
  frequence: FrequenceDepense | null;
  dateFin: string | null;
  note: string;
  popUpId: string | null;
}): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');

  const { error } = await supabase.from('flux_tresorerie_depenses').insert({
    libelle: params.libelle.trim(),
    montant: params.montant,
    type: params.type,
    date: params.date,
    frequence: params.type === 'recurrente' ? params.frequence : null,
    date_fin: params.type === 'recurrente' ? params.dateFin || null : null,
    note: params.note.trim() || null,
    pop_up_id: params.popUpId,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
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
