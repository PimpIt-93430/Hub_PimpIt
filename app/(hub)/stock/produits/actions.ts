'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import type { ChaussureInventaire, CoqueInventaire, SacInventaire, VenteSumupLigne } from './produitsLib';

/** Réplique src/api/chaussures.ts, coques.ts, sacs.ts de l'app Pimp It (écrans Produits > Chaussures/
 * Coques/Sacs) — mêmes tables réelles (chaussures_inventaires/coques_inventaires/sacs_inventaires,
 * ventes_sumup_lignes), pas un miroir hub_*. `chaussures_stock`/`coques_stock`/`sacs_stock` et leurs
 * `*_mapping_sumup` sont lus (page.tsx) mais jamais écrits ici — leur édition reste le rôle de
 * /stock-cible, déjà construit. */

async function idUtilisateurCourant(supabase: Awaited<ReturnType<typeof creerClientSupabaseServeur>>): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');
  return user.id;
}

/** `numeric` côté Postgres peut revenir sous forme de string selon le client (cf.
 * normaliserStockPin dans pins/stockLib.ts) — même normalisation ici pour quantite_comptee/quantite,
 * utilisés en arithmétique (soustraction/somme) dans produitsLib.ts. */
function normaliserQuantite<T extends { quantite_comptee: number | string }>(rows: T[]): (T & { quantite_comptee: number })[] {
  return rows.map((r) => ({ ...r, quantite_comptee: Number(r.quantite_comptee) }));
}

export async function chargerChaussuresInventaires(popUpId: string): Promise<ChaussureInventaire[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('chaussures_inventaires')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return normaliserQuantite(data as ChaussureInventaire[]);
}

export async function chargerCoquesInventaires(popUpId: string): Promise<CoqueInventaire[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('coques_inventaires')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return normaliserQuantite(data as CoqueInventaire[]);
}

export async function chargerSacsInventaires(popUpId: string): Promise<SacInventaire[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('sacs_inventaires')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return normaliserQuantite(data as SacInventaire[]);
}

export async function chargerVentesSumupLignes(popUpId: string): Promise<VenteSumupLigne[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('ventes_sumup_lignes')
    .select('id, pop_up_id, horodatage, nom_produit, description, quantite')
    .eq('pop_up_id', popUpId)
    .order('horodatage', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as VenteSumupLigne[]).map((l) => ({ ...l, quantite: Number(l.quantite) }));
}

export async function enregistrerInventaireChaussures(
  lignes: { couleur: ChaussureInventaire['couleur']; taille: ChaussureInventaire['taille']; quantite_comptee: number }[],
  popUpId: string,
) {
  if (lignes.length === 0) return;
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);
  const { error } = await supabase
    .from('chaussures_inventaires')
    .insert(lignes.map((l) => ({ ...l, profile_id: profileId, pop_up_id: popUpId })));
  if (error) throw new Error(error.message);
  revalidatePath('/stock');
}

export async function enregistrerInventaireCoques(
  lignes: {
    modele: CoqueInventaire['modele'];
    variante: CoqueInventaire['variante'];
    couleur: CoqueInventaire['couleur'];
    quantite_comptee: number;
  }[],
  popUpId: string,
) {
  if (lignes.length === 0) return;
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);
  const { error } = await supabase
    .from('coques_inventaires')
    .insert(lignes.map((l) => ({ ...l, profile_id: profileId, pop_up_id: popUpId })));
  if (error) throw new Error(error.message);
  revalidatePath('/stock');
}

export async function enregistrerInventaireSacs(
  lignes: { produit: SacInventaire['produit']; couleur: SacInventaire['couleur']; quantite_comptee: number }[],
  popUpId: string,
) {
  if (lignes.length === 0) return;
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);
  const { error } = await supabase
    .from('sacs_inventaires')
    .insert(lignes.map((l) => ({ ...l, profile_id: profileId, pop_up_id: popUpId })));
  if (error) throw new Error(error.message);
  revalidatePath('/stock');
}

/** Déclenche l'Edge Function `sync-ventes-sumup` (admin) — cf. useSynchroniserVentesSumup côté
 * app. Manuel ici (bouton) plutôt qu'automatique à chaque ouverture d'écran comme dans l'app, pour
 * ne pas appeler l'Edge Function à chaque chargement de page côté Hub. */
export async function synchroniserVentesSumup(): Promise<{ transactions_vues: number; nouvelles_ou_modifiees: number }> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.functions.invoke('sync-ventes-sumup', { body: {} });
  if (error) throw new Error(error.message);
  revalidatePath('/stock');
  return data;
}
