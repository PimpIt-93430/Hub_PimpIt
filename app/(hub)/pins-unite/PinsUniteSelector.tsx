'use client';

import { useMemo, useState } from 'react';

interface PinOption {
  airtable_id: string;
  name: string | null;
}
interface CollectionOption {
  id: string;
  title: string;
  handle: string;
}

/** Sélecteur multi-pins (sans quantité, contrairement à celui des sabots personnalisés) +
 * collections à cocher, pour reconstituer le formulaire "Créer un nouveau produit" de l'ancien
 * site. Écrit dans deux inputs cachés (`pin_ids` et `collection_ids`, tableaux JSON) soumis avec
 * le reste du formulaire. */
export function PinsUniteSelector({ pins, collections }: { pins: PinOption[]; collections: CollectionOption[] }) {
  const [recherche, setRecherche] = useState('');
  const [selectionnes, setSelectionnes] = useState<Set<string>>(new Set());
  const [collectionsCochees, setCollectionsCochees] = useState<Set<string>>(new Set());

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const base = q ? pins.filter((p) => (p.name ?? '').toLowerCase().includes(q)) : pins;
    return base.slice(0, 10);
  }, [recherche, pins]);

  const nomParId = useMemo(() => Object.fromEntries(pins.map((p) => [p.airtable_id, p.name ?? p.airtable_id])), [pins]);

  function basculer(id: string) {
    setSelectionnes((s) => {
      const copie = new Set(s);
      if (copie.has(id)) copie.delete(id);
      else copie.add(id);
      return copie;
    });
  }
  function basculerCollection(id: string) {
    setCollectionsCochees((s) => {
      const copie = new Set(s);
      if (copie.has(id)) copie.delete(id);
      else copie.add(id);
      return copie;
    });
  }

  return (
    <div className="col-span-2 flex flex-col gap-3 sm:col-span-4">
      <input type="hidden" name="pin_ids" value={JSON.stringify([...selectionnes])} />
      <input type="hidden" name="collection_ids" value={JSON.stringify([...collectionsCochees])} />

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500">
          Pin&apos;s inclus ({selectionnes.size} sélectionné{selectionnes.size > 1 ? 's' : ''})
        </label>
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un pin par nom…"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
        <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {resultats.map((p) => (
            <label
              key={p.airtable_id}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selectionnes.has(p.airtable_id)}
                onChange={() => basculer(p.airtable_id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {p.name}
            </label>
          ))}
          {resultats.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Aucun résultat.</p>}
        </div>
        {selectionnes.size > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...selectionnes].map((id) => (
              <span key={id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {nomParId[id] ?? id}
                <button type="button" onClick={() => basculer(id)} className="text-slate-400 hover:text-slate-900">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {collections.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Collections</label>
          <div className="flex max-h-32 flex-wrap gap-3 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {collections.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
                <input
                  type="checkbox"
                  disabled={c.handle === 'tous-les-pins'}
                  checked={c.handle === 'tous-les-pins' || collectionsCochees.has(c.id)}
                  onChange={() => basculerCollection(c.id)}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                {c.title}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
