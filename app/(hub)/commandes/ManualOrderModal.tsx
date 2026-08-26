'use client';

import { useMemo, useState, useTransition } from 'react';

import { creerCommande } from './actions';
import { FOURNISSEURS, type HubPinLite } from '@/lib/purchase-orders';

/** Réplique la modale "Nouvelle commande manuelle" de l'ancien admin (openManualOrderModal/
 * renderManualPins/confirmManualOrder) : recherche + sélection libre de pins pour un fournisseur
 * donné, quantités saisies à la main. Toujours de type 'normal', comme l'ancien code. */
export function ManualOrderModal({
  pinsInitiaux,
  onClose,
  onCree,
}: {
  pinsInitiaux: HubPinLite[];
  onClose: () => void;
  onCree: (ref: string) => void;
}) {
  const [supplier, setSupplier] = useState('');
  const [recherche, setRecherche] = useState('');
  const [selectionnes, setSelectionnes] = useState<Record<string, number>>({});
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const pinsFiltres = useMemo(() => {
    const codes = supplier ? FOURNISSEURS[supplier]?.codes : null;
    const q = recherche.trim().toLowerCase();
    return pinsInitiaux.filter((p) => {
      if (codes && !(p.fournisseur && codes.includes(p.fournisseur))) return false;
      if (!q) return true;
      return (
        (p.name ?? '').toLowerCase().includes(q) ||
        String(p.sku_pimpit ?? '').includes(q) ||
        (p.sku_fournisseur ?? '').toLowerCase().includes(q)
      );
    });
  }, [pinsInitiaux, supplier, recherche]);

  const nbSelectionnes = Object.keys(selectionnes).length;
  const totalPieces = Object.values(selectionnes).reduce((s, q) => s + q, 0);

  function definirQty(id: string, val: string) {
    const qty = parseInt(val, 10) || 0;
    setSelectionnes((prev) => {
      const next = { ...prev };
      if (qty > 0) next[id] = qty;
      else delete next[id];
      return next;
    });
  }

  function valider() {
    if (!supplier) {
      setErreur('Sélectionnez un fournisseur');
      return;
    }
    const ids = Object.keys(selectionnes).filter((id) => selectionnes[id] > 0);
    if (!ids.length) {
      setErreur('Ajoutez au moins un pin avec une quantité');
      return;
    }
    const pinsParId = new Map(pinsInitiaux.map((p) => [p.airtable_id, p]));
    const items = ids.map((id) => {
      const pin = pinsParId.get(id);
      return {
        airtableId: id,
        name: pin?.name ?? '',
        skuPimpit: pin?.sku_pimpit ?? null,
        skuFournisseur: pin?.sku_fournisseur ?? '',
        stockActuel: Math.round(pin?.stock ?? 0),
        qty: selectionnes[id],
      };
    });
    setErreur(null);
    demarrer(async () => {
      try {
        const { ref } = await creerCommande(supplier, items, 'normal');
        onCree(ref);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] w-[740px] max-w-full flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-lg font-bold text-slate-900">Nouvelle commande manuelle</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Fournisseur <span className="text-red-500">*</span>
              </p>
              <select
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-44 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              >
                <option value="">— Tous —</option>
                {Object.keys(FOURNISSEURS).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px] flex-1">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Rechercher</p>
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Nom, SKU..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Fourn.</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Qté à commander</th>
                </tr>
              </thead>
              <tbody>
                {pinsFiltres.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                      Aucun résultat
                    </td>
                  </tr>
                ) : (
                  pinsFiltres.map((p) => {
                    const qty = selectionnes[p.airtable_id] ?? 0;
                    return (
                      <tr key={p.airtable_id} className={qty > 0 ? 'bg-emerald-50/50' : ''}>
                        <td className="border-t border-slate-100 px-3 py-2">
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-slate-100" />
                          )}
                        </td>
                        <td className="border-t border-slate-100 px-3 py-2 font-medium text-slate-800">{p.name}</td>
                        <td className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">{p.fournisseur ?? '—'}</td>
                        <td className="border-t border-slate-100 px-3 py-2 text-right text-slate-700">{p.stock ?? 0}</td>
                        <td className="border-t border-slate-100 px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            value={qty}
                            onChange={(e) => definirQty(p.airtable_id, e.target.value)}
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-slate-400"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <p className="text-sm text-slate-500">
            {nbSelectionnes} pin{nbSelectionnes > 1 ? 's' : ''} sélectionné{nbSelectionnes > 1 ? 's' : ''} · {totalPieces} pièce
            {totalPieces > 1 ? 's' : ''}
          </p>
          <div className="flex gap-2.5">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={valider}
              disabled={enCours}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {enCours ? 'Création…' : 'Créer le bon de commande'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
