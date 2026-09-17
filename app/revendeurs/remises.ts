// Paliers de réduction volume (retour utilisateur du 2026-09-17, cf. analyse marge fournisseur/
// revente — marge moyenne ~75%, largement de quoi absorber ces paliers). Dans types.ts (pas
// actions.ts) car un fichier 'use server' ne peut exporter que des fonctions async — un composant
// client qui importerait cette constante depuis actions.ts la recevrait cassée au runtime (piège
// déjà rencontré sur ce projet, cf. PRIX_FOURNISSEUR_VALEURS).
export interface PalierRemise {
  seuil: number;
  pourcentage: number;
}

export const PALIERS_REMISE: PalierRemise[] = [
  { seuil: 1500, pourcentage: 5 },
  { seuil: 3000, pourcentage: 8 },
  { seuil: 6000, pourcentage: 12 },
  { seuil: 10000, pourcentage: 18 },
];

/** Le palier applicable est le seuil le plus haut atteint par le sous-total (pas cumulatif) —
 * lecture standard d'une grille de remise par palier. */
export function calculerRemise(sousTotalHT: number): { pourcentage: number; seuil: number | null } {
  let meilleur: PalierRemise | null = null;
  for (const p of PALIERS_REMISE) {
    if (sousTotalHT >= p.seuil && (!meilleur || p.seuil > meilleur.seuil)) meilleur = p;
  }
  return { pourcentage: meilleur?.pourcentage ?? 0, seuil: meilleur?.seuil ?? null };
}
