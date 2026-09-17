export interface PinPrix {
  id: string;
  nom: string | null;
  sku_pimpit: string | null;
  custom: boolean | null;
  photo_url: string | null;
  prix_fournisseur: number | null;
  prix_revente_ht: number | null;
}

// Cf. retour utilisateur du 2026-09-15 : "le prix des pin's fournisseurs c'est soit 0.05 soit 0.15
// soit 0.25 soit 0.30 soit 0.60" — dans types.ts (pas actions.ts) car un fichier 'use server' ne
// peut exporter que des fonctions async ; un composant client qui importerait cette constante
// depuis actions.ts la recevrait cassée au runtime (piège déjà rencontré sur ce projet).
export const PRIX_FOURNISSEUR_VALEURS = [0.05, 0.15, 0.25, 0.3, 0.6] as const;
export type PrixFournisseur = (typeof PRIX_FOURNISSEUR_VALEURS)[number];

// Cf. retour utilisateur du 2026-09-17 : prix de revente (utilisé par la page publique /revendeurs,
// cf. catalogue_revendeurs) ajouté à côté du prix fournisseur sur ce même écran — valeurs
// confirmées par les données déjà en place (636 pins déjà tarifés), verrouillées aussi côté base
// (contrainte CHECK, migration stock_pins_prix_revente_valeurs).
export const PRIX_REVENTE_VALEURS = [0.25, 0.4, 0.7, 1.0, 1.25] as const;
export type PrixRevente = (typeof PRIX_REVENTE_VALEURS)[number];
