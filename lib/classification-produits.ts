// Léger vs lourd (cf. discussion 2026-08-29 : "si c'est livraison à domicile de produit léger
// c'est par lettre et lourd par colis") — la boutique a déjà deux profils d'expédition Shopify
// dédiés ("Produits Légers", "Produits Lourds", cf. lib/shopify.ts listDeliveryProfiles/
// getLeversProfileId), donc pas besoin d'un poids/seuil séparé ici : on lit directement ces
// profils pour savoir dans quelle catégorie tombe chaque produit d'une commande.
import { listDeliveryProfiles } from './shopify';
import type { CommandeShopify } from './shopify';

export type ClassificationCommande = 'leger' | 'lourd';

const NOM_PROFIL_LEGER = /l[ée]ger/i;

// listDeliveryProfiles() est un GraphQL Shopify paginé (tous les profils + tous leurs produits) —
// gros contributeur de latence sur l'écran Commandes identifié lors de l'audit du 2026-09-02,
// refait à chaque visite pour une donnée de config catalogue qui ne change quasiment jamais. Cache
// mémoire process (même idiome que cachedToken/tokenExpiresAt dans lib/shopify.ts) : ne concerne
// que ce calcul dérivé, pas listDeliveryProfiles() elle-même (l'écran "Analyser les profils",
// app/(hub)/profil-expedition/actions.ts, doit rester toujours à jour pendant qu'on édite les
// assignations).
let idsLegersEnCache: Set<string> | null = null;
let idsLegersExpireLe = 0;
const DUREE_CACHE_IDS_LEGERS_MS = 15 * 60 * 1000;

async function chargerIdsLegers(): Promise<Set<string>> {
  if (idsLegersEnCache && Date.now() < idsLegersExpireLe) return idsLegersEnCache;

  const profils = await listDeliveryProfiles();
  const idsLegers = new Set<string>();
  for (const profil of profils) {
    if (!NOM_PROFIL_LEGER.test(profil.name)) continue;
    for (const item of profil.items) idsLegers.add(item.productId);
  }

  idsLegersEnCache = idsLegers;
  idsLegersExpireLe = Date.now() + DUREE_CACHE_IDS_LEGERS_MS;
  return idsLegers;
}

/** 'leger' seulement si TOUTES les lignes de la commande sont des produits du profil "Produits
 * Légers" — toute ligne dans "Produits Lourds", dans le profil général (non classé), ou sans
 * productId reconnu fait basculer toute la commande en 'lourd' (colis) : mieux vaut un colis
 * envoyé pour un article léger qu'une lettre refusée/perdue pour un article trop lourd. */
export async function calculerClassificationCommandes(
  commandes: CommandeShopify[],
): Promise<Map<number, ClassificationCommande>> {
  const idsLegers = await chargerIdsLegers();

  const resultat = new Map<number, ClassificationCommande>();
  for (const cmd of commandes) {
    if (cmd.lignes.length === 0) continue;
    const toutesLegeres = cmd.lignes.every((l) => l.productId !== null && idsLegers.has(String(l.productId)));
    resultat.set(cmd.id, toutesLegeres ? 'leger' : 'lourd');
  }
  return resultat;
}
