// Suivi des étiquettes La Poste créées depuis le Hub (cf. migration 0090_expeditions_laposte, même
// principe que lib/expeditions-sendcloud.ts) — l'API La Poste n'a pas d'endpoint pour retélécharger
// une étiquette déjà générée, donc le PDF (base64) est conservé ici tel quel à la création.
import { creerClientSupabaseServeur } from './supabase/server';
import type { EtiquetteLettre, ProduitLettre } from './laposte';

export interface ExpeditionLaPoste {
  id: string;
  commandeShopifyId: number;
  commandeNom: string;
  laposteOrderId: string;
  laposteItemId: string;
  itemLabel: string;
  visualOutputBase64: string;
  produit: ProduitLettre;
  statut: 'cree' | 'annulee';
  fulfillmentShopifyId: string | null;
  creeLe: string;
}

interface LigneBrute {
  id: string;
  commande_shopify_id: number;
  commande_nom: string;
  laposte_order_id: string;
  laposte_item_id: string;
  item_label: string;
  visual_output_base64: string;
  produit: string;
  statut: 'cree' | 'annulee';
  fulfillment_shopify_id: string | null;
  cree_le: string;
}

function versExpeditionLaPoste(l: LigneBrute): ExpeditionLaPoste {
  return {
    id: l.id,
    commandeShopifyId: l.commande_shopify_id,
    commandeNom: l.commande_nom,
    laposteOrderId: l.laposte_order_id,
    laposteItemId: l.laposte_item_id,
    itemLabel: l.item_label,
    visualOutputBase64: l.visual_output_base64,
    produit: l.produit as ProduitLettre,
    statut: l.statut,
    fulfillmentShopifyId: l.fulfillment_shopify_id,
    creeLe: l.cree_le,
  };
}

export interface EtiquetteRecente {
  id: string;
  commandeNom: string;
  creeLe: string;
}

/** Étiquettes créées depuis `depuisIso` (id/commande/date seulement, pas le PDF base64 — trop
 * lourd pour une liste) — cf. PanneauHistoriqueEtiquettes : retrouve les PDF d'un lot d'impression
 * en masse dont le navigateur a été fermé avant que le PDF fusionné (généré côté client, jamais
 * stocké) n'ait été enregistré, cf. retour utilisateur du 2026-09-05 : "j'ai fait un tout
 * imprimer... j'ai plus accès... il faudrait un moyen de les récupérer". */
export async function chargerEtiquettesLaPosteRecentes(depuisIso: string): Promise<EtiquetteRecente[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('expeditions_laposte')
    .select('id, commande_nom, cree_le')
    .eq('statut', 'cree')
    .gte('cree_le', depuisIso)
    .order('cree_le', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; commande_nom: string; cree_le: string }[]).map((l) => ({
    id: l.id,
    commandeNom: l.commande_nom,
    creeLe: l.cree_le,
  }));
}

export async function chargerExpeditionsLaPoste(): Promise<Map<number, ExpeditionLaPoste>> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('expeditions_laposte')
    .select('*')
    .eq('statut', 'cree')
    .order('cree_le', { ascending: true });
  if (error) throw new Error(error.message);

  const map = new Map<number, ExpeditionLaPoste>();
  for (const l of (data ?? []) as LigneBrute[]) map.set(l.commande_shopify_id, versExpeditionLaPoste(l));
  return map;
}

/** `.order().limit(1)` plutôt que `.maybeSingle()` (cf. retour utilisateur du 2026-09-05, commande
 * #27026) : `.maybeSingle()` échoue dès que PLUS D'UNE ligne 'cree' existe pour la commande — ce qui
 * peut arriver malgré le garde-fou "une étiquette par commande" habituel, par ex. une commande
 * suspendue (ON_HOLD) côté Shopify où une 1ʳᵉ création a réussi sans fulfillment (jamais visible
 * comme "déjà créée" côté Hub tant que la commande était suspendue), suivie d'une 2ᵉ création bien
 * réelle une fois le blocage levé — l'échec de CETTE lecture (après coup, l'étiquette et le
 * fulfillment Shopify ayant déjà réussi) affichait à tort "Échec" alors que tout avait fonctionné.
 * La plus récente est la bonne référence à afficher/réimprimer ; une ancienne ligne orpheline reste
 * en base pour audit (statut 'cree') mais doit être annulée à la main si elle ne sert plus. */
export async function chargerExpeditionLaPostePourCommande(commandeShopifyId: number): Promise<ExpeditionLaPoste | null> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('expeditions_laposte')
    .select('*')
    .eq('commande_shopify_id', commandeShopifyId)
    .eq('statut', 'cree')
    .order('cree_le', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? versExpeditionLaPoste(data[0] as LigneBrute) : null;
}

export async function enregistrerExpeditionLaPoste(params: {
  commandeShopifyId: number;
  commandeNom: string;
  etiquette: EtiquetteLettre;
  produit: ProduitLettre;
  fulfillmentShopifyId: string | null;
}): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('expeditions_laposte').insert({
    commande_shopify_id: params.commandeShopifyId,
    commande_nom: params.commandeNom,
    laposte_order_id: params.etiquette.orderId,
    laposte_item_id: params.etiquette.itemId,
    item_label: params.etiquette.itemLabel,
    visual_output_base64: params.etiquette.visualOutputBase64,
    produit: params.produit,
    fulfillment_shopify_id: params.fulfillmentShopifyId,
  });
  if (error) throw new Error(error.message);
}

export async function marquerExpeditionLaPosteAnnulee(itemId: string): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase
    .from('expeditions_laposte')
    .update({ statut: 'annulee', annulee_le: new Date().toISOString() })
    .eq('laposte_item_id', itemId);
  if (error) throw new Error(error.message);
}
