'use client';

import { useState, useTransition } from 'react';

import { modifierSabotCustom, supprimerSabotCustom } from './actions';

interface HubSabotCustom {
  airtable_id: string;
  nom: string | null;
  sku_shopify: string | null;
  photo_url: string | null;
  shopify_product_id: string | null;
  pins_inclus_count: number | null;
  synced_at: string | null;
}

const champ = 'w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none';

export function SabotCustomRow({ sabotCustom }: { sabotCustom: HubSabotCustom }) {
  const [edition, setEdition] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function supprimer() {
    if (!confirm(`Supprimer le sabot personnalisé « ${sabotCustom.nom ?? sabotCustom.airtable_id} » ?`)) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await supprimerSabotCustom(sabotCustom.airtable_id);
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
                  await modifierSabotCustom(sabotCustom.airtable_id, formData);
                  setEdition(false);
                } catch (e) {
                  setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
                }
              });
            }}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-center"
          >
            <input name="nom" defaultValue={sabotCustom.nom ?? ''} placeholder="Nom" className={champ} />
            <input
              name="sku_shopify"
              defaultValue={sabotCustom.sku_shopify ?? ''}
              placeholder="SKU Shopify"
              className={champ}
            />
            <input
              name="photo_url"
              defaultValue={sabotCustom.photo_url ?? ''}
              placeholder="URL photo"
              className={champ}
            />
            <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
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

  const nbPins = sabotCustom.pins_inclus_count ?? 0;

  return (
    <tr className="group border-b border-slate-50 last:border-0">
      <td className="px-4 py-2.5">
        {sabotCustom.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sabotCustom.photo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 font-semibold text-slate-800">{sabotCustom.nom ?? '—'}</td>
      <td className="px-4 py-2.5 text-slate-500">{sabotCustom.sku_shopify ?? '—'}</td>
      <td className="px-4 py-2.5 text-slate-500">{nbPins > 0 ? `${nbPins} pin${nbPins > 1 ? "'s" : "'"}` : '—'}</td>
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
