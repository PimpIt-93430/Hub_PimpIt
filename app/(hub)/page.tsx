import { atGet, TABLES } from '@/lib/airtable';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

function Carte({ titre, valeur, sousTitre }: { titre: string; valeur: string; sousTitre?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titre}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{valeur}</p>
      {sousTitre && <p className="mt-1 text-xs text-slate-400">{sousTitre}</p>}
    </div>
  );
}

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

interface PinFields {
  Name?: string;
  Stock?: number;
  'Seuil cible'?: number;
}

export default async function DashboardPage() {
  const supabase = await creerClientSupabaseServeur();
  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);

  const [{ data: ventesSumup }, { data: ventesEspeces }, { data: shiftsAujourdhui }, pins] = await Promise.all([
    supabase.from('ventes_sumup').select('montant, statut').gte('horodatage', debutJour.toISOString()),
    supabase.from('ventes_especes').select('montant, statut').gte('created_at', debutJour.toISOString()),
    supabase
      .from('planning_shifts')
      .select('id')
      .eq('date', debutJour.toISOString().slice(0, 10)),
    atGet<PinFields>(TABLES.PINS, { fields: ['Name', 'Stock', 'Seuil cible'] }).catch(() => null),
  ]);

  const caCarte = (ventesSumup ?? [])
    .filter((v) => v.statut === 'SUCCESSFUL')
    .reduce((s, v) => s + v.montant, 0);
  const caEspeces = (ventesEspeces ?? [])
    .filter((v) => v.statut === 'confirmee')
    .reduce((s, v) => s + v.montant, 0);

  const pinsSousLeSeuil = pins
    ? pins.filter((p) => (p.fields.Stock ?? 0) < (p.fields['Seuil cible'] ?? 0)).length
    : null;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Tableau de bord</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Carte titre="CA carte aujourd'hui" valeur={formatMontant(caCarte)} />
        <Carte titre="Espèces aujourd'hui" valeur={formatMontant(caEspeces)} />
        <Carte titre="Créneaux planifiés aujourd'hui" valeur={String(shiftsAujourdhui?.length ?? 0)} />
        <Carte
          titre="Pin's sous le seuil cible"
          valeur={pinsSousLeSeuil !== null ? String(pinsSousLeSeuil) : '—'}
          sousTitre={pinsSousLeSeuil === null ? 'Airtable indisponible' : 'Depuis Airtable'}
        />
      </div>

      <p className="mt-8 text-xs text-slate-400">
        Première itération : lecture seule sur Shopify/Airtable, lecture Supabase via ton compte
        connecté (mêmes droits que sur l'app). La création/modification arrive dans une itération
        suivante.
      </p>
    </div>
  );
}
