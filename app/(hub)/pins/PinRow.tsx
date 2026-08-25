'use client';

import { useState, useTransition } from 'react';

import { modifierPin, supprimerPin } from './actions';

interface HubPin {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  sku_fournisseur: string | null;
  stock: number | null;
  seuil_cible: number | null;
  fournisseur: string | null;
  boite: string | null;
  poids_unitaire: number | null;
  poids_total: number | null;
  custom: boolean | null;
  pas_dans_unite: boolean | null;
  description: string | null;
  image_url: string | null;
}

const champ = 'w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none';

export function PinRow({ pin }: { pin: HubPin }) {
  const [edition, setEdition] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const sousLeSeuil = (pin.stock ?? 0) < (pin.seuil_cible ?? 0);

  function supprimer() {
    if (!confirm(`Supprimer le pin « ${pin.name ?? pin.airtable_id} » ?`)) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await supprimerPin(pin.airtable_id);
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
                  await modifierPin(pin.airtable_id, formData);
                  setEdition(false);
                } catch (e) {
                  setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
                }
              });
            }}
            className="grid grid-cols-2 gap-2 sm:grid-cols-7 sm:items-center"
          >
            <input name="name" defaultValue={pin.name ?? ''} placeholder="Nom" className={champ} />
            <input name="sku_pimpit" defaultValue={pin.sku_pimpit ?? ''} placeholder="SKU Pimp It" className={champ} />
            <input
              name="sku_fournisseur"
              defaultValue={pin.sku_fournisseur ?? ''}
              placeholder="SKU Fournisseur"
              className={champ}
            />
            <input name="fournisseur" defaultValue={pin.fournisseur ?? ''} placeholder="Fournisseur" className={champ} />
            <input name="boite" defaultValue={pin.boite ?? ''} placeholder="Boîte" className={champ} />
            <input name="stock" type="number" defaultValue={pin.stock ?? ''} placeholder="Stock" className={champ} />
            <input
              name="seuil_cible"
              type="number"
              defaultValue={pin.seuil_cible ?? ''}
              placeholder="Seuil cible"
              className={champ}
            />
            <input
              name="poids_unitaire"
              type="number"
              step="0.01"
              defaultValue={pin.poids_unitaire ?? ''}
              placeholder="Poids unité x10"
              className={champ}
            />
            <input
              name="poids_total"
              type="number"
              step="0.01"
              defaultValue={pin.poids_total ?? ''}
              placeholder="Poids total"
              className={champ}
            />
            <input
              name="image_url"
              defaultValue={pin.image_url ?? ''}
              placeholder="URL image"
              className={`${champ} col-span-2 sm:col-span-2`}
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                name="custom"
                type="checkbox"
                defaultChecked={pin.custom ?? false}
                className="h-4 w-4 rounded border-slate-300"
              />
              Custom
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                name="pas_dans_unite"
                type="checkbox"
                defaultChecked={pin.pas_dans_unite ?? false}
                className="h-4 w-4 rounded border-slate-300"
              />
              Pas dans pin&apos;s unité
            </label>
            <textarea
              name="description"
              defaultValue={pin.description ?? ''}
              placeholder="Description"
              rows={2}
              className={`${champ} col-span-2 sm:col-span-7`}
            />
            <div className="col-span-2 flex items-center gap-2 sm:col-span-7">
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
      <td className="px-4 py-2.5 font-semibold text-slate-800">
        {pin.name ?? '—'}
        {pin.custom && (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Custom
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-slate-500">{pin.sku_pimpit ?? '—'}</td>
      <td className="px-4 py-2.5 text-slate-500">{pin.sku_fournisseur ?? '—'}</td>
      <td className="px-4 py-2.5 text-slate-500">{pin.fournisseur ?? '—'}</td>
      <td className="px-4 py-2.5 text-slate-500">{pin.boite ?? '—'}</td>
      <td className={`px-4 py-2.5 text-right font-semibold ${sousLeSeuil ? 'text-amber-600' : 'text-slate-700'}`}>
        {pin.stock ?? 0}
      </td>
      <td className="px-4 py-2.5 text-right text-slate-500">{pin.seuil_cible ?? '—'}</td>
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
