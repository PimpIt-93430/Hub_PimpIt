'use client';

import { useState } from 'react';

import { NouveauProduitUniteModal } from './NouveauProduitUniteModal';

interface PinARajouter {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  fournisseur: string | null;
  stock: number;
  image_url: string | null;
}
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

/** Réplique l'écran "Pin's à rajouter sur le site" de l'ancien admin (screen-to-add /
 * loadToAdd() dans public/index.html) : même tableau (photo, nom, SKU, fournisseur, stock),
 * même message vide "Aucun pin à rajouter 🎉". */
export function PinsUnitePageClient({
  pinsARajouter,
  autresPins,
  collections,
}: {
  pinsARajouter: PinARajouter[];
  autresPins: PinOption[];
  collections: CollectionOption[];
}) {
  const [urlCreee, setUrlCreee] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pin&apos;s à rajouter sur le site</h1>
          <p className="mt-1 text-sm text-slate-400">Pin&apos;s cochés &laquo;&nbsp;Pas dans pin&apos;s unité&nbsp;&raquo;</p>
        </div>
      </div>

      <div className="mb-4">
        <NouveauProduitUniteModal
          pinsARajouter={pinsARajouter}
          autresPins={autresPins}
          collections={collections}
          onCree={setUrlCreee}
        />
        {urlCreee && (
          <p className="mt-2 text-sm text-emerald-700">
            Produit Shopify créé :{' '}
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
              <th className="px-4 py-3">SKU Pimpit</th>
              <th className="px-4 py-3">Fournisseur</th>
              <th className="px-4 py-3">Stock</th>
            </tr>
          </thead>
          <tbody>
            {pinsARajouter.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Aucun pin à rajouter 🎉
                </td>
              </tr>
            ) : (
              pinsARajouter.map((p) => (
                <tr key={p.airtable_id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" className="h-9 w-9 rounded-md object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded-md bg-slate-100" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{p.name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                      {p.sku_pimpit ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{p.fournisseur ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                      {Math.round(p.stock)}
                    </span>
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
