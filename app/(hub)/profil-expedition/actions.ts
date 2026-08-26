'use server';

import { assignVariantsToProfile, listDeliveryProfiles, type ProfilExpedition } from '@/lib/shopify';

/** Réplique GET /api/shipping/profiles de l'ancien admin (server.js:125-185) — appelé
 * manuellement au clic sur "Analyser les profils" (pas de chargement automatique, l'appel
 * est coûteux : GraphQL paginé + batch REST d'images). */
export async function chargerProfilsExpedition(): Promise<ProfilExpedition[]> {
  return listDeliveryProfiles();
}

/** Réplique POST /api/shipping/assign de l'ancien admin (server.js:187-203). */
export async function deplacerVersProfil(variantGids: string[], profileId: string): Promise<void> {
  await assignVariantsToProfile(variantGids, profileId);
}
