'use server';

import { revalidatePath } from 'next/cache';

import { exigerAdmin } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

/** Bascule "exclure les heures du dimanche" pour une personne, directement depuis le calendrier
 * comptable (cf. retour utilisateur : "il faut pouvoir cocher une case pour chaque travailleur") —
 * même champ que l'onglet Contrat de la fiche employé (informations_rh.exclure_heures_dimanche),
 * upsert partiel (ne touche à aucun autre champ RH de la personne). */
export async function definirExclusionDimanche(profileId: string, valeur: boolean) {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('informations_rh')
    .upsert({ profile_id: profileId, exclure_heures_dimanche: valeur, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/export-comptable');
  revalidatePath('/equipe');
}
