'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { synchroniserVentes } from './actions';

interface ResultatSynchro {
  transactions_vues: number;
  nouvelles_ou_modifiees: number;
  plafond_details_atteint: boolean;
}

/** Bouton "Actualiser" — déclenche la synchro SumUp à la demande (cf. actions.ts pour pourquoi ce
 * n'est pas automatique comme dans l'app RN), puis rafraîchit les données de la page (le Server
 * Component ventes/page.tsx) via router.refresh() une fois la synchro terminée. */
export function SyncButton() {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [resultat, setResultat] = useState<ResultatSynchro | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function lancer() {
    setErreur(null);
    demarrer(async () => {
      try {
        const r = await synchroniserVentes();
        setResultat(r);
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="flex-1 text-xs text-slate-400">
        {enCours
          ? 'Synchronisation en cours...'
          : erreur
            ? `Échec de la synchro : ${erreur}`
            : resultat
              ? `Dernière synchro : ${resultat.transactions_vues} vente(s) vue(s), ${resultat.nouvelles_ou_modifiees} nouvelle(s)/modifiée(s)${
                  resultat.plafond_details_atteint
                    ? ' — encore des détails à rattraper, cliquez « Actualiser » à nouveau'
                    : ''
                }`
              : 'Cliquez « Actualiser » pour récupérer les dernières ventes SumUp.'}
      </p>
      <button
        onClick={lancer}
        disabled={enCours}
        className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {enCours ? '...' : 'Actualiser'}
      </button>
    </div>
  );
}
