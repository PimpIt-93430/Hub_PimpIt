'use client';

import { useMemo, useState, useTransition } from 'react';

import { modifierPackPins, supprimerPack } from './actions';
import type { HubPack, PinOption } from './types';

const champInput = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400';

/** Réplique la modale "Modifier — {nom}" de l'ancien admin (openEditPackModal/savePackPins) :
 * photo en lecture seule, liste de pin's avec stepper de quantité (−/N/+, clic sur la ligne = +1),
 * case "Problème sur ce pack", bouton Enregistrer. Le nom/SKU/photo ne sont PAS éditables ici —
 * l'ancien admin ne le permettait pas non plus (edit-pack-modal ne contient aucun champ pour ça). */
export function EditPackModal({ pack, pins, onClose }: { pack: HubPack; pins: PinOption[]; onClose: () => void }) {
  const [recherche, setRecherche] = useState('');
  const [quantites, setQuantites] = useState<Record<string, number>>({ ...(pack.qtes_pins ?? {}) });
  const [probleme, setProbleme] = useState(Boolean(pack.probleme));
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const pinsParId = useMemo(() => new Map(pins.map((p) => [p.airtable_id, p])), [pins]);

  const pinsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? pins.filter((p) => (p.name ?? '').toLowerCase().includes(q)) : pins;
  }, [pins, recherche]);

  function changerQte(id: string, delta: number) {
    setQuantites((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      const copie = { ...prev };
      if (next === 0) delete copie[id];
      else copie[id] = next;
      return copie;
    });
  }

  const entrees = Object.entries(quantites);
  const total = entrees.reduce((s, [, q]) => s + q, 0);
  const resume = entrees
    .map(([id, qte]) => {
      const nom = pinsParId.get(id)?.name ?? id;
      return qte > 1 ? `${nom} ×${qte}` : nom;
    })
    .join(', ');

  function enregistrer() {
    setErreur(null);
    demarrer(async () => {
      try {
        await modifierPackPins(pack.airtable_id, { qtesPins: quantites, probleme });
        onClose();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  function supprimer() {
    if (!confirm(`Supprimer le pack « ${pack.nom_du_pack ?? pack.airtable_id} » ?`)) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await supprimerPack(pack.airtable_id);
        onClose();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] w-[600px] max-w-full flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-lg font-bold text-slate-900">Modifier — {pack.nom_du_pack || pack.airtable_id}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          {pack.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pack.photo_url} alt="" className="mx-auto max-h-[180px] rounded-xl object-contain" />
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Pin&apos;s inclus</p>
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un pin's..."
              className={`${champInput} rounded-b-none`}
            />
            <div className="max-h-80 overflow-y-auto rounded-b-lg border border-t-0 border-slate-200">
              {pinsFiltres.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">Aucun pin&apos;s trouvé</p>
              ) : (
                pinsFiltres.map((p) => {
                  const qte = quantites[p.airtable_id] ?? 0;
                  return (
                    <div
                      key={p.airtable_id}
                      onClick={() => changerQte(p.airtable_id, 1)}
                      className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 ${qte > 0 ? 'bg-slate-50' : ''}`}
                    >
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
                      ) : (
                        <div className="h-7 w-7 shrink-0 rounded-md bg-slate-100" />
                      )}
                      <span className="flex-1 text-slate-800">
                        {p.name} <span className="text-xs text-slate-400">#{p.sku_pimpit || '?'}</span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => changerQte(p.airtable_id, -1)}
                          className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-slate-200 bg-white text-base leading-none text-slate-600 hover:bg-slate-50"
                        >
                          −
                        </button>
                        <span className="min-w-[18px] text-center text-sm font-semibold text-slate-800">{qte}</span>
                        <button
                          type="button"
                          onClick={() => changerQte(p.airtable_id, 1)}
                          className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-slate-200 bg-white text-base leading-none text-slate-600 hover:bg-slate-50"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
            <p>
              {entrees.length} pin{entrees.length > 1 ? 's' : ''} différent{entrees.length > 1 ? 's' : ''} · {total} au total
            </p>
            {resume && <p className="mt-1 leading-relaxed">{resume}</p>}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-red-600">
            <input type="checkbox" checked={probleme} onChange={(e) => setProbleme(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-red-500" />
            Problème sur ce pack
          </label>

          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        </div>

        <div className="flex items-center gap-2.5 border-t border-slate-100 px-6 py-4">
          <button onClick={supprimer} disabled={enCours} className="mr-auto text-xs font-semibold text-red-500 hover:text-red-700">
            Supprimer
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={enregistrer}
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
