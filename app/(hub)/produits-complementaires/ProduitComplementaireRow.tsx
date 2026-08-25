'use client';

import { useState, useTransition } from 'react';

import { modifierProduitComplementaire, supprimerProduitComplementaire } from './actions';

interface HubProduitComplementaire {
  airtable_id: string;
  nom: string | null;
  photo_url: string | null;
  prix: number | null;
  actif: boolean | null;
  description: string | null;
  synced_at: string | null;
}

const champ = 'w-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none';

function formatPrix(prix: number): string {
  return `${prix.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function tronquer(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max)}…` : texte;
}

export function ProduitComplementaireRow({ produit }: { produit: HubProduitComplementaire }) {
  const [edition, setEdition] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function supprimer() {
    if (!confirm(`Supprimer le produit « ${produit.nom ?? produit.airtable_id} » ?`)) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await supprimerProduitComplementaire(produit.airtable_id);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  if (edition) {
    return (
      <tr className="border-b border-slate-50 bg-slate-50/60 last:border-0">
        <td className="px-2 py-2" colSpan={6}>
          <form
            action={(formData) => {
              setErreur(null);
              demarrer(async () => {
                try {
                  await modifierProduitComplementaire(produit.airtable_id, formData);
                  setEdition(false);
                } catch (e) {
                  setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
                }
              });
            }}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-center"
          >
            <input name="nom" defaultValue={produit.nom ?? ''} placeholder="Nom" className={champ} />
            <input name="photo_url" defaultValue={produit.photo_url ?? ''} placeholder="URL photo" className={champ} />
            <input
              name="prix"
              type="number"
              step="0.01"
              defaultValue={produit.prix ?? ''}
              placeholder="Prix"
              className={champ}
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                name="actif"
                type="checkbox"
                defaultChecked={produit.actif ?? false}
                className="h-4 w-4 rounded border-slate-300"
              />
              Actif
            </label>
            <textarea
              name="description"
              defaultValue={produit.description ?? ''}
              placeholder="Description"
              rows={2}
              className={`${champ} col-span-2 sm:col-span-4`}
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

  const description = produit.description ?? '';

  return (
    <tr className="group border-b border-slate-50 last:border-0">
      <td className="px-4 py-2.5">
        {produit.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={produit.photo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 font-semibold text-slate-800">{produit.nom ?? '—'}</td>
      <td className="px-4 py-2.5 text-right text-slate-700">
        {typeof produit.prix === 'number' ? formatPrix(produit.prix) : '—'}
      </td>
      <td className="px-4 py-2.5">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            produit.actif ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {produit.actif ? 'Actif' : 'Inactif'}
        </span>
      </td>
      <td className="px-4 py-2.5 text-slate-500">{description ? tronquer(description, 60) : '—'}</td>
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
