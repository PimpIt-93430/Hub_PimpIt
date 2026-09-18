'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

/** Réplique src/api/chaussures.ts, coques.ts de l'app Pimp It (écran Réglages > Stock cible, web
 * uniquement) — mêmes tables Supabase (chaussures_stock/coques_stock + leurs *_mapping_sumup),
 * donc écrit directement dans les VRAIES données de l'app, pas dans un miroir hub_*. Le stock
 * cible est un seul jeu de valeurs partagé par tous les pop-ups. Sacs et Lanières n'ont plus de
 * suivi de stock (retour utilisateur du 2026-09-18). */

export async function definirStockChaussures(id: string, quantite: number) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('chaussures_stock')
    .update({ stock_initial: quantite, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/stock-cible');
}

export async function definirStockCoques(id: string, quantite: number) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('coques_stock')
    .update({ stock_initial: quantite, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/stock-cible');
}

export async function definirMappingChaussures(nomProduit: string, couleur: string, taille: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('chaussures_mapping_sumup')
    .upsert({ nom_produit: nomProduit, couleur, taille, updated_at: new Date().toISOString() }, { onConflict: 'nom_produit' });
  if (error) throw new Error(error.message);
  revalidatePath('/stock-cible');
}

export async function definirMappingCoques(nomProduit: string, modele: string, couleur: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('coques_mapping_sumup')
    .upsert({ nom_produit: nomProduit, modele, couleur, updated_at: new Date().toISOString() }, { onConflict: 'nom_produit' });
  if (error) throw new Error(error.message);
  revalidatePath('/stock-cible');
}

export async function supprimerMappingChaussures(id: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('chaussures_mapping_sumup').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/stock-cible');
}

export async function supprimerMappingCoques(id: string) {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('coques_mapping_sumup').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/stock-cible');
}

