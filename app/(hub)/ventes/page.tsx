import {
  dateDuJourFrance,
  debutJourFrance,
  debutJourIsoFrance,
  debutMoisFrance,
  debutSemaineFrance,
  finJourFrance,
  finJourIsoFrance,
  finMoisFrance,
  finSemaineFrance,
} from '@/lib/dateFrance';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { exigerAdmin } from '@/lib/roles';
import { paginerToutesLesLignes } from '@/lib/supabase/pagination';
import { PeriodeSelecteur } from './PeriodeSelecteur';
import { SyncButton } from './SyncButton';
import { VentesClient } from './VentesClient';
import type { PopUpLite, ProfilLite, VenteSumupLigneLite, VenteSumupLite } from './VentesClient';
import { PerformanceClient } from './PerformanceClient';
import type { ProfilAvecContrat, ShiftLite } from './PerformanceClient';

type PeriodePreset = 'jour' | 'semaine' | 'mois' | 'debut_mois' | 'personnalise';

// Cf. lib/dateFrance.ts — jamais `new Date(); setHours(...)`/`.toISOString().slice(0, 10)`, qui
// utilisent le fuseau du serveur (UTC sur Railway) au lieu de celui de la France (incident du
// 2026-09-15 sur le tableau de bord : "aujourd'hui" démarrait 1-2h trop tard, ventes du tout début
// de journée exclues en silence — même calcul ici, mêmes chiffres, même bug).
function calculerPeriode(preset: PeriodePreset, debutPerso: string, finPerso: string): { debut: Date; fin: Date } {
  if (preset === 'jour') return { debut: debutJourFrance(), fin: finJourFrance() };
  if (preset === 'mois') return { debut: debutMoisFrance(), fin: finMoisFrance() };
  // "Début de mois" = mois en cours jusqu'à aujourd'hui (month-to-date) — distinct de "Ce mois",
  // qui couvre tout le mois calendaire (dates futures comprises, vide en fin de période sinon).
  if (preset === 'debut_mois') return { debut: debutMoisFrance(), fin: finJourFrance() };
  if (preset === 'personnalise') {
    return { debut: debutJourIsoFrance(debutPerso), fin: finJourIsoFrance(finPerso) };
  }
  return { debut: debutSemaineFrance(), fin: finSemaineFrance() };
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
  const aujourdhui = dateDuJourFrance();
  const periode: PeriodePreset =
    params.periode === 'jour' || params.periode === 'mois' || params.periode === 'debut_mois' || params.periode === 'personnalise'
      ? params.periode
      : 'semaine';
  const debutPerso = params.debut ?? aujourdhui;
  const finPerso = params.fin ?? aujourdhui;

  const { debut, fin } = calculerPeriode(periode, debutPerso, finPerso);

  const supabase = await creerClientSupabaseServeur();
  // Paginé (cf. lib/supabase/pagination.ts) : PostgREST plafonne .select() à 1000 lignes par défaut
  // sans erreur — incident du 2026-09-15 où une période "mois"/personnalisée dépassant ce volume
  // (ventes_sumup_lignes en particulier, plusieurs lignes par vente) tronquait en silence les
  // ventes les plus anciennes de la période, faussant le chiffre d'affaires affiché à la baisse.
  const [ventes, lignes, { data: popUps }, { data: profils }, { data: shifts }] = await Promise.all([
    paginerToutesLesLignes<VenteSumupLite>((debutLigne, finLigne) =>
      supabase
        .from('ventes_sumup')
        .select('id, pop_up_id, profile_id, montant, frais_montant, pourboire_montant, statut, horodatage')
        .gte('horodatage', debut.toISOString())
        .lte('horodatage', fin.toISOString())
        .order('horodatage', { ascending: false })
        .range(debutLigne, finLigne),
    ),
    paginerToutesLesLignes<VenteSumupLigneLite>((debutLigne, finLigne) =>
      supabase
        .from('ventes_sumup_lignes')
        .select('id, vente_id, nom_produit, quantite')
        .gte('horodatage', debut.toISOString())
        .lte('horodatage', fin.toISOString())
        .range(debutLigne, finLigne),
    ),
    supabase.from('pop_ups').select('id, nom, couleur').eq('actif', true).order('nom'),
    supabase
      .from('profiles')
      .select('id, nom_complet, email, couleur, type_contrat')
      .eq('actif', true)
      .order('nom_complet'),
    // Bornes en date locale France (dateDuJourFrance), pas horodatage : planning_shifts.date est
    // une date "murale" du point de vente, sans notion de fuseau — cf. kpiLib.ts pour le
    // rattachement heure par heure de chaque vente à son créneau.
    supabase
      .from('planning_shifts')
      .select('id, profile_id, pop_up_id, date, heure_debut, heure_fin, pause_debut, pause_fin')
      .gte('date', dateDuJourFrance(debut))
      .lte('date', dateDuJourFrance(fin)),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Ventes</h1>
      <p className="mb-6 text-sm text-slate-400">
        Ventes SumUp synchronisées — même source que l&apos;écran Finance de l&apos;app Pimp It.
      </p>

      <SyncButton />

      <PeriodeSelecteur periode={periode} debut={debutPerso} fin={finPerso} />

      <PerformanceClient
        ventes={ventes}
        lignes={lignes}
        shifts={(shifts ?? []) as ShiftLite[]}
        popUps={(popUps ?? []) as PopUpLite[]}
        profils={(profils ?? []) as ProfilAvecContrat[]}
        periode={periode}
      />
      <VentesClient
        ventes={ventes}
        lignes={lignes}
        popUps={(popUps ?? []) as PopUpLite[]}
        profils={(profils ?? []) as ProfilLite[]}
      />
    </div>
  );
}
