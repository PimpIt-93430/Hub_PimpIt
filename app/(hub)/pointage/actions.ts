'use server';

import { revalidatePath } from 'next/cache';

import { exigerAdmin } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

export async function definirPointageActif(popUpId: string, valeur: boolean) {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('pop_ups')
    .update({ pointage_actif: valeur })
    .eq('id', popUpId)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/pointage');
}

/** Nouveau code secret pour ce pop-up : le QR déjà imprimé ne marche plus, il faut réimprimer. */
export async function regenererCodePointage(popUpId: string) {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const octets = crypto.getRandomValues(new Uint8Array(16));
  const code = Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
  const { data, error } = await supabase
    .from('pop_up_pointage')
    .update({ code, updated_at: new Date().toISOString() })
    .eq('pop_up_id', popUpId)
    .select('pop_up_id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/pointage');
}
