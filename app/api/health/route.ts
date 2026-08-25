import { NextResponse } from 'next/server';

import { atGet, TABLES } from '@/lib/airtable';
import { shopifyFetch } from '@/lib/shopify';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

/** Ping les trois systèmes et renvoie leur statut — sert à vérifier que les identifiants dans
 * .env.local sont corrects sans avoir à ouvrir chaque page une par une. */
export async function GET() {
  const resultats: Record<string, { ok: boolean; detail: string }> = {};

  try {
    const shop = await shopifyFetch('/shop.json');
    resultats.shopify = { ok: true, detail: shop.shop?.name ?? 'connecté' };
  } catch (e) {
    resultats.shopify = { ok: false, detail: e instanceof Error ? e.message : 'erreur inconnue' };
  }

  try {
    const pins = await atGet(TABLES.PINS, { pageSize: '1' });
    resultats.airtable = { ok: true, detail: `${pins.length >= 0 ? 'connecté' : ''}` };
  } catch (e) {
    resultats.airtable = { ok: false, detail: e instanceof Error ? e.message : 'erreur inconnue' };
  }

  try {
    const supabase = await creerClientSupabaseServeur();
    const { error } = await supabase.from('pop_ups').select('id').limit(1);
    if (error) throw error;
    resultats.supabase = { ok: true, detail: 'connecté' };
  } catch (e) {
    resultats.supabase = { ok: false, detail: e instanceof Error ? e.message : 'erreur inconnue' };
  }

  return NextResponse.json(resultats);
}
