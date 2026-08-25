'use client';

import { useState, useTransition } from 'react';

import { modifierRecommandation, supprimerRecommandation } from './actions';

interface HubReco {
  airtable_id: string;
  auteur: string | null;
  message: string | null;
  categorie: string | null;
}

const champ = 'w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none';

export function RecommandationRow({ reco }: { reco: HubReco }) {
  const [edition, setEdition] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function supprimer() {
    if (!confirm(`Supprimer la recommandation de « ${reco.auteur ?? 'Anonyme'} » ?`)) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await supprimerRecommandation(reco.airtable_id);
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
                await modifierRecommandation(reco.airtable_id, formData);
                setEdition(false);
              } catch (e) {
                setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
              }
            });
          }}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-center"
        >
          <input name="auteur" defaultValue={reco.auteur ?? ''} placeholder="Auteur" className={champ} />
          <input
            name="categorie"
            defaultValue={reco.categorie ?? ''}
            placeholder="Catégorie"
            className={champ}
          />
          <textarea
            name="message"
            defaultValue={reco.message ?? ''}
            placeholder="Message"
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
    <div className="group rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">{reco.auteur || 'Anonyme'}</p>
        <div className="flex items-center gap-2">
          {reco.categorie && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {reco.categorie}
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
      <p className="mt-1.5 text-sm text-slate-500">{reco.message || '—'}</p>
    </div>
  );
}
