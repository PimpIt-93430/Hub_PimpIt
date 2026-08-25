'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

function champTexte(formData: FormData, cle: string): string | null {
  const v = formData.get(cle);
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.trim();
}

/** Supabase est désormais la base d'origine du Hub : une tâche créée ici n'existe que dans
 * Supabase (pas de write-back vers Airtable). Les tâches synchronisées depuis Airtable ont un
 * airtable_id qui commence par "rec" ; les tâches créées depuis le Hub ont un id synthétique
 * préfixé "hub_" pour qu'on puisse toujours les distinguer plus tard si besoin. */
export async function creerTache(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;

  const { error } = await supabase.from('hub_taches').insert({
    airtable_id: nouvelId,
    titre: champTexte(formData, 'titre'),
    assigne_a: champTexte(formData, 'assigne_a'),
    priorite: champTexte(formData, 'priorite'),
    statut: champTexte(formData, 'statut'),
    date_limite: champTexte(formData, 'date_limite'),
    notes: champTexte(formData, 'notes'),
  });
  if (error) throw new Error(error.message);

  revalidatePath('/taches');
}

export async function modifierTache(airtableId: string, formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const { error } = await supabase
    .from('hub_taches')
    .update({
      titre: champTexte(formData, 'titre'),
      assigne_a: champTexte(formData, 'assigne_a'),
      priorite: champTexte(formData, 'priorite'),
      statut: champTexte(formData, 'statut'),
      date_limite: champTexte(formData, 'date_limite'),
      notes: champTexte(formData, 'notes'),
      synced_at: new Date().toISOString(),
    })
    .eq('airtable_id', airtableId);
  if (error) throw new Error(error.message);

  revalidatePath('/taches');
}

export async function supprimerTache(airtableId: string) {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase.from('hub_taches').delete().eq('airtable_id', airtableId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/taches');
}
