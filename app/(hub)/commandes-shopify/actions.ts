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
  chargerEtiquettesSendcloudRecentes,
  enregistrerExpeditionSendcloud,
  rafraichirStatutsExpeditionsSendcloud,
  type ExpeditionSendcloud,
} from '@/lib/expeditions-sendcloud';
import {
  chargerEtiquettesLaPosteRecentes,
  chargerExpeditionLaPostePourCommande,
  enregistrerExpeditionLaPoste,
  marquerExpeditionLaPosteAnnulee,
  type ExpeditionLaPoste,
} from '@/lib/expeditions-laposte';
import { annulerEtiquetteLettre, creerEtiquetteLettre, type AdresseLaPoste, type ProduitLettre } from '@/lib/laposte';
import { commandesEnSuspens, creerFulfillmentShopify, listerPossibilitesExpedition, type LigneCommande, type PossibiliteExpedition } from '@/lib/shopify';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

/** Décrémente stock_pins pour les pin's vendus dans une commande Shopify, au moment où son
 * étiquette d'expédition est créée — cf. retour utilisateur du 2026-09-05 : "quand on fait une
 * vente sur shopify il faut que le pin's soit décrémenté [...] au moment ou imprime les
 * expéditions". Trois cas par ligne :
 *  1) Le SKU correspond à un pin unique (catalogue "Pin's à l'unité", stock_pins.sku_pimpit) —
 *     décrémente ce seul pin.
 *  2) Le SKU correspond à un pack (hub_packs) ou un sabot personnalisé (hub_sabots_custom) —
 *     "il y a des fois tous les pins de ce produit qui sont commandés, faut décrémenter tous les
 *     sku de ce produit" : décrémente CHAQUE pin de sa composition (qtes_pins), dans la quantité
 *     prévue par le pack, multipliée par la quantité commandée de ce pack.
 *  3) Aucune correspondance (produit sans lien pin's, ex. un sabot brut) — "si jamais il y a pas
 *     de sku de pin's on décrémente rien" : ignoré silencieusement, jamais d'erreur.
 * Best-effort : ne doit jamais faire échouer la création de l'étiquette (même logique que le
 * fulfillment Shopify juste au-dessus dans ce fichier) — une erreur est juste loguée.
 */
async function decrementerStockPourVente(lignes: Pick<LigneCommande, 'sku' | 'quantite'>[]): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const deltaParPin = new Map<string, number>();

  for (const ligne of lignes) {
    if (!ligne.sku || !ligne.quantite) continue;

    const { data: pin } = await supabase.from('stock_pins').select('airtable_record_id').eq('sku_pimpit', ligne.sku).maybeSingle();
    if (pin?.airtable_record_id) {
      deltaParPin.set(pin.airtable_record_id, (deltaParPin.get(pin.airtable_record_id) ?? 0) + ligne.quantite);
      continue;
    }

    const [{ data: pack }, { data: sabotCustom }] = await Promise.all([
      supabase.from('hub_packs').select('qtes_pins').eq('sku_shopify', ligne.sku).maybeSingle(),
      supabase.from('hub_sabots_custom').select('qtes_pins').eq('sku_shopify', ligne.sku).maybeSingle(),
    ]);
    const composition = (pack?.qtes_pins ?? sabotCustom?.qtes_pins) as Record<string, number> | null | undefined;
    if (composition) {
      for (const [pinAirtableId, qteDansLot] of Object.entries(composition)) {
        deltaParPin.set(pinAirtableId, (deltaParPin.get(pinAirtableId) ?? 0) + Number(qteDansLot) * ligne.quantite);
      }
    }
    // Ni pin ni pack/sabot custom trouvé pour ce SKU : rien à décrémenter pour cette ligne.
  }

  for (const [airtableId, delta] of deltaParPin) {
    const { data: pinActuel } = await supabase
      .from('stock_pins')
      .select('stock_general')
      .eq('airtable_record_id', airtableId)
      .maybeSingle();
    if (!pinActuel) continue;
    const nouveauStock = Math.max(0, Number(pinActuel.stock_general) - delta);
    await supabase.from('stock_pins').update({ stock_general: nouveauStock }).eq('airtable_record_id', airtableId);
  }
}

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
  /** Lignes de la commande, pour le décrément de stock des pin's vendus — cf. decrementerStockPourVente. */
  lignes: Pick<LigneCommande, 'sku' | 'quantite'>[];
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
  // qui suit (création du fulfillment Shopify, décrément du stock) ne doit jamais faire remonter
  // d'erreur qui donnerait l'impression que toute l'opération a échoué (même leçon que pour
  // Boxtal, incident #26586).
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

  try {
    await decrementerStockPourVente(params.lignes);
  } catch (e) {
    console.warn(`Décrément stock pin's échoué pour ${params.commandeNom}:`, e instanceof Error ? e.message : e);
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
  /** Lignes de la commande, pour le décrément de stock des pin's vendus — cf. decrementerStockPourVente. */
  lignes: Pick<LigneCommande, 'sku' | 'quantite'>[];
}): Promise<ExpeditionLaPoste> {
  const etiquette = await creerEtiquetteLettre({
    produit: params.produit,
    poidsGrammes: params.poidsGrammes,
    expediteur: params.expediteur,
    destinataire: params.destinataire,
    reference: params.commandeNom,
  });

  try {
    await decrementerStockPourVente(params.lignes);
  } catch (e) {
    console.warn(`Décrément stock pin's échoué pour ${params.commandeNom}:`, e instanceof Error ? e.message : e);
  }

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

export interface EtiquetteHistorique {
  cle: string;
  commandeNom: string;
  methode: 'laposte' | 'sendcloud';
  url: string | null;
  creeLe: string;
}

/** Étiquettes (La Poste + Sendcloud) créées depuis `depuisIso`, url ouvrable pour chacune — cf.
 * PanneauHistoriqueEtiquettes, retour utilisateur du 2026-09-05 : "j'ai fait un tout imprimer...
 * j'ai plus accès... il faudrait un moyen de les récupérer" (le PDF fusionné de l'impression en
 * masse n'est jamais stocké, généré à la volée côté navigateur — cf. PanneauImpressionMasse — donc
 * perdu si l'onglet ferme avant d'être enregistré ; les étiquettes d'origine, elles, sont toujours
 * en base). Sendcloud n'a pas de parcelId stocké directement (seulement le shipment id) : une
 * requête par étiquette pour le résoudre, best-effort — une étiquette dont la résolution échoue
 * reste listée avec url:null plutôt que de faire échouer tout le chargement. */
export async function chargerEtiquettesRecentes(depuisIso: string): Promise<EtiquetteHistorique[]> {
  const [laposte, sendcloud] = await Promise.all([
    chargerEtiquettesLaPosteRecentes(depuisIso),
    chargerEtiquettesSendcloudRecentes(depuisIso),
  ]);

  const lignesLaPoste: EtiquetteHistorique[] = laposte.map((l) => ({
    cle: `laposte-${l.id}`,
    commandeNom: l.commandeNom,
    methode: 'laposte',
    url: `/api/etiquette-laposte/${l.id}`,
    creeLe: l.creeLe,
  }));

  const lignesSendcloud: EtiquetteHistorique[] = await Promise.all(
    sendcloud.map(async (l): Promise<EtiquetteHistorique> => {
      try {
        const envoi = await recupererEnvoi(l.sendcloudShipmentId);
        return {
          cle: `sendcloud-${l.id}`,
          commandeNom: l.commandeNom,
          methode: 'sendcloud',
          url: `/api/etiquette-sendcloud/${envoi.parcelId}`,
          creeLe: l.creeLe,
        };
      } catch {
        return { cle: `sendcloud-${l.id}`, commandeNom: l.commandeNom, methode: 'sendcloud', url: null, creeLe: l.creeLe };
      }
    }),
  );

  return [...lignesLaPoste, ...lignesSendcloud].sort((a, b) => (a.creeLe < b.creeLe ? 1 : -1));
}
