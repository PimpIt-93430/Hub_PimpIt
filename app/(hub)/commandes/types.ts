/** Une ligne du tableau "Créer une commande" — cf. retour utilisateur du 2026-09-05 : plus de
 * sélection de fournisseur ni de type (stock normal/pop-up) en amont, un seul tableau avec tous
 * les pins, une quantité par ligne ; le regroupement par fournisseur (pour créer un bon + un PDF
 * par fournisseur) se fait au moment de valider, cf. CommandesClient.tsx grouperParFournisseur. */
export interface LigneCreation {
  airtableId: string;
  name: string;
  skuPimpit: string | null;
  skuFournisseur: string;
  fournisseur: string | null;
  photo: string;
  stockActuel: number;
  /** Somme des quantités de ce pin sur TOUTES les commandes déjà passées (tout statut confondu) —
   * juste un indicateur de volume vendu/commandé dans le temps, pas une contrainte. */
  commandeDepuisToujours: number;
  qty: number;
  /** Cf. retour utilisateur du 2026-09-15 : "pour les commandes fournisseurs... ajoute le prix
   * pendant que je les fais" — prix unitaire fournisseur (écran "Prix fournisseurs"), affiché en
   * lecture seule pour donner le coût de la commande en cours de saisie. */
  prixFournisseur: number | null;
}
