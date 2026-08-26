'use client';

import { useMemo, useState } from 'react';

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

/** Réplique le sélecteur de pin's du tiroir "Créer un nouveau produit" de l'ancien admin
 * (unite-create-list) : par défaut, seuls les pin's pas encore dans un produit (`pinsARajouter`)
 * sont proposés — un bouton "+ Ajouter des pin's déjà dans des produits en ligne" révèle le reste
 * sous un séparateur, exactement comme loadAllPinsForCreate()/renderCreateList() côté ancien site.
 * Plus le choix des collections à cocher. */
export function PinsUniteSelector({
  pinsARajouter,
  autresPins,
  collections,
}: {
  pinsARajouter: PinOption[];
  autresPins: PinOption[];
  collections: CollectionOption[];
}) {
  const [recherche, setRecherche] = useState('');
  const [selectionnes, setSelectionnes] = useState<Set<string>>(new Set());
  const [collectionsCochees, setCollectionsCochees] = useState<Set<string>>(new Set());
  const [autresPinsCharges, setAutresPinsCharges] = useState(false);

  const q = recherche.trim().toLowerCase();
  const correspond = (p: PinOption) =>
    !q || (p.name ?? '').toLowerCase().includes(q) || (p.sku_pimpit ?? '').includes(q);

  const principaux = useMemo(() => pinsARajouter.filter(correspond), [pinsARajouter, q]);
  const secondaires = useMemo(
    () => (autresPinsCharges ? autresPins.filter(correspond) : []),
    [autresPins, autresPinsCharges, q],
  );

  const tousLesPins = useMemo(() => [...pinsARajouter, ...autresPins], [pinsARajouter, autresPins]);
  const nomParId = useMemo(
    () => Object.fromEntries(tousLesPins.map((p) => [p.airtable_id, p.name ?? p.airtable_id])),
    [tousLesPins],
  );

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

  function ligne(p: PinOption) {
    const sel = selectionnes.has(p.airtable_id);
    return (
      <label
        key={p.airtable_id}
        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
      >
        <input
          type="checkbox"
          checked={sel}
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
  }

  return (
    <div>
      <input type="hidden" name="pin_ids" value={JSON.stringify([...selectionnes])} />
      <input type="hidden" name="collection_ids" value={JSON.stringify([...collectionsCochees])} />

      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Pin&apos;s inclus ({selectionnes.size} sélectionné{selectionnes.size > 1 ? 's' : ''})
      </p>
      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher..."
        className="mb-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
      <div className="max-h-[340px] overflow-y-auto rounded-lg border border-slate-200 p-1">
        {principaux.length === 0 && secondaires.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-slate-400">Aucun pin trouvé</p>
        ) : (
          <>
            {principaux.map(ligne)}
            {secondaires.length > 0 && (
              <p className="mt-1 border-t border-slate-100 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Déjà dans des produits en ligne
              </p>
            )}
            {secondaires.map(ligne)}
          </>
        )}
      </div>

      {!autresPinsCharges && autresPins.length > 0 && (
        <button
          type="button"
          onClick={() => setAutresPinsCharges(true)}
          className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          + Ajouter des pin&apos;s déjà dans des produits en ligne
        </button>
      )}

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

      {collections.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Collections</p>
          <div className="flex max-h-32 flex-wrap gap-3 overflow-y-auto rounded-lg border border-slate-200 p-2.5">
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
