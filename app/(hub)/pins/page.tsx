import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { PinsClient } from './PinsClient';
import type { HubPin } from './types';

interface HubPinBrute {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  sku_fournisseur: string | null;
  stock: number | string | null;
  seuil_cible: number | string | null;
  fournisseur: string | null;
  boite: string | null;
  poids_unitaire: number | string | null;
  poids_total: number | string | null;
  custom: boolean | null;
  pas_dans_unite: boolean | null;
  description: string | null;
  image_url: string | null;
}

/** `numeric` côté Postgres revient en string selon le client PostgREST — on normalise ici plutôt
 * que de faire confiance au typage brut de Supabase (même piège que StockCibleClient/Chaussures). */
function versNombre(v: number | string | null): number | null {
  if (v === null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Réplique l'écran "Database Pin's" de l'ancien admin Shopify (premier écran de l'ancien site,
 * juste après le tableau de bord ici) — gestion complète sur Supabase (hub_pins), plus de
 * write-back vers Airtable : Supabase est désormais la base d'origine du Hub. */
export default async function PinsPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_pins').select('*').order('name');
  const pins: HubPin[] = ((data ?? []) as HubPinBrute[]).map((p) => ({
    ...p,
    stock: versNombre(p.stock),
    seuil_cible: versNombre(p.seuil_cible),
    poids_unitaire: versNombre(p.poids_unitaire),
    poids_total: versNombre(p.poids_total),
  }));

  return <PinsClient pinsInitiaux={pins} />;
}
