'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import {
  ajouterVariantesTikTok,
  chargerProduitTikTokDetail,
  modifierVarianteTikTok,
  supprimerVarianteTikTok,
  type VarianteTikTok,
} from './actions';
import { SelecteurPinsTikTok } from './SelecteurPinsTikTok';
import type { PinOption, ProduitTikTokExistant } from './types';

const champInput = 'w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400';

/** Panneau "Gérer les variantes" d'un produit TikTok Shop déjà en ligne (retour utilisateur du
 * 2026-09-16 : ajouter/retirer des variantes et modifier prix/nom sans repasser par l'admin
 * Shopify). Charge le détail à l'ouverture (pas dans la liste initiale, déjà coûteuse sur tout le
 * catalogue) ; chaque variante a son propre "Enregistrer" (prix/nom) et "Supprimer" — pas de
 * sauvegarde groupée, pour qu'une erreur sur une ligne n'affecte jamais les autres. */
export function GererProduitTikTokModal({ pins, produit }: { pins: PinOption[]; produit: ProduitTikTokExistant }) {
  const [ouvert, setOuvert] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [variants, setVariants] = useState<VarianteTikTok[] | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [prixGlobalAjout, setPrixGlobalAjout] = useState('2.00');
  const [erreurAjout, setErreurAjout] = useState<string | null>(null);
  const [ajoutEnCours, demarrerAjout] = useTransition();

  const charger = () => {
    setChargement(true);
    setErreurChargement(null);
    chargerProduitTikTokDetail(produit.numericId)
      .then((d) => setVariants(d.variants))
      .catch((e) => setErreurChargement(e instanceof Error ? e.message : 'Erreur de chargement'))
      .finally(() => setChargement(false));
  };

  useEffect(() => {
    if (ouvert && variants === null && !chargement) charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const dejaPresents = useMemo(() => new Set((variants ?? []).map((v) => v.sku).filter(Boolean) as string[]), [variants]);
  // Les pin's déjà en variante sont identifiés par SKU (pas d'airtable_id stocké côté Shopify) —
  // on associe donc au catalogue local via sku_pimpit pour construire l'ensemble à exclure du
  // sélecteur d'ajout.
  const idsDejaPresents = useMemo(
    () => new Set(pins.filter((p) => p.sku_pimpit && dejaPresents.has(p.sku_pimpit)).map((p) => p.airtable_id)),
    [pins, dejaPresents],
  );

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} className="text-xs font-semibold text-indigo-600 hover:underline">
        Gérer les variantes
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && setOuvert(false)}
    >
      <div className="flex max-h-[85vh] w-[720px] max-w-full flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-lg font-bold text-slate-900">{produit.title}</p>
          <button onClick={() => setOuvert(false)} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {chargement && <p className="text-sm text-slate-400">Chargement des variantes…</p>}
          {erreurChargement && <p className="text-sm text-red-600">{erreurChargement}</p>}

          {variants && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Variantes ({variants.length} / 100)
              </p>
              <div className="mb-6 flex flex-col gap-1.5">
                {variants.map((v) => (
                  <LigneVariante key={v.id} variante={v} productId={produit.numericId} onSupprimee={charger} />
                ))}
              </div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Ajouter des pin&apos;s
              </p>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Prix global (€)</p>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={prixGlobalAjout}
                  onChange={(e) => setPrixGlobalAjout(e.target.value)}
                  className={`${champInput} mb-3 max-w-[140px]`}
                />
              </div>
              <form
                action={(formData) => {
                  setErreurAjout(null);
                  demarrerAjout(async () => {
                    try {
                      const pinIds: string[] = JSON.parse(String(formData.get('pin_ids') ?? '[]'));
                      const prixParPin: Record<string, string> = JSON.parse(String(formData.get('prix_par_pin') ?? '{}'));
                      await ajouterVariantesTikTok(produit.numericId, pinIds, prixGlobalAjout, prixParPin);
                      charger();
                    } catch (e) {
                      setErreurAjout(e instanceof Error ? e.message : 'Erreur inconnue');
                    }
                  });
                }}
              >
                <SelecteurPinsTikTok
                  pins={pins}
                  prixGlobal={prixGlobalAjout}
                  dejaPresents={idsDejaPresents}
                  maxVariantes={Math.max(0, 100 - variants.length)}
                />
                {erreurAjout && <p className="mt-2 text-sm text-red-600">{erreurAjout}</p>}
                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={ajoutEnCours}
                    className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {ajoutEnCours ? 'Ajout… (peut prendre un moment)' : 'Ajouter au produit'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LigneVariante({
  variante,
  productId,
  onSupprimee,
}: {
  variante: VarianteTikTok;
  productId: string;
  onSupprimee: () => void;
}) {
  const [option1, setOption1] = useState(variante.option1);
  const [price, setPrice] = useState(variante.price);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [suppressionEnCours, demarrerSuppression] = useTransition();

  const modifie = option1 !== variante.option1 || price !== variante.price;

  const enregistrer = () => {
    setErreur(null);
    demarrer(async () => {
      try {
        const champs: { price?: string; option1?: string } = {};
        if (price !== variante.price) champs.price = price;
        if (option1 !== variante.option1) champs.option1 = option1;
        await modifierVarianteTikTok(variante.id, champs);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  };

  const supprimer = () => {
    if (!window.confirm(`Supprimer la variante "${variante.option1}" ? Cette action est irréversible sur Shopify.`)) return;
    setErreur(null);
    demarrerSuppression(async () => {
      try {
        await supprimerVarianteTikTok(productId, variante.id);
        onSupprimee();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
      {variante.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={variante.image} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-8 w-8 shrink-0 rounded-md bg-slate-100" />
      )}
      <input value={option1} onChange={(e) => setOption1(e.target.value)} className={`${champInput} flex-1`} />
      <span className="text-xs text-slate-400">#{variante.sku ?? '?'}</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className={`${champInput} w-20`}
      />
      <span className="text-xs text-slate-400">€</span>
      {erreur && <span className="text-xs text-red-600">{erreur}</span>}
      <button
        onClick={enregistrer}
        disabled={!modifie || enCours}
        className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
      >
        {enCours ? '…' : 'Enregistrer'}
      </button>
      <button
        onClick={supprimer}
        disabled={suppressionEnCours}
        className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40"
      >
        {suppressionEnCours ? '…' : 'Supprimer'}
      </button>
    </div>
  );
}
