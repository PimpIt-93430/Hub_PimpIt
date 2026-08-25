'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

function champTexte(formData: FormData, cle: string): string | null {
  const v = formData.get(cle);
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.trim();
}

/** Supabase est désormais la base d'origine du Hub : une recommandation créée ici n'existe que
 * dans Supabase (pas de write-back vers Airtable). Les recommandations synchronisées depuis
 * Airtable ont un airtable_id qui commence par "rec" ; les recommandations créées depuis le Hub
 * ont un id synthétique préfixé "hub_" pour qu'on puisse toujours les distinguer plus tard si
 * besoin. */
export async function creerRecommandation(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;

  const { error } = await supabase.from('hub_recommandations').insert({
    airtable_id: nouvelId,
    auteur: champTexte(formData, 'auteur'),
    message: champTexte(formData, 'message'),
    categorie: champTexte(formData, 'categorie'),
  });
  if (error) throw new Error(error.message);

  revalidatePath('/recommandations');
}

export async function modifierRecommandation(airtableId: string, formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const { error } = await supabase
    .from('hub_recommandations')
    .update({
      auteur: champTexte(formData, 'auteur'),
      message: champTexte(formData, 'message'),
      categorie: champTexte(formData, 'categorie'),
      synced_at: new Date().toISOString(),
    })
    .eq('airtable_id', airtableId);
  if (error) throw new Error(error.message);

  revalidatePath('/recommandations');
}

export async function supprimerRecommandation(airtableId: string) {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase.from('hub_recommandations').delete().eq('airtable_id', airtableId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/recommandations');
}
