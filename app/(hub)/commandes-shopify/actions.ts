'use server';

import {
  annulerEnvoi,
  chercherPointsRelais,
  creerEtiquetteEnvoi,
  listerOptionsExpedition,
  recupererEnvoi,
  recupererPointEtCarrierCommande,
  recupererPointRelais,
  type Envoi,
  type OptionExpedition,
  type PointEtCarrierConnu,
  type PointRelais,
  type SendcloudAddress,
} from '@/lib/sendcloud';
import {
  chargerExpeditionSendcloudPourCommande,
  enregistrerExpeditionSendcloud,
  rafraichirStatutsExpeditionsSendcloud,
  type ExpeditionSendcloud,
} from '@/lib/expeditions-sendcloud';
import {
  chargerExpeditionLaPostePourCommande,
  enregistrerExpeditionLaPoste,
  marquerExpeditionLaPosteAnnulee,
  type ExpeditionLaPoste,
} from '@/lib/expeditions-laposte';
import { annulerEtiquetteLettre, creerEtiquetteLettre, type AdresseLaPoste, type ProduitLettre } from '@/lib/laposte';
import { commandesEnSuspens, creerFulfillmentShopify, listerPossibilitesExpedition, type PossibiliteExpedition } from '@/lib/shopify';

export async function chargerPossibilitesExpedition(): Promise<PossibiliteExpedition[]> {
  return listerPossibilitesExpedition();
}

/** Commandes (parmi celles données) dont le fulfillment order est ON_HOLD côté Shopify — cf.
 * lib/shopify.ts commandesEnSuspens, retour utilisateur du 2026-09-05. À vérifier avant de proposer
 * une commande "pas encore créée"/"partielle" à la création (panneau seul ou en masse) : tant
 * qu'elle est suspendue côté Shopify, ne jamais tenter de créer une étiquette dessus. */
export async function verifierCommandesEnSuspens(commandeShopifyIds: number[]): Promise<number[]> {
  return [...(await commandesEnSuspens(commandeShopifyIds))];
}

/** Offres d'expédition disponibles pour une destination/un poids précis, prix en direct (cf.
 * discussion 2026-08-29 : remplace lib/boxtal-tarifs.ts, plus de grille statique à maintenir).
 *
 * DOIT rester une server action (fichier 'use server') : lib/sendcloud.ts lit
 * SENDCLOUD_SECRET_KEY (secret serveur, jamais inliné côté client) et appelle
 * https://panel.sendcloud.sc en cross-origin — appelé depuis le navigateur ça échoue toujours
 * silencieusement ("Failed to fetch", clé absente + pas de CORS), jamais une vraie absence
 * d'offre. Bug découvert le 2026-09-05 : expedition-commun.ts meilleureOffre() important et
 * appelant listerOptionsExpedition() directement depuis des composants 'use client' — aucune
 * règle de livraison Sendcloud n'a donc jamais pu matcher en pratique, cf. shippingOptionCode
 * ci-dessous ajouté pour que meilleureOffre() puisse passer par cette action à la place. */
export async function chargerOptionsExpedition(params: {
  fromAddress: SendcloudAddress;
  toAddress: SendcloudAddress;
  poidsKg: number;
  shippingOptionCode?: string;
}): Promise<OptionExpedition[]> {
  return listerOptionsExpedition(params);
}

/** Options disponibles pour le compte (cf. ReglesLivraisonPanel.tsx, PanneauCodesTransporteurs.tsx)
 * — pas d'endpoint "liste tous les codes" indépendant d'une adresse côté Sendcloud, donc interrogé
 * avec l'adresse expéditeur réelle et une destination représentative : suffisant pour lister les
 * codes/transporteurs disponibles sur le compte, même si le prix affiché ne reflète pas toutes les
 * destinations réelles. Deux destinations possibles (cf. retour utilisateur du 2026-09-04, commande
 * #26963 : un code domestique FR comme "colissimo:home/fr" ne dessert pas l'étranger, et
 * inversement un code international comme "colissimo:international/home_delivery" n'apparaît pas
 * dans une recherche vers une destination FR) : `zone` sélectionne laquelle interroger, pour que le
 * panneau de règles puisse proposer les bons codes selon la zone de la règle éditée. */
export async function chargerOptionsExpeditionCompte(
  fromAddress: SendcloudAddress,
  zone: 'france' | 'international' = 'france',
): Promise<OptionExpedition[]> {
  const toAddress: SendcloudAddress =
    zone === 'france'
      ? { name: '—', addressLine1: '1 rue de Rivoli', postalCode: '75001', city: 'Paris', countryIsoCode: 'FR' }
      : { name: '—', addressLine1: 'Rue Julien Mullie 60', postalCode: '7711', city: 'Mouscron', countryIsoCode: 'BE' };
  return listerOptionsExpedition({ fromAddress, toAddress, poidsKg: 0.2 });
}

/** Points relais disponibles autour de l'adresse du destinataire — utilisé seulement en secours
 * (cf. lib/sendcloud.ts chercherPointsRelais) : normalement le point du client est déjà connu via
 * chargerPointEtCarrierConnu ci-dessous. */
export async function chargerPointsRelais(
  adresse: { street: string; city: string; postalCode: string; countryIsoCode: string },
  carrierCode?: string,
): Promise<PointRelais[]> {
  return chercherPointsRelais(adresse, carrierCode);
}

/** Point relais + offre déjà connus par Sendcloud pour cette commande (cf. discussion 2026-08-29 :
 * captés par son propre sélecteur post-achat) — remplace chargerPointRelaisSendcloud (lecture d'un
 * metafield Shopify écrit par l'ancien module Sendcloud checkout) par une lecture directe côté
 * Sendcloud, plus de conversion de code entre deux systèmes. */
export async function chargerPointEtCarrierConnu(orderNumber: string): Promise<PointEtCarrierConnu | null> {
  return recupererPointEtCarrierCommande(orderNumber);
}

/** Détail (nom/adresse) d'un point relais déjà connu par son id Sendcloud — cf.
 * chargerPointEtCarrierConnu, qui ne renvoie que l'id. */
export async function chargerDetailPointRelais(id: number): Promise<PointRelais> {
  return recupererPointRelais(id);
}

export interface ParamsCreerEtiquette {
  shippingOptionCode: string;
  fromAddress: SendcloudAddress;
  toAddress: SendcloudAddress;
  poidsKg: number;
  dimensionsCm?: { longueur: number; largeur: number; hauteur: number };
  totalCommande?: { value: number; devise: string };
  pointRelaisId?: number;
  /** Id + nom de la commande Shopify — sert uniquement à enregistrer le lien vers l'envoi Sendcloud
   * pour le suivi de livraison automatique, pas envoyé à Sendcloud (order_number l'est séparément). */
  commandeShopifyId: number;
  commandeNom: string;
}

/** Crée un envoi Sendcloud RÉEL (facturé) puis récupère son étiquette. Appelé uniquement depuis un
 * clic explicite de confirmation côté client (PanneauExpedition.tsx). */
export async function creerEtiquette(
  params: ParamsCreerEtiquette,
): Promise<{ envoi: Envoi; etiquetteUrl: string | null; fulfillmentShopifyId: string | null }> {
  const envoi = await creerEtiquetteEnvoi({
    shippingOptionCode: params.shippingOptionCode,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
    poidsKg: params.poidsKg,
    dimensionsCm: params.dimensionsCm,
    orderNumber: params.commandeNom,
    externalReferenceId: params.commandeNom,
    totalCommande: params.totalCommande,
    pointRelaisId: params.pointRelaisId,
  });

  // Cf. discussion 2026-08-29 : l'envoi est déjà créé et FACTURÉ au-dessus — un échec dans tout ce
  // qui suit (création du fulfillment Shopify) ne doit jamais faire remonter d'erreur qui donnerait
  // l'impression que toute l'opération a échoué (même leçon que pour Boxtal, incident #26586).
  let fulfillmentShopifyId: string | null = null;
  try {
    const fulfillment = await creerFulfillmentShopify({
      commandeShopifyId: params.commandeShopifyId,
      trackingNumber: envoi.trackingNumber,
      trackingUrl: envoi.trackingUrl,
      trackingCompany: null,
    });
    fulfillmentShopifyId = fulfillment.fulfillmentId;
  } catch (e) {
    console.warn(`Fulfillment Shopify échoué pour ${params.commandeNom}:`, e instanceof Error ? e.message : e);
  }

  await enregistrerExpeditionSendcloud({
    commandeShopifyId: params.commandeShopifyId,
    commandeNom: params.commandeNom,
    sendcloudShipmentId: envoi.id,
    fulfillmentShopifyId,
  });

  return { envoi, etiquetteUrl: `/api/etiquette-sendcloud/${envoi.parcelId}`, fulfillmentShopifyId };
}

export async function annulerEtiquette(id: string): Promise<void> {
  await annulerEnvoi(id);
}

/** Vérifie si un envoi Sendcloud existe déjà pour cette commande Shopify (même garde-fou anti
 * double-création que pour Boxtal, cf. incident #26586). Appelée à chaque ouverture du panneau
 * d'expédition, avant même d'afficher le formulaire de création. */
export async function verifierExpeditionExistante(commandeShopifyId: number): Promise<ExpeditionSendcloud | null> {
  return chargerExpeditionSendcloudPourCommande(commandeShopifyId);
}

/** Étiquette d'un envoi Sendcloud déjà créé (cf. verifierExpeditionExistante ci-dessus) — lecture
 * seule, aucun coût, contrairement à creerEtiquette. */
export async function chargerEtiquetteExistante(sendcloudShipmentId: string): Promise<string | null> {
  const envoi = await recupererEnvoi(sendcloudShipmentId);
  return `/api/etiquette-sendcloud/${envoi.parcelId}`;
}

/** Interroge Sendcloud pour de vrai (cf. lib/expeditions-sendcloud.ts) — à n'appeler que depuis un
 * clic explicite ("Vérifier les livraisons"), jamais automatiquement. Ne touche pas à Shopify. */
export async function rafraichirSuivisLivraison(): Promise<[number, ExpeditionSendcloud][]> {
  return [...(await rafraichirStatutsExpeditionsSendcloud())];
}

// ---- La Poste (Lettre Suivie, produits "léger") — retour utilisateur du 2026-09-02, compte de
// RECETTE (étiquettes fictives) tant que le passage en production n'a pas été demandé. ----

export async function verifierExpeditionLaPosteExistante(commandeShopifyId: number): Promise<ExpeditionLaPoste | null> {
  return chargerExpeditionLaPostePourCommande(commandeShopifyId);
}

/** Génère une étiquette La Poste (recette) puis pousse le tracking sur Shopify — même principe que
 * creerEtiquette (Sendcloud) : la création elle-même ne doit jamais échouer à cause d'un souci
 * côté fulfillment Shopify (best-effort, cf. incident Boxtal #26586). */
export async function creerEtiquetteLaPoste(params: {
  produit: ProduitLettre;
  poidsGrammes: number;
  expediteur: AdresseLaPoste;
  destinataire: AdresseLaPoste;
  commandeShopifyId: number;
  commandeNom: string;
}): Promise<ExpeditionLaPoste> {
  const etiquette = await creerEtiquetteLettre({
    produit: params.produit,
    poidsGrammes: params.poidsGrammes,
    expediteur: params.expediteur,
    destinataire: params.destinataire,
    reference: params.commandeNom,
  });

  let fulfillmentShopifyId: string | null = null;
  try {
    const fulfillment = await creerFulfillmentShopify({
      commandeShopifyId: params.commandeShopifyId,
      trackingNumber: etiquette.itemId,
      trackingUrl: `https://www.laposte.fr/outils/suivre-vos-envois?code=${etiquette.itemId}`,
      trackingCompany: 'La Poste',
    });
    fulfillmentShopifyId = fulfillment.fulfillmentId;
  } catch (e) {
    console.warn(`Fulfillment Shopify échoué pour ${params.commandeNom}:`, e instanceof Error ? e.message : e);
  }

  await enregistrerExpeditionLaPoste({
    commandeShopifyId: params.commandeShopifyId,
    commandeNom: params.commandeNom,
    etiquette,
    produit: params.produit,
    fulfillmentShopifyId,
  });

  const enregistree = await chargerExpeditionLaPostePourCommande(params.commandeShopifyId);
  if (!enregistree) throw new Error('Étiquette créée mais introuvable juste après enregistrement.');
  return enregistree;
}

export async function annulerEtiquetteLaPoste(itemId: string): Promise<void> {
  await annulerEtiquetteLettre(itemId);
  await marquerExpeditionLaPosteAnnulee(itemId);
}
