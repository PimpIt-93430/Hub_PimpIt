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

/** Supabase est désormais la base d'origine du Hub : un pack créé ici n'existe que dans Supabase
 * (pas de write-back vers Airtable). Les packs synchronisés depuis Airtable ont un airtable_id qui
 * commence par "rec" ; les packs créés depuis le Hub ont un id synthétique préfixé "hub_" pour
 * qu'on puisse toujours les distinguer plus tard si besoin. */
export async function creerPack(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;

  const { error } = await supabase.from('hub_packs').insert({
    airtable_id: nouvelId,
    nom_du_pack: champTexte(formData, 'nom_du_pack'),
    sku_shopify: champTexte(formData, 'sku_shopify'),
    photo_url: champTexte(formData, 'photo_url'),
    stock_max: champNombre(formData, 'stock_max'),
    probleme: champBooleen(formData, 'probleme'),
    qtes_pins: null,
    pins_inclus_count: 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/packs');
}

export async function modifierPack(airtableId: string, formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const { error } = await supabase
    .from('hub_packs')
    .update({
      nom_du_pack: champTexte(formData, 'nom_du_pack'),
      sku_shopify: champTexte(formData, 'sku_shopify'),
      photo_url: champTexte(formData, 'photo_url'),
      stock_max: champNombre(formData, 'stock_max'),
      probleme: champBooleen(formData, 'probleme'),
      synced_at: new Date().toISOString(),
    })
    .eq('airtable_id', airtableId);
  if (error) throw new Error(error.message);

  revalidatePath('/packs');
}

export async function supprimerPack(airtableId: string) {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase.from('hub_packs').delete().eq('airtable_id', airtableId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/packs');
}
