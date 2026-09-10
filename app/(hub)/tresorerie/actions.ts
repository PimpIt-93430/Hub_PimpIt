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
}

export async function chargerDepensesFlux(): Promise<DepenseFlux[]> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('flux_tresorerie_depenses')
    .select('id, libelle, montant, type, date, frequence, date_fin, note, createur:created_by(nom_complet, email)')
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
