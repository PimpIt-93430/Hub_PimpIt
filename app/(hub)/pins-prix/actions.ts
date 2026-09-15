'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { PRIX_FOURNISSEUR_VALEURS, type PrixFournisseur } from './types';

/** Cf. retour utilisateur du 2026-09-15 : "le prix des pin's fournisseurs c'est soit 0.05 soit
 * 0.15 soit 0.25 soit 0.30 soit 0.60" — verrouillé aussi côté base (contrainte CHECK, migration
 * stock_pins_prix_fournisseur) mais on revalide ici pour ne jamais dépendre du seul message
 * d'erreur Postgres dans l'UI. */
function verifierPrixValide(prix: number): void {
  if (!PRIX_FOURNISSEUR_VALEURS.includes(prix as PrixFournisseur)) {
    throw new Error(`Prix fournisseur invalide : ${prix}`);
  }
}

// Clé sur l'id (uuid, toujours renseigné) plutôt que airtable_record_id (3 pins actifs ne l'ont
// pas — cf. app/(hub)/pins/actions.ts qui, lui, dépend de airtable_record_id) : cet écran doit
// pouvoir tarifer tous les pin's, sans exception.
export async function definirPrixFournisseur(id: string, prix: number): Promise<void> {
  verifierPrixValide(prix);
  const supabase = await creerClientSupabaseServeur();

  const { data, error } = await supabase
    .from('stock_pins')
    .update({ prix_fournisseur: prix, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');

  revalidatePath('/pins-prix');
}

export async function definirPrixFournisseurEnMasse(ids: string[], prix: number): Promise<void> {
  verifierPrixValide(prix);
  if (ids.length === 0) return;
  const supabase = await creerClientSupabaseServeur();

  const { data, error } = await supabase
    .from('stock_pins')
    .update({ prix_fournisseur: prix, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');

  revalidatePath('/pins-prix');
}
