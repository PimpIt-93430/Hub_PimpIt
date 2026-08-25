'use client';

import { useState, useTransition } from 'react';

import { modifierSabot, supprimerSabot } from './actions';

interface HubSabot {
  airtable_id: string;
  couleur: string | null;
  taille: string | null;
  stock: number | null;
  sku: string | null;
  inventory_item_id: string | null;
  synced_at: string | null;
}

const champ = 'w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none';

export function SabotRow({ sabot }: { sabot: HubSabot }) {
  const [edition, setEdition] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function supprimer() {
    if (!confirm(`Supprimer le sabot « ${sabot.couleur ?? sabot.airtable_id} » ?`)) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await supprimerSabot(sabot.airtable_id);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  if (edition) {
    return (
      <tr className="border-b border-slate-50 bg-slate-50/60 last:border-0">
        <td className="px-2 py-2" colSpan={5}>
          <form
            action={(formData) => {
              setErreur(null);
              demarrer(async () => {
                try {
                  await modifierSabot(sabot.airtable_id, formData);
                  setEdition(false);
                } catch (e) {
                  setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
                }
              });
            }}
            className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:items-center"
          >
            <input name="couleur" defaultValue={sabot.couleur ?? ''} placeholder="Couleur" className={champ} />
            <input name="taille" defaultValue={sabot.taille ?? ''} placeholder="Taille" className={champ} />
            <input name="sku" defaultValue={sabot.sku ?? ''} placeholder="SKU" className={champ} />
            <input
              name="stock"
              type="number"
              defaultValue={sabot.stock ?? ''}
              placeholder="Stock"
              className={champ}
            />
            <div className="col-span-2 flex items-center gap-2 sm:col-span-5">
              <button
                type="submit"
                disabled={enCours}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setEdition(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                Annuler
              </button>
              {erreur && <span className="text-xs text-red-600">{erreur}</span>}
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-b border-slate-50 last:border-0">
      <td className="px-4 py-2.5 font-semibold text-slate-800">{sabot.couleur ?? '—'}</td>
      <td className="px-4 py-2.5 text-slate-500">{sabot.taille ?? '—'}</td>
      <td className="px-4 py-2.5 text-slate-500">{sabot.sku ?? '—'}</td>
      <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{sabot.stock ?? 0}</td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex justify-end gap-2 opacity-0 transition group-hover:opacity-100">
          <button onClick={() => setEdition(true)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
            Modifier
          </button>
          <button onClick={supprimer} disabled={enCours} className="text-xs font-semibold text-red-500 hover:text-red-700">
            Supprimer
          </button>
        </div>
      </td>
    </tr>
  );
}
