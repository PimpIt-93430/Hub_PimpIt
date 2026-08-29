import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { exigerAdmin } from '@/lib/roles';
import { PeriodeSelecteur } from './PeriodeSelecteur';
import { SyncButton } from './SyncButton';
import { VentesClient } from './VentesClient';
import type { PopUpLite, ProfilLite, VenteSumupLigneLite, VenteSumupLite } from './VentesClient';

type PeriodePreset = 'jour' | 'semaine' | 'mois' | 'personnalise';

function debutDeJournee(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function finDeJournee(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Semaine ISO (lundi -> dimanche), même convention que FinanceEcran.tsx (weekStartsOn: 1).
function debutDeSemaine(d: Date): Date {
  const x = debutDeJournee(d);
  const jour = x.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  x.setDate(x.getDate() + decalage);
  return x;
}

function finDeSemaine(d: Date): Date {
  const x = debutDeSemaine(d);
  x.setDate(x.getDate() + 6);
  return finDeJournee(x);
}

function debutDeMois(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function finDeMois(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function calculerPeriode(preset: PeriodePreset, debutPerso: string, finPerso: string): { debut: Date; fin: Date } {
  const maintenant = new Date();
  if (preset === 'jour') return { debut: debutDeJournee(maintenant), fin: finDeJournee(maintenant) };
  if (preset === 'mois') return { debut: debutDeMois(maintenant), fin: finDeMois(maintenant) };
  if (preset === 'personnalise') {
    return { debut: new Date(`${debutPerso}T00:00:00`), fin: new Date(`${finPerso}T23:59:59`) };
  }
  return { debut: debutDeSemaine(maintenant), fin: finDeSemaine(maintenant) };
}

function formatDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Réplique de l'écran Finance de l'app Pimp It (App PIMP IT/src/components/finance/
 * FinanceEcran.tsx) côté Hub : mêmes KPI, mêmes filtres, mêmes calculs, à partir des mêmes tables
 * Supabase (ventes_sumup / ventes_sumup_lignes). La période vit dans les search params (?periode=,
 * ?debut=, ?fin=) pour que ce Server Component refasse la requête avec la bonne fenêtre de dates à
 * chaque changement (cf. PeriodeSelecteur.tsx) — les filtres pop-up/salarié, eux, ne changent pas
 * la fenêtre de données donc restent en state client (cf. VentesClient.tsx), comme dans l'écran
 * d'origine. La synchro SumUp (bouton "Actualiser") est un Server Action déclenché uniquement au
 * clic, jamais au chargement de la page (cf. actions.ts / SyncButton.tsx) : c'est la seule
 * déviation volontaire par rapport à la version RN, qui synchronise aussi à l'ouverture de l'écran.
 * Réservée aux admins (cf. lib/roles.ts) : chiffre d'affaires, pas pour le rôle "local".
 */
export default async function VentesPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; debut?: string; fin?: string }>;
}) {
  await exigerAdmin();
  const params = await searchParams;
  const aujourdhui = formatDateInput(new Date());
  const periode: PeriodePreset =
    params.periode === 'jour' || params.periode === 'mois' || params.periode === 'personnalise'
      ? params.periode
      : 'semaine';
  const debutPerso = params.debut ?? aujourdhui;
  const finPerso = params.fin ?? aujourdhui;

  const { debut, fin } = calculerPeriode(periode, debutPerso, finPerso);

  const supabase = await creerClientSupabaseServeur();
  const [{ data: ventes, error: erreurVentes }, { data: lignes }, { data: popUps }, { data: profils }] = await Promise.all([
    supabase
      .from('ventes_sumup')
      .select('id, pop_up_id, profile_id, montant, frais_montant, pourboire_montant, statut, horodatage')
      .gte('horodatage', debut.toISOString())
      .lte('horodatage', fin.toISOString())
      .order('horodatage', { ascending: false }),
    supabase
      .from('ventes_sumup_lignes')
      .select('id, vente_id, nom_produit, quantite')
      .gte('horodatage', debut.toISOString())
      .lte('horodatage', fin.toISOString()),
    supabase.from('pop_ups').select('id, nom, couleur').eq('actif', true).order('nom'),
    supabase.from('profiles').select('id, nom_complet, email, couleur').eq('actif', true).order('nom_complet'),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Ventes</h1>
      <p className="mb-6 text-sm text-slate-400">
        Ventes SumUp synchronisées — même source que l&apos;écran Finance de l&apos;app Pimp It.
      </p>

      <SyncButton />

      <PeriodeSelecteur periode={periode} debut={debutPerso} fin={finPerso} />

      {erreurVentes ? (
        <p className="mt-6 text-sm text-red-600">Erreur de chargement des ventes : {erreurVentes.message}</p>
      ) : (
        <VentesClient
          ventes={(ventes ?? []) as VenteSumupLite[]}
          lignes={(lignes ?? []) as VenteSumupLigneLite[]}
          popUps={(popUps ?? []) as PopUpLite[]}
          profils={(profils ?? []) as ProfilLite[]}
        />
      )}
    </div>
  );
}
