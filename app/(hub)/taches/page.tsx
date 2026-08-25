import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface HubTache {
  airtable_id: string;
  titre: string | null;
  assigne_a: string | null;
  priorite: string | null;
  statut: string | null;
  date_limite: string | null;
  notes: string | null;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function tronquer(texte: string | null | undefined, max: number): string {
  if (!texte) return '—';
  return texte.length > max ? `${texte.slice(0, max)}…` : texte;
}

function badgePriorite(priorite?: string | null): string {
  const p = (priorite ?? '').toLowerCase();
  if (p.includes('haut') || p.includes('urgent')) return 'bg-red-50 text-red-700';
  if (p.includes('moy')) return 'bg-amber-50 text-amber-700';
  if (p.includes('bas')) return 'bg-slate-100 text-slate-600';
  return 'bg-slate-100 text-slate-600';
}

function badgeStatut(statut?: string | null): string {
  const s = (statut ?? '').toLowerCase();
  if (s.includes('termin') || s.includes('fait')) return 'bg-emerald-50 text-emerald-700';
  if (s.includes('cours')) return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

/** Lit le miroir Supabase (hub_taches), synchronisé depuis Airtable T_TACHES — plus d'appel direct
 * à Airtable ici (cf. script de synchronisation dans Pimp It Hub/scripts). */
export default async function TachesPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase
    .from('hub_taches')
    .select('*')
    .order('date_limite', { ascending: true, nullsFirst: false });
  const taches = (data ?? []) as HubTache[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Tâches</h1>
      <p className="mb-6 text-sm text-slate-400">
        {taches.length} tâches — depuis Supabase (synchronisé depuis Airtable).
      </p>

      <div className="flex flex-col gap-2">
        {taches.map((t) => (
          <div
            key={t.airtable_id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">{t.titre || 'Sans titre'}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {t.assigne_a ? `${t.assigne_a} · ` : ''}
                Échéance : {formatDate(t.date_limite)}
                {t.notes ? ` · ${tronquer(t.notes, 80)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {t.priorite && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgePriorite(t.priorite)}`}>
                  {t.priorite}
                </span>
              )}
              {t.statut && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeStatut(t.statut)}`}>
                  {t.statut}
                </span>
              )}
            </div>
          </div>
        ))}
        {taches.length === 0 && <p className="text-sm text-slate-400">Aucune tâche.</p>}
      </div>
    </div>
  );
}
