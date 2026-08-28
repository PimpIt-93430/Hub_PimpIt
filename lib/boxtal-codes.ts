// Correspondance Transporteur + Offre (mêmes libellés exacts que la grille tarifaire,
// boxtal-tarifs.json/.ts) → shippingOfferCode Boxtal — donnée par l'utilisateur le 2026-08-29
// depuis son compte Boxtal. Permet de résoudre automatiquement le code à envoyer à l'API pour une
// offre trouvée dans la grille tarifaire, sans jamais le deviner.
export const TABLE_CODES_TRANSPORTEURS: [transporteur: string, offre: string, code: string][] = [
  ['Chronopost', 'Chrono 13', 'CHRP-Chrono13'],
  ['Chronopost', 'Chrono 13 collecte', 'CHRP-Chrono13Pickup'],
  ['Chronopost', 'Chrono 18', 'CHRP-Chrono18'],
  ['Chronopost', 'Chrono 18 collecte', 'CHRP-Chrono18Pickup'],
  ['Chronopost', 'Chrono 2Shop Direct', 'CHRP-Chrono2ShopDirect'],
  ['Chronopost', 'Chrono 2Shop Direct collecte', 'CHRP-Chrono2ShopDirectPickup'],
  ['Chronopost', 'Chrono 2Shop Europe', 'CHRP-Chrono2ShopEurope'],
  ['Chronopost', 'Chrono 2Shop Europe collecte', 'CHRP-Chrono2ShopEuropePickup'],
  ['Chronopost', 'Chrono 2Shop Europe Retour', 'CHRP-Chrono2ShopEuropeRetour'],
  ['Chronopost', 'Chrono 2ShopDirect Retour', 'CHRP-Chrono2ShopDirectRetour'],
  ['Chronopost', 'Chrono Classic', 'CHRP-ChronoInternationalClassic'],
  ['Chronopost', 'Chrono Classic collecte', 'CHRP-ChronoInternationalClassicPickup'],
  ['Chronopost', 'Chrono Express', 'CHRP-ChronoInternationalColis'],
  ['Chronopost', 'Chrono Express collecte', 'CHRP-ChronoInternationalColisPickup'],
  ['Chronopost', 'Chrono Relais 13', 'CHRP-ChronoRelais'],
  ['Chronopost', 'Chrono Relais 13 collecte', 'CHRP-ChronoRelaisPickup'],
  ['Chronopost', 'Chrono Relais Europe', 'CHRP-ChronoRelaisEurope'],
  ['Chronopost', 'Chrono Relais Europe collecte', 'CHRP-ChronoRelaisEuropePickup'],
  ['Chronopost', 'Chrono Shop2Shop', 'CHRP-ChronoShoptoShop'],
  ['Chronopost', 'Chrono18 boîte aux lettres', 'CHRP-Chrono18BAL'],
  ['Colis Privé', 'Colis Privé Domicile', 'COPR-CoprRelaisDomicileNat'],
  ['Colis Privé', 'Colis Privé Domicile avec signature', 'COPR-CoprRelaisSignatureNat'],
  ['Colis Privé', 'Colis Privé Relais', 'COPR-CoprRelaisRelaisNat'],
  ['Colissimo', 'Colissimo Domicile - avec signature', 'POFR-ColissimoExpert'],
  ['Colissimo', 'Colissimo Domicile - sans signature', 'POFR-ColissimoAccess'],
  ['Colissimo', 'Colissimo Domicile Outre-Mer - avec signature', 'POFR-ColissimoExpertOutreMer'],
  ['Colissimo', 'Colissimo Domicile Outre-Mer - sans signature', 'POFR-ColissimoAccessOutreMer'],
  ['Colissimo', 'Colissimo International Domicile - avec signature', 'POFR-ColissimoExpertInternational'],
  ['Colissimo', 'Colissimo International Domicile - sans signature', 'POFR-ColissimoAccessInternational'],
  ['Colissimo', 'Colissimo International Point Retrait', 'POFR-ColissimoPickupStationInternational'],
  ['Colissimo', 'Colissimo Point Retrait', 'POFR-ColissimoPickupStation'],
  ['Delivengo', 'Delivengo easy', 'DLVG-DelivengoEasy'],
  ['DHL Express', 'DHL Domestic Express', 'DHLE-DomesticExpress'],
  ['DHL Express', 'DHL Express Economy Select', 'DHLE-EconomySelect'],
  ['DHL Express', 'DHL Express Import', 'DHLE-ExpressImport'],
  ['DHL Express', 'DHL Express Worldwide', 'DHLE-ExpressWorldwide'],
  ['DHL Freight', 'DHL Freight EuroConnect Domestic', 'DHLF-EuroConnectDomestic'],
  ['FedEx', 'FedEx First', 'FEDX-FedexFirst'],
  ['FedEx', 'FedEx International Connect Plus', 'FEDX-FedexInternationalConnectPlus'],
  ['FedEx', 'FedEx International Economy', 'FEDX-InternationalEconomy'],
  ['FedEx', 'FedEx International Priority', 'FEDX-InternationalPriority'],
  ['FedEx', 'FedEx International Priority Express', 'FEDX-FedexInternationalPriorityExpress'],
  ['FedEx', 'FedEx Priority', 'FEDX-DomesticExpress'],
  ['FedEx', 'FedEx Priority Express', 'FEDX-FedexPriorityExpress'],
  ['FedEx', 'FedEx Regional Economy', 'FEDX-FedexRegionalEconomy'],
  ['FedEx', 'FedEx Regional Economy Freight', 'FEDX-FedexRegionalEconomyFreight'],
  ['Happy Post', 'Happy Post avec Suivi sans Signature', 'IMXE-PackSuiviEurope'],
  ['La Poste', 'Lettre Verte Suivie', 'LPFR-LettreSuivieSU'],
  ['Mondial Relay', 'Mondial Domicile Europe', 'MONR-DomicileEurope'],
  ['Mondial Relay', 'Mondial Domicile France', 'MONR-DomicileFrance'],
  ['Mondial Relay', 'Mondial Points Relais', 'MONR-CpourToi'],
  ['Mondial Relay', 'Mondial Points Relais - Europe', 'MONR-CpourToiEurope'],
  ['Relais Colis', 'Relais Colis', 'SOGP-RelaisColis'],
  ['Sodexi', 'Sodexi Express', 'SODX-ExpressStandard'],
  ['Sodexi', 'Sodexi Express International', 'SODX-ExpressStandardInterColisMarch'],
  ['TNT', 'TNT 10:00 Express', 'TNTE-ExpressNationalPremium10H'],
  ['TNT', 'TNT 12:00 Express', 'TNTE-ExpressNationalPremium12H'],
  ['TNT', 'TNT 13:00 Express', 'TNTE-ExpressNational'],
  ['TNT', 'TNT 13:00 Express Bulk', 'TNTE-ExpressNationalBulk'],
  ['TNT', 'TNT 18:00 Express', 'TNTE-ExpressNational18H'],
  ['TNT', 'TNT 18:00 Express Bulk', 'TNTE-ExpressNational18HBulk'],
  ['TNT', 'TNT Economy Express', 'TNTE-EconomyExpressInternational'],
  ['TNT', 'TNT Economy Express Import', 'TNTE-EconomyExpressInternationalImport'],
  ['TNT', 'TNT Express International', 'TNTE-ExpressInternationalColis'],
  ['TNT', 'TNT Express International Doc', 'TNTE-ExpressInternationalPlis'],
  ['TNT', 'TNT Express National Palette', 'TNTE-ExpressNationalPalette'],
  ['UPS', 'UPS Economy Access Point', 'UPSE-EconomyAccessPoint'],
  ['UPS', 'UPS Expedited', 'UPSE-Expedited'],
  ['UPS', 'UPS Express', 'UPSE-Express'],
  ['UPS', 'UPS Express Plus', 'UPSE-ExpressPlus'],
  ['UPS', 'UPS Express Saver', 'UPSE-ExpressSaver'],
  ['UPS', 'UPS Standard', 'UPSE-Standard'],
  ['UPS', 'UPS Standard Access Point', 'UPSE-StandardAP'],
];

const CODES = new Map(TABLE_CODES_TRANSPORTEURS.map(([transporteur, offre, code]) => [`${transporteur}|${offre}`, code]));

/** Résout le shippingOfferCode exact pour un transporteur + offre de la grille tarifaire —
 * correspondance stricte (même libellé exact), null si absent de la table plutôt que de deviner. */
export function trouverCodeOffre(transporteur: string, offre: string): string | null {
  return CODES.get(`${transporteur}|${offre}`) ?? null;
}

const OFFRES_PAR_CODE = new Map(TABLE_CODES_TRANSPORTEURS.map(([transporteur, offre, code]) => [code, { transporteur, offre }]));

/** Sens inverse de trouverCodeOffre — sert à afficher un libellé pour une offre choisie par une
 * règle de livraison même quand elle n'a pas de prix dans la grille tarifaire (cf. discussion
 * 2026-08-29, offre "Lettre Verte Suivie" : le code existe, aucune des grilles de prix données ne
 * la couvre — "on s'en fiche du prix" pour l'instant). */
export function trouverOffreParCode(code: string): { transporteur: string; offre: string } | null {
  return OFFRES_PAR_CODE.get(code) ?? null;
}
