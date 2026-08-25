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

interface VentePopUp {
  id: string;
  nom: string;
  couleur: string | null;
  caCarte: number;
  caEspeces: number;
  total: number;
}

/** Lecture seule — vue de reporting sur les ventes du mois en cours, depuis Supabase
 * (mêmes droits RLS que le compte admin connecté sur l'app). Rien n'est créé/modifié ici. */
export default async function VentesPage() {
  const supabase = await creerClientSupabaseServeur();

  const debutMois = new Date();
  debutMois.setDate(1);
  debutMois.setHours(0, 0, 0, 0);

  const [{ data: ventesSumup }, { data: ventesEspeces }, { data: popUps }] = await Promise.all([
    supabase
      .from('ventes_sumup')
      .select('montant, statut, pop_up_id')
      .gte('horodatage', debutMois.toISOString()),
    supabase
      .from('ventes_especes')
      .select('montant, statut, pop_up_id')
      .gte('created_at', debutMois.toISOString()),
    supabase.from('pop_ups').select('id, nom, couleur'),
  ]);

  const ventesSumupReussies = (ventesSumup ?? []).filter((v) => v.statut === 'SUCCESSFUL');
  const ventesEspecesConfirmees = (ventesEspeces ?? []).filter((v) => v.statut === 'confirmee');

  const caCarte = ventesSumupReussies.reduce((s, v) => s + v.montant, 0);
  const caEspeces = ventesEspecesConfirmees.reduce((s, v) => s + v.montant, 0);
  const caTotal = caCarte + caEspeces;

  const ventilationParPopUp: VentePopUp[] = (popUps ?? [])
    .map((p) => {
      const caCartePopUp = ventesSumupReussies
        .filter((v) => v.pop_up_id === p.id)
        .reduce((s, v) => s + v.montant, 0);
      const caEspecesPopUp = ventesEspecesConfirmees
        .filter((v) => v.pop_up_id === p.id)
        .reduce((s, v) => s + v.montant, 0);
      return {
        id: p.id,
        nom: p.nom,
        couleur: p.couleur,
        caCarte: caCartePopUp,
        caEspeces: caEspecesPopUp,
        total: caCartePopUp + caEspecesPopUp,
      };
    })
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Ventes</h1>
      <p className="mb-6 text-sm text-slate-400">
        Ce mois-ci — depuis Supabase, même compte que l&apos;app Pimp It.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Carte titre="CA carte (mois)" valeur={formatMontant(caCarte)} />
        <Carte titre="Espèces (mois)" valeur={formatMontant(caEspeces)} />
        <Carte titre="CA total (mois)" valeur={formatMontant(caTotal)} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Par pop-up
      </h2>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Pop-up</th>
              <th className="px-4 py-3 text-right">CA carte</th>
              <th className="px-4 py-3 text-right">Espèces</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {ventilationParPopUp.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: p.couleur ?? '#cbd5e1' }}
                    />
                    {p.nom}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">{formatMontant(p.caCarte)}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{formatMontant(p.caEspeces)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                  {formatMontant(p.total)}
                </td>
              </tr>
            ))}
            {ventilationParPopUp.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                  Aucune vente ce mois-ci.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
