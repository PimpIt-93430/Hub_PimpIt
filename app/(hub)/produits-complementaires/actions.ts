'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

function champTexte(formData: FormData, cle: string): string | null {
  const v = formData.get(cle);
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.trim();
}

function champNombre(formData: FormData, cle: string): number | null {
  const v = formData.get(cle);
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function champBooleen(formData: FormData, cle: string): boolean {
  return formData.get(cle) === 'on';
}

/** Supabase est désormais la base d'origine du Hub : un produit créé ici n'existe que dans
 * Supabase (pas de write-back vers Airtable). Les produits synchronisés depuis Airtable ont un
 * airtable_id qui commence par "rec" ; les produits créés depuis le Hub ont un id synthétique
 * préfixé "hub_" pour qu'on puisse toujours les distinguer plus tard si besoin. */
export async function creerProduitComplementaire(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;

  const { error } = await supabase.from('hub_produits_complementaires').insert({
    airtable_id: nouvelId,
    nom: champTexte(formData, 'nom'),
    photo_url: champTexte(formData, 'photo_url'),
    prix: champNombre(formData, 'prix'),
    actif: champBooleen(formData, 'actif'),
    description: champTexte(formData, 'description'),
    lien1: champTexte(formData, 'lien1'),
    titre_lien1: champTexte(formData, 'titre_lien1'),
    lien2: champTexte(formData, 'lien2'),
    titre_lien2: champTexte(formData, 'titre_lien2'),
    variantes: champTexte(formData, 'variantes'),
  });
  if (error) throw new Error(error.message);

  revalidatePath('/produits-complementaires');
}

export async function modifierProduitComplementaire(airtableId: string, formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const { error } = await supabase
    .from('hub_produits_complementaires')
    .update({
      nom: champTexte(formData, 'nom'),
      photo_url: champTexte(formData, 'photo_url'),
      prix: champNombre(formData, 'prix'),
      actif: champBooleen(formData, 'actif'),
      description: champTexte(formData, 'description'),
      lien1: champTexte(formData, 'lien1'),
      titre_lien1: champTexte(formData, 'titre_lien1'),
      lien2: champTexte(formData, 'lien2'),
      titre_lien2: champTexte(formData, 'titre_lien2'),
      variantes: champTexte(formData, 'variantes'),
      synced_at: new Date().toISOString(),
    })
    .eq('airtable_id', airtableId);
  if (error) throw new Error(error.message);

  revalidatePath('/produits-complementaires');
}

export async function supprimerProduitComplementaire(airtableId: string) {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase
    .from('hub_produits_complementaires')
    .delete()
    .eq('airtable_id', airtableId)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/produits-complementaires');
}
