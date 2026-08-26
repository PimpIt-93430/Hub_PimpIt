'use client';

import { useRef, useState, useTransition } from 'react';

import { creerProduitUnite } from './actions';
import { PinsUniteSelector } from './PinsUniteSelector';

interface PinOption {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  image_url: string | null;
}
interface CollectionOption {
  id: string;
  title: string;
  handle: string;
}

const champLabel = 'mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400';
const champInput = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400';

const TITRE_DEFAUT = "Pin's pour Clogs - ";

/** Réplique le tiroir "Créer un nouveau produit" de l'ancien admin (unite-step-create dans
 * public/index.html) : même ordre exact (pin's d'abord, puis nom, description, SEO, tags,
 * collections), présenté en modale centrée comme sur l'ancien site (pas un tiroir latéral, qui
 * était réservé à l'édition d'un pin). Le bouton "Générer la fiche avec l'IA" de l'ancien site
 * n'est pas repris : c'était un appel payant à un service tiers, les champs sont directement
 * éditables ici. */
export function NouveauProduitUniteModal({
  pinsARajouter,
  autresPins,
  collections,
  onCree,
}: {
  pinsARajouter: PinOption[];
  autresPins: PinOption[];
  collections: CollectionOption[];
  onCree: (url: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="mb-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        + Nouveaux produits pin&apos;s à l&apos;unité
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => e.target === e.currentTarget && setOuvert(false)}>
      <div className="flex max-h-[85vh] w-[640px] max-w-full flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-lg font-bold text-slate-900">Créer un nouveau produit</p>
          <button onClick={() => setOuvert(false)} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <form
          ref={formRef}
          action={(formData) => {
            setErreur(null);
            demarrer(async () => {
              try {
                const { shopifyUrl } = await creerProduitUnite(formData);
                formRef.current?.reset();
                setOuvert(false);
                onCree(shopifyUrl);
              } catch (e) {
                setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
              }
            });
          }}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6"
        >
          <div>
            <p className={champLabel}>Pin&apos;s principal</p>
            <PinsUniteSelector pinsARajouter={pinsARajouter} autresPins={autresPins} collections={collections} />
          </div>

          <div>
            <p className={champLabel}>Nom du produit</p>
            <input name="titre" defaultValue={TITRE_DEFAUT} required className={champInput} />
          </div>

          <div>
            <p className={champLabel}>Description</p>
            <textarea name="description" rows={4} className={`${champInput} resize-y`} />
          </div>

          <div>
            <p className={champLabel}>
              Balise SEO titre <span className="font-normal normal-case text-slate-400">(50-60 car.)</span>
            </p>
            <input name="meta_titre" defaultValue={TITRE_DEFAUT} className={champInput} />
          </div>

          <div>
            <p className={champLabel}>
              Balise SEO description <span className="font-normal normal-case text-slate-400">(150-160 car.)</span>
            </p>
            <textarea name="meta_description" rows={2} className={`${champInput} resize-y`} />
          </div>

          <div>
            <p className={champLabel}>Tags</p>
            <input name="tags" placeholder="tag1, tag2…" className={champInput} />
          </div>

          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        </form>

        <div className="flex items-center gap-2.5 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={() => setOuvert(false)}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={() => formRef.current?.requestSubmit()}
            disabled={enCours}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {enCours ? 'Création…' : 'Créer sur Shopify'}
          </button>
        </div>
      </div>
    </div>
  );
}
