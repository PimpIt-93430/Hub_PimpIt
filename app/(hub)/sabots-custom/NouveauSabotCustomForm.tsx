'use client';

import { useRef, useState, useTransition } from 'react';

import { creerSabotCustomComplet } from './actions';
import { PinPicker } from './PinPicker';

interface PinOption {
  airtable_id: string;
  name: string | null;
}

const champ = 'rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none';

export function NouveauSabotCustomForm({ pins }: { pins: PinOption[] }) {
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [urlCreee, setUrlCreee] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!ouvert) {
    return (
      <div className="mb-4">
        <button
          onClick={() => setOuvert(true)}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          + Nouveau sabot personnalisé
        </button>
        {urlCreee && (
          <p className="mt-2 text-sm text-emerald-700">
            Produit Shopify créé :{' '}
            <a href={urlCreee} target="_blank" rel="noreferrer" className="underline">
              voir sur Shopify
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setErreur(null);
        demarrer(async () => {
          try {
            const { shopifyUrl } = await creerSabotCustomComplet(formData);
            formRef.current?.reset();
            setOuvert(false);
            setUrlCreee(shopifyUrl);
          } catch (e) {
            setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
          }
        });
      }}
      className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4"
    >
      <input name="nom" placeholder="Nom" required className={champ} />
      <input name="sku" placeholder="SKU (base)" required className={champ} />
      <input name="prix" type="number" step="0.01" placeholder="Prix (€)" required className={champ} />
      <input name="tags" placeholder="Tags (séparés par des virgules)" className={champ} />
      <textarea name="description" placeholder="Description" rows={2} className={`${champ} col-span-2 sm:col-span-4`} />
      <input name="seo_titre" placeholder="Titre SEO" className={`${champ} col-span-2 sm:col-span-2`} />
      <input name="seo_description" placeholder="Description SEO" className={`${champ} col-span-2 sm:col-span-2`} />

      <PinPicker nomChamp="pins_selectionnes" pins={pins} />

      <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-4">
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
        <p className="w-full text-xs text-slate-400">
          Crée un vrai produit Shopify (une variante par couleur × taille, comme sur l&apos;ancien
          site) — visible sur la boutique dès la création.
        </p>
      </div>
    </form>
  );
}
