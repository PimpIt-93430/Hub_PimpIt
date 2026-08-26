import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { PacksClient } from './PacksClient';
import type { HubPack, PinOption } from './types';

/** Réplique l'écran "Packs de pin's" de l'ancien admin (id="screen-packs" dans public/index.html) :
 * grille de cartes (pas un tableau), création + édition avec sélection de pin's. Gestion complète
 * sur Supabase (hub_packs) — Supabase est désormais la base d'origine du Hub, plus de write-back
 * vers Airtable (cf. actions.ts). */
export default async function PacksPage() {
  const supabase = await creerClientSupabaseServeur();
  const [{ data: packsData }, { data: pinsData }] = await Promise.all([
    supabase.from('hub_packs').select('*').order('nom_du_pack'),
    supabase.from('hub_pins').select('airtable_id, name, sku_pimpit, image_url').order('name'),
  ]);

  const packs = (packsData ?? []) as HubPack[];
  const pins = (pinsData ?? []) as PinOption[];

  return <PacksClient packsInitiaux={packs} pins={pins} />;
}
