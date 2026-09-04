'use client';

import { useMemo, useState } from 'react';

import type { PinOption } from './types';

const MAX_VARIANTES = 100;

/** Sélecteur de pin's pour un produit TikTok Shop — même principe que PinsUniteSelector
 * (pins-unite), avec deux différences : un plafond dur à 100 (limite du canal TikTok Shop, cf.
 * actions.ts) qui bloque toute case au-delà, et un prix personnalisable par pin sélectionné (sinon
 * le prix global du formulaire s'applique) au lieu d'un prix fixe. */
export function SelecteurPinsTikTok({ pins, prixGlobal }: { pins: PinOption[]; prixGlobal: string }) {
  const [recherche, setRecherche] = useState('');
  const [selectionnes, setSelectionnes] = useState<Set<string>>(new Set());
  const [prixParPin, setPrixParPin] = useState<Record<string, string>>({});

  const q = recherche.trim().toLowerCase();
  const pinsFiltres = useMemo(
    () => (q ? pins.filter((p) => (p.name ?? '').toLowerCase().includes(q) || (p.sku_pimpit ?? '').includes(q)) : pins),
    [pins, q],
  );
  const pinsSelectionnes = useMemo(
    () => pins.filter((p) => selectionnes.has(p.airtable_id)),
    [pins, selectionnes],
  );

  const plafondAtteint = selectionnes.size >= MAX_VARIANTES;

  function basculer(id: string) {
    setSelectionnes((s) => {
      const copie = new Set(s);
      if (copie.has(id)) {
        copie.delete(id);
      } else {
        if (copie.size >= MAX_VARIANTES) return s;
        copie.add(id);
      }
      return copie;
    });
  }

  const prixParPinNettoye = Object.fromEntries(
    Object.entries(prixParPin).filter(([id, v]) => selectionnes.has(id) && v.trim() !== ''),
  );

  return (
    <div>
      <input type="hidden" name="pin_ids" value={JSON.stringify([...selectionnes])} />
      <input type="hidden" name="prix_par_pin" value={JSON.stringify(prixParPinNettoye)} />

      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pin&apos;s à inclure</p>
        <p className={`text-xs font-semibold ${plafondAtteint ? 'text-amber-600' : 'text-slate-400'}`}>
          {selectionnes.size} / {MAX_VARIANTES}
          {plafondAtteint && ' — plafond TikTok Shop atteint'}
        </p>
      </div>
      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher..."
        className="mb-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
      <div className="max-h-[220px] overflow-y-auto rounded-lg border border-slate-200 p-1">
        {pinsFiltres.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-slate-400">Aucun pin trouvé</p>
        ) : (
          pinsFiltres.map((p) => {
            const sel = selectionnes.has(p.airtable_id);
            const desactive = !sel && plafondAtteint;
            return (
              <label
                key={p.airtable_id}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${
                  desactive ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={sel}
                  disabled={desactive}
                  onChange={() => basculer(p.airtable_id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-8 w-8 shrink-0 rounded-md bg-slate-100" />
                )}
                <span>
                  {p.name} <span className="text-xs text-slate-400">#{p.sku_pimpit ?? '?'}</span>
                </span>
              </label>
            );
          })
        )}
      </div>

      {pinsSelectionnes.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Prix par pin (laisser vide = prix global{prixGlobal ? ` de ${prixGlobal} €` : ''})
          </p>
          <div className="flex max-h-[180px] flex-col gap-1 overflow-y-auto rounded-lg border border-slate-200 p-1.5">
            {pinsSelectionnes.map((p) => (
              <div key={p.airtable_id} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-6 w-6 shrink-0 rounded bg-slate-100" />
                )}
                <span className="flex-1 truncate text-xs text-slate-700">{p.name}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={prixGlobal || '—'}
                  value={prixParPin[p.airtable_id] ?? ''}
                  onChange={(e) => setPrixParPin((s) => ({ ...s, [p.airtable_id]: e.target.value }))}
                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                />
                <span className="text-xs text-slate-400">€</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
