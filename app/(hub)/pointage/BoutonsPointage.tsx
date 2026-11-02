'use client';

import { useTransition } from 'react';

import { regenererCodePointage } from './actions';

export function BoutonImprimer() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
    >
      Imprimer les QR codes
    </button>
  );
}

export function BoutonRegenerer({ popUpId, nom }: { popUpId: string; nom: string }) {
  const [enCours, demarrer] = useTransition();
  return (
    <button
      disabled={enCours}
      onClick={() => {
        if (!window.confirm(`Nouveau QR code pour ${nom} ? L'ancien ne marchera plus, il faudra réimprimer.`)) return;
        demarrer(() => regenererCodePointage(popUpId));
      }}
      className="text-xs font-semibold text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
    >
      {enCours ? 'Génération…' : 'Nouveau QR code'}
    </button>
  );
}
