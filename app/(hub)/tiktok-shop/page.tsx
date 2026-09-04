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
    supabase.from('hub_pins').select('airtable_id, name, sku_pimpit, image_url, stock').order('name'),
    chargerProduitsTikTokExistants().catch(() => []),
  ]);

  const pins: PinOption[] = ((pinsData ?? []) as { airtable_id: string; name: string | null; sku_pimpit: string | null; image_url: string | null; stock: number | string | null }[]).map(
    (p) => ({ ...p, stock: versNombre(p.stock) }),
  );

  return <TikTokShopClient pins={pins} produitsExistants={produitsExistants} />;
}
