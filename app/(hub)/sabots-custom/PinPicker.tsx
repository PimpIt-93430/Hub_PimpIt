'use client';

import { useMemo, useState } from 'react';

interface PinOption {
  airtable_id: string;
  name: string | null;
}

/** Sélecteur de pin's avec quantité, pour reconstituer le champ "Pin's inclus" / "Qtes pins" de
 * l'ancien site. Écrit la sélection dans un input caché (JSON `{airtableId: qty}`) que le
 * formulaire parent soumet avec les autres champs. */
export function PinPicker({ nomChamp, pins }: { nomChamp: string; pins: PinOption[] }) {
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState<Record<string, number>>({});

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return [];
    return pins.filter((p) => (p.name ?? '').toLowerCase().includes(q)).slice(0, 8);
  }, [recherche, pins]);

  function ajouter(id: string) {
    setSelection((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }));
    setRecherche('');
  }
  function changerQte(id: string, delta: number) {
    setSelection((s) => {
      const q = (s[id] ?? 0) + delta;
      if (q <= 0) {
        const { [id]: _retire, ...reste } = s;
        return reste;
      }
      return { ...s, [id]: q };
    });
  }

  const nomParId = Object.fromEntries(pins.map((p) => [p.airtable_id, p.name ?? p.airtable_id]));

  return (
    <div className="col-span-2 sm:col-span-4">
      <input type="hidden" name={nomChamp} value={JSON.stringify(selection)} />
      <label className="mb-1 block text-xs font-semibold text-slate-500">Pin&apos;s inclus</label>
      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Chercher un pin par nom…"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
      />
      {resultats.length > 0 && (
        <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm">
          {resultats.map((p) => (
            <button
              key={p.airtable_id}
              type="button"
              onClick={() => ajouter(p.airtable_id)}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      {Object.keys(selection).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(selection).map(([id, qte]) => (
            <span
              key={id}
              className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {nomParId[id] ?? id}
              <button type="button" onClick={() => changerQte(id, -1)} className="text-slate-400 hover:text-slate-900">
                −
              </button>
              {qte}
              <button type="button" onClick={() => changerQte(id, 1)} className="text-slate-400 hover:text-slate-900">
                +
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
