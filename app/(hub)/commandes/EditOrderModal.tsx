'use client';

import { useMemo, useState, useTransition } from 'react';

import { modifierCommande } from './actions';
import type { ArticleCommande, CommandeFournisseur, HubPinLite } from '@/lib/purchase-orders';

interface NouvelArticle {
  airtableId: string;
  name: string;
  skuPimpit: string | null;
  skuFournisseur: string;
  photo: string;
  stockActuel: number;
  qty: number;
}

/** Réplique la modale "Modifier la commande" de l'ancien admin (openEditOrderModal/
 * renderEditOrderList/renderEditAddPins/confirmEditOrder) : quantités éditables sur les articles
 * existants + recherche/ajout de nouveaux pins (toutes marques confondues, comme l'ancien code —
 * pas de filtre par fournisseur ici, contrairement à la commande manuelle). */
export function EditOrderModal({
  commande,
  pinsInitiaux,
  onClose,
  onEnregistre,
}: {
  commande: CommandeFournisseur;
  pinsInitiaux: HubPinLite[];
  onClose: () => void;
  onEnregistre: () => void;
}) {
  const [qtysExistants, setQtysExistants] = useState<Record<string, number>>(
    Object.fromEntries(commande.items.map((i) => [i.airtableId, i.qty])),
  );
  const [nouveaux, setNouveaux] = useState<NouvelArticle[]>([]);
  const [recherche, setRecherche] = useState('');
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const idsExistants = useMemo(() => new Set(commande.items.map((i) => i.airtableId)), [commande.items]);
  const idsNouveaux = useMemo(() => new Set(nouveaux.map((i) => i.airtableId)), [nouveaux]);

  const resultatsRecherche = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return pinsInitiaux
      .filter((p) => !idsExistants.has(p.airtable_id) && !idsNouveaux.has(p.airtable_id))
      .filter((p) => {
        if (!q) return true;
        return (
          (p.name ?? '').toLowerCase().includes(q) ||
          String(p.sku_pimpit ?? '').includes(q) ||
          (p.sku_fournisseur ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [pinsInitiaux, idsExistants, idsNouveaux, recherche]);

  function ajouter(p: HubPinLite) {
    setNouveaux((prev) => [
      ...prev,
      {
        airtableId: p.airtable_id,
        name: p.name ?? '',
        skuPimpit: p.sku_pimpit,
        skuFournisseur: p.sku_fournisseur ?? '',
        photo: p.image_url ?? '',
        stockActuel: Math.round(p.stock ?? 0),
        qty: 10,
      },
    ]);
  }

  function retirerNouveau(id: string) {
    setNouveaux((prev) => prev.filter((i) => i.airtableId !== id));
  }

  function valider() {
    setErreur(null);
    const items: ArticleCommande[] = [
      ...commande.items.map((i) => ({ ...i, qty: qtysExistants[i.airtableId] ?? i.qty })),
      ...nouveaux.map((i) => ({
        airtableId: i.airtableId,
        name: i.name,
        skuPimpit: i.skuPimpit,
        skuFournisseur: i.skuFournisseur,
        stockActuel: i.stockActuel,
        qty: i.qty,
      })),
    ];
    demarrer(async () => {
      try {
        await modifierCommande(commande.id, items);
        onEnregistre();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] w-[700px] max-w-full flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-lg font-bold text-slate-900">Modifier — {commande.ref || 'Sans référence'}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-3 text-sm text-slate-500">Modifiez les quantités ou ajoutez des pin&apos;s, puis validez.</p>

          <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto">
            {commande.items.map((item) => (
              <div key={item.airtableId} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                  <p className="text-xs text-slate-400">Stock à la commande : {item.stockActuel}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  value={qtysExistants[item.airtableId] ?? item.qty}
                  onChange={(e) => setQtysExistants((prev) => ({ ...prev, [item.airtableId]: parseInt(e.target.value, 10) || 0 }))}
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm font-semibold outline-none focus:border-slate-400"
                />
              </div>
            ))}
            {nouveaux.map((item) => (
              <div key={item.airtableId} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                  <p className="text-xs font-medium text-emerald-600">✦ Nouveau</p>
                </div>
                <input
                  type="number"
                  min={1}
                  value={item.qty}
                  onChange={(e) =>
                    setNouveaux((prev) =>
                      prev.map((i) => (i.airtableId === item.airtableId ? { ...i, qty: parseInt(e.target.value, 10) || 0 } : i)),
                    )
                  }
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm font-semibold outline-none focus:border-slate-400"
                />
                <button
                  onClick={() => retirerNouveau(item.airtableId)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-sm text-white hover:bg-red-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">Ajouter un pin&apos;s</p>
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher par nom ou SKU..."
              className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <div className="max-h-[220px] overflow-y-auto rounded-xl border border-slate-200">
              {resultatsRecherche.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-400">Aucun résultat</p>
              ) : (
                resultatsRecherche.map((p) => (
                  <button
                    key={p.airtable_id}
                    onClick={() => ajouter(p)}
                    className="flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                  >
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-slate-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">
                        SKU {p.sku_pimpit ?? '—'} · Stock : {p.stock ?? 0}
                      </p>
                    </div>
                    <span className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white">+ Ajouter</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={valider}
            disabled={enCours}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
