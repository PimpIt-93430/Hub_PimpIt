// Suivi des étiquettes Boxtal créées depuis le Hub (cf. discussion 2026-08-29, migration Supabase
// 0080_expeditions_boxtal.sql) — Shopify ne reçoit jamais de mise à jour de statut pour ces envois
// (constaté sur la commande #26382 : fulfillment.shipment_status reste `null` même après livraison
// réelle), donc on interroge directement le suivi Boxtal (recupererSuiviExpedition) pour les
// étiquettes créées par cet outil, et on garde le dernier statut connu en base pour l'affichage.
import { recupererSuiviExpedition } from './boxtal';
import { creerClientSupabaseServeur } from './supabase/server';

export interface ExpeditionBoxtal {
  id: string;
  commandeShopifyId: number;
  commandeNom: string;
  boxtalShippingOrderId: string;
  statutSuivi: string;
  suiviUrl: string | null;
  majLe: string;
  /** Id du fulfillment Shopify créé à l'expédition (cf. discussion 2026-08-29 : "il me faut
   * absolument le lien de suivi") — sert à lui pousser le numéro de suivi dès qu'il devient
   * disponible côté Boxtal, si ce n'était pas encore le cas à la création. null si le fulfillment
   * Shopify a échoué à la création (best-effort, cf. actions.ts creerEtiquette). */
  fulfillmentShopifyId: string | null;
}

interface LigneBrute {
  id: string;
  commande_shopify_id: number;
  commande_nom: string;
  boxtal_shipping_order_id: string;
  statut_suivi: string;
  suivi_url: string | null;
  maj_le: string;
  fulfillment_shopify_id: string | null;
}

function versExpeditionBoxtal(l: LigneBrute): ExpeditionBoxtal {
  return {
    id: l.id,
    commandeShopifyId: l.commande_shopify_id,
    commandeNom: l.commande_nom,
    boxtalShippingOrderId: l.boxtal_shipping_order_id,
    statutSuivi: l.statut_suivi,
    suiviUrl: l.suivi_url,
    majLe: l.maj_le,
    fulfillmentShopifyId: l.fulfillment_shopify_id,
  };
}

/** Statuts de suivi Boxtal considérés définitifs (cf. lib/boxtal.ts, PackageTrackingStatusEnum) —
 * inutile de re-solliciter l'API pour ces commandes-là à chaque rafraîchissement. */
const STATUTS_FINAUX = new Set(['DELIVERED', 'RETURNED']);

/** Enregistre le lien commande Shopify → commande d'expédition Boxtal juste après création d'une
 * étiquette (cf. actions.ts, creerEtiquette) — best-effort : si ça échoue, l'étiquette existe déjà
 * et est facturée, on ne veut pas faire échouer le retour à l'utilisateur pour autant, juste perdre
 * le suivi automatique pour cette commande. */
export async function enregistrerExpeditionBoxtal(params: {
  commandeShopifyId: number;
  commandeNom: string;
  boxtalShippingOrderId: string;
  fulfillmentShopifyId?: string | null;
}): Promise<void> {
  try {
    const supabase = await creerClientSupabaseServeur();
    await supabase.from('expeditions_boxtal').insert({
      commande_shopify_id: params.commandeShopifyId,
      commande_nom: params.commandeNom,
      boxtal_shipping_order_id: params.boxtalShippingOrderId,
      fulfillment_shopify_id: params.fulfillmentShopifyId ?? null,
    });
  } catch (e) {
    console.warn('Enregistrement expedition_boxtal échoué:', e instanceof Error ? e.message : e);
  }
}

/** Dernière expédition Boxtal connue pour UNE commande précise, interrogée en direct (pas depuis la
 * liste chargée au chargement de la page, potentiellement périmée) — cf. discussion 2026-08-29 :
 * commande #26586, la création avait réussi et facturé côté Boxtal mais l'écran avait affiché un
 * échec (bug de récupération du PDF corrigé séparément) ; sans cette vérification à l'ouverture, la
 * commande aurait pu être créée une deuxième fois par erreur, facturée deux fois. Appelée à chaque
 * ouverture du panneau d'expédition d'une commande. */
export async function chargerExpeditionBoxtalPourCommande(commandeShopifyId: number): Promise<ExpeditionBoxtal | null> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('expeditions_boxtal')
    .select('*')
    .eq('commande_shopify_id', commandeShopifyId)
    .order('cree_le', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const ligne = (data ?? [])[0] as LigneBrute | undefined;
  return ligne ? versExpeditionBoxtal(ligne) : null;
}

/** Dernière expédition Boxtal connue par commande Shopify (une commande pourrait en théorie avoir
 * plusieurs étiquettes créées — colis partiels — on ne garde que la plus récente pour l'affichage). */
export async function chargerExpeditionsBoxtal(): Promise<Map<number, ExpeditionBoxtal>> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('expeditions_boxtal')
    .select('*')
    .order('cree_le', { ascending: true });
  if (error) throw new Error(error.message);

  const map = new Map<number, ExpeditionBoxtal>();
  for (const l of (data ?? []) as LigneBrute[]) map.set(l.commande_shopify_id, versExpeditionBoxtal(l));
  return map;
}

/** Interroge Boxtal pour chaque expédition pas encore à un statut final et met à jour la base — à
 * appeler depuis le bouton "Vérifier les livraisons" (cf. CommandesShopifyClient.tsx), pas
 * automatiquement : chaque appel interroge l'API Boxtal pour de vrai. Ne touche pas à Shopify — cf.
 * discussion 2026-08-29 : "juste vérifier les livraisons je le veux pas" — l'envoi des numéros de
 * suivi vers Shopify est un bouton séparé, cf. envoyerSuivisManquants ci-dessous. */
export async function rafraichirStatutsExpeditionsBoxtal(): Promise<Map<number, ExpeditionBoxtal>> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('expeditions_boxtal').select('*');
  if (error) throw new Error(error.message);

  const lignes = (data ?? []) as LigneBrute[];
  for (const l of lignes) {
    if (STATUTS_FINAUX.has(l.statut_suivi)) continue;
    try {
      const suivi = await recupererSuiviExpedition(l.boxtal_shipping_order_id);
      if (!suivi) continue;
      await supabase
        .from('expeditions_boxtal')
        .update({ statut_suivi: suivi.statut, suivi_url: suivi.trackingUrl, maj_le: new Date().toISOString() })
        .eq('id', l.id);
      l.statut_suivi = suivi.statut;
      l.suivi_url = suivi.trackingUrl;
    } catch (e) {
      console.warn(`Suivi Boxtal ${l.boxtal_shipping_order_id} échoué:`, e instanceof Error ? e.message : e);
    }
  }

  const map = new Map<number, ExpeditionBoxtal>();
  for (const l of lignes) map.set(l.commande_shopify_id, versExpeditionBoxtal(l));
  return map;
}

// Cf. discussion 2026-08-29 : l'envoi des numéros de suivi manquants vers Shopify tourne désormais
// en cron (toutes les 24h, Edge Function envoyer-suivis-boxtal) plutôt que depuis un bouton du Hub
// — mêmes tables, logique équivalente réimplémentée en Deno (cf.
// supabase/functions/envoyer-suivis-boxtal/index.ts), pas réutilisable ici (runtime différent).
