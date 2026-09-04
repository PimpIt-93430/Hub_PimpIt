'use client';

import { useRef, useState, useTransition } from 'react';

import { creerProduitTikTok } from './actions';
import { SelecteurPinsTikTok } from './SelecteurPinsTikTok';
import type { PinOption } from './types';

const champLabel = 'mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400';
const champInput = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400';

/** Tiroir "Nouveau produit TikTok Shop" — même gabarit que PinsUniteModal (pins-unite), simplifié :
 * pas de choix "créer / ajouter à un existant" (toujours un nouveau produit ici), pas de
 * description/SEO/collections (pas demandé, cf. retour utilisateur du 2026-09-04 — juste titre,
 * pin's, prix). */
export function NouveauProduitTikTokModal({ pins, onCree }: { pins: PinOption[]; onCree: (url: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [prixGlobal, setPrixGlobal] = useState('2.00');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="mb-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        + Nouveau produit TikTok Shop
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && setOuvert(false)}
    >
      <div className="flex max-h-[85vh] w-[640px] max-w-full flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-lg font-bold text-slate-900">Nouveau produit TikTok Shop</p>
          <button onClick={() => setOuvert(false)} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <form
            ref={formRef}
            action={(formData) => {
              setErreur(null);
              demarrer(async () => {
                try {
                  const { shopifyUrl } = await creerProduitTikTok(formData);
                  setOuvert(false);
                  onCree(shopifyUrl);
                } catch (e) {
                  setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
                }
              });
            }}
            className="flex flex-col gap-4 px-6 py-6"
          >
            <div>
              <p className={champLabel}>Nom du produit</p>
              <input name="titre" placeholder="Pin's - ..." required className={champInput} />
            </div>

            <div>
              <p className={champLabel}>Prix global (€)</p>
              <input
                name="prix_global"
                type="number"
                step="0.01"
                min="0"
                required
                value={prixGlobal}
                onChange={(e) => setPrixGlobal(e.target.value)}
                className={champInput}
              />
              <p className="mt-1 text-xs text-slate-400">
                Appliqué à tous les pin's sélectionnés, sauf ceux avec un prix personnalisé ci-dessous.
              </p>
            </div>

            <SelecteurPinsTikTok pins={pins} prixGlobal={prixGlobal} />

            {erreur && <p className="text-sm text-red-600">{erreur}</p>}

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setOuvert(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={enCours}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {enCours ? 'Création… (peut prendre plusieurs minutes)' : 'Créer sur Shopify'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
