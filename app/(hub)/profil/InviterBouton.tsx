'use client';

import { useState } from 'react';

import { NouvelEmployeModal } from '../equipe/NouvelEmployeModal';

/** Réutilise la modale d'invitation existante de l'écran Équipe (mêmes Edge Function/action
 * serveur `creerEmploye`, cf. app/(hub)/equipe/actions.ts) — pas de logique dupliquée ici. */
export function InviterBouton() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <button
        onClick={() => setOuvert(true)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="text-sm font-medium text-slate-800">Inviter une personne</span>
        <span className="text-slate-300">›</span>
      </button>
      {ouvert && <NouvelEmployeModal onClose={() => setOuvert(false)} />}
    </>
  );
}
