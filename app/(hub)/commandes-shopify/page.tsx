import { calculerClassificationCommandes } from '@/lib/classification-produits';
import { commandesShopifyEnCache } from '@/lib/commandes-shopify-cache';
import { chargerExpeditionsSendcloud } from '@/lib/expeditions-sendcloud';
import { calculerPoidsCommandes } from '@/lib/poids-commandes';
import { CommandesShopifyClient } from './CommandesShopifyClient';

/** Écran "Commandes Shopify" (cf. discussion 2026-08-27) : vue d'ensemble des commandes pas encore
 * livrées — pas encore expédiées, en transit, perdues — pour préparer les futures impressions
 * d'étiquettes depuis cet écran. Passe par le cache Supabase (cf. lib/commandes-shopify-cache.ts,
 * migration 0089) plutôt que par un appel Shopify complet à chaque visite : seule la synchro
 * incrémentale (ce qui a changé depuis la dernière fois) touche Shopify, et une commande livrée
 * sort du cache — retour utilisateur du 2026-09-02. */
export default async function CommandesShopifyPage() {
  const expeditions = await chargerExpeditionsSendcloud();
  const commandes = await commandesShopifyEnCache(expeditions);
  const [poids, classification] = await Promise.all([
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
