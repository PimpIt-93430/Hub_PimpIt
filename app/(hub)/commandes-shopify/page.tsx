import { calculerClassificationCommandes } from '@/lib/classification-produits';
import { chargerExpeditionsSendcloud } from '@/lib/expeditions-sendcloud';
import { calculerPoidsCommandes } from '@/lib/poids-commandes';
import { listerCommandesRecentes } from '@/lib/shopify';
import { CommandesShopifyClient } from './CommandesShopifyClient';

/** Écran "Commandes Shopify" (cf. discussion 2026-08-27) : vue d'ensemble des commandes en direct
 * depuis Shopify — pas encore expédiées, en transit, livrées, perdues — pour préparer les futures
 * impressions d'étiquettes depuis cet écran. Chargement direct à chaque visite, pas de cache
 * Supabase : le statut doit refléter Shopify à l'instant T — sauf le statut de livraison Sendcloud
 * (cf. lib/expeditions-sendcloud.ts, migré de Boxtal le 2026-08-29), que Shopify ne connaît pas
 * pour ces envois et qu'on garde donc dans Supabase, rafraîchi à la demande. */
export default async function CommandesShopifyPage() {
  const commandes = await listerCommandesRecentes(200);
  const [expeditions, poids, classification] = await Promise.all([
    chargerExpeditionsSendcloud(),
    calculerPoidsCommandes(commandes),
    calculerClassificationCommandes(commandes),
  ]);

  return (
    <CommandesShopifyClient
      commandesInitiales={commandes}
      expeditionsInitiales={[...expeditions]}
      poidsInitiaux={[...poids]}
      classificationInitiale={[...classification]}
    />
  );
}
