// Qonto Business API — connexion en lecture seule (cf. retour utilisateur du 2026-09-10 : "un
// truc flux de trésorerie avec Qonto... déjà on va connecter notre compte Qonto... l'affichage du
// solde de tous nos comptes"). Authentification par clé API (pas OAuth) : header Authorization au
// format "<login>:<secret_key>", SANS encodage Base64 (cf. doc Qonto — ce n'est pas du Basic Auth
// standard).
//
// Deux appels, pas un seul : GET /v2/organization ne renvoie QUE les comptes Qonto natifs — un
// compte d'une autre banque agrégé dans Qonto (ex. Crédit Mutuel, cf. retour utilisateur : "si il
// est bien relié j'ai accès à tous les comptes... je vois le solde des deux comptes sur mon
// Qonto") n'y apparaît PAS, vérifié en direct (un seul compte renvoyé alors que Qonto lui-même en
// montre deux). GET /v2/bank_accounts, lui, renvoie les deux — c'est le seul qui inclut vraiment
// is_external_account: true. Le nom de l'organisation n'est en revanche disponible que via
// /v2/organization, d'où les deux appels en parallèle.
const QONTO_API = 'https://thirdparty.qonto.com/v2';

function authHeader(): string {
  const login = process.env.QONTO_LOGIN;
  const secret = process.env.QONTO_SECRET_KEY;
  if (!login || !secret) throw new Error('Qonto non configuré (QONTO_LOGIN / QONTO_SECRET_KEY manquants).');
  return `${login}:${secret}`;
}

async function appelQonto<T>(chemin: string): Promise<T> {
  const res = await fetch(`${QONTO_API}${chemin}`, {
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  });
  if (!res.ok) {
    const corps = await res.text().catch(() => '');
    throw new Error(`Qonto API ${res.status}: ${corps.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface CompteQonto {
  id: string;
  nom: string;
  iban: string;
  devise: string;
  solde: number;
  soldeAutorise: number;
  statut: 'active' | 'closed';
  principal: boolean;
  /** Compte d'une autre banque agrégé dans Qonto (ex. Crédit Mutuel) plutôt qu'un vrai compte
   * Qonto — is_external_account côté API. Doit être connecté côté Qonto (Comptes > Comptes
   * externes) pour apparaître ici : rien à faire côté Hub une fois que c'est fait chez Qonto. */
  externe: boolean;
  majLe: string;
}

export interface OrganisationQonto {
  nom: string;
  comptes: CompteQonto[];
}

interface ReponseOrganisation {
  organization: { name: string };
}

interface ReponseBankAccounts {
  bank_accounts: {
    id: string;
    name: string;
    iban: string;
    currency: string;
    /** String côté /v2/bank_accounts (ex. "16182.93"), contrairement à /v2/organization qui les
     * renvoie en nombre — vérifié en direct, pas une supposition de la doc. */
    balance: string;
    authorized_balance: string;
    status: 'active' | 'closed';
    main: boolean;
    is_external_account: boolean;
    updated_at: string;
  }[];
}

/** Organisation + tous les comptes bancaires (Qonto natifs + externes agrégés, soldes inclus) —
 * cf. en-tête du fichier. Ne renvoie que les comptes actifs (un compte fermé n'a plus de solde
 * pertinent pour la trésorerie). */
export async function chargerComptesQonto(): Promise<OrganisationQonto> {
  const [organisation, comptes] = await Promise.all([
    appelQonto<ReponseOrganisation>('/organization'),
    appelQonto<ReponseBankAccounts>('/bank_accounts?per_page=100'),
  ]);

  return {
    nom: organisation.organization.name,
    comptes: comptes.bank_accounts
      .filter((c) => c.status === 'active')
      .map((c) => ({
        id: c.id,
        nom: c.name,
        iban: c.iban,
        devise: c.currency,
        solde: Number(c.balance),
        soldeAutorise: Number(c.authorized_balance),
        statut: c.status,
        principal: c.main,
        externe: c.is_external_account,
        majLe: c.updated_at,
      })),
  };
}
