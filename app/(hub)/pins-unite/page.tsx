import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { shopifyFetch } from '@/lib/shopify';
import { PinsUnitePageClient } from './PinsUnitePageClient';

interface HubPin {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  fournisseur: string | null;
  stock: number | string | null;
  image_url: string | null;
}

function versNombre(v: number | string | null): number {
  if (v === null) return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/** Réplique l'écran "Pin's à rajouter sur le site" de l'ancien admin : liste les pin's encore
 * cochés "pas dans pin's unité" (recensés depuis Supabase — Airtable n'est plus la base d'origine
 * du Hub côté catalogue), avec la même création de produit Shopify que sur l'ancien site. */
export default async function PinsUnitePage() {
  const supabase = await creerClientSupabaseServeur();
  const { data: pinsARajouterData } = await supabase
    .from('hub_pins')
    .select('airtable_id, name, sku_pimpit, fournisseur, stock, image_url')
    .eq('pas_dans_unite', true)
    .order('name');
  const { data: autresPinsData } = await supabase
    .from('hub_pins')
    .select('airtable_id, name, sku_pimpit, image_url')
    .or('pas_dans_unite.eq.false,pas_dans_unite.is.null')
    .order('name');

  let collections: { id: string; title: string; handle: string }[] = [];
  try {
    const data = await shopifyFetch('/custom_collections.json?limit=250');
    collections = (data.custom_collections ?? []).map((c: { id: number; title: string; handle: string }) => ({
      id: String(c.id),
      title: c.title,
      handle: c.handle,
    }));
  } catch (e) {
    console.warn('Collections Shopify indisponibles :', e instanceof Error ? e.message : e);
  }

  const pinsARajouter = ((pinsARajouterData ?? []) as HubPin[]).map((p) => ({ ...p, stock: versNombre(p.stock) }));
  const autresPins = (autresPinsData ?? []) as { airtable_id: string; name: string | null; sku_pimpit: string | null; image_url: string | null }[];

  return (
    <PinsUnitePageClient pinsARajouter={pinsARajouter} autresPins={autresPins} collections={collections} />
  );
}
