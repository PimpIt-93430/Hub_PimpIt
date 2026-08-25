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

/** Supabase est désormais la base d'origine du Hub : un pin créé ici n'existe que dans Supabase
 * (pas de write-back vers Airtable). Les pins synchronisés depuis Airtable ont un airtable_id qui
 * commence par "rec" ; les pins créés depuis le Hub ont un id synthétique préfixé "hub_" pour
 * qu'on puisse toujours les distinguer plus tard si besoin. */
export async function creerPin(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;

  const { error } = await supabase.from('hub_pins').insert({
    airtable_id: nouvelId,
    name: champTexte(formData, 'name'),
    sku_pimpit: champTexte(formData, 'sku_pimpit'),
    sku_fournisseur: champTexte(formData, 'sku_fournisseur'),
    stock: champNombre(formData, 'stock'),
    seuil_cible: champNombre(formData, 'seuil_cible'),
    fournisseur: champTexte(formData, 'fournisseur'),
    boite: champTexte(formData, 'boite'),
  });
  if (error) throw new Error(error.message);

  revalidatePath('/pins');
}

export async function modifierPin(airtableId: string, formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const { error } = await supabase
    .from('hub_pins')
    .update({
      name: champTexte(formData, 'name'),
      sku_pimpit: champTexte(formData, 'sku_pimpit'),
      sku_fournisseur: champTexte(formData, 'sku_fournisseur'),
      stock: champNombre(formData, 'stock'),
      seuil_cible: champNombre(formData, 'seuil_cible'),
      fournisseur: champTexte(formData, 'fournisseur'),
      boite: champTexte(formData, 'boite'),
      synced_at: new Date().toISOString(),
    })
    .eq('airtable_id', airtableId);
  if (error) throw new Error(error.message);

  revalidatePath('/pins');
}

export async function supprimerPin(airtableId: string) {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase.from('hub_pins').delete().eq('airtable_id', airtableId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/pins');
}
