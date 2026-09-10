// Qonto Business API — connexion en lecture seule (cf. retour utilisateur du 2026-09-10 : "un
// truc flux de trésorerie avec Qonto... déjà on va connecter notre compte Qonto... l'affichage du
// solde de tous nos comptes"). Authentification par clé API (pas OAuth) : header Authorization au
// format "<login>:<secret_key>", SANS encodage Base64 (cf. doc Qonto — ce n'est pas du Basic Auth
// standard). Un seul appel suffit pour tout récupérer : GET /v2/organization renvoie l'organisation
// ET la liste de tous les comptes bancaires (soldes inclus), pas besoin d'un endpoint par compte.
const QONTO_API = 'https://thirdparty.qonto.com/v2';

function authHeader(): string {
  const login = process.env.QONTO_LOGIN;
  const secret = process.env.QONTO_SECRET_KEY;
  if (!login || !secret) throw new Error('Qonto non configuré (QONTO_LOGIN / QONTO_SECRET_KEY manquants).');
  return `${login}:${secret}`;
}

export interface CompteQonto {
  id: string;
  slug: string;
  nom: string;
  iban: string;
  devise: string;
  solde: number;
  soldeAutorise: number;
  statut: 'active' | 'closed';
  principal: boolean;
  /** Compte d'une autre banque agrégé dans Qonto (ex. Crédit Mutuel, cf. retour utilisateur du
   * 2026-09-10) plutôt qu'un vrai compte Qonto — même endpoint /v2/organization, juste ce flag en
   * plus (is_external_account). Doit être connecté côté Qonto (Comptes > Comptes externes) pour
   * apparaître ici : rien à faire côté Hub une fois que c'est fait chez Qonto. */
  externe: boolean;
  majLe: string;
}

export interface OrganisationQonto {
  nom: string;
  comptes: CompteQonto[];
}

interface ReponseOrganisation {
  organization: {
    name: string;
    bank_accounts: {
      id: string;
      slug: string;
      name: string;
      iban: string;
      currency: string;
      balance: number;
      authorized_balance: number;
      status: 'active' | 'closed';
      main: boolean;
      is_external_account: boolean;
      updated_at: string;
    }[];
  };
}

/** Organisation + tous les comptes bancaires Qonto (soldes inclus) — cf. en-tête du fichier.
 * Ne renvoie que les comptes actifs (un compte fermé n'a plus de solde pertinent pour la
 * trésorerie). */
export async function chargerComptesQonto(): Promise<OrganisationQonto> {
  const res = await fetch(`${QONTO_API}/organization`, {
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  });
  if (!res.ok) {
    const corps = await res.text().catch(() => '');
    throw new Error(`Qonto API ${res.status}: ${corps.slice(0, 300)}`);
  }
  const json = (await res.json()) as ReponseOrganisation;

  return {
    nom: json.organization.name,
    comptes: json.organization.bank_accounts
      .filter((c) => c.status === 'active')
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        nom: c.name,
        iban: c.iban,
        devise: c.currency,
        solde: c.balance,
        soldeAutorise: c.authorized_balance,
        statut: c.status,
        principal: c.main,
        externe: c.is_external_account,
        majLe: c.updated_at,
      })),
  };
}
