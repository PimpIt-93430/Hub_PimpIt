import { atGet, TABLES } from '@/lib/airtable';

interface TacheFields {
  Titre?: string;
  'Assigné à'?: string;
  Priorité?: string;
  Statut?: string;
  'Date limite'?: string;
  Notes?: string;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function tronquer(texte: string | undefined, max: number): string {
  if (!texte) return '—';
  return texte.length > max ? `${texte.slice(0, max)}…` : texte;
}

function badgePriorite(priorite?: string): string {
  const p = (priorite ?? '').toLowerCase();
  if (p.includes('haut') || p.includes('urgent')) return 'bg-red-50 text-red-700';
  if (p.includes('moy')) return 'bg-amber-50 text-amber-700';
  if (p.includes('bas')) return 'bg-slate-100 text-slate-600';
  return 'bg-slate-100 text-slate-600';
}

function badgeStatut(statut?: string): string {
  const s = (statut ?? '').toLowerCase();
  if (s.includes('termin') || s.includes('fait')) return 'bg-emerald-50 text-emerald-700';
  if (s.includes('cours')) return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

/** Lecture seule pour l'instant (cf. plan) — même table Airtable que Shopify Pimp IT/admin
 * (T_TACHES), rien n'est créé/modifié ici. */
export default async function TachesPage() {
  const taches = await atGet<TacheFields>(TABLES.TACHES, {
    fields: ['Titre', 'Assigné à', 'Priorité', 'Statut', 'Date limite', 'Notes'],
  });

  const triees = [...taches].sort((a, b) => {
    const da = a.fields['Date limite'] ? new Date(a.fields['Date limite']).getTime() : NaN;
    const db = b.fields['Date limite'] ? new Date(b.fields['Date limite']).getTime() : NaN;
    if (Number.isNaN(da) && Number.isNaN(db)) return 0;
    if (Number.isNaN(da)) return 1;
    if (Number.isNaN(db)) return -1;
    return da - db;
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Tâches</h1>
      <p className="mb-6 text-sm text-slate-400">
        {taches.length} tâches — depuis Airtable, lecture seule pour l&apos;instant.
      </p>

      <div className="flex flex-col gap-2">
        {triees.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">{t.fields.Titre || 'Sans titre'}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {t.fields['Assigné à'] ? `${t.fields['Assigné à']} · ` : ''}
                Échéance : {formatDate(t.fields['Date limite'])}
                {t.fields.Notes ? ` · ${tronquer(t.fields.Notes, 80)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {t.fields.Priorité && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgePriorite(t.fields.Priorité)}`}>
                  {t.fields.Priorité}
                </span>
              )}
              {t.fields.Statut && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeStatut(t.fields.Statut)}`}>
                  {t.fields.Statut}
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
