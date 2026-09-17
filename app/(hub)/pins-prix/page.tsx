import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { PrixPinsClient } from './PrixPinsClient';
import type { PinPrix } from './types';

function versNombre(v: number | string | null): number | null {
  if (v === null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Cf. retour utilisateur du 2026-09-15 : écran dédié pour vérifier/corriger rapidement le prix
 * fournisseur de chaque pin's (valeurs par défaut posées en base par la migration
 * stock_pins_prix_fournisseur : custom -> 0.15, tout le reste -> 0.05 — le "métallique" n'existe
 * pas comme donnée en base, à repasser à 0.60 ici à la main). Volontairement séparé de /pins
 * (écran de gestion complet, déjà chargé) pour rester rapide à parcourir. */
export default async function PinsPrixPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase
    .from('stock_pins')
    .select('id, nom, sku_pimpit, custom, photo_url, prix_fournisseur, prix_revente_ht')
    .order('nom');
  const pins: PinPrix[] = (data ?? []).map((p) => ({
    id: p.id,
    nom: p.nom,
    sku_pimpit: p.sku_pimpit,
    custom: p.custom,
    photo_url: p.photo_url,
    prix_fournisseur: versNombre(p.prix_fournisseur),
    prix_revente_ht: versNombre(p.prix_revente_ht),
  }));

  return <PrixPinsClient pinsInitiaux={pins} />;
}
