// Règles de livraison (cf. discussion 2026-08-28 : "si la livraison est home delivery c'est
// colissimo") — associent un mot-clé trouvé dans le mode de livraison choisi au checkout Shopify
// (CommandeShopify.moyenExpedition) à un shipping_option_code Sendcloud précis (cf.
// lib/sendcloud.ts listerOptionsExpedition — plus de table statique à tenir à jour, les codes sont
// interrogés en direct). Le code exact (et non plus juste un nom de transporteur, cf. discussion
// 2026-08-29 : "faudrait mettre le code transporteur comme ça on est sûr y'a pas de problème") lève
// toute ambiguïté — un même transporteur a souvent plusieurs offres (domicile/point relais, avec ou
// sans signature...), matcher par code choisit l'offre exacte plutôt que la moins chère du
// transporteur. Purement côté navigateur (localStorage), pas de secret ni d'appel serveur
// nécessaire.
//
// Cf. discussion 2026-08-29 : migration Boxtal → Sendcloud — clé de stockage changée
// (regles-livraison-boxtal → regles-livraison-sendcloud) volontairement, les anciens codes Boxtal
// enregistrés ne sont pas des shipping_option_code Sendcloud valides, mieux vaut repartir de zéro
// (REGLES_PAR_DEFAUT vide) que de faire semblant de les migrer.

export interface RegleLivraison {
  id: string;
  motCle: string;
  code: string;
  /** Cf. discussion 2026-08-29 : "si c'est livraison à domicile de produit léger c'est par lettre
   * et lourd par colis" — quand true, la règle ne s'applique qu'aux commandes dont tous les
   * articles sont dans le profil d'expédition Shopify "Produits Légers" (cf.
   * lib/classification-produits.ts). Absent/false = s'applique quel que soit le poids. */
  legerUniquement?: boolean;
}

export const CLE_REGLES_LIVRAISON = 'regles-livraison-sendcloud';

// Vide : les anciennes règles par défaut pointaient vers des codes Boxtal (POFR-ColissimoAccess…),
// invalides côté Sendcloud — à recréer depuis le panneau "Règles de livraison" (sélecteur alimenté
// en direct par lib/sendcloud.ts listerOptionsExpedition).
export const REGLES_PAR_DEFAUT: RegleLivraison[] = [];

/** Premier code d'offre dont le mot-clé de règle apparaît (insensible à la casse) dans le mode de
 * livraison Shopify — en ignorant les règles réservées aux produits légers (legerUniquement) si la
 * commande n'est pas classée légère. null si aucune règle ne correspond (pas de préférence, on
 * retombe sur le moins cher tous transporteurs confondus). */
export function trouverCodeRegle(
  regles: RegleLivraison[],
  moyenExpedition: string | null,
  estLeger: boolean,
): string | null {
  if (!moyenExpedition) return null;
  const texte = moyenExpedition.toLowerCase();
  const regle = regles.find(
    (r) => r.motCle.trim() && texte.includes(r.motCle.trim().toLowerCase()) && (!r.legerUniquement || estLeger),
  );
  return regle?.code?.trim() || null;
}

/** Migre d'anciennes règles sauvegardées avant le passage au code exact (cf. discussion
 * 2026-08-29) — l'ancien champ `transporteur` est ignoré (plus assez précis pour choisir une offre
 * sans ambiguïté), la règle est gardée avec un code vide plutôt que perdue : elle ne matchera plus
 * rien tant que l'utilisateur n'aura pas choisi une offre dans le panneau, mais rien ne plante. */
function migrer(brut: unknown): RegleLivraison[] {
  if (!Array.isArray(brut)) return REGLES_PAR_DEFAUT;
  return brut.map((r) => ({
    id: String(r?.id ?? `regle-${Date.now()}-${Math.random()}`),
    motCle: String(r?.motCle ?? ''),
    code: typeof r?.code === 'string' ? r.code : '',
    legerUniquement: Boolean(r?.legerUniquement),
  }));
}

export function chargerReglesLivraison(): RegleLivraison[] {
  try {
    const sauvegarde = localStorage.getItem(CLE_REGLES_LIVRAISON);
    return sauvegarde ? migrer(JSON.parse(sauvegarde)) : REGLES_PAR_DEFAUT;
  } catch {
    return REGLES_PAR_DEFAUT;
  }
}

export function sauvegarderReglesLivraison(regles: RegleLivraison[]): void {
  try {
    localStorage.setItem(CLE_REGLES_LIVRAISON, JSON.stringify(regles));
  } catch {
    /* navigation privée — tant pis, pas persisté */
  }
}
