'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { chargerProchainSkuPack, creerPack } from './actions';
import type { PinOption } from './types';

const champLabel = 'mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400';
const champInput = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400';

/** Réplique la modale "Créer un pack" de l'ancien admin (openPackModal/submitPack) : nom, SKU
 * auto-rempli séquentiel (désactivé pendant le chargement), et une liste de pin's à cocher (pas de
 * quantité à la création — asymétrie volontaire avec l'édition, comportement réel de l'ancien
 * site). */
export function NouveauPackModal({ pins, onCree }: { pins: PinOption[]; onCree: (url: string | null) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState('');
  const [sku, setSku] = useState('');
  const [skuEnChargement, setSkuEnChargement] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    if (!ouvert) return;
    setSkuEnChargement(true);
    chargerProchainSkuPack()
      .then(setSku)
      .catch(() => setSku(''))
      .finally(() => setSkuEnChargement(false));
  }, [ouvert]);

  function ouvrir() {
    setNom('');
    setSku('');
    setRecherche('');
    setCoches(new Set());
    setErreur(null);
    setOuvert(true);
  }

  function toggle(id: string) {
    setCoches((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  const pinsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? pins.filter((p) => (p.name ?? '').toLowerCase().includes(q)) : pins;
  }, [pins, recherche]);

  function submit() {
    if (!nom.trim() || !sku.trim()) {
      setErreur('Nom et SKU requis');
      return;
    }
    if (coches.size === 0) {
      setErreur("Sélectionne au moins un pin's");
      return;
    }
    setErreur(null);
    demarrer(async () => {
      try {
        const { shopifyUrl } = await creerPack({ nom: nom.trim(), sku: sku.trim(), pinIds: [...coches] });
        setOuvert(false);
        onCree(shopifyUrl);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  return (
    <>
      <button
        onClick={ouvrir}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        + Créer un pack
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => e.target === e.currentTarget && setOuvert(false)}>
          <div className="flex max-h-[85vh] w-[560px] max-w-full flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <p className="text-lg font-bold text-slate-900">Créer un pack</p>
              <button onClick={() => setOuvert(false)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
              <div>
                <p className={champLabel}>Nom du pack</p>
                <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: Pack Océan Summer" className={champInput} />
              </div>
              <div>
                <p className={champLabel}>SKU Shopify</p>
                <input
                  value={skuEnChargement ? '…' : sku}
                  onChange={(e) => setSku(e.target.value)}
                  disabled={skuEnChargement}
                  placeholder="Ex: OCEAN3"
                  className={`${champInput} disabled:bg-slate-50 disabled:text-slate-400`}
                />
              </div>
              <div>
                <p className={champLabel}>Pin&apos;s inclus ({coches.size})</p>
                <input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher un pin's..."
                  className={`${champInput} rounded-b-none`}
                />
                <div className="max-h-64 overflow-y-auto rounded-b-lg border border-t-0 border-slate-200">
                  {pinsFiltres.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-slate-400">Aucun pin&apos;s trouvé</p>
                  ) : (
                    pinsFiltres.map((p) => {
                      const coche = coches.has(p.airtable_id);
                      return (
                        <label
                          key={p.airtable_id}
                          className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 ${coche ? 'bg-slate-50' : ''}`}
                        >
                          <input type="checkbox" checked={coche} onChange={() => toggle(p.airtable_id)} className="h-4 w-4 rounded border-slate-300" />
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image_url} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
                          ) : (
                            <div className="h-7 w-7 shrink-0 rounded-md bg-slate-100" />
                          )}
                          <span className="text-slate-800">
                            {p.name} <span className="text-xs text-slate-400">#{p.sku_pimpit || '?'}</span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {erreur && <p className="text-sm text-red-600">{erreur}</p>}
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setOuvert(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
                Annuler
              </button>
              <button
                onClick={submit}
                disabled={enCours}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {enCours ? 'Création…' : 'Créer le pack'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
