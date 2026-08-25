'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { assignToLeversProfile, setHsCode, shopifyFetch } from '@/lib/shopify';

function champTexte(formData: FormData, cle: string): string | null {
  const v = formData.get(cle);
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.trim();
}

function champNombre(formData: FormData, cle: string): number | null {
  const v = formData.get(cle);
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function champBooleen(formData: FormData, cle: string): boolean {
  return formData.get(cle) === 'on';
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
 * comportement que l'ancien site, qui avalait déjà l'erreur Shopify). */
export async function creerPack(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;
  const nom = champTexte(formData, 'nom_du_pack');
  const sku = champTexte(formData, 'sku_shopify');
  if (!nom) throw new Error('Nom requis');

  let shopifyProductId: string | null = null;
  let shopifyUrl: string | null = null;
  if (sku) {
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
  }

  const { error } = await supabase.from('hub_packs').insert({
    airtable_id: nouvelId,
    nom_du_pack: nom,
    sku_shopify: sku,
    photo_url: champTexte(formData, 'photo_url'),
    stock_max: champNombre(formData, 'stock_max'),
    probleme: champBooleen(formData, 'probleme'),
    qtes_pins: null,
    pins_inclus_count: 0,
    shopify_product_id: shopifyProductId,
    shopify_url: shopifyUrl,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/packs');
  return { shopifyUrl };
}

export async function modifierPack(airtableId: string, formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const { error } = await supabase
    .from('hub_packs')
    .update({
      nom_du_pack: champTexte(formData, 'nom_du_pack'),
      sku_shopify: champTexte(formData, 'sku_shopify'),
      photo_url: champTexte(formData, 'photo_url'),
      stock_max: champNombre(formData, 'stock_max'),
      probleme: champBooleen(formData, 'probleme'),
      synced_at: new Date().toISOString(),
    })
    .eq('airtable_id', airtableId);
  if (error) throw new Error(error.message);

  revalidatePath('/packs');
}

export async function supprimerPack(airtableId: string) {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase.from('hub_packs').delete().eq('airtable_id', airtableId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/packs');
}
