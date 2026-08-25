'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

function champTexte(formData: FormData, cle: string): string | null {
  const v = formData.get(cle);
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.trim();
}

/** Supabase est désormais la base d'origine du Hub : un sabot personnalisé créé ici n'existe que
 * dans Supabase (pas de write-back vers Airtable). Les sabots personnalisés synchronisés depuis
 * Airtable ont un airtable_id qui commence par "rec" ; ceux créés depuis le Hub ont un id
 * synthétique préfixé "hub_" pour qu'on puisse toujours les distinguer plus tard si besoin. */
export async function creerSabotCustom(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;

  const { error } = await supabase.from('hub_sabots_custom').insert({
    airtable_id: nouvelId,
    nom: champTexte(formData, 'nom'),
    sku_shopify: champTexte(formData, 'sku_shopify'),
    photo_url: champTexte(formData, 'photo_url'),
    shopify_product_id: null,
    pins_inclus_count: 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/sabots-custom');
}

export async function modifierSabotCustom(airtableId: string, formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const { error } = await supabase
    .from('hub_sabots_custom')
    .update({
      nom: champTexte(formData, 'nom'),
      sku_shopify: champTexte(formData, 'sku_shopify'),
      photo_url: champTexte(formData, 'photo_url'),
      synced_at: new Date().toISOString(),
    })
    .eq('airtable_id', airtableId);
  if (error) throw new Error(error.message);

  revalidatePath('/sabots-custom');
}

export async function supprimerSabotCustom(airtableId: string) {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase.from('hub_sabots_custom').delete().eq('airtable_id', airtableId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/sabots-custom');
}
