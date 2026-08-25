'use client';

import { useState, useTransition } from 'react';

import { modifierTache, supprimerTache } from './actions';

interface HubTache {
  airtable_id: string;
  titre: string | null;
  assigne_a: string | null;
  priorite: string | null;
  statut: string | null;
  date_limite: string | null;
  notes: string | null;
}

const champ = 'w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none';

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

export function TacheRow({ tache }: { tache: HubTache }) {
  const [edition, setEdition] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function supprimer() {
    if (!confirm(`Supprimer la tâche « ${tache.titre ?? tache.airtable_id} » ?`)) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await supprimerTache(tache.airtable_id);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  if (edition) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5 shadow-sm">
        <form
          action={(formData) => {
            setErreur(null);
            demarrer(async () => {
              try {
                await modifierTache(tache.airtable_id, formData);
                setEdition(false);
              } catch (e) {
                setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
              }
            });
          }}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-center"
        >
          <input
            name="titre"
            defaultValue={tache.titre ?? ''}
            placeholder="Titre"
            className={`${champ} col-span-2 sm:col-span-2`}
          />
          <input name="assigne_a" defaultValue={tache.assigne_a ?? ''} placeholder="Assigné à" className={champ} />
          <input name="date_limite" type="date" defaultValue={tache.date_limite ?? ''} className={champ} />
          <select name="priorite" defaultValue={tache.priorite ?? ''} className={champ}>
            <option value="">Priorité…</option>
            <option value="🔴 Haute">🔴 Haute</option>
            <option value="🟡 Moyenne">🟡 Moyenne</option>
            <option value="🟢 Basse">🟢 Basse</option>
          </select>
          <select name="statut" defaultValue={tache.statut ?? ''} className={champ}>
            <option value="">Statut…</option>
            <option value="À faire">À faire</option>
            <option value="En cours">En cours</option>
            <option value="Terminé">Terminé</option>
          </select>
          <textarea
            name="notes"
            defaultValue={tache.notes ?? ''}
            placeholder="Notes"
            rows={2}
            className={`${champ} col-span-2 sm:col-span-4`}
          />
          <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
            <button
              type="submit"
              disabled={enCours}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setEdition(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              Annuler
            </button>
            {erreur && <span className="text-xs text-red-600">{erreur}</span>}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-slate-800">{tache.titre || 'Sans titre'}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {tache.assigne_a ? `${tache.assigne_a} · ` : ''}
          Échéance : {formatDate(tache.date_limite)}
          {tache.notes ? ` · ${tronquer(tache.notes, 80)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {tache.priorite && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgePriorite(tache.priorite)}`}>
            {tache.priorite}
          </span>
        )}
        {tache.statut && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeStatut(tache.statut)}`}>
            {tache.statut}
          </span>
        )}
        <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
          <button onClick={() => setEdition(true)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
            Modifier
          </button>
          <button onClick={supprimer} disabled={enCours} className="text-xs font-semibold text-red-500 hover:text-red-700">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
