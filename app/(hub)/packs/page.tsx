import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { PacksClient } from './PacksClient';
import type { HubPack, PinOption } from './types';

/** Réplique l'écran "Packs de pin's" de l'ancien admin (id="screen-packs" dans public/index.html) :
 * grille de cartes (pas un tableau), création + édition avec sélection de pin's. Gestion complète
 * sur Supabase (hub_packs) — Supabase est désormais la base d'origine du Hub, plus de write-back
 * vers Airtable (cf. actions.ts). */
export default async function PacksPage() {
  const supabase = await creerClientSupabaseServeur();
  const [{ data: packsData }, { data: pinsBrut }] = await Promise.all([
    supabase.from('hub_packs').select('*').order('nom_du_pack'),
    // stock_pins (table de l'app Pimp It) plutôt que hub_pins depuis la fusion — cf. migration 0096.
    supabase.from('stock_pins').select('airtable_record_id, nom, sku_pimpit, photo_url').order('nom'),
  ]);

  const packs = (packsData ?? []) as HubPack[];
  const pins: PinOption[] = (pinsBrut ?? []).map((p) => ({
    airtable_id: p.airtable_record_id,
    name: p.nom,
    sku_pimpit: p.sku_pimpit,
    image_url: p.photo_url,
  }));

  return <PacksClient packsInitiaux={packs} pins={pins} />;
}
