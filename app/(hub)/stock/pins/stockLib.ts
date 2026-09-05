/** Types et fonctions pures partagés par actions.ts (serveur) et PinsScreen.tsx (client) — réplique
 * src/api/stock.ts de l'app Pimp It (mêmes tables réelles : stock_pins, pop_up_pin_boites,
 * commandes_pop_up, commande_lignes, pop_up_boite_remplissages, commandes_historique). Pas de
 * 'use server' ici : uniquement des types et fonctions synchrones, importables des deux côtés. */

export interface StockPin {
  id: string;
  nom: string;
  sku_pimpit: string | null;
  sku_fournisseur: string | null;
  fournisseur: string | null;
  photo_url: string | null;
  description: string | null;
  poids_unitaire: number | null;
  stock_general: number;
  seuil_cible: number | null;
  emplacement_type: 'boite_rouge' | 'bac_gris' | null;
  emplacement_rangement: number | null;
  emplacement_numero: number | null;
  a_completer: boolean;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

/** `numeric` côté Postgres peut revenir sous forme de string selon le client (déjà observé ailleurs
 * dans le Hub, cf. `versNombre` dans stock-cible/page.tsx) — normalise les champs numériques de
 * stock_pins juste après lecture pour que comparaisons (`<`) et sommes restent correctes. */
export function normaliserStockPin(row: StockPin): StockPin {
  return {
    ...row,
    stock_general: Number(row.stock_general),
    seuil_cible: row.seuil_cible === null ? null : Number(row.seuil_cible),
    poids_unitaire: row.poids_unitaire === null ? null : Number(row.poids_unitaire),
  };
}

export interface PopUpPinBoite {
  id: string;
  pop_up_id: string;
  pin_id: string;
  case_position: string;
  a_commander: boolean;
  updated_at: string;
}

export type StatutCommandePopUp = 'envoyee' | 'prete' | 'recue';

export interface CommandePopUp {
  id: string;
  pop_up_id: string;
  statut: StatutCommandePopUp;
  envoyee_par: string | null;
  envoyee_at: string;
  preparee_par: string | null;
  preparee_at: string | null;
  recue_par: string | null;
  recue_at: string | null;
  created_at: string;
}

export interface CommandeLigne {
  id: string;
  commande_id: string;
  pin_id: string;
  fait: boolean;
  /** Quantité envoyée de ce pin au pop-up — cf. migration 0097 (App PIMP IT), retour utilisateur
   * du 2026-09-05 : "il faut que le pin's soit décrémenté de 100 200 ou 300 ou met 100 par
   * defaut". Décrémentée du stock local (stock_pins.stock_general) à l'envoi. */
  quantite: number;
  updated_at: string;
}

export interface CommandeLigneAvecPin extends CommandeLigne {
  pin: StockPin;
}

export interface CommandeAvecLignes {
  commande: CommandePopUp;
  lignes: CommandeLigneAvecPin[];
}

export interface StockMouvement {
  id: string;
  pin_id: string;
  pop_up_id: string | null;
  type: string;
  quantite_delta: number | null;
  poids_pese: number | null;
  quantite_calculee: number | null;
  note: string | null;
  profile_id: string | null;
  created_at: string;
}

export interface DernierRemplissage {
  id: string;
  casePosition: string;
  profileNom: string;
  createdAt: string;
}

export interface CommandeHistoriqueResume {
  commande: CommandePopUp;
  nbPins: number;
}

const COLONNES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
const LIGNES = [1, 2, 3] as const;

/** Les 21 positions physiques de la grille, dans l'ordre d'affichage (A1, A2, A3, B1...G3). */
export const POSITIONS_GRILLE: string[] = COLONNES.flatMap((colonne) => LIGNES.map((ligne) => `${colonne}${ligne}`));

export interface ContenuCase {
  boiteId: string;
  pin: StockPin;
  aCommander: boolean;
  updatedAt: string;
}

export interface CaseGrille {
  casePosition: string;
  contenus: ContenuCase[];
}

export type StatutBoiteCommande = 'vide' | 'ok' | 'a_commander';

export function statutBoiteCommande(contenus: ContenuCase[]): StatutBoiteCommande {
  if (contenus.length === 0) return 'vide';
  return contenus.some((c) => c.aCommander) ? 'a_commander' : 'ok';
}

export interface LigneCommande {
  pin: StockPin;
  nbBoites: number;
}

/** Regroupe par pin les cases marquées "à commander" sur CE pop-up, avec le nombre de boîtes
 * concernées pour ce pin — cf. calculerCommandes (src/api/stock.ts). */
export function calculerCommandes(grille: CaseGrille[]): LigneCommande[] {
  const parPin = new Map<string, LigneCommande>();
  for (const caseGrille of grille) {
    for (const contenu of caseGrille.contenus) {
      if (!contenu.aCommander) continue;
      const existant = parPin.get(contenu.pin.id);
      if (existant) existant.nbBoites += 1;
      else parPin.set(contenu.pin.id, { pin: contenu.pin, nbBoites: 1 });
    }
  }
  return [...parPin.values()].sort((a, b) => b.nbBoites - a.nbBoites);
}

/** Construit la grille des 21 cases à partir des boîtes brutes et du catalogue (pour joindre le
 * pin complet) — équivalent client-side de fetchGrillePopUp, qui fait le join côté requête. */
export function construireGrille(boites: PopUpPinBoite[], popUpId: string, pinsParId: Map<string, StockPin>): CaseGrille[] {
  const boitesDuPopUp = boites.filter((b) => b.pop_up_id === popUpId);
  const boitesTriees = [...boitesDuPopUp].sort((a, b) => {
    const pinA = pinsParId.get(a.pin_id);
    const pinB = pinsParId.get(b.pin_id);
    const parNom = (pinA?.nom ?? '').localeCompare(pinB?.nom ?? '');
    return parNom !== 0 ? parNom : a.id.localeCompare(b.id);
  });

  const parPosition = new Map<string, ContenuCase[]>();
  for (const boite of boitesTriees) {
    const pin = pinsParId.get(boite.pin_id);
    if (!pin) continue;
    const liste = parPosition.get(boite.case_position) ?? [];
    liste.push({ boiteId: boite.id, pin, aCommander: boite.a_commander, updatedAt: boite.updated_at });
    parPosition.set(boite.case_position, liste);
  }

  return POSITIONS_GRILLE.map((casePosition) => ({
    casePosition,
    contenus: parPosition.get(casePosition) ?? [],
  }));
}

/** Libellé court de l'emplacement pour affichage ("Bac R3-14" / "Boîte 12"), null si non renseigné. */
export function formatEmplacement(
  pin: Pick<StockPin, 'emplacement_type' | 'emplacement_rangement' | 'emplacement_numero'>,
): string | null {
  if (pin.emplacement_type === 'bac_gris') return `Bac R${pin.emplacement_rangement}-${pin.emplacement_numero}`;
  if (pin.emplacement_type === 'boite_rouge') return `Boîte ${pin.emplacement_numero}`;
  return null;
}

/** Trie par emplacement physique dans l'entrepôt — cf. comparerParEmplacement (src/api/stock.ts). */
export function comparerParEmplacement(
  a: Pick<StockPin, 'emplacement_type' | 'emplacement_rangement' | 'emplacement_numero'>,
  b: Pick<StockPin, 'emplacement_type' | 'emplacement_rangement' | 'emplacement_numero'>,
): number {
  if (a.emplacement_type === null && b.emplacement_type === null) return 0;
  if (a.emplacement_type === null) return 1;
  if (b.emplacement_type === null) return -1;
  if (a.emplacement_type !== b.emplacement_type) return a.emplacement_type === 'bac_gris' ? -1 : 1;
  const rangA = a.emplacement_rangement ?? 0;
  const rangB = b.emplacement_rangement ?? 0;
  if (rangA !== rangB) return rangA - rangB;
  return (a.emplacement_numero ?? 0) - (b.emplacement_numero ?? 0);
}

/** `numeric` côté Postgres revient parfois en string selon le client — normalise ici. */
export function versNombre(valeur: number | string): number {
  return typeof valeur === 'string' ? Number(valeur) : valeur;
}

/** Pas des flèches (natives et clavier) sur la quantité envoyée à un pop-up : 100 par défaut,
 * palier de 100 (100 → 200 → 300…), jamais en dessous de 100 (décocher la case exclut le pin
 * plutôt que descendre à 0) — cf. retour utilisateur du 2026-09-05 : "100 200 ou 300 ou met 100
 * par defaut avec une possibilité de monter 200 300 etc". Même principe que le palier 0/50/100/200
 * de Commandes fournisseurs (CommandesClient.tsx), mais un pas fixe ici. */
export function prochainPalierEnvoi(v: number): number {
  return Math.max(100, v || 0) + 100;
}
export function palierPrecedentEnvoi(v: number): number {
  return Math.max(100, (v || 0) - 100);
}
