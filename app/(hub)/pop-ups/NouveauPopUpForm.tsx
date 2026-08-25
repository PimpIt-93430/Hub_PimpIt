'use client';

import { useState, useTransition } from 'react';

import { creerPopUp } from './actions';

const champ = 'rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none';

export function NouveauPopUpForm() {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [ouverture, setOuverture] = useState('10:00');
  const [fermeture, setFermeture] = useState('20:00');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const creer = () => {
    if (!nom.trim()) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await creerPopUp({
          nom: nom.trim(),
          heureOuverture: ouverture,
          heureFermeture: fermeture,
          dateDebut: dateDebut.trim() || null,
          dateFin: dateFin.trim() || null,
        });
        setNom('');
        setDateDebut('');
        setDateFin('');
        setOuvert(false);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  };

  return (
    <div className="rounded-2xl border border-dashed border-indigo-300 bg-white p-4">
      <button onClick={() => setOuvert((v) => !v)} className="w-full text-center text-sm font-semibold text-indigo-600">
        {ouvert ? 'Annuler' : '+ Ajouter un pop-up'}
      </button>
      {ouvert && (
        <div className="mt-3">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du pop-up" className={`mb-3 w-full ${champ}`} />
          <div className="mb-3 flex items-center justify-center gap-2">
            <input value={ouverture} onChange={(e) => setOuverture(e.target.value)} placeholder="10:00" className={`w-20 text-center ${champ}`} />
            <span className="text-slate-400">à</span>
            <input value={fermeture} onChange={(e) => setFermeture(e.target.value)} placeholder="20:00" className={`w-20 text-center ${champ}`} />
          </div>
          <div className="mb-3 flex items-center justify-center gap-2">
            <input value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} placeholder="Début (AAAA-MM-JJ)" className={`flex-1 text-center ${champ}`} />
            <span className="text-slate-400">→</span>
            <input value={dateFin} onChange={(e) => setDateFin(e.target.value)} placeholder="Fin prévue (AAAA-MM-JJ)" className={`flex-1 text-center ${champ}`} />
          </div>
          <button onClick={creer} disabled={enCours} className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {enCours ? 'Création…' : 'Créer le pop-up'}
          </button>
          {erreur && <p className="mt-2 text-center text-sm text-red-600">{erreur}</p>}
        </div>
      )}
    </div>
  );
}
