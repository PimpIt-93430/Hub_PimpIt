import { debutMoisFrance, finMoisFrance } from '@/lib/dateFrance';
import { exigerAdmin } from '@/lib/roles';
import { paginerToutesLesLignes } from '@/lib/supabase/pagination';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { chargerLignesFinance, chargerParametresFinance } from './actions';
import { ChargesRecettesClient } from './ChargesRecettesClient';

/** Charges & recettes (retour utilisateur du 2026-11-03 : "je vais remplir toutes mes charges fixes
 * par mois pour voir combien je dois faire de CA pour être flat") — saisie des charges fixes (et
 * recettes fixes hors ventes), CA à faire pour être à l'équilibre, comparé au CA réellement fait
 * sur les pop-ups (SumUp + espèces appli) pour le mois choisi (?mois=YYYY-MM). Admins uniquement. */
export default async function ChargesRecettesPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  await exigerAdmin();
  const params = await searchParams;

  const maintenant = new Date();
  const moisCourant = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;
  const mois = params.mois && /^\d{4}-\d{2}$/.test(params.mois) && params.mois <= moisCourant ? params.mois : moisCourant;
  // Milieu du mois à midi UTC : toujours dans le bon mois en heure de Paris.
  const reference = new Date(`${mois}-15T12:00:00Z`);
  const debut = debutMoisFrance(reference);
  const fin = finMoisFrance(reference);

  const supabase = await creerClientSupabaseServeur();
  const [lignes, parametres, ventesSumup, ventesEspeces] = await Promise.all([
    chargerLignesFinance(),
    chargerParametresFinance(),
    paginerToutesLesLignes<{ montant: number }>((a, b) =>
      supabase
        .from('ventes_sumup')
        .select('montant')
        .eq('statut', 'SUCCESSFUL')
        .gte('horodatage', debut.toISOString())
        .lte('horodatage', fin.toISOString())
        .order('id')
        .range(a, b),
    ),
    paginerToutesLesLignes<{ montant: number }>((a, b) =>
      supabase
        .from('ventes_especes')
        .select('montant')
        .eq('statut', 'confirmee')
        .gte('created_at', debut.toISOString())
        .lte('created_at', fin.toISOString())
        .order('id')
        .range(a, b),
    ),
  ]);

  const caRealise =
    ventesSumup.reduce((s, v) => s + Number(v.montant), 0) + ventesEspeces.reduce((s, v) => s + Number(v.montant), 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Charges & recettes</h1>
      <p className="mb-6 text-sm text-slate-400">
        Tes charges fixes et le CA à faire chaque mois pour être à l&apos;équilibre.
      </p>
      <ChargesRecettesClient
        mois={mois}
        moisCourant={moisCourant}
        lignes={lignes}
        parametres={parametres}
        caRealise={caRealise}
      />
    </div>
  );
}
