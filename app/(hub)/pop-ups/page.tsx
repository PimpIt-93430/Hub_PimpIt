import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface PopUp {
  id: string;
  nom: string;
  couleur: string | null;
  actif: boolean;
  est_local: boolean;
  date_debut: string | null;
  date_fin: string | null;
  lat: number | null;
  lon: number | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Lecture seule pour cette page — les pop-ups changent rarement, pas d'UI de création/édition ici
 * (l'écriture Supabase est possible pour le compte propriétaire du projet, mais hors périmètre de
 * cette itération). */
export default async function PopUpsPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data: popUps } = await supabase
    .from('pop_ups')
    .select('id, nom, couleur, actif, est_local, date_debut, date_fin, lat, lon')
    .order('nom', { ascending: true });

  const liste = (popUps ?? []) as PopUp[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Pop-ups</h1>
      <p className="mb-6 text-sm text-slate-400">
        {liste.length} pop-up{liste.length > 1 ? 's' : ''} — depuis Supabase, même compte que l&apos;app
        Pimp It.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Période</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.couleur ?? '#94a3b8' }}
                    />
                    <span className="font-semibold text-slate-800">{p.nom}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      p.actif ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {p.actif ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{p.est_local ? 'Local' : 'Itinérant'}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {p.date_debut
                    ? `Depuis le ${formatDate(p.date_debut)}${p.date_fin ? ` jusqu'au ${formatDate(p.date_fin)}` : ''}`
                    : '—'}
                </td>
              </tr>
            ))}
            {liste.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                  Aucun pop-up.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
