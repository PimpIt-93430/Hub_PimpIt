/** Types et calculs partagés par les 3 écrans Produits (Chaussures/Coques/Sacs) — réplique
 * src/utils/inventaireStock.ts + chaussures.ts/coques.ts/sacs.ts (résolution des ventes SumUp) de
 * l'app Pimp It. Distinct de /stock-cible : ici `stock_initial` n'est lu qu'en entrée du calcul
 * "à ramener", jamais modifié (l'édition du stock visé reste le rôle de /stock-cible). */

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

export type ModeleCoque = 'Iphone 13' | 'Iphone 14' | 'Iphone 15' | 'Iphone 16' | 'Iphone 17';
export type VarianteCoque = 'Normal' | 'Pro' | 'Pro Max' | 'Plus';
export type CouleurCoqueSac = 'Rose' | 'Noir';

export interface CoqueStock {
  id: string;
  modele: ModeleCoque;
  variante: VarianteCoque;
  couleur: CouleurCoqueSac;
  stock_initial: number;
}
export interface CoqueInventaire {
  id: string;
  pop_up_id: string;
  modele: ModeleCoque;
  variante: VarianteCoque;
  couleur: CouleurCoqueSac;
  quantite_comptee: number;
  profile_id: string;
  created_at: string;
}
export interface CoqueMappingSumup {
  id: string;
  nom_produit: string;
  modele: ModeleCoque;
  variante: VarianteCoque;
  couleur: CouleurCoqueSac;
}

export type ProduitSac = 'Grandes Pochettes' | 'Petites Pochettes' | "Sac Pimp-it + 6 pin's";

export interface SacStock {
  id: string;
  produit: ProduitSac;
  couleur: CouleurCoqueSac;
  stock_initial: number;
}
export interface SacInventaire {
  id: string;
  pop_up_id: string;
  produit: ProduitSac;
  couleur: CouleurCoqueSac;
  quantite_comptee: number;
  profile_id: string;
  created_at: string;
}
export interface SacMappingSumup {
  id: string;
  nom_produit: string;
  produit: ProduitSac;
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
export const MODELES_COQUES: ModeleCoque[] = ['Iphone 13', 'Iphone 14', 'Iphone 15', 'Iphone 16', 'Iphone 17'];
export const VARIANTES_COQUES: VarianteCoque[] = ['Normal', 'Pro', 'Pro Max', 'Plus'];
export const COULEURS_COQUES_SACS: CouleurCoqueSac[] = ['Rose', 'Noir'];
export const PRODUITS_SACS: ProduitSac[] = ['Grandes Pochettes', 'Petites Pochettes', "Sac Pimp-it + 6 pin's"];

export interface AvecARamener {
  id: string;
  dernierInventaire: { quantite_comptee: number; created_at: string } | null;
  venduDepuisInventaire: number;
  stockEstime: number | null;
  aRamener: number;
}

/** Calcul générique "à ramener" partagé par chaussures/coques/sacs — cf. calculerARamenerGenerique
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
  variante: VarianteCoque;
  couleur: CouleurCoqueSac;
  quantite: number;
  horodatage: string;
}

function parserModeleVarianteCouleur(
  description: string | null,
): { modele: ModeleCoque; variante: VarianteCoque; couleur: CouleurCoqueSac } | null {
  if (!description) return null;
  const parties = description.split('·').map((p) => p.trim());
  if (parties.length !== 3) return null;
  const [modeleBrut, varianteBrute, couleurBrute] = parties;
  const modele = MODELES_COQUES.find((m) => m.toLowerCase() === modeleBrut.toLowerCase());
  const variante = VARIANTES_COQUES.find((v) => v.toLowerCase() === varianteBrute.toLowerCase());
  const couleur = COULEURS_COQUES_SACS.find((c) => c.toLowerCase() === couleurBrute.toLowerCase());
  if (!modele || !variante || !couleur) return null;
  return { modele, variante, couleur };
}

export function resoudreVentesSumupCoques(lignes: VenteSumupLigne[], mapping: CoqueMappingSumup[]): VenteCoque[] {
  const mappingParNom = new Map(mapping.map((m) => [m.nom_produit, m]));
  const ventes: VenteCoque[] = [];
  for (const ligne of lignes) {
    const parsed = parserModeleVarianteCouleur(ligne.description);
    if (parsed) {
      ventes.push({ ...parsed, quantite: ligne.quantite, horodatage: ligne.horodatage });
      continue;
    }
    const m = mappingParNom.get(ligne.nom_produit);
    if (!m) continue;
    ventes.push({ modele: m.modele, variante: m.variante, couleur: m.couleur, quantite: ligne.quantite, horodatage: ligne.horodatage });
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
    (item) => `${item.modele}|${item.variante}|${item.couleur}`,
    (inv) => `${inv.modele}|${inv.variante}|${inv.couleur}`,
    (vente) => `${vente.modele}|${vente.variante}|${vente.couleur}`,
  );
}

// ---- Sacs ----

export interface VenteSac {
  produit: ProduitSac;
  couleur: CouleurCoqueSac;
  quantite: number;
  horodatage: string;
}

function parserCouleur(description: string | null): CouleurCoqueSac | null {
  if (!description) return null;
  const brut = description.trim();
  return COULEURS_COQUES_SACS.find((c) => c.toLowerCase() === brut.toLowerCase()) ?? null;
}

function resoudreProduit(nomProduit: string): ProduitSac | null {
  const brut = nomProduit.trim();
  return PRODUITS_SACS.find((p) => p === brut) ?? null;
}

export function resoudreVentesSumupSacs(lignes: VenteSumupLigne[], mapping: SacMappingSumup[]): VenteSac[] {
  const mappingParNom = new Map(mapping.map((m) => [m.nom_produit, m]));
  const ventes: VenteSac[] = [];
  for (const ligne of lignes) {
    const produit = resoudreProduit(ligne.nom_produit);
    const couleur = parserCouleur(ligne.description);
    if (produit && couleur) {
      ventes.push({ produit, couleur, quantite: ligne.quantite, horodatage: ligne.horodatage });
      continue;
    }
    const m = mappingParNom.get(ligne.nom_produit);
    if (!m) continue;
    ventes.push({ produit: m.produit, couleur: m.couleur, quantite: ligne.quantite, horodatage: ligne.horodatage });
  }
  return ventes;
}

export function calculerARamenerSacs(stock: SacStock[], inventaires: SacInventaire[], ventes: VenteSac[]): (SacStock & AvecARamener)[] {
  return calculerARamenerGenerique(
    stock,
    inventaires,
    ventes,
    (item) => `${item.produit}|${item.couleur}`,
    (inv) => `${inv.produit}|${inv.couleur}`,
    (vente) => `${vente.produit}|${vente.couleur}`,
  );
}
