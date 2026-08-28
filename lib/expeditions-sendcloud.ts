// Suivi des étiquettes Sendcloud créées depuis le Hub (cf. discussion 2026-08-29, migration
// Supabase 0085_expeditions_sendcloud.sql) — remplace lib/expeditions-boxtal.ts (Boxtal abandonné,
// cf. "et plus de boxtal"). Shopify ne reçoit jamais de mise à jour de statut pour ces envois, donc
// on interroge directement le suivi Sendcloud (recupererEnvoi) pour les étiquettes créées par cet
// outil, et on garde le dernier statut connu en base pour l'affichage.
import { recupererEnvoi } from './sendcloud';
import { creerClientSupabaseServeur } from './supabase/server';

export interface ExpeditionSendcloud {
  id: string;
  commandeShopifyId: number;
  commandeNom: string;
  sendcloudShipmentId: string;
  statutSuivi: string;
  suiviUrl: string | null;
  majLe: string;
  /** Id du fulfillment Shopify créé à l'expédition — sert à lui pousser le numéro de suivi dès
   * qu'il devient disponible côté Sendcloud si ce n'était pas encore le cas à la création. null si
   * le fulfillment Shopify a échoué à la création (best-effort, cf. actions.ts creerEtiquette). */
  fulfillmentShopifyId: string | null;
}

interface LigneBrute {
  id: string;
  commande_shopify_id: number;
  commande_nom: string;
  sendcloud_shipment_id: string;
  statut_suivi: string;
  suivi_url: string | null;
  maj_le: string;
  fulfillment_shopify_id: string | null;
}

function versExpeditionSendcloud(l: LigneBrute): ExpeditionSendcloud {
  return {
    id: l.id,
    commandeShopifyId: l.commande_shopify_id,
    commandeNom: l.commande_nom,
    sendcloudShipmentId: l.sendcloud_shipment_id,
    statutSuivi: l.statut_suivi,
    suiviUrl: l.suivi_url,
    majLe: l.maj_le,
    fulfillmentShopifyId: l.fulfillment_shopify_id,
  };
}

/** Statuts de suivi Sendcloud considérés définitifs — inutile de re-solliciter l'API pour ces
 * commandes-là à chaque rafraîchissement (cf. status.code retourné par GET /shipments/{id}). */
const STATUTS_FINAUX = new Set(['DELIVERED', 'CANCELLED']);

/** Enregistre le lien commande Shopify → envoi Sendcloud juste après création d'une étiquette (cf.
 * actions.ts, creerEtiquette) — best-effort : si ça échoue, l'étiquette existe déjà et est
 * facturée, on ne veut pas faire échouer le retour à l'utilisateur pour autant, juste perdre le
 * suivi automatique pour cette commande. */
export async function enregistrerExpeditionSendcloud(params: {
  commandeShopifyId: number;
  commandeNom: string;
  sendcloudShipmentId: string;
  fulfillmentShopifyId?: string | null;
}): Promise<void> {
  try {
    const supabase = await creerClientSupabaseServeur();
    await supabase.from('expeditions_sendcloud').insert({
      commande_shopify_id: params.commandeShopifyId,
      commande_nom: params.commandeNom,
      sendcloud_shipment_id: params.sendcloudShipmentId,
      fulfillment_shopify_id: params.fulfillmentShopifyId ?? null,
    });
  } catch (e) {
    console.warn('Enregistrement expedition_sendcloud échoué:', e instanceof Error ? e.message : e);
  }
}

/** Dernière expédition Sendcloud connue pour UNE commande précise, interrogée en direct — garde-fou
 * anti double-création (même logique que Boxtal, cf. incident #26586) : sans cette vérification à
 * l'ouverture, une commande dont la création avait réussi et facturé mais semblé échouer côté écran
 * risquerait une deuxième création réelle et facturée. */
export async function chargerExpeditionSendcloudPourCommande(commandeShopifyId: number): Promise<ExpeditionSendcloud | null> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('expeditions_sendcloud')
    .select('*')
    .eq('commande_shopify_id', commandeShopifyId)
    .order('cree_le', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const ligne = (data ?? [])[0] as LigneBrute | undefined;
  return ligne ? versExpeditionSendcloud(ligne) : null;
}

/** Dernière expédition Sendcloud connue par commande Shopify. */
export async function chargerExpeditionsSendcloud(): Promise<Map<number, ExpeditionSendcloud>> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('expeditions_sendcloud')
    .select('*')
    .order('cree_le', { ascending: true });
  if (error) throw new Error(error.message);

  const map = new Map<number, ExpeditionSendcloud>();
  for (const l of (data ?? []) as LigneBrute[]) map.set(l.commande_shopify_id, versExpeditionSendcloud(l));
  return map;
}

/** Interroge Sendcloud pour chaque expédition pas encore à un statut final et met à jour la base —
 * à appeler depuis le bouton "Vérifier les livraisons", pas automatiquement. Ne touche pas à
 * Shopify (même règle que pour Boxtal). */
export async function rafraichirStatutsExpeditionsSendcloud(): Promise<Map<number, ExpeditionSendcloud>> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('expeditions_sendcloud').select('*');
  if (error) throw new Error(error.message);

  const lignes = (data ?? []) as LigneBrute[];
  for (const l of lignes) {
    if (STATUTS_FINAUX.has(l.statut_suivi)) continue;
    try {
      const envoi = await recupererEnvoi(l.sendcloud_shipment_id);
      await supabase
        .from('expeditions_sendcloud')
        .update({ statut_suivi: envoi.statutCode, suivi_url: envoi.trackingUrl, maj_le: new Date().toISOString() })
        .eq('id', l.id);
      l.statut_suivi = envoi.statutCode;
      l.suivi_url = envoi.trackingUrl;
    } catch (e) {
      console.warn(`Suivi Sendcloud ${l.sendcloud_shipment_id} échoué:`, e instanceof Error ? e.message : e);
    }
  }

  const map = new Map<number, ExpeditionSendcloud>();
  for (const l of lignes) map.set(l.commande_shopify_id, versExpeditionSendcloud(l));
  return map;
}

// Cf. discussion 2026-08-29 : l'envoi des numéros de suivi manquants vers Shopify tourne en cron
// (Edge Function envoyer-suivis-sendcloud, remplace envoyer-suivis-boxtal), pas ici — mêmes tables,
// logique équivalente réimplémentée en Deno, pas réutilisable ici (runtime différent).
