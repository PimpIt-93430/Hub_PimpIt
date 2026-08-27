'use client';

import { useState, useTransition } from 'react';

import { basculerTacheQuotidienne, creerTacheQuotidienne, retirerTacheQuotidienne, type TacheQuotidienne } from './taches-quotidiennes-actions';

/** Checklist quotidienne (cf. discussion 2026-08-27 : pas un calcul automatique — une vraie liste
 * de tâches récurrentes fixes, cochée à la main chaque jour, qui se réinitialise le lendemain). */
export function TachesQuotidiennesCard({ tachesInitiales }: { tachesInitiales: TacheQuotidienne[] }) {
  const [taches, setTaches] = useState(tachesInitiales);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [nouveauLibelle, setNouveauLibelle] = useState('');
  const [, demarrer] = useTransition();

  const basculer = (id: string) => {
    setTaches((ts) => ts.map((t) => (t.id === id ? { ...t, valideAujourdhui: !t.valideAujourdhui } : t)));
    const tache = taches.find((t) => t.id === id);
    demarrer(async () => {
      try {
        await basculerTacheQuotidienne(id, !tache?.valideAujourdhui);
      } catch {
        // en cas d'échec (droits...), on resynchronise l'affichage sur l'état d'avant
        setTaches((ts) => ts.map((t) => (t.id === id ? { ...t, valideAujourdhui: tache?.valideAujourdhui ?? false } : t)));
      }
    });
  };

  const retirer = (id: string) => {
    setTaches((ts) => ts.filter((t) => t.id !== id));
    demarrer(() => retirerTacheQuotidienne(id));
  };

  const ajouter = () => {
    const libelle = nouveauLibelle.trim();
    if (!libelle) return;
    setNouveauLibelle('');
    setAjoutOuvert(false);
    demarrer(async () => {
      await creerTacheQuotidienne(libelle);
      setTaches((ts) => [...ts, { id: `temp-${Date.now()}`, libelle, valideAujourdhui: false }]);
    });
  };

  const nbFaites = taches.filter((t) => t.valideAujourdhui).length;

  return (
    <>
      <div className="mb-1 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm text-indigo-600">📋</span>
        <h2 className="text-sm font-bold text-slate-900">Tâches quotidiennes</h2>
        <span className="ml-auto text-xs font-semibold text-slate-400">
          {nbFaites}/{taches.length}
        </span>
      </div>

      <div className="mt-4 flex-1">
        {taches.length === 0 ? (
          <p className="flex h-full items-center justify-center text-center text-sm text-slate-400">Aucune tâche pour l&apos;instant</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {taches.map((t) => (
              <li key={t.id} className="group flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50">
                <button
                  onClick={() => basculer(t.id)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    t.valideAujourdhui ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {t.valideAujourdhui && <span className="text-[10px] font-bold text-white">✓</span>}
                </button>
                <button
                  onClick={() => basculer(t.id)}
                  className={`flex-1 text-left text-sm ${t.valideAujourdhui ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                >
                  {t.libelle}
                </button>
                <button
                  onClick={() => retirer(t.id)}
                  className="shrink-0 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                  title="Retirer"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ajoutOuvert ? (
        <div className="mt-2 flex gap-1.5">
          <input
            autoFocus
            value={nouveauLibelle}
            onChange={(e) => setNouveauLibelle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ajouter();
              if (e.key === 'Escape') setAjoutOuvert(false);
            }}
            placeholder="Nouvelle tâche…"
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <button onClick={ajouter} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">
            Ajouter
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAjoutOuvert(true)}
          className="mt-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-400 hover:text-indigo-600"
        >
          + Ajouter une tâche
        </button>
      )}
    </>
  );
}
