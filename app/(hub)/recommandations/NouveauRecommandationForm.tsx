'use client';

import { useRef, useState, useTransition } from 'react';

import { creerRecommandation } from './actions';

const champ = 'rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none';

export function NouveauRecommandationForm() {
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="mb-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        + Nouvelle recommandation
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setErreur(null);
        demarrer(async () => {
          try {
            await creerRecommandation(formData);
            formRef.current?.reset();
            setOuvert(false);
          } catch (e) {
            setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
          }
        });
      }}
      className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4"
    >
      <input name="auteur" placeholder="Auteur" className={champ} />
      <input name="categorie" placeholder="Catégorie (ex. amélioration)" className={champ} />
      <textarea
        name="message"
        placeholder="Message"
        required
        rows={2}
        className={`${champ} col-span-2 sm:col-span-4`}
      />

      <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
        <button
          type="submit"
          disabled={enCours}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {enCours ? 'Création…' : 'Créer'}
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
        >
          Annuler
        </button>
        {erreur && <span className="text-sm text-red-600">{erreur}</span>}
      </div>
    </form>
  );
}
