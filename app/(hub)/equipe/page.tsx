import { creerClientSupabaseServeur } from '@/lib/supabase/server';

type Role = 'admin' | 'employe';
type TypeContrat = 'manager' | 'employe' | 'alternant';

interface ProfilEquipe {
  id: string;
  nom_complet: string;
  email: string;
  role: Role;
  type_contrat: TypeContrat;
  couleur: string;
  heures_max_semaine: number | null;
  actif: boolean;
}

interface InfoRhEquipe {
  profile_id: string;
  date_debut_contrat: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function BadgeType({ role, typeContrat }: { role: Role; typeContrat: TypeContrat }) {
  if (role === 'admin') {
    return (
      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">Admin</span>
    );
  }
  if (typeContrat === 'manager') {
    return <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Manager</span>;
  }
  if (typeContrat === 'alternant') {
    return (
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Alternant</span>
    );
  }
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Employé</span>;
}

function BadgeActif({ actif }: { actif: boolean }) {
  return actif ? (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Actif</span>
  ) : (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Inactif</span>
  );
}

/** Lecture seule pour l'instant (cf. plan) — mêmes données que l'app Pimp It, via la session
 * connectée de l'admin (RLS existante, pas de clé service role). Ne sélectionne/affiche aucun
 * champ sensible d'informations_rh (IBAN/BIC/numéro sécu/médical/adresse) : seulement
 * date_debut_contrat, en best-effort, avec repli sur profiles seul si la jointure échoue. */
export default async function EquipePage() {
  const supabase = await creerClientSupabaseServeur();

  const { data: profils } = await supabase
    .from('profiles')
    .select('id, nom_complet, email, role, type_contrat, couleur, heures_max_semaine, actif')
    .eq('actif', true)
    .order('nom_complet', { ascending: true });

  const liste = (profils ?? []) as ProfilEquipe[];

  let datesDebut: Map<string, string | null> | null = null;
  if (liste.length > 0) {
    const { data: infosRh, error } = await supabase
      .from('informations_rh')
      .select('profile_id, date_debut_contrat')
      .in(
        'profile_id',
        liste.map((p) => p.id),
      );

    if (!error && infosRh) {
      datesDebut = new Map((infosRh as InfoRhEquipe[]).map((i) => [i.profile_id, i.date_debut_contrat]));
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Équipe</h1>
      <p className="mb-6 text-sm text-slate-400">
        {liste.length} personnes — depuis Supabase — même compte que l&apos;app Pimp It.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Nom complet</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Heures/semaine</th>
              <th className="px-4 py-3">Statut</th>
              {datesDebut && <th className="px-4 py-3">Début de contrat</th>}
            </tr>
          </thead>
          <tbody>
            {liste.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.couleur }} />
                    <span className="font-semibold text-slate-800">{p.nom_complet}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{p.email}</td>
                <td className="px-4 py-2.5">
                  <BadgeType role={p.role} typeContrat={p.type_contrat} />
                </td>
                <td className="px-4 py-2.5 text-right text-slate-500">
                  {p.heures_max_semaine !== null ? p.heures_max_semaine : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <BadgeActif actif={p.actif} />
                </td>
                {datesDebut && (
                  <td className="px-4 py-2.5 text-slate-500">
                    {(() => {
                      const d = datesDebut.get(p.id);
                      return d ? formatDate(d) : '—';
                    })()}
                  </td>
                )}
              </tr>
            ))}
            {liste.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-slate-400" colSpan={datesDebut ? 6 : 5}>
                  Aucune personne active.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
