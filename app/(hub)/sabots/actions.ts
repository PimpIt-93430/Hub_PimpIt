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

/** Supabase est désormais la base d'origine du Hub : un sabot créé ici n'existe que dans Supabase
 * (pas de write-back vers Airtable). Les sabots synchronisés depuis Airtable ont un airtable_id qui
 * commence par "rec" ; les sabots créés depuis le Hub ont un id synthétique préfixé "hub_" pour
 * qu'on puisse toujours les distinguer plus tard si besoin. */
export async function creerSabot(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;

  const { error } = await supabase.from('hub_sabots').insert({
    airtable_id: nouvelId,
    couleur: champTexte(formData, 'couleur'),
    taille: champTexte(formData, 'taille'),
    sku: champTexte(formData, 'sku'),
    stock: champNombre(formData, 'stock'),
    inventory_item_id: null,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/sabots');
}

export async function modifierSabot(airtableId: string, formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const { error } = await supabase
    .from('hub_sabots')
    .update({
      couleur: champTexte(formData, 'couleur'),
      taille: champTexte(formData, 'taille'),
      sku: champTexte(formData, 'sku'),
      stock: champNombre(formData, 'stock'),
      synced_at: new Date().toISOString(),
    })
    .eq('airtable_id', airtableId);
  if (error) throw new Error(error.message);

  revalidatePath('/sabots');
}

export async function supprimerSabot(airtableId: string) {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase.from('hub_sabots').delete().eq('airtable_id', airtableId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/sabots');
}
