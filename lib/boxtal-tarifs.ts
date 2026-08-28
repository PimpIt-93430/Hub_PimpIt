// Grille tarifaire Boxtal (cf. discussion 2026-08-28) — pas d'endpoint de devis dans l'API v3
// (lib/boxtal.ts), donc prix fournis à la main par l'utilisateur depuis son espace Boxtal
// (shipping.boxtal.com/fr/fr/grille-tarifaire, export CSV par pays de destination) et convertis une
// fois en JSON par scripts ponctuels (cf. historique — pas de script committé, conversion faite en
// session). "si un jour ya un autre pays tu mets erreur" : trouverTarifs() renvoie null pour tout
// pays absent de ce JSON plutôt que d'inventer un prix.
import { trouverCodeOffre } from './boxtal-codes';
import grilleBrute from './boxtal-tarifs.json';

interface TrancheGrille {
  label: string;
  min: number;
  max: number | null;
  prixMin: number;
  prixMax: number | null;
  prixMaxNonMeca: number | null;
}

interface OffreGrille {
  transporteur: string;
  offre: string;
  depart: string;
  arrivee: string;
  typePoids: 'WEIGHT_BASED' | 'VOLUME_BASED';
  tranches: TrancheGrille[];
}

const grille = grilleBrute as Record<string, OffreGrille[]>;

export const NOM_PAYS: Record<string, string> = {
  FR: 'France',
  BE: 'Belgique',
  DE: 'Allemagne',
  ES: 'Espagne',
  IT: 'Italie',
  CH: 'Suisse',
};

export interface TarifEstimation {
  transporteur: string;
  offre: string;
  depart: string;
  arrivee: string;
  trancheLabel: string;
  prixMin: number;
  prixMax: number;
  /** shippingOfferCode Boxtal résolu (cf. boxtal-codes.ts, donné par l'utilisateur le 2026-08-29)
   * — null si cette offre n'a pas (encore) de code connu, auquel cas elle ne doit jamais être
   * utilisée pour créer une vraie expédition automatiquement. */
  code: string | null;
}

/** Estimations triées du moins cher au plus cher (cf. "tu mets le moins cher en priorité") pour un
 * poids donné vers un pays donné — null si ce pays n'a pas de grille déposée (cf. en-tête). */
export function trouverTarifs(paysIso: string, poidsGrammes: number): TarifEstimation[] | null {
  const offres = grille[paysIso];
  if (!offres) return null;

  const estimations: TarifEstimation[] = [];
  for (const o of offres) {
    const tranche = o.tranches.find((t) => poidsGrammes >= t.min && (t.max === null || poidsGrammes <= t.max));
    if (!tranche) continue;
    estimations.push({
      transporteur: o.transporteur,
      offre: o.offre,
      depart: o.depart,
      arrivee: o.arrivee,
      trancheLabel: tranche.label,
      // Le "prix maximal" est parfois absent de la grille source pour une tranche donnée (cellule
      // vide dans le CSV) — on retombe sur le prix minimal plutôt que d'afficher "null".
      prixMin: tranche.prixMin,
      prixMax: tranche.prixMax ?? tranche.prixMin,
      code: trouverCodeOffre(o.transporteur, o.offre),
    });
  }

  return estimations.sort((a, b) => a.prixMin - b.prixMin);
}

export function paysSupportes(): string[] {
  return Object.keys(grille);
}
