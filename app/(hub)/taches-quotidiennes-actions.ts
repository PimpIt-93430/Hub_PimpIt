'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

export interface TacheQuotidienne {
  id: string;
  libelle: string;
  valideAujourdhui: boolean;
}

function aujourdhui(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** Checklist quotidienne de l'accueil (cf. migration hub_taches_quotidiennes) — tâches récurrentes
 * fixes, cochées jour par jour (une ligne de validation par tâche et par date, jamais un simple
 * booléen : la coche se réinitialise donc naturellement chaque jour). */
export async function chargerTachesQuotidiennes(): Promise<TacheQuotidienne[]> {
  const supabase = await creerClientSupabaseServeur();
  const date = aujourdhui();

  const [{ data: taches }, { data: validations }] = await Promise.all([
    supabase.from('hub_taches_quotidiennes').select('id, libelle').eq('actif', true).order('ordre'),
    supabase.from('hub_taches_quotidiennes_validations').select('tache_id').eq('date', date),
  ]);

  const validesAujourdhui = new Set((validations ?? []).map((v) => v.tache_id as string));
  return (taches ?? []).map((t) => ({ id: t.id, libelle: t.libelle, valideAujourdhui: validesAujourdhui.has(t.id) }));
}

export async function basculerTacheQuotidienne(tacheId: string, valide: boolean): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const date = aujourdhui();

  if (valide) {
    const { error } = await supabase
      .from('hub_taches_quotidiennes_validations')
      .upsert({ tache_id: tacheId, date, valide_par: user?.id ?? null, valide_le: new Date().toISOString() }, { onConflict: 'tache_id,date' });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('hub_taches_quotidiennes_validations').delete().eq('tache_id', tacheId).eq('date', date);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/');
}

export async function creerTacheQuotidienne(libelle: string): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const { data: max } = await supabase
    .from('hub_taches_quotidiennes')
    .select('ordre')
    .order('ordre', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from('hub_taches_quotidiennes')
    .insert({ libelle: libelle.trim(), ordre: (max?.ordre ?? 0) + 1 });
  if (error) throw new Error(error.message);

  revalidatePath('/');
}

/** Désactive plutôt que supprime : garde l'historique des validations passées intact. */
export async function retirerTacheQuotidienne(tacheId: string): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('hub_taches_quotidiennes').update({ actif: false }).eq('id', tacheId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/');
}
