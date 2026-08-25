'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { assignToLeversProfile, shopifyFetch } from '@/lib/shopify';

function champTexte(formData: FormData, cle: string): string | null {
  const v = formData.get(cle);
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.trim();
}

const TAILLES = ['36-37', '38-39', '40-41', '41-42', '43-44', '45-46'];

/** Réplique "/api/sabots-custom/create-full" de l'ancien site : crée un vrai produit Shopify avec
 * une variante par couleur × taille (couleurs lues dynamiquement depuis hub_sabots, comme avant),
 * le SEO en metafields, l'assignation au profil d'expédition léger, puis l'enregistrement Supabase
 * avec les pin's inclus (remplace l'écriture Airtable de l'ancien site — Supabase est désormais la
 * base d'origine). Si la création Shopify échoue, on s'arrête avant d'écrire dans Supabase (contrairement
 * aux packs) car un sabot personnalisé sans produit Shopify n'a pas de sens métier. */
export async function creerSabotCustomComplet(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();
  const nom = champTexte(formData, 'nom');
  const sku = champTexte(formData, 'sku')?.toUpperCase() ?? null;
  const prix = champTexte(formData, 'prix');
  if (!nom || !sku || !prix) throw new Error('Nom, SKU et prix requis');

  const description = champTexte(formData, 'description');
  const seoTitre = champTexte(formData, 'seo_titre');
  const seoDescription = champTexte(formData, 'seo_description');
  const tagsBrut = champTexte(formData, 'tags');
  const tags = tagsBrut ? tagsBrut.split(',').map((t) => t.trim()).filter(Boolean) : [];

  let qtesMap: Record<string, number> = {};
  try {
    qtesMap = JSON.parse(champTexte(formData, 'pins_selectionnes') ?? '{}');
  } catch {
    qtesMap = {};
  }
  const idsUniques = Object.keys(qtesMap);

  const { data: sabotsRows } = await supabase.from('hub_sabots').select('couleur');
  const couleurs = [...new Set((sabotsRows ?? []).map((r) => r.couleur).filter(Boolean))].sort() as string[];
  if (couleurs.length === 0) throw new Error('Aucune couleur trouvée dans la table Sabots');

  const variants = couleurs.flatMap((couleur) =>
    TAILLES.map((taille) => ({
      option1: couleur,
      option2: taille,
      price: Number(prix).toFixed(2),
      sku,
      inventory_management: 'shopify',
      inventory_policy: 'deny',
    })),
  );

  const result = await shopifyFetch('/products.json', 'POST', {
    product: {
      title: nom,
      body_html: description ?? '',
      product_type: 'Sabot customisé',
      tags: tags.join(', '),
      options: [
        { name: 'Couleur', values: couleurs },
        { name: 'Taille', values: TAILLES },
      ],
      variants,
    },
  });
  const productId = result.product?.id;
  if (!productId) throw new Error('Création Shopify échouée');

  const metaPromises: Promise<unknown>[] = [];
  if (seoTitre) {
    metaPromises.push(
      shopifyFetch(`/products/${productId}/metafields.json`, 'POST', {
        metafield: { namespace: 'global', key: 'title_tag', value: seoTitre, type: 'single_line_text_field' },
      }),
    );
  }
  if (seoDescription) {
    metaPromises.push(
      shopifyFetch(`/products/${productId}/metafields.json`, 'POST', {
        metafield: { namespace: 'global', key: 'description_tag', value: seoDescription, type: 'single_line_text_field' },
      }),
    );
  }
  await Promise.all(metaPromises).catch(() => {});
  await assignToLeversProfile(productId);

  const nouvelId = `hub_${crypto.randomUUID()}`;
  const { error } = await supabase.from('hub_sabots_custom').insert({
    airtable_id: nouvelId,
    nom,
    sku_shopify: sku,
    shopify_product_id: String(productId),
    shopify_url: `https://${process.env.SHOPIFY_STORE}/admin/products/${productId}`,
    pins_inclus_count: idsUniques.length,
    qtes_pins: idsUniques.length ? qtesMap : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/sabots-custom');
  return {
    shopifyUrl: `https://${process.env.SHOPIFY_STORE}/admin/products/${productId}`,
    variantsCreated: variants.length,
    couleurs,
  };
}

/** Supabase est désormais la base d'origine du Hub : un sabot personnalisé créé ici n'existe que
 * dans Supabase (pas de write-back vers Airtable). Les sabots personnalisés synchronisés depuis
 * Airtable ont un airtable_id qui commence par "rec" ; ceux créés depuis le Hub ont un id
 * synthétique préfixé "hub_" pour qu'on puisse toujours les distinguer plus tard si besoin. */
export async function creerSabotCustom(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();
  const nouvelId = `hub_${crypto.randomUUID()}`;

  const { error } = await supabase.from('hub_sabots_custom').insert({
    airtable_id: nouvelId,
    nom: champTexte(formData, 'nom'),
    sku_shopify: champTexte(formData, 'sku_shopify'),
    photo_url: champTexte(formData, 'photo_url'),
    shopify_product_id: null,
    pins_inclus_count: 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/sabots-custom');
}

export async function modifierSabotCustom(airtableId: string, formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const { error } = await supabase
    .from('hub_sabots_custom')
    .update({
      nom: champTexte(formData, 'nom'),
      sku_shopify: champTexte(formData, 'sku_shopify'),
      photo_url: champTexte(formData, 'photo_url'),
      synced_at: new Date().toISOString(),
    })
    .eq('airtable_id', airtableId);
  if (error) throw new Error(error.message);

  revalidatePath('/sabots-custom');
}

export async function supprimerSabotCustom(airtableId: string) {
  const supabase = await creerClientSupabaseServeur();

  // .select() force Supabase/PostgREST à renvoyer les lignes supprimées : sans ça, une RLS qui
  // bloque silencieusement la suppression ne remonte aucune erreur (piège déjà rencontré sur ce
  // projet — cf. mémoire "Supabase delete RLS silent").
  const { data, error } = await supabase.from('hub_sabots_custom').delete().eq('airtable_id', airtableId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/sabots-custom');
}
