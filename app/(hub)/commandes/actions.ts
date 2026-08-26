'use server';

import { revalidatePath } from 'next/cache';

import { FOURNISSEURS, type ArticleCommande, type TypeCommande } from '@/lib/purchase-orders';
import { shopifyFetch, shopifyFetchAll } from '@/lib/shopify';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

/** Mutations "Commandes fournisseurs" — réplique exactement la logique métier de l'ancien admin
 * (Shopify Pimp IT/admin/lib/purchase-orders.js) contre Supabase (hub_purchase_orders, hub_pins)
 * au lieu d'Airtable. Toute commande créée/modifiée/reçue ici n'écrit plus jamais Airtable. */

function articlesVersItems(items: ArticleCommande[]): ArticleCommande[] {
  // Même dégraissage que l'ancien createPO/updatePO : on ne conserve que les champs utiles au
  // suivi (pas de photo — elle est retrouvée à l'affichage via hub_pins.airtable_id).
  return items.map((i) => ({
    airtableId: i.airtableId,
    name: i.name,
    skuPimpit: i.skuPimpit ?? null,
    skuFournisseur: i.skuFournisseur ?? '',
    stockActuel: i.stockActuel ?? 0,
    qty: i.qty ?? 0,
  }));
}

/** ref format `BC-<année>-<séquence 3 chiffres>`, séquence = max existant + 1 (même principe que
 * l'ancien getNextRef, adapté pour scanner hub_purchase_orders.ref via Supabase). */
async function calculerProchaineRef(): Promise<string> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('hub_purchase_orders').select('ref');
  if (error) throw new Error(error.message);

  const year = new Date().getFullYear();
  let max = 0;
  for (const row of data ?? []) {
    const m = String(row.ref ?? '').match(/BC-\d{4}-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `BC-${year}-${String(max + 1).padStart(3, '0')}`;
}

export async function creerCommande(
  supplierKey: string,
  items: ArticleCommande[],
  type: TypeCommande = 'normal',
): Promise<{ id: string; ref: string }> {
  const sup = FOURNISSEURS[supplierKey];
  if (!sup) throw new Error('Fournisseur inconnu');
  if (!items.length) throw new Error('Données manquantes');

  const ref = await calculerProchaineRef();
  const now = new Date().toISOString();
  const propreItems = articlesVersItems(items);
  const airtableId = `hub_${crypto.randomUUID()}`;

  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('hub_purchase_orders')
    .insert({
      airtable_id: airtableId,
      ref,
      date_creation: now,
      supplier: supplierKey,
      label: sup.label,
      statut: 'en attente',
      type,
      items: propreItems,
      nb_articles: propreItems.length,
      quantite_totale: propreItems.reduce((s, i) => s + (i.qty || 0), 0),
    })
    .select('airtable_id, ref')
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Création bloquée (droits insuffisants ?)');

  revalidatePath('/commandes');
  return { id: data.airtable_id as string, ref: data.ref as string };
}

/** Modifie les quantités/articles d'une commande encore en attente (ajout de nouveaux pins
 * inclus — le front envoie la liste complète, existants + ajoutés). Une commande reçue ne peut
 * plus être modifiée (même garde que l'ancien updatePO). */
export async function modifierCommande(id: string, items: ArticleCommande[]): Promise<void> {
  if (!items.length) throw new Error('Données manquantes');
  const supabase = await creerClientSupabaseServeur();

  const { data: existante, error: errLecture } = await supabase
    .from('hub_purchase_orders')
    .select('statut')
    .eq('airtable_id', id)
    .single();
  if (errLecture) throw new Error(errLecture.message);
  if (existante?.statut === 'recu') throw new Error('Commande déjà reçue');

  const propreItems = articlesVersItems(items);
  const { data, error } = await supabase
    .from('hub_purchase_orders')
    .update({
      items: propreItems,
      nb_articles: propreItems.length,
      quantite_totale: propreItems.reduce((s, i) => s + (i.qty || 0), 0),
    })
    .eq('airtable_id', id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');

  revalidatePath('/commandes');
}

/** Bascule rapide du badge de statut dans l'historique (clic direct, sans passer par la modale de
 * réception) — ne touche ni au stock Supabase ni à Shopify, exactement comme l'ancien
 * toggleOrderStatus/PATCH /api/orders/:id/status. Sert à corriger un statut à la main, pas à
 * réceptionner une commande. */
export async function basculerStatutCommande(id: string, statutActuel: 'pending' | 'received'): Promise<void> {
  const nouveauStatut = statutActuel === 'received' ? 'en attente' : 'recu';
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('hub_purchase_orders')
    .update({ statut: nouveauStatut })
    .eq('airtable_id', id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');

  revalidatePath('/commandes');
}

export async function supprimerCommande(id: string): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('hub_purchase_orders').delete().eq('airtable_id', id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');

  revalidatePath('/commandes');
}

/** Réceptionne une commande : bascule son statut à "recu", bumpe hub_pins.stock pour chaque
 * article non exclu et non nul (même sémantique que l'ancien receivePO : les articles décochés ne
 * sont ni comptés ni retirés de la commande, juste exclus du bump de stock), et répercute le
 * nouveau stock sur l'inventaire Shopify de la variante correspondante (mode normal/b2b
 * uniquement — jamais en mode pop-up, comme l'ancien code). Le mode pop-up ne bumpe aucun stock
 * Supabase : l'ancien équivalent Airtable "Stock Pop UP" n'a pas de colonne Supabase (cf. rapport
 * de tâche) — on marque quand même la commande reçue pour garder un historique correct. */
export async function receptionnerCommande(
  id: string,
  articlesExclus: string[],
): Promise<{ received: number; excluded: number }> {
  const supabase = await creerClientSupabaseServeur();

  const { data: commande, error: errLecture } = await supabase
    .from('hub_purchase_orders')
    .select('*')
    .eq('airtable_id', id)
    .single();
  if (errLecture) throw new Error(errLecture.message);
  if (!commande) throw new Error('Commande introuvable');
  if (commande.statut === 'recu') throw new Error('Déjà reçue');

  const items = (commande.items as ArticleCommande[]) ?? [];
  const type = ((commande.type as TypeCommande) ?? 'normal') as TypeCommande;
  const aReceptionner = items.filter((i) => !articlesExclus.includes(i.airtableId) && (i.qty || 0) > 0);

  if (type !== 'popup' && aReceptionner.length) {
    const ids = aReceptionner.map((i) => i.airtableId);
    const { data: pins, error: errPins } = await supabase
      .from('hub_pins')
      .select('airtable_id, stock')
      .in('airtable_id', ids);
    if (errPins) throw new Error(errPins.message);
    const stockParId = new Map((pins ?? []).map((p) => [p.airtable_id as string, Number(p.stock ?? 0)]));

    const nouveauStockParId = new Map<string, number>();
    for (const item of aReceptionner) {
      const stockActuel = stockParId.get(item.airtableId) ?? 0;
      nouveauStockParId.set(item.airtableId, stockActuel + item.qty);
    }

    for (const [airtableId, nouveauStock] of nouveauStockParId) {
      const { error: errMaj } = await supabase.from('hub_pins').update({ stock: nouveauStock }).eq('airtable_id', airtableId);
      if (errMaj) throw new Error(errMaj.message);
    }

    // Shopify : best-effort, comme l'ancien code (une erreur d'API Shopify ne doit pas bloquer la
    // réception côté Supabase, qui est la donnée qui compte pour le staff).
    try {
      const locData = await shopifyFetch('/locations.json');
      const locId = locData.locations?.[0]?.id;
      const variants = await shopifyFetchAll<{ sku?: string; inventory_item_id?: number }>(
        '/variants.json?fields=sku,inventory_item_id&limit=250',
        'variants',
      );
      const invIdParSku = new Map<string, number>();
      for (const v of variants) if (v.sku && v.inventory_item_id) invIdParSku.set(String(v.sku), v.inventory_item_id);

      if (locId) {
        for (const item of aReceptionner) {
          const invId = item.skuPimpit ? invIdParSku.get(String(item.skuPimpit)) : undefined;
          if (!invId) continue;
          const nouveauStock = nouveauStockParId.get(item.airtableId);
          if (nouveauStock == null) continue;
          await shopifyFetch('/inventory_levels/set.json', 'POST', {
            location_id: locId,
            inventory_item_id: invId,
            available: nouveauStock,
          });
        }
      }
    } catch (e) {
      console.warn('Shopify inventory skip:', e instanceof Error ? e.message : e);
    }
  }

  const { data: commandeMaj, error: errMajCommande } = await supabase
    .from('hub_purchase_orders')
    .update({ statut: 'recu', date_reception: new Date().toISOString() })
    .eq('airtable_id', id)
    .select();
  if (errMajCommande) throw new Error(errMajCommande.message);
  if (!commandeMaj || commandeMaj.length === 0) throw new Error('Réception bloquée (droits insuffisants ?)');

  revalidatePath('/commandes');
  revalidatePath('/pins');
  return { received: aReceptionner.length, excluded: articlesExclus.length };
}
