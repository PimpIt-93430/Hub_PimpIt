'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { assignToLeversProfile, setHsCode, shopifyFetch } from '@/lib/shopify';

/** Prochain SKU séquentiel "P{n}" — port de GET /api/packs/next-sku (server.js:1386), calculé sur
 * hub_packs.sku_shopify au lieu du champ Airtable équivalent. */
export async function chargerProchainSkuPack(): Promise<string> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('hub_packs').select('sku_shopify');
  if (error) throw new Error(error.message);

  let max = 0;
  for (const row of data ?? []) {
    const m = (row.sku_shopify ?? '').match(/^P(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `P${max + 1}`;
}

/** Supabase est désormais la base d'origine du Hub : un pack créé ici n'existe que dans Supabase
 * (pas de write-back vers Airtable). Les packs synchronisés depuis Airtable ont un airtable_id qui
 * commence par "rec" ; les packs créés depuis le Hub ont un id synthétique préfixé "hub_" pour
 * qu'on puisse toujours les distinguer plus tard si besoin.
 *
 * Comme sur l'ancien site, créer un pack crée aussi un vrai produit Shopify (poids fixe 2g, code
 * douanier, profil d'expédition "Produits légers") — c'est un produit live sur la boutique dès la
 * création, exactement comme avant. Si la création Shopify échoue, on garde quand même
 * l'enregistrement Supabase (le pack existe côté inventaire même sans fiche boutique — même
 * comportement que l'ancien site, qui avalait déjà l'erreur Shopify).
 *
 * Contrairement à l'édition (cf. modifierPackPins), la création ne prend pas de quantités par pin
 * (checkbox simple, pas de stepper) — comportement réel de l'ancien admin (openPackModal /
 * submitPack), pas une simplification de notre part : chaque pin coché compte pour 1. */
export async function creerPack(params: { nom: string; sku: string; pinIds: string[] }): Promise<{ shopifyUrl: string | null }> {
  const nom = params.nom.trim();
  const sku = params.sku.trim();
  const pinIds = [...new Set(params.pinIds)];
  if (!nom || !sku) throw new Error('Nom et SKU requis');
  if (!pinIds.length) throw new Error("Sélectionne au moins un pin's");

  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;
  const qtesPins: Record<string, number> = Object.fromEntries(pinIds.map((id) => [id, 1]));

  let shopifyProductId: string | null = null;
  let shopifyUrl: string | null = null;
  try {
    const result = await shopifyFetch('/products.json', 'POST', {
      product: {
        title: nom,
        product_type: "Pack de pin's",
        vendor: 'Pimp-It',
        variants: [{ sku, inventory_management: null, weight: 2, weight_unit: 'g' }],
      },
    });
    const productId = result.product?.id;
    if (productId) {
      shopifyProductId = String(productId);
      shopifyUrl = `https://${process.env.SHOPIFY_STORE}/admin/products/${productId}`;
      const invItemId = result.product?.variants?.[0]?.inventory_item_id;
      if (invItemId) await setHsCode(invItemId);
      await assignToLeversProfile(productId);
    }
  } catch (e) {
    console.warn('Shopify product skip:', e instanceof Error ? e.message : e);
  }

  const { error } = await supabase.from('hub_packs').insert({
    airtable_id: nouvelId,
    nom_du_pack: nom,
    sku_shopify: sku,
    photo_url: null,
    probleme: false,
    qtes_pins: qtesPins,
    pins_inclus_count: pinIds.length,
    shopify_product_id: shopifyProductId,
    shopify_url: shopifyUrl,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/packs');
  return { shopifyUrl };
}

/** Port de PATCH /api/packs/:id (server.js:1312) : sur l'ancien admin, éditer un pack ne touche
 * QUE la composition en pin's (avec quantités, via les steppers +/-) et le drapeau "Problème" — ni
 * le nom, ni le SKU, ni la photo (pas de champs pour ça dans edit-pack-modal), et aucun appel
 * Shopify (la fiche produit n'est pas retouchée). Comportement répliqué à l'identique ici. */
export async function modifierPackPins(
  airtableId: string,
  params: { qtesPins: Record<string, number>; probleme: boolean },
): Promise<void> {
  const qtesPins = Object.fromEntries(Object.entries(params.qtesPins).filter(([, qte]) => qte > 0));
  const total = Object.values(qtesPins).reduce((s, q) => s + q, 0);

  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('hub_packs')
    .update({
      qtes_pins: total > 0 ? qtesPins : null,
      pins_inclus_count: total,
      probleme: params.probleme,
      synced_at: new Date().toISOString(),
    })
    .eq('airtable_id', airtableId);
  if (error) throw new Error(error.message);

  revalidatePath('/packs');
}

/** L'ancien admin n'exposait aucune suppression de pack (pas de route /api/packs/:id DELETE dans
 * server.js). On garde quand même une suppression ici, discrète (lien texte dans le tiroir
 * d'édition plutôt qu'un bouton visible), même choix que PinDrawer pour les pin's à l'unité — pour
 * ne pas perdre la fonctionnalité tout en respectant la structure de l'ancien site. */
export async function supprimerPack(airtableId: string): Promise<void> {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase.from('hub_packs').delete().eq('airtable_id', airtableId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/packs');
}
