'use client';

import { useState, useTransition } from 'react';

import { modifierPack, supprimerPack } from './actions';

interface HubPack {
  airtable_id: string;
  nom_du_pack: string | null;
  sku_shopify: string | null;
  photo_url: string | null;
  stock_max: number | null;
  probleme: boolean | null;
  qtes_pins: Record<string, number> | null;
  pins_inclus_count: number | null;
  synced_at: string | null;
}

/** `qtes_pins` est un objet jsonb, ex. {"recXXX": 2, "recYYY": 1} — une quantité par pin lié
 * (contrairement à `Articles` sur les commandes fournisseurs, qui est un tableau). On lit
 * défensivement pour ne pas faire échouer tout l'affichage sur un format inattendu. */
function quantiteTotalePins(qtesPins: Record<string, number> | null): number | null {
  if (!qtesPins || typeof qtesPins !== 'object' || Array.isArray(qtesPins)) return null;
  return Object.values(qtesPins).reduce((s, q) => s + (typeof q === 'number' ? q : 0), 0);
}

const champ = 'w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none';

export function PackRow({ pack }: { pack: HubPack }) {
  const [edition, setEdition] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function supprimer() {
    if (!confirm(`Supprimer le pack « ${pack.nom_du_pack ?? pack.airtable_id} » ?`)) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await supprimerPack(pack.airtable_id);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  if (edition) {
    return (
      <tr className="border-b border-slate-50 bg-slate-50/60 last:border-0">
        <td className="px-2 py-2" colSpan={8}>
          <form
            action={(formData) => {
              setErreur(null);
              demarrer(async () => {
                try {
                  await modifierPack(pack.airtable_id, formData);
                  setEdition(false);
                } catch (e) {
                  setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
                }
              });
            }}
            className="grid grid-cols-2 gap-2 sm:grid-cols-6 sm:items-center"
          >
            <input
              name="nom_du_pack"
              defaultValue={pack.nom_du_pack ?? ''}
              placeholder="Nom du pack"
              className={champ}
            />
            <input
              name="sku_shopify"
              defaultValue={pack.sku_shopify ?? ''}
              placeholder="SKU Shopify"
              className={champ}
            />
            <input name="photo_url" defaultValue={pack.photo_url ?? ''} placeholder="URL photo" className={champ} />
            <input
              name="stock_max"
              type="number"
              defaultValue={pack.stock_max ?? ''}
              placeholder="Stock max"
              className={champ}
            />
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                name="probleme"
                type="checkbox"
                defaultChecked={Boolean(pack.probleme)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Problème
            </label>
            <div className="col-span-2 flex items-center gap-2 sm:col-span-6">
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

  const thumb = pack.photo_url;
  const nbPins = pack.pins_inclus_count ?? 0;
  const qteTotale = quantiteTotalePins(pack.qtes_pins);
  const probleme = Boolean(pack.probleme);

  return (
    <tr className="group border-b border-slate-50 last:border-0">
      <td className="px-4 py-2.5">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 font-semibold text-slate-800">{pack.nom_du_pack ?? '—'}</td>
      <td className="px-4 py-2.5 text-slate-500">{pack.sku_shopify ?? '—'}</td>
      <td className="px-4 py-2.5 text-right text-slate-700">{nbPins || '—'}</td>
      <td className="px-4 py-2.5 text-right text-slate-500">{qteTotale ?? '—'}</td>
      <td className="px-4 py-2.5 text-right text-slate-700">{pack.stock_max ?? '—'}</td>
      <td className="px-4 py-2.5">
        {probleme ? (
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">Problème</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
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
