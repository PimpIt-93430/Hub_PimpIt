'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import type { CommandeConsommableLigne, CommandeConsommables, CommandeConsommablesAvecLignes, TypeConsommable } from './consommablesLib';

/** Réplique src/api/consommables.ts de l'app Pimp It (écran Stock > Consommables) — même table
 * réelle (commandes_consommables/commande_consommables_lignes), pas un miroir hub_*. Cycle :
 * demandée (par le pop-up) → envoyée (par le local, une fois préparée) → reçue (par le pop-up).
 * Le Hub étant admin-only, les deux bouts du cycle sont montrés ensemble côté client plutôt que
 * conditionnés par un rôle (cf. ConsommablesScreen.tsx). */

async function idUtilisateurCourant(supabase: Awaited<ReturnType<typeof creerClientSupabaseServeur>>): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');
  return user.id;
}

export async function chargerCommandeActiveConsommables(popUpId: string): Promise<CommandeConsommablesAvecLignes | null> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('commandes_consommables')
    .select('*, lignes:commande_consommables_lignes(*)')
    .eq('pop_up_id', popUpId)
    .neq('statut', 'recue')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { lignes, ...commande } = data as unknown as CommandeConsommables & { lignes: CommandeConsommableLigne[] };
  return { commande, lignes };
}

export async function demanderConsommables(popUpId: string, lignes: { type: TypeConsommable; description: string | null }[]) {
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);
  const { data: commande, error: errorCommande } = await supabase
    .from('commandes_consommables')
    .insert({ pop_up_id: popUpId, demandee_par: profileId })
    .select('id')
    .single();
  if (errorCommande) throw new Error(errorCommande.message);

  const { error: errorLignes } = await supabase
    .from('commande_consommables_lignes')
    .insert(lignes.map((l) => ({ commande_id: commande.id, type: l.type, description: l.description })));
  if (errorLignes) throw new Error(errorLignes.message);
  revalidatePath('/stock');
}

export async function basculerLigneConsommable(params: { commandeId: string; type: TypeConsommable; description: string | null; inclus: boolean }) {
  const supabase = await creerClientSupabaseServeur();
  if (params.inclus) {
    const { error } = await supabase
      .from('commande_consommables_lignes')
      .insert({ commande_id: params.commandeId, type: params.type, description: params.description });
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase
      .from('commande_consommables_lignes')
      .delete()
      .eq('commande_id', params.commandeId)
      .eq('type', params.type)
      .select();
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('Retrait bloqué (droits insuffisants ?)');
  }
  revalidatePath('/stock');
}

export async function marquerConsommablesEnvoyee(commandeId: string) {
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);
  const { data, error } = await supabase
    .from('commandes_consommables')
    .update({ statut: 'envoyee', envoyee_par: profileId, envoyee_at: new Date().toISOString() })
    .eq('id', commandeId)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/stock');
}

export async function marquerConsommablesRecue(commandeId: string) {
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);
  const { data, error } = await supabase
    .from('commandes_consommables')
    .update({ statut: 'recue', recue_par: profileId, recue_at: new Date().toISOString() })
    .eq('id', commandeId)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/stock');
}
