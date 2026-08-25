'use client';

import { useRef, useState, useTransition } from 'react';

import { creerPin } from './actions';

const champ = 'rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none';

export function NouveauPinForm() {
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
        + Nouveau pin
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
            await creerPin(formData);
            formRef.current?.reset();
            setOuvert(false);
          } catch (e) {
            setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
          }
        });
      }}
      className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4"
    >
      <input name="name" placeholder="Nom" required className={`${champ} col-span-2 sm:col-span-1`} />
      <input name="sku_pimpit" placeholder="SKU Pimp It" className={champ} />
      <input name="sku_fournisseur" placeholder="SKU Fournisseur" className={champ} />
      <input name="fournisseur" placeholder="Fournisseur (J / W / Wu...)" className={champ} />
      <input name="boite" placeholder="Boîte (ex A,4)" className={champ} />
      <input name="stock" type="number" placeholder="Stock" className={champ} />
      <input name="seuil_cible" type="number" placeholder="Seuil cible" className={champ} />
      <input name="poids_unitaire" type="number" step="0.01" placeholder="Poids unité x10" className={champ} />
      <input name="poids_total" type="number" step="0.01" placeholder="Poids total" className={champ} />
      <input name="image_url" placeholder="URL image" className={`${champ} col-span-2 sm:col-span-2`} />
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input name="custom" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
        Custom
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input name="pas_dans_unite" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
        Pas dans pin&apos;s unité
      </label>
      <textarea
        name="description"
        placeholder="Description"
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
