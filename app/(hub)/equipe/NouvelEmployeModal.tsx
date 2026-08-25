'use client';

import { useState, useTransition } from 'react';

import { creerEmploye } from './actions';
import { LIBELLE_TYPE_CONTRAT } from './lib';
import { Champ, ChampSelect } from './ui';
import type { Role, TypeContrat } from './types';

export function NouvelEmployeModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [nomComplet, setNomComplet] = useState('');
  const [role, setRole] = useState<Role>('employe');
  const [typeContrat, setTypeContrat] = useState<TypeContrat>('employe');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const envoyer = () => {
    if (!email.trim() || !nomComplet.trim()) {
      setErreur('Email et nom complet requis.');
      return;
    }
    setErreur(null);
    demarrer(async () => {
      try {
        await creerEmploye({ email: email.trim(), nomComplet: nomComplet.trim(), role, typeContrat });
        onClose();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec de l'invitation.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-slate-900">Nouvel employé</h2>
        <div className="flex flex-col gap-3">
          <Champ label="Nom complet" valeur={nomComplet} onChangeText={setNomComplet} />
          <Champ label="Email" valeur={email} onChangeText={setEmail} type="email" />
          <ChampSelect
            label="Rôle"
            valeur={role}
            onChange={(v) => setRole(v as Role)}
            options={[
              { value: 'employe', label: 'Employé' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
          <ChampSelect
            label="Type de contrat"
            valeur={typeContrat}
            onChange={(v) => setTypeContrat(v as TypeContrat)}
            options={Object.entries(LIBELLE_TYPE_CONTRAT).map(([value, label]) => ({ value, label }))}
          />
        </div>
        {erreur && <p className="mt-3 text-xs text-red-600">{erreur}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={envoyer}
            disabled={enCours}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {enCours ? 'Envoi...' : 'Inviter'}
          </button>
        </div>
      </div>
    </div>
  );
}
