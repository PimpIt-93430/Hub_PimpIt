// Règles de livraison (cf. retour utilisateur du 2026-09-05 : "dans les règles il faudrait que tu
// mettes toutes les possibilités shopify avec poids et destination et moi je match avec mes règles
// comme ça c'est simple et tout le reste de la logique tu enlèves") — réécriture complète, simple à
// dessein : une règle = (mode de livraison Shopify EXACT, poids, destination) → transporteur/code
// EXACT choisi par l'utilisateur, sans mot-clé approximatif, sans zone implicite, sans "on retombe
// sur le moins cher" ni "léger + France → La Poste par défaut". Si aucune règle ne correspond
// exactement, rien n'est proposé — jamais de logique cachée à décrypter en cas de souci.
//
// Historique : d'abord un matching par sous-chaîne (motCle inclus dans le texte Shopify) avec un
// champ zone séparé et un flag legerUniquement — source de plusieurs bugs réels (une règle
// "Shipped by Seller" qui matchait presque toutes les commandes, un flag legerUniquement laissé par
// erreur sur des règles qui devaient s'appliquer aux deux poids...). Abandonné au profit d'un
// matching exact sur liste fermée de possibilités (cf. actions.ts listerPossibilitesExpedition,
// interrogée en direct depuis la config Shopify — toujours à jour, pas de texte à deviner).

export type ClassePoids = 'leger' | 'lourd' | 'tous';
export type ClasseDestination = 'france' | 'international' | 'tous';
export type Transporteur = 'laposte' | 'sendcloud';

export interface RegleLivraison {
  id: string;
  /** Texte EXACT du mode de livraison Shopify (CommandeShopify.moyenExpedition), ex. "Livraison en
   * point relais (Sélectionnez votre point relais après le paiement)" — plus de sous-chaîne
   * approximative, choisi dans la liste des possibilités réelles de la boutique. */
  moyenExpedition: string;
  poids: ClassePoids;
  destination: ClasseDestination;
  transporteur: Transporteur;
  /** Sendcloud uniquement (shipping_option_code) — vide/ignoré si transporteur === 'laposte'
   * (tarif contractuel fixe, cf. lib/laposte.ts PRIX_LETTRE_VERTE_SUIVIE_HT, pas de code à choisir). */
  code: string;
}

export const CLE_REGLES_LIVRAISON = 'regles-livraison-v2';

export const REGLES_PAR_DEFAUT: RegleLivraison[] = [];

/** Règle correspondant EXACTEMENT au mode de livraison Shopify de la commande, à son poids et à sa
 * destination — pas de sous-chaîne, pas de "plus proche". `poids: 'tous'`/`destination: 'tous'` sur
 * une règle la fait matcher indépendamment du poids/de la destination réels. null si aucune règle ne
 * correspond : c'est le signal "rien à faire ici", pas une absence d'information à combler par une
 * logique de repli. */
/** Cf. retour utilisateur du 2026-09-05 : les DOM (Guadeloupe, Martinique, Réunion, Guyane,
 * Mayotte) sont juridiquement la France et desservis par le réseau postal domestique de La Poste
 * (cf. lib/laposte.ts CODES_PAYS_NUMERIQUES) — mais PAS par les transporteurs tiers agrégés par
 * Sendcloud (Mondial Relay confirmé en direct comme ne desservant pas ces destinations). Compte donc
 * comme "France" seulement pour matcher une règle La Poste ; reste "international" pour une règle
 * Sendcloud, qui a besoin d'un vrai code dédié aux DOM (ex. colissimo:home-overseas/fr). */
const CODES_PAYS_DOM = ['GP', 'MQ', 'RE', 'GF', 'YT'];

export function trouverRegle(
  regles: RegleLivraison[],
  moyenExpedition: string | null,
  poids: 'leger' | 'lourd',
  paysCode: string | null,
): RegleLivraison | null {
  if (!moyenExpedition) return null;
  const code = (paysCode ?? '').toUpperCase();
  const estFrance = code === 'FR';
  const estDom = CODES_PAYS_DOM.includes(code);
  return (
    regles.find((r) => {
      if (r.moyenExpedition !== moyenExpedition) return false;
      if (r.poids !== 'tous' && r.poids !== poids) return false;
      if (r.destination === 'tous') return true;
      if (r.destination === 'france') return estFrance || (estDom && r.transporteur === 'laposte');
      return !estFrance && !(estDom && r.transporteur === 'laposte');
    }) ?? null
  );
}

/** Migre d'anciennes règles (motCle/zone/legerUniquement, cf. historique ci-dessus) — pas de
 * correspondance fiable vers le nouveau modèle (matching exact vs sous-chaîne), donc repart de zéro
 * plutôt que de faire semblant de migrer des règles qui matcheraient différemment. */
function migrer(brut: unknown): RegleLivraison[] {
  if (!Array.isArray(brut)) return REGLES_PAR_DEFAUT;
  return brut
    .filter((r) => r && typeof r === 'object' && 'moyenExpedition' in r)
    .map((r: any) => ({
      id: String(r?.id ?? `regle-${Date.now()}-${Math.random()}`),
      moyenExpedition: String(r?.moyenExpedition ?? ''),
      poids: r?.poids === 'leger' || r?.poids === 'lourd' ? r.poids : 'tous',
      destination: r?.destination === 'france' || r?.destination === 'international' ? r.destination : 'tous',
      transporteur: r?.transporteur === 'laposte' ? 'laposte' : 'sendcloud',
      code: typeof r?.code === 'string' ? r.code : '',
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
