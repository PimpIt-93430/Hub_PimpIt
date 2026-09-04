'use client';

import { useState } from 'react';

import { NouveauProduitTikTokModal } from './NouveauProduitTikTokModal';
import type { PinOption, ProduitTikTokExistant } from './types';

const LIBELLE_STATUT: Record<string, string> = {
  ACTIVE: 'Actif',
  DRAFT: 'Brouillon',
  ARCHIVED: 'Archivé',
};

/** Onglet "TikTok Shop" de Gestion des produits — cf. actions.ts pour le pourquoi. Liste les
 * produits déjà "TikTok Shop" (titre "Pin's..." + plus de 30 variantes, calculé en direct sur
 * Shopify) et permet d'en créer un nouveau à partir d'une sélection de pin's. */
export function TikTokShopClient({ pins, produitsExistants }: { pins: PinOption[]; produitsExistants: ProduitTikTokExistant[] }) {
  const [urlCreee, setUrlCreee] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">TikTok Shop</h1>
        <p className="mt-1 text-sm text-slate-400">
          Produits Pin&apos;s à plus de 30 variantes — le canal TikTok Shop plafonne à 100 variantes par produit,
          d&apos;où des produits dédiés séparés des gros &laquo;&nbsp;Pin&apos;s pour Clogs&nbsp;&raquo; classiques.
        </p>
      </div>

      <div className="mb-4">
        <NouveauProduitTikTokModal pins={pins} onCree={setUrlCreee} />
        {urlCreee && (
          <p className="mt-2 text-sm text-emerald-700">
            Produit Shopify créé — pense à le publier sur le canal TikTok Shop depuis Shopify (pas encore automatisé
            ici) :{' '}
            <a href={urlCreee} target="_blank" rel="noreferrer" className="underline">
              voir sur Shopify
            </a>
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3" />
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Variantes</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {produitsExistants.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Aucun produit TikTok Shop pour l&apos;instant.
                </td>
              </tr>
            ) : (
              produitsExistants.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-9 w-9 rounded-md object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded-md bg-slate-100" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{p.title}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {LIBELLE_STATUT[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                      {p.variantCount}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <a href={p.adminUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 hover:underline">
                      Voir sur Shopify →
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
