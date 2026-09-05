'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

/** Réplique l'écran "Database Pin's" de l'ancien admin Shopify (public/index.html + server.js
 * `/api/pins*`) — mêmes champs, même logique (SKU Pimpit auto-assigné et jamais modifiable, pas
 * de suppression exposée dans l'ancien site). Écrit dans stock_pins (table de l'app Pimp It,
 * cf. migration 0096 — hub_pins avait dérivé de stock_pins faute de synchro depuis la bascule
 * Airtable, fusionnées pour n'avoir plus qu'une seule source de vérité du stock). */

export interface PinParams {
  name: string;
  skuFournisseur: string | null;
  fournisseur: string | null;
  boite: string | null;
  stock: number | null;
  seuilCible: number | null;
  poidsUnitaire: number | null;
  poidsTotal: number | null;
  description: string | null;
  imageUrl: string | null;
  custom: boolean;
  pasDansUnite: boolean;
}

/** Prochain SKU Pimpit disponible (max + 1) — même principe que GET /api/pins/next-sku de
 * l'ancien admin, recalculé côté Supabase puisqu'il n'y a plus d'Airtable à interroger. */
export async function chargerProchainSku(): Promise<number> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('stock_pins').select('sku_pimpit');
  if (error) throw new Error(error.message);
  let max = 0;
  for (const row of data ?? []) {
    const n = Number(row.sku_pimpit);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export async function creerPin(params: PinParams): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;
  const nextSku = await chargerProchainSku();

  const { error } = await supabase.from('stock_pins').insert({
    airtable_record_id: nouvelId,
    nom: params.name,
    sku_pimpit: String(nextSku),
    sku_fournisseur: params.skuFournisseur,
    stock_general: params.stock ?? 0,
    seuil_cible: params.seuilCible,
    fournisseur: params.fournisseur,
    boite: params.boite,
    poids_unitaire: params.poidsUnitaire,
    poids_total: params.poidsTotal,
    custom: params.custom,
    pas_dans_unite: params.pasDansUnite,
    description: params.description,
    photo_url: params.imageUrl,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/pins');
}

export async function modifierPin(airtableId: string, params: PinParams): Promise<void> {
  const supabase = await creerClientSupabaseServeur();

  const { data, error } = await supabase
    .from('stock_pins')
    .update({
      nom: params.name,
      sku_fournisseur: params.skuFournisseur,
      stock_general: params.stock ?? 0,
      seuil_cible: params.seuilCible,
      fournisseur: params.fournisseur,
      boite: params.boite,
      poids_unitaire: params.poidsUnitaire,
      poids_total: params.poidsTotal,
      custom: params.custom,
      pas_dans_unite: params.pasDansUnite,
      description: params.description,
      photo_url: params.imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('airtable_record_id', airtableId)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');

  revalidatePath('/pins');
}

export async function supprimerPin(airtableId: string): Promise<void> {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase.from('stock_pins').delete().eq('airtable_record_id', airtableId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/pins');
}
