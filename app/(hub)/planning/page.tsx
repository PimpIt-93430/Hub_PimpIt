import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface Shift {
  id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  profil: { nom_complet: string | null; couleur: string | null } | null;
  pop_up: { nom: string | null; couleur: string | null } | null;
}

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formate une date locale en YYYY-MM-DD sans passer par toISOString (qui convertirait en UTC et
 * pourrait décaler le jour selon le fuseau du serveur). */
function formatISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Lundi de la semaine contenant `d` (dimanche = 0 en JS, donc traité à part). */
function lundiDeLaSemaine(d: Date): Date {
  const jour = d.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  const lundi = new Date(d.getFullYear(), d.getMonth(), d.getDate() + decalage);
  return lundi;
}

function formatDateLongue(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

function heureCourte(heure: string): string {
  return heure.slice(0, 5);
}

/** Lecture seule — depuis Supabase, même compte que l'app Pimp It (RLS existante). */
export default async function PlanningPage() {
  const supabase = await creerClientSupabaseServeur();

  const lundi = lundiDeLaSemaine(new Date());
  const jours = Array.from({ length: 7 }, (_, i) => new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + i));
  const dimanche = jours[6];

  const { data } = await supabase
    .from('planning_shifts')
    .select(
      'id, date, heure_debut, heure_fin, profil:profiles!planning_shifts_profile_id_fkey(nom_complet, couleur), pop_up:pop_ups!planning_shifts_pop_up_id_fkey(nom, couleur)',
    )
    .gte('date', formatISO(lundi))
    .lte('date', formatISO(dimanche))
    .order('date', { ascending: true })
    .order('heure_debut', { ascending: true });

  const shifts = (data ?? []) as unknown as Shift[];

  const shiftsParJour = new Map<string, Shift[]>();
  for (const j of jours) {
    shiftsParJour.set(formatISO(j), []);
  }
  for (const s of shifts) {
    const liste = shiftsParJour.get(s.date);
    if (liste) liste.push(s);
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Planning</h1>
      <p className="mb-1 text-sm text-slate-600">
        Semaine du {formatDateLongue(lundi)} au {formatDateLongue(dimanche)}
      </p>
      <p className="mb-6 text-sm text-slate-400">depuis Supabase — même compte que l&apos;app Pimp It</p>

      <div className="flex flex-col gap-6">
        {jours.map((j, i) => {
          const iso = formatISO(j);
          const creneaux = shiftsParJour.get(iso) ?? [];
          return (
            <div key={iso}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {JOURS[i]} {formatDateLongue(j)}
              </h2>
              {creneaux.length === 0 ? (
                <p className="text-sm text-slate-400">Aucun créneau</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {creneaux.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: s.profil?.couleur ?? '#94a3b8' }}
                        />
                        <span className="text-sm font-semibold text-slate-800">
                          {s.profil?.nom_complet ?? 'Employé·e inconnu·e'}
                        </span>
                      </div>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor: `${s.pop_up?.couleur ?? '#94a3b8'}1a`,
                          color: s.pop_up?.couleur ?? '#64748b',
                        }}
                      >
                        {s.pop_up?.nom ?? 'Pop-up inconnu'}
                      </span>
                      <span className="text-sm text-slate-500">
                        {heureCourte(s.heure_debut)}–{heureCourte(s.heure_fin)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
