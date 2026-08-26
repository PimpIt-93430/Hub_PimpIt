'use client';

import { useEffect, useState } from 'react';

import { chargerCommandesTerminees } from './actions';
import { PanneauDetailCommandeHistorique } from './PanneauDetailCommandeHistorique';
import type { CommandeHistoriqueResume } from './stockLib';

export function HistoriqueTab({ popUpId }: { popUpId: string }) {
  const [commandes, setCommandes] = useState<CommandeHistoriqueResume[] | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);

  useEffect(() => {
    setCommandes(null);
    chargerCommandesTerminees(popUpId).then(setCommandes);
  }, [popUpId]);

  return (
    <div className="mx-auto w-full max-w-[960px]">
      {commandes === null ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : commandes.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune commande pour l&apos;instant sur ce pop-up.</p>
      ) : (
        commandes.map(({ commande, nbPins }) => (
          <button
            key={commande.id}
            onClick={() => setOuverte(commande.id)}
            className="mb-2.5 flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm"
          >
            <div>
              <p className="text-sm font-semibold capitalize text-slate-800">
                {new Date(commande.envoyee_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {nbPins} pin{nbPins > 1 ? 's' : ''} commandé{nbPins > 1 ? 's' : ''}
              </p>
            </div>
            <span className="text-lg text-indigo-400">›</span>
          </button>
        ))
      )}

      {ouverte && <PanneauDetailCommandeHistorique commandeId={ouverte} onFermer={() => setOuverte(null)} />}
    </div>
  );
}
