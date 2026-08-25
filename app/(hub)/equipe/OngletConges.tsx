'use client';

import { useEffect, useState } from 'react';

import { obtenirConges, supprimerConge } from './actions';
import { formatHeure } from './lib';
import { TexteAlerte } from './ui';
import type { Conge, Profile } from './types';

export function OngletConges({ profil }: { profil: Profile }) {
  const [conges, setConges] = useState<Conge[] | null>(null);

  const charger = () => {
    obtenirConges(profil.id).then(setConges);
  };

  useEffect(() => {
    setConges(null);
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil.id]);

  const handleSupprimer = (conge: Conge) => {
    const confirme = window.confirm(
      `Supprimer ${conge.type === 'conge' ? 'ce congé' : 'cette indisponibilité'} de ${profil.nom_complet || profil.email} ? Cette action est irréversible.`,
    );
    if (!confirme) return;
    supprimerConge(conge.id).then(charger);
  };

  if (conges === null) return <TexteAlerte>Chargement...</TexteAlerte>;

  return (
    <div className="pb-6">
      {conges.length === 0 && <TexteAlerte>Aucun congé/indisponibilité déclaré.</TexteAlerte>}
      {conges.map((c) => (
        <div
          key={c.id}
          className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <p className="text-sm text-slate-800">
            {c.date_debut}
            {c.date_fin !== c.date_debut ? ` → ${c.date_fin}` : ''}
            {c.heure_debut && c.heure_fin ? ` · ${formatHeure(c.heure_debut)}-${formatHeure(c.heure_fin)}` : ' · journée entière'}
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{c.type === 'conge' ? 'Congé' : 'Indisponibilité'}</span>
            <button onClick={() => handleSupprimer(c)} className="text-xs font-semibold text-red-500 hover:text-red-700">
              Supprimer
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
