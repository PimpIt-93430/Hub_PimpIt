/** Types et calculs partagés par les 2 écrans Produits (Chaussures/Coques) — réplique
 * src/utils/inventaireStock.ts + chaussures.ts/coques.ts (résolution des ventes SumUp) de l'app
 * Pimp It. Distinct de /stock-cible : ici `stock_initial` n'est lu qu'en entrée du calcul "à
 * ramener", jamais modifié (l'édition du stock visé reste le rôle de /stock-cible). Sacs et
 * Lanières n'ont plus de suivi de stock (retour utilisateur du 2026-09-18) — gérés uniquement côté
 * app via un panier de commande. */

export type CouleurChaussure = 'Noir' | 'Kaki' | 'Rose' | 'Gris';
export type TailleChaussure = '36-37' | '38-39' | '40-41' | '41-42' | '43-44' | '45-46';

export interface ChaussureStock {
  id: string;
  couleur: CouleurChaussure;
  taille: TailleChaussure;
  stock_initial: number;
}
export interface ChaussureInventaire {
  id: string;
  pop_up_id: string;
  couleur: CouleurChaussure;
  taille: TailleChaussure;
  quantite_comptee: number;
  profile_id: string;
  created_at: string;
}
export interface ChaussureMappingSumup {
  id: string;
  nom_produit: string;
  couleur: CouleurChaussure;
  taille: TailleChaussure;
}

/** Retour utilisateur du 2026-09-18 : plusieurs générations iPhone partagent la même coque —
 * regroupement en 13 modèles (remplace l'ancien modele x variante), cf. même type côté app
 * (src/types/database.types.ts). */
export type ModeleCoque =
  | '13/14/15'
  | '13/14 Pro'
  | '13/14 Pro Max'
  | '15 Pro'
  | '15 Pro Max'
  | '15 Plus'
  | '16'
  | '16 Pro'
  | '16 Pro Max'
  | '16 Plus'
  | '17'
  | '17 Pro'
  | '17 Pro Max';
export type CouleurCoqueSac = 'Rose' | 'Noir';

export interface CoqueStock {
  id: string;
  modele: ModeleCoque;
  couleur: CouleurCoqueSac;
  stock_initial: number;
}
export interface CoqueInventaire {
  id: string;
  pop_up_id: string;
  modele: ModeleCoque;
  couleur: CouleurCoqueSac;
  quantite_comptee: number;
  profile_id: string;
  created_at: string;
}
export interface CoqueMappingSumup {
  id: string;
  nom_produit: string;
  modele: ModeleCoque;
  couleur: CouleurCoqueSac;
}

export interface VenteSumupLigne {
  id: string;
  pop_up_id: string | null;
  horodatage: string;
  nom_produit: string;
  description: string | null;
  quantite: number;
}

export const COULEURS_CHAUSSURES: CouleurChaussure[] = ['Noir', 'Kaki', 'Rose', 'Gris'];
export const TAILLES_CHAUSSURES: TailleChaussure[] = ['36-37', '38-39', '40-41', '41-42', '43-44', '45-46'];
export const MODELES_COQUES: ModeleCoque[] = [
  '13/14/15',
  '13/14 Pro',
  '13/14 Pro Max',
  '15 Pro',
  '15 Pro Max',
  '15 Plus',
  '16',
  '16 Pro',
  '16 Pro Max',
  '16 Plus',
  '17',
  '17 Pro',
  '17 Pro Max',
];
export const COULEURS_COQUES_SACS: CouleurCoqueSac[] = ['Rose', 'Noir'];

export interface AvecARamener {
  id: string;
  dernierInventaire: { quantite_comptee: number; created_at: string } | null;
  venduDepuisInventaire: number;
  stockEstime: number | null;
  aRamener: number;
}

/** Calcul générique "à ramener" partagé par chaussures/coques — cf. calculerARamenerGenerique
 * (src/utils/inventaireStock.ts) : stock de départ moins le dernier inventaire compté par le
 * pop-up, corrigé des ventes SumUp survenues depuis ce comptage. */
export function calculerARamenerGenerique<
  TStock extends { id: string; stock_initial: number },
  TInv extends { created_at: string; quantite_comptee: number },
  TVente extends { quantite: number; horodatage: string },
>(
  stock: TStock[],
  inventaires: TInv[],
  ventes: TVente[],
  cleStock: (item: TStock) => string,
  cleInventaire: (inv: TInv) => string,
  cleVente: (vente: TVente) => string,
): (TStock & AvecARamener)[] {
  const dernierParCle = new Map<string, TInv>();
  for (const inv of inventaires) {
    const cle = cleInventaire(inv);
    const existant = dernierParCle.get(cle);
    if (!existant || inv.created_at > existant.created_at) dernierParCle.set(cle, inv);
  }
  return stock.map((item) => {
    const cle = cleStock(item);
    const dernierInventaire = dernierParCle.get(cle) ?? null;
    const venduDepuisInventaire = dernierInventaire
      ? ventes.filter((v) => cleVente(v) === cle && v.horodatage > dernierInventaire.created_at).reduce((s, v) => s + v.quantite, 0)
      : 0;
    const stockEstime = dernierInventaire ? Math.max(0, dernierInventaire.quantite_comptee - venduDepuisInventaire) : null;
    const aRamener = stockEstime !== null ? Math.max(0, item.stock_initial - stockEstime) : 0;
    return { ...item, dernierInventaire, venduDepuisInventaire, stockEstime, aRamener };
  });
}

// ---- Chaussures ----

export interface VenteChaussure {
  couleur: CouleurChaussure;
  taille: TailleChaussure;
  quantite: number;
  horodatage: string;
}

function parserCouleurTaille(description: string | null): { couleur: CouleurChaussure; taille: TailleChaussure } | null {
  if (!description) return null;
  const parties = description.split('·').map((p) => p.trim());
  if (parties.length !== 2) return null;
  const [tailleBrute, couleurBrute] = parties;
  const taille = TAILLES_CHAUSSURES.find((t) => t === tailleBrute);
  const couleur = COULEURS_CHAUSSURES.find((c) => c.toLowerCase() === couleurBrute.toLowerCase());
  if (!taille || !couleur) return null;
  return { couleur, taille };
}

export function resoudreVentesSumup(lignes: VenteSumupLigne[], mapping: ChaussureMappingSumup[]): VenteChaussure[] {
  const mappingParNom = new Map(mapping.map((m) => [m.nom_produit, m]));
  const ventes: VenteChaussure[] = [];
  for (const ligne of lignes) {
    const parsed = parserCouleurTaille(ligne.description);
    if (parsed) {
      ventes.push({ ...parsed, quantite: ligne.quantite, horodatage: ligne.horodatage });
      continue;
    }
    const m = mappingParNom.get(ligne.nom_produit);
    if (!m) continue;
    ventes.push({ couleur: m.couleur, taille: m.taille, quantite: ligne.quantite, horodatage: ligne.horodatage });
  }
  return ventes;
}

export function calculerARamener(
  stock: ChaussureStock[],
  inventaires: ChaussureInventaire[],
  ventes: VenteChaussure[],
): (ChaussureStock & AvecARamener)[] {
  return calculerARamenerGenerique(
    stock,
    inventaires,
    ventes,
    (item) => `${item.couleur}|${item.taille}`,
    (inv) => `${inv.couleur}|${inv.taille}`,
    (vente) => `${vente.couleur}|${vente.taille}`,
  );
}

// ---- Coques ----

export interface VenteCoque {
  modele: ModeleCoque;
  couleur: CouleurCoqueSac;
  quantite: number;
  horodatage: string;
}

/** Le catalogue SumUp ("Coque Iphone + 5 pin's") n'a pas été changé — il garde ses 40 versions au
 * format "Iphone XX · Variante · Couleur" (Normal/Pro/Pro Max/Plus x 13 à 17), cf. même table côté
 * app (src/utils/coques.ts REGROUPEMENT_SUMUP) : 13/14/15/Normal ont le même gabarit, 13 Pro/14 Pro
 * pareil, 13 Pro Max/14 Pro Max pareil, 15 Pro et 15 Pro Max changent de gabarit (bords titane) donc
 * restent seuls, 14 Plus rejoint 15 Plus (même gabarit 6,7" hors Pro). "Iphone 13 · Plus" et
 * "Iphone 17 · Plus" n'existent pas chez Apple (SKU du catalogue jamais vendable) et ne sont donc
 * volontairement pas mappés. */
const REGROUPEMENT_SUMUP: Record<string, ModeleCoque> = {
  'iphone 13|normal': '13/14/15',
  'iphone 14|normal': '13/14/15',
  'iphone 15|normal': '13/14/15',
  'iphone 13|pro': '13/14 Pro',
  'iphone 14|pro': '13/14 Pro',
  'iphone 15|pro': '15 Pro',
  'iphone 13|pro max': '13/14 Pro Max',
  'iphone 14|pro max': '13/14 Pro Max',
  'iphone 15|pro max': '15 Pro Max',
  'iphone 14|plus': '15 Plus',
  'iphone 15|plus': '15 Plus',
  'iphone 16|normal': '16',
  'iphone 16|pro': '16 Pro',
  'iphone 16|pro max': '16 Pro Max',
  'iphone 16|plus': '16 Plus',
  'iphone 17|normal': '17',
  'iphone 17|pro': '17 Pro',
  'iphone 17|pro max': '17 Pro Max',
};

function parserModeleCouleur(description: string | null): { modele: ModeleCoque; couleur: CouleurCoqueSac } | null {
  if (!description) return null;
  const parties = description.split('·').map((p) => p.trim());
  if (parties.length !== 3) return null;
  const [generationBrute, varianteBrute, couleurBrute] = parties;
  const modele = REGROUPEMENT_SUMUP[`${generationBrute.toLowerCase()}|${varianteBrute.toLowerCase()}`];
  const couleur = COULEURS_COQUES_SACS.find((c) => c.toLowerCase() === couleurBrute.toLowerCase());
  if (!modele || !couleur) return null;
  return { modele, couleur };
}

export function resoudreVentesSumupCoques(lignes: VenteSumupLigne[], mapping: CoqueMappingSumup[]): VenteCoque[] {
  const mappingParNom = new Map(mapping.map((m) => [m.nom_produit, m]));
  const ventes: VenteCoque[] = [];
  for (const ligne of lignes) {
    const parsed = parserModeleCouleur(ligne.description);
    if (parsed) {
      ventes.push({ ...parsed, quantite: ligne.quantite, horodatage: ligne.horodatage });
      continue;
    }
    const m = mappingParNom.get(ligne.nom_produit);
    if (!m) continue;
    ventes.push({ modele: m.modele, couleur: m.couleur, quantite: ligne.quantite, horodatage: ligne.horodatage });
  }
  return ventes;
}

export function calculerARamenerCoques(
  stock: CoqueStock[],
  inventaires: CoqueInventaire[],
  ventes: VenteCoque[],
): (CoqueStock & AvecARamener)[] {
  return calculerARamenerGenerique(
    stock,
    inventaires,
    ventes,
    (item) => `${item.modele}|${item.couleur}`,
    (inv) => `${inv.modele}|${inv.couleur}`,
    (vente) => `${vente.modele}|${vente.couleur}`,
  );
}
