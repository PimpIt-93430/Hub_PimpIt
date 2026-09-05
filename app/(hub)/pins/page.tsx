import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { PinsClient } from './PinsClient';
import type { HubPin } from './types';

/** `numeric` côté Postgres revient en string selon le client PostgREST — on normalise ici plutôt
 * que de faire confiance au typage brut de Supabase (même piège que StockCibleClient/Chaussures). */
function versNombre(v: number | string | null): number | null {
  if (v === null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Réplique l'écran "Database Pin's" de l'ancien admin Shopify (premier écran de l'ancien site,
 * juste après le tableau de bord ici) — gestion complète sur stock_pins (table de l'app Pimp It,
 * cf. migration 0096 : hub_pins avait dérivé de stock_pins faute de synchro depuis la bascule
 * Airtable, fusionnées pour n'avoir plus qu'une seule source de vérité du stock). */
export default async function PinsPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase
    .from('stock_pins')
    .select(
      'airtable_record_id, nom, sku_pimpit, sku_fournisseur, stock_general, seuil_cible, fournisseur, boite, poids_unitaire, poids_total, custom, pas_dans_unite, description, photo_url',
    )
    .order('nom');
  const pins: HubPin[] = (data ?? []).map((p) => ({
    airtable_id: p.airtable_record_id,
    name: p.nom,
    sku_pimpit: p.sku_pimpit,
    sku_fournisseur: p.sku_fournisseur,
    stock: versNombre(p.stock_general),
    seuil_cible: versNombre(p.seuil_cible),
    fournisseur: p.fournisseur,
    boite: p.boite,
    poids_unitaire: versNombre(p.poids_unitaire),
    poids_total: versNombre(p.poids_total),
    custom: p.custom,
    pas_dans_unite: p.pas_dans_unite,
    description: p.description,
    image_url: p.photo_url,
  }));

  return <PinsClient pinsInitiaux={pins} />;
}
