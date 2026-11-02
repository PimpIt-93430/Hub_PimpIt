'use client';

import { useTransition } from 'react';

import { definirPointageActif, regenererCodePointage } from './actions';

/** Case "faire pointer ce pop-up" (migration 0132) — décochée = pas de bouton Pointer dans l'appli
 * pour ce pop-up, QR refusé, chiffres du jour non bloqués pour les alternants. */
export function CaseActiverPointage({ popUpId, actif }: { popUpId: string; actif: boolean }) {
  const [enCours, demarrer] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
      <input
        type="checkbox"
        checked={actif}
        disabled={enCours}
        onChange={(e) => {
          const valeur = e.target.checked;
          demarrer(() => definirPointageActif(popUpId, valeur));
        }}
        className="h-4 w-4 accent-indigo-600"
      />
      {enCours ? 'Enregistrement…' : 'Faire pointer ce pop-up'}
    </label>
  );
}

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
