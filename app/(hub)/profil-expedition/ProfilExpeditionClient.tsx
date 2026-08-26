'use client';

import { useState, useTransition } from 'react';

import type { ProfilExpedition, ProfilExpeditionItem } from '@/lib/shopify';

import { chargerProfilsExpedition, deplacerVersProfil } from './actions';

/** Réplique loadShippingProfiles/renderShippingProfiles/openShippingAssign/doShippingAssign de
 * l'ancien admin (Shopify Pimp IT/admin/public/index.html:4527-4686) — accordéon des profils
 * d'expédition + modal de déplacement d'un produit vers un autre profil. */

const trieProfils = (profils: ProfilExpedition[]) =>
  [...profils].sort((a, b) => {
    if (a.default && !b.default) return -1;
    if (!a.default && b.default) return 1;
    return a.name.localeCompare(b.name);
  });

const estLeger = (nom: string) => /l[ée]ger/i.test(nom);

function BadgeProfil({ profil }: { profil: ProfilExpedition }) {
  if (profil.default) {
    return (
      <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">
        Général
      </span>
    );
  }
  if (estLeger(profil.name)) {
    return (
      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
        Produits légers
      </span>
    );
  }
  return null;
}

function libelleVariante(item: ProfilExpeditionItem): string {
  const n = item.variants.length;
  if (n === 1) return item.variants[0].title !== 'Default Title' ? `· ${item.variants[0].title}` : '';
  if (n > 1) return `· ${n} variantes`;
  return '';
}

interface CibleDeplacement {
  profileId: string;
  productId: string;
  title: string;
  variantGids: string[];
  variants: ProfilExpeditionItem['variants'];
}

export function ProfilExpeditionClient() {
  const [profils, setProfils] = useState<ProfilExpedition[] | null>(null);
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cible, setCible] = useState<CibleDeplacement | null>(null);
  const [enChargement, demarrerChargement] = useTransition();
  const [enDeplacement, demarrerDeplacement] = useTransition();

  const analyser = () => {
    setErreur(null);
    setMessage(null);
    demarrerChargement(async () => {
      try {
        const result = await chargerProfilsExpedition();
        setProfils(result);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur lors du chargement des profils.');
      }
    });
  };

  const ouvrirDeplacement = (profileId: string, item: ProfilExpeditionItem) => {
    setCible({
      profileId,
      productId: item.productId,
      title: item.title,
      variantGids: item.variants.map((v) => v.gid),
      variants: item.variants,
    });
  };

  const confirmerDeplacement = (profileDestId: string, profileDestName: string) => {
    if (!cible) return;
    demarrerDeplacement(async () => {
      try {
        await deplacerVersProfil(cible.variantGids, profileDestId);
        setProfils((prev) => {
          if (!prev) return prev;
          return prev.map((p) => {
            if (p.id === cible.profileId) return { ...p, items: p.items.filter((i) => i.productId !== cible.productId) };
            if (p.id === profileDestId) {
              const item = prev.find((pp) => pp.id === cible.profileId)?.items.find((i) => i.productId === cible.productId);
              if (!item) return p;
              return { ...p, items: [...p.items, item] };
            }
            return p;
          });
        });
        setCible(null);
        setMessage(`« ${cible.title} » déplacé vers « ${profileDestName} »`);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur lors du déplacement.');
      }
    });
  };

  const totalItems = profils?.reduce((s, p) => s + p.items.length, 0) ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={analyser}
          disabled={enChargement}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {enChargement ? '⏳ Analyse en cours…' : '🔍 Analyser les profils'}
        </button>
        {profils && !enChargement && (
          <span className="text-sm text-slate-400">
            {profils.length} profil{profils.length !== 1 ? 's' : ''} · {totalItems} entrée{totalItems !== 1 ? 's' : ''} produit
          </span>
        )}
      </div>

      {message && <p className="mb-4 text-sm font-medium text-emerald-600">{message}</p>}
      {erreur && <p className="mb-4 text-sm font-medium text-red-600">Erreur : {erreur}</p>}

      {profils === null && !enChargement && (
        <p className="text-sm text-slate-400">
          Cliquez sur « Analyser les profils » pour charger les profils d&apos;expédition Shopify.
        </p>
      )}

      {profils !== null && profils.length === 0 && <p className="text-sm text-slate-400">Aucun profil trouvé.</p>}

      {profils !== null && profils.length > 0 && (
        <div className="flex flex-col gap-3">
          {trieProfils(profils).map((profil) => {
            const estOuvert = !!ouverts[profil.id];
            return (
              <div key={profil.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  onClick={() => setOuverts((o) => ({ ...o, [profil.id]: !o[profil.id] }))}
                  className={`flex w-full items-center justify-between px-5 py-4 text-left ${profil.default ? 'bg-yellow-50' : ''}`}
                >
                  <span className="flex items-center">
                    <span className="text-[15px] font-bold text-slate-900">{profil.name}</span>
                    <BadgeProfil profil={profil} />
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">
                      {profil.items.length} produit{profil.items.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-slate-400">{estOuvert ? '▲' : '▼'}</span>
                  </span>
                </button>

                {estOuvert && (
                  <div className="border-t border-slate-200 p-2">
                    {profil.items.length === 0 ? (
                      <p className="p-4 text-center text-sm text-slate-400">Aucun produit</p>
                    ) : (
                      profil.items.map((item) => (
                        <div
                          key={item.productId}
                          className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50"
                        >
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image} alt="" className="h-9 w-9 flex-shrink-0 rounded-md object-cover" />
                          ) : (
                            <div className="h-9 w-9 flex-shrink-0 rounded-md bg-slate-100" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                            <p className="truncate text-xs text-slate-400">
                              {item.type}
                              {libelleVariante(item) ? ` ${libelleVariante(item)}` : ''}
                            </p>
                          </div>
                          <button
                            onClick={() => ouvrirDeplacement(profil.id, item)}
                            className="flex-shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Déplacer
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !enDeplacement && setCible(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Changer de profil d&apos;expédition</h2>
              <button
                onClick={() => !enDeplacement && setCible(null)}
                className="text-xl leading-none text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-800">
              {cible.title}
              {cible.variants.length > 1
                ? ` (${cible.variants.length} variantes)`
                : cible.variants[0]?.title && cible.variants[0].title !== 'Default Title'
                  ? ` — ${cible.variants[0].title}`
                  : ''}
            </div>

            <p className="mb-2 text-xs font-semibold text-slate-500">Choisir un profil</p>
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {trieProfils(profils ?? []).map((p) => {
                const estActuel = p.id === cible.profileId;
                return (
                  <div
                    key={p.id}
                    onClick={() => !estActuel && !enDeplacement && confirmerDeplacement(p.id, p.name)}
                    className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm ${
                      estActuel
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'cursor-pointer border-slate-200 hover:bg-slate-50'
                    } ${enDeplacement && !estActuel ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <span className="font-medium text-slate-800">{p.name}</span>
                    {estActuel ? (
                      <span className="text-xs font-semibold text-emerald-600">Actuel</span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {p.items.length} entrée{p.items.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => !enDeplacement && setCible(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
