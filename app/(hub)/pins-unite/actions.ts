'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { assignToLeversProfile, setHsCode, shopifyFetch, shopifyFetchAll } from '@/lib/shopify';

function champTexte(formData: FormData, cle: string): string | null {
  const v = formData.get(cle);
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.trim();
}

interface ShopifyVariant {
  id: number;
  sku: string | null;
  option1: string | null;
  title?: string | null;
  inventory_item_id: number | null;
}

/** Réplique "/api/unite/create" de l'ancien site : crée un vrai produit Shopify "Pin's à l'unité"
 * (une variante par pin sélectionné + une variante "Tous les pin's de cette collection"), active
 * le suivi de stock + code douanier + niveau de stock par variante (stock lu depuis hub_pins, plus
 * besoin d'Airtable en direct), ajoute aux collections "tous-les-pins" + celles cochées, pose les
 * metafields SEO, assigne le profil d'expédition léger, puis décoche "pas_dans_unite" sur les pins
 * utilisés dans Supabase (remplace l'atPatch Airtable de l'ancien site). */
export async function creerProduitUnite(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const titre = champTexte(formData, 'titre');
  let pinIds: string[] = [];
  try {
    pinIds = JSON.parse(champTexte(formData, 'pin_ids') ?? '[]');
  } catch {
    pinIds = [];
  }
  if (!titre) throw new Error('Titre requis');
  if (pinIds.length === 0) throw new Error('Sélectionne au moins un pin');

  const description = champTexte(formData, 'description') ?? '';
  const metaTitle = champTexte(formData, 'meta_titre');
  const metaDescription = champTexte(formData, 'meta_description');
  const tagsBrut = champTexte(formData, 'tags');
  const tags = tagsBrut
    ? tagsBrut
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  let collectionIds: string[] = [];
  try {
    collectionIds = JSON.parse(champTexte(formData, 'collection_ids') ?? '[]');
  } catch {
    collectionIds = [];
  }

  const { data: pinsData } = await supabase.from('hub_pins').select('airtable_id, name, sku_pimpit, stock').in('airtable_id', pinIds);
  const pinsById = Object.fromEntries((pinsData ?? []).map((p) => [p.airtable_id, p]));

  const pinVariants = pinIds.map((id) => {
    const p = pinsById[id];
    return {
      option1: p?.name || id,
      sku: p?.sku_pimpit != null ? String(p.sku_pimpit) : '',
      inventory_policy: 'continue',
      weight: 0.6,
      weight_unit: 'g',
    };
  });
  const allVariant = {
    option1: "Tous les pin's de cette collection",
    sku: '',
    inventory_policy: 'continue',
    weight: +(pinIds.length * 0.6).toFixed(2),
    weight_unit: 'g',
  };

  const productPayload: Record<string, unknown> = {
    title: titre,
    body_html: description,
    product_type: "Pin's à l'unité",
    vendor: 'Pimp-It',
    options: [{ name: 'Pin' }],
    variants: [...pinVariants, allVariant],
    template_suffix: 'pins-et-pack',
  };
  if (tags.length) productPayload.tags = tags.join(', ');

  const result = await shopifyFetch('/products.json', 'POST', { product: productPayload });
  const productId = result.product?.id;
  if (!productId) throw new Error(JSON.stringify(result));

  const locationData = await shopifyFetch('/locations.json');
  const locationId = locationData.locations?.[0]?.id;

  const stockBySku: Record<string, number> = {};
  for (const id of pinIds) {
    const p = pinsById[id];
    if (p?.sku_pimpit != null) stockBySku[String(p.sku_pimpit)] = p.stock != null ? Math.round(Number(p.stock)) : 0;
  }

  for (const v of (result.product.variants ?? []) as ShopifyVariant[]) {
    try {
      await shopifyFetch(`/variants/${v.id}.json`, 'PUT', { variant: { id: v.id, inventory_management: 'shopify' } });
    } catch {
      // même comportement que l'ancien site : on continue même si une variante échoue
    }
    if (v.inventory_item_id) await setHsCode(v.inventory_item_id);

    if (locationId && v.inventory_item_id) {
      const estToutesVariantes = (v.option1 || v.title || '').toLowerCase().includes("tous les pin");
      const qte = estToutesVariantes ? 1000 : (stockBySku[String(v.sku)] ?? 0);
      try {
        await shopifyFetch('/inventory_levels/set.json', 'POST', {
          location_id: locationId,
          inventory_item_id: v.inventory_item_id,
          available: qte,
        });
      } catch (e) {
        console.warn(`Stock error variant ${v.id}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  const colsData = await shopifyFetch('/custom_collections.json?limit=250');
  const tousLesPins = (colsData.custom_collections ?? []).find((c: { handle: string }) => c.handle === 'tous-les-pins');
  const colIdsToAdd = new Set(collectionIds.map(String));
  if (tousLesPins) colIdsToAdd.add(String(tousLesPins.id));
  for (const colId of colIdsToAdd) {
    try {
      await shopifyFetch('/collects.json', 'POST', { collect: { product_id: productId, collection_id: parseInt(colId, 10) } });
    } catch {
      // idem : une collection qui échoue ne doit pas bloquer la création du produit
    }
  }

  if (metaTitle) {
    await shopifyFetch('/metafields.json', 'POST', {
      metafield: {
        namespace: 'global',
        key: 'title_tag',
        value: metaTitle,
        type: 'single_line_text_field',
        owner_id: productId,
        owner_resource: 'product',
      },
    }).catch(() => {});
  }
  if (metaDescription) {
    await shopifyFetch('/metafields.json', 'POST', {
      metafield: {
        namespace: 'global',
        key: 'description_tag',
        value: metaDescription,
        type: 'single_line_text_field',
        owner_id: productId,
        owner_resource: 'product',
      },
    }).catch(() => {});
  }

  await assignToLeversProfile(productId);

  for (let i = 0; i < pinIds.length; i += 10) {
    const batch = pinIds.slice(i, i + 10);
    await supabase.from('hub_pins').update({ pas_dans_unite: false }).in('airtable_id', batch);
  }

  revalidatePath('/pins-unite');
  revalidatePath('/pins');

  return { shopifyUrl: `https://${process.env.SHOPIFY_STORE}/admin/products/${productId}` };
}

interface ProduitUniteExistant {
  id: string;
  title: string;
  variantCount: number;
  image: string;
}

interface ShopifyProduitBrut {
  id: number;
  title: string;
  product_type?: string;
  variants?: { sku?: string | null }[];
  images?: { src?: string }[];
}

/** Réplique "/api/unite/products" de l'ancien site : liste les produits Shopify déjà de type
 * "Pin's à l'unité", pour l'option "Ajouter à un produit existant". */
export async function chargerProduitsUniteExistants(): Promise<ProduitUniteExistant[]> {
  const produits = await shopifyFetchAll<ShopifyProduitBrut>(
    '/products.json?limit=250&fields=id,title,product_type,variants,images',
    'products',
  );
  return produits
    .filter((p) => p.product_type === "Pin's à l'unité")
    .map((p) => ({
      id: String(p.id),
      title: p.title,
      variantCount: (p.variants ?? []).length,
      image: p.images?.[0]?.src ?? '',
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Réplique "/api/unite/add-variant" de l'ancien site : ajoute une variante pour ce pin sur un
 * produit "Pin's à l'unité" déjà en ligne (prix fixe 2€, comme l'ancien site), active le suivi de
 * stock, code douanier, niveau de stock depuis hub_pins, profil d'expédition léger, puis décoche
 * "pas_dans_unite" sur ce pin dans Supabase. */
export async function ajouterVarianteAProduitExistant(
  pinAirtableId: string,
  productId: string,
): Promise<{ shopifyUrl: string }> {
  const supabase = await creerClientSupabaseServeur();

  const { data: pin } = await supabase
    .from('hub_pins')
    .select('name, sku_pimpit, stock')
    .eq('airtable_id', pinAirtableId)
    .single();
  if (!pin) throw new Error('Pin introuvable');

  const stock = pin.stock != null ? Math.round(Number(pin.stock)) : 0;

  const varResult = await shopifyFetch(`/products/${productId}/variants.json`, 'POST', {
    variant: {
      option1: pin.name || '',
      sku: pin.sku_pimpit != null ? String(pin.sku_pimpit) : '',
      price: '2.00',
      inventory_policy: 'continue',
      weight: 0.6,
      weight_unit: 'g',
    },
  });
  if (!varResult.variant) throw new Error(JSON.stringify(varResult));
  const variant = varResult.variant;

  try {
    await shopifyFetch(`/variants/${variant.id}.json`, 'PUT', {
      variant: { id: variant.id, inventory_management: 'shopify' },
    });
  } catch {
    // même comportement que l'ancien site : on continue même si l'activation du suivi échoue
  }

  if (variant.inventory_item_id) await setHsCode(variant.inventory_item_id);

  const locationData = await shopifyFetch('/locations.json');
  const locationId = locationData.locations?.[0]?.id;
  if (locationId && variant.inventory_item_id) {
    try {
      await shopifyFetch('/inventory_levels/set.json', 'POST', {
        location_id: locationId,
        inventory_item_id: variant.inventory_item_id,
        available: stock,
      });
    } catch (e) {
      console.warn('Stock error:', e instanceof Error ? e.message : e);
    }
  }

  await assignToLeversProfile(productId);

  await supabase.from('hub_pins').update({ pas_dans_unite: false }).eq('airtable_id', pinAirtableId);

  revalidatePath('/pins-unite');
  revalidatePath('/pins');

  return { shopifyUrl: `https://${process.env.SHOPIFY_STORE}/admin/products/${productId}` };
}
