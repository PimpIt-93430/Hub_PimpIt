'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { assignToLeversProfile, setHsCode, shopifyFetch, shopifyGraphQL } from '@/lib/shopify';
import type { ProduitTikTokExistant } from './types';

/** Onglet "TikTok Shop" de Gestion des produits (cf. retour utilisateur du 2026-09-04) : le canal
 * TikTok Shop plafonne un produit à 100 variantes — les gros produits "Pin's pour Clogs" existants
 * (Lettres, Boy, Girly...) dépassent souvent ça, d'où ce générateur séparé pour composer, à la
 * main, un produit dédié TikTok Shop à partir d'une sélection de pin's (catalogue hub_pins). Même
 * squelette de création que creerProduitUnite (pins-unite/actions.ts : options/variantes, suivi de
 * stock, code douanier, profil d'expédition léger), avec deux différences volontaires : un prix
 * réglable (global ou par pin, pas de prix par défaut à 0€ comme pins-unite) et une photo par
 * variante (reprise directement depuis hub_pins.image_url — pins-unite n'en met aucune,
 * volontairement laissé à la charge de l'utilisateur là-bas). */

interface ShopifyVariant {
  id: number;
  sku: string | null;
  option1: string | null;
  title?: string | null;
  inventory_item_id: number | null;
}

function champTexte(formData: FormData, cle: string): string | null {
  const v = formData.get(cle);
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.trim();
}

interface ReponseProduitsShopify {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: {
      node: {
        id: string;
        title: string;
        status: string;
        featuredImage: { url: string } | null;
        variants: { edges: { node: { id: string } }[] };
      };
    }[];
  };
}

/** Produits déjà "TikTok Shop" au sens où l'utilisateur les a définis (2026-09-04) : un titre
 * commençant par "Pin's" et plus de 30 variantes — le canal TikTok Shop refuse au-delà de 100,
 * donc au-delà de 30 c'est déjà hors de portée des petits produits "Pin's pour Clogs - Lettres"
 * (26 variantes, ceux-là restent des produits classiques). Calculé en direct depuis Shopify (pas
 * de champ dédié côté Supabase) : couvre aussi bien les produits créés ici que ceux déjà en ligne
 * avant cet écran. */
export async function chargerProduitsTikTokExistants(): Promise<ProduitTikTokExistant[]> {
  const resultats: ProduitTikTokExistant[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const data: ReponseProduitsShopify = await shopifyGraphQL<ReponseProduitsShopify>(
      `query($cursor: String) {
        products(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              status
              featuredImage { url }
              variants(first: 250) { edges { node { id } } }
            }
          }
        }
      }`,
      { cursor },
    );

    for (const { node } of data.products.edges) {
      const nb = node.variants.edges.length;
      if (nb > 30 && /^pin.?s\b/i.test(node.title.trim())) {
        const numericId = node.id.split('/').pop();
        resultats.push({
          id: node.id,
          title: node.title,
          status: node.status,
          variantCount: nb,
          image: node.featuredImage?.url ?? null,
          adminUrl: `https://${process.env.SHOPIFY_STORE}/admin/products/${numericId}`,
        });
      }
    }
    hasNext = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }

  return resultats.sort((a, b) => b.variantCount - a.variantCount);
}

/** Crée un nouveau produit Shopify dédié TikTok Shop : une variante par pin coché (max 100, cf.
 * SelecteurPinsTikTok côté client — revérifié ici aussi, pas seulement côté UI), prix global ou
 * personnalisé par pin, stock repris de hub_pins comme creerProduitUnite, plus une photo par
 * variante (reprise de hub_pins.image_url, uploadée sur le produit puis associée à sa variante —
 * impossible de l'envoyer dans le même appel que la création, Shopify n'attribue les ids de
 * variante qu'une fois le produit créé). */
export async function creerProduitTikTok(formData: FormData) {
  const supabase = await creerClientSupabaseServeur();

  const titre = champTexte(formData, 'titre');
  const prixGlobal = champTexte(formData, 'prix_global');
  let pinIds: string[] = [];
  let prixParPin: Record<string, string> = {};
  try {
    pinIds = JSON.parse(champTexte(formData, 'pin_ids') ?? '[]');
  } catch {
    pinIds = [];
  }
  try {
    prixParPin = JSON.parse(champTexte(formData, 'prix_par_pin') ?? '{}');
  } catch {
    prixParPin = {};
  }

  if (!titre) throw new Error('Titre requis');
  if (!prixGlobal || Number.isNaN(Number(prixGlobal))) throw new Error('Prix global requis');
  if (pinIds.length === 0) throw new Error("Sélectionne au moins un pin's");
  if (pinIds.length > 100) throw new Error('TikTok Shop refuse plus de 100 variantes par produit');

  const { data: pinsData } = await supabase
    .from('hub_pins')
    .select('airtable_id, name, sku_pimpit, stock, image_url')
    .in('airtable_id', pinIds);
  const pinsById = Object.fromEntries((pinsData ?? []).map((p) => [p.airtable_id, p]));

  const pinVariants = pinIds.map((id) => {
    const p = pinsById[id];
    const prix = champTexteNombre(prixParPin[id]) ?? prixGlobal;
    return {
      option1: p?.name || id,
      sku: p?.sku_pimpit != null ? String(p.sku_pimpit) : '',
      price: prix,
      inventory_policy: 'continue',
      weight: 0.6,
      weight_unit: 'g',
    };
  });

  const productPayload = {
    title: titre,
    product_type: 'Pin\'s TikTok Shop',
    vendor: 'Pimp-It',
    // Brouillon volontaire : la création ici ne publie sur aucun canal (ni boutique en ligne, ni
    // TikTok Shop) — le publication réelle (choix des canaux) reste une étape manuelle dans
    // Shopify une fois le produit vérifié, cf. message affiché après création (TikTokShopClient).
    status: 'draft',
    options: [{ name: 'Pin' }],
    variants: pinVariants,
    template_suffix: 'pins-et-pack',
  };

  const result = await shopifyFetch('/products.json', 'POST', { product: productPayload });
  const productId = result.product?.id;
  if (!productId) throw new Error(JSON.stringify(result));

  const locationData = await shopifyFetch('/locations.json');
  const locationId = locationData.locations?.[0]?.id;

  // Association par index plutôt que par SKU/nom (cf. creerProduitUnite) : deux pin's peuvent
  // partager le même nom ou ne pas avoir de SKU, ce qui rendrait un matching par valeur ambigu.
  // L'API Shopify renvoie les variantes dans le même ordre que le tableau soumis (pinVariants,
  // lui-même construit depuis pinIds dans cet ordre) — zip par position, fiable ici puisqu'on
  // maîtrise entièrement le tableau soumis (contrairement à creerProduitUnite, qui ajoute en plus
  // une variante "Tous les pin's" à la fin).
  const variantsResultat = (result.product.variants ?? []) as ShopifyVariant[];
  for (let i = 0; i < variantsResultat.length; i++) {
    const v = variantsResultat[i];
    const pin = pinsById[pinIds[i]] ?? null;

    try {
      await shopifyFetch(`/variants/${v.id}.json`, 'PUT', { variant: { id: v.id, inventory_management: 'shopify' } });
    } catch {
      // même comportement que creerProduitUnite : on continue même si une variante échoue
    }
    if (v.inventory_item_id) await setHsCode(v.inventory_item_id);

    if (locationId && v.inventory_item_id) {
      const qte = pin?.stock != null ? Math.round(Number(pin.stock)) : 0;
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

    if (pin?.image_url) {
      try {
        await shopifyFetch(`/products/${productId}/images.json`, 'POST', {
          image: { src: pin.image_url, variant_ids: [v.id] },
        });
      } catch (e) {
        console.warn(`Image error variant ${v.id}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  await assignToLeversProfile(productId);

  revalidatePath('/tiktok-shop');

  return { shopifyUrl: `https://${process.env.SHOPIFY_STORE}/admin/products/${productId}` };
}

function champTexteNombre(v: string | undefined): string | null {
  if (!v || v.trim() === '' || Number.isNaN(Number(v))) return null;
  return v.trim();
}
