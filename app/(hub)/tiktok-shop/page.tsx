import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { chargerProduitsTikTokExistants } from './actions';
import { TikTokShopClient } from './TikTokShopClient';
import type { PinOption } from './types';

function versNombre(v: number | string | null): number {
  if (v === null) return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/** Onglet "TikTok Shop" de Gestion des produits — cf. actions.ts pour le pourquoi (limite de 100
 * variantes du canal TikTok Shop, séparée des gros produits "Pin's pour Clogs" classiques). Charge
 * tout le catalogue hub_pins (695 pin's) pour le sélecteur, plus les produits déjà "TikTok Shop"
 * (calculés en direct sur Shopify, pas de champ dédié côté Supabase). */
export default async function TikTokShopPage() {
  const supabase = await creerClientSupabaseServeur();
  const [{ data: pinsData }, produitsExistants] = await Promise.all([
    // stock_pins (table de l'app Pimp It) plutôt que hub_pins depuis la fusion — cf. migration 0096.
    supabase.from('stock_pins').select('airtable_record_id, nom, sku_pimpit, photo_url, stock_general').order('nom'),
    chargerProduitsTikTokExistants().catch(() => []),
  ]);

  const pins: PinOption[] = (
    (pinsData ?? []) as { airtable_record_id: string; nom: string | null; sku_pimpit: string | null; photo_url: string | null; stock_general: number | string | null }[]
  ).map((p) => ({
    airtable_id: p.airtable_record_id,
    name: p.nom,
    sku_pimpit: p.sku_pimpit,
    image_url: p.photo_url,
    stock: versNombre(p.stock_general),
  }));

  return <TikTokShopClient pins={pins} produitsExistants={produitsExistants} />;
}
