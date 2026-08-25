'use client';

import { useState } from 'react';

import { FicheDetailMembre } from './FicheDetailMembre';
import { NouvelEmployeModal } from './NouvelEmployeModal';
import { AvatarInitiales, BadgeRole } from './ui';
import type { PopUp, Profile, ProfilPopUp } from './types';

export function EquipeClient({
  profils,
  popUps,
  affectations,
}: {
  profils: Profile[];
  popUps: PopUp[];
  affectations: ProfilPopUp[];
}) {
  const [recherche, setRecherche] = useState('');
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [modalOuverte, setModalOuverte] = useState(false);

  const membres = profils.filter((p) => `${p.nom_complet} ${p.email}`.toLowerCase().includes(recherche.toLowerCase()));
  const selection = profils.find((p) => p.id === selectionId) ?? null;

  const lieuxAttribuesDe = (profil: Profile): PopUp[] => {
    const ids = new Set(affectations.filter((a) => a.profile_id === profil.id).map((a) => a.pop_up_id));
    return popUps.filter((p) => ids.has(p.id));
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex flex-col gap-2.5 border-b border-slate-200 p-4">
          <div className="relative">
            <input
              placeholder="Rechercher par nom ou email"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm focus:border-slate-400 focus:outline-none"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
          </div>
          <button
            onClick={() => setModalOuverte(true)}
            className="rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Nouvel employé
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {membres.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectionId(m.id)}
              className={`mb-0.5 flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left ${
                selectionId === m.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
            >
              <AvatarInitiales nom={m.nom_complet} email={m.email} couleur={m.couleur} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{m.nom_complet || m.email}</p>
                <BadgeRole role={m.role} typeContrat={m.type_contrat} />
              </div>
            </button>
          ))}
          {membres.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Aucun membre.</p>}
        </div>
      </div>

      {selection ? (
        <FicheDetailMembre
          key={selection.id}
          profil={selection}
          popUps={popUps}
          membres={profils}
          lieuxAttribues={lieuxAttribuesDe(selection)}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
          <span className="text-3xl">👥</span>
          <p className="text-sm">Sélectionnez un collaborateur dans la liste.</p>
        </div>
      )}

      {modalOuverte && <NouvelEmployeModal onClose={() => setModalOuverte(false)} />}
    </div>
  );
}
