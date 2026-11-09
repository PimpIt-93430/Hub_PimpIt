'use server';

import { revalidatePath } from 'next/cache';

import { exigerAdmin } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

// Finance > Charges & recettes (retour utilisateur du 2026-11-03) — tables finance_lignes et
// finance_parametres (migration 0136 côté App PIMP IT), réservées aux admins par la RLS.

export type TypeLigneFinance = 'charge' | 'recette';
export type FrequenceLigneFinance = 'mensuelle' | 'annuelle';

export interface LigneFinance {
  id: string;
  type: TypeLigneFinance;
  libelle: string;
  categorie: string;
  montant: number;
  frequence: FrequenceLigneFinance;
}

export interface ParamsLigneFinance {
  type: TypeLigneFinance;
  libelle: string;
  categorie: string;
  montant: number;
  frequence: FrequenceLigneFinance;
}

export interface ParametresFinance {
  tauxMarge: number;
  tauxTva: number;
}

export async function chargerLignesFinance(): Promise<LigneFinance[]> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('finance_lignes')
    .select('id, type, libelle, categorie, montant, frequence')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => ({ ...l, montant: Number(l.montant) })) as LigneFinance[];
}

export async function chargerParametresFinance(): Promise<ParametresFinance> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('finance_parametres')
    .select('taux_marge, taux_tva')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    tauxMarge: data ? Number(data.taux_marge) : 100,
    tauxTva: data ? Number(data.taux_tva) : 20,
  };
}

function verifier(params: ParamsLigneFinance) {
  if (!params.libelle.trim()) throw new Error('Donne un nom à la ligne.');
  if (!Number.isFinite(params.montant) || params.montant < 0) throw new Error('Montant invalide.');
}

export async function ajouterLigneFinance(params: ParamsLigneFinance) {
  await exigerAdmin();
  verifier(params);
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('finance_lignes').insert({ ...params, libelle: params.libelle.trim() });
  if (error) throw new Error(error.message);
  revalidatePath('/charges-recettes');
}

export async function modifierLigneFinance(id: string, params: ParamsLigneFinance) {
  await exigerAdmin();
  verifier(params);
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('finance_lignes')
    .update({ ...params, libelle: params.libelle.trim() })
    .eq('id', id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/charges-recettes');
}

export async function supprimerLigneFinance(id: string) {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('finance_lignes').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/charges-recettes');
}

export async function enregistrerParametresFinance(params: ParametresFinance) {
  await exigerAdmin();
  if (!(params.tauxMarge > 0 && params.tauxMarge <= 100)) throw new Error('La marge doit être entre 1 et 100 %.');
  if (!(params.tauxTva >= 0 && params.tauxTva < 100)) throw new Error('TVA invalide.');
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('finance_parametres')
    .upsert({ id: 1, taux_marge: params.tauxMarge, taux_tva: params.tauxTva });
  if (error) throw new Error(error.message);
  revalidatePath('/charges-recettes');
}
