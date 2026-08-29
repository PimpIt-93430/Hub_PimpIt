'use client';

import { useRef, useState } from 'react';

import { mettreAJourPhotoPin } from './actions';
import { PinsUniteModal } from './PinsUniteModal';
import { uploaderPhotoPinNavigateur } from '@/lib/uploadPhotoPin';

interface PinARajouter {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  fournisseur: string | null;
  stock: number;
  image_url: string | null;
}
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

/** Cellule photo d'une ligne "pin à rajouter" — cf. discussion 2026-08-29 : certains pins listés
 * ici n'ont pas encore de photo, on peut maintenant en ajouter une directement depuis ce tableau
 * plutôt que de devoir passer par l'écran "Pin's". Même mécanisme que là-bas (upload storage puis
 * enregistrement de l'URL), juste un bouton en plus pour les pins sans photo. */
function CellulePhoto({ airtableId, imageUrl }: { airtableId: string; imageUrl: string | null }) {
  const [url, setUrl] = useState(imageUrl);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const choisirFichier = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    setEnCours(true);
    setErreur(null);
    try {
      const nouvelleUrl = await uploaderPhotoPinNavigateur(fichier);
      await mettreAJourPhotoPin(airtableId, nouvelleUrl);
      setUrl(nouvelleUrl);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Échec de l’envoi de la photo.');
    } finally {
      setEnCours(false);
    }
  };

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-9 w-9 rounded-md object-cover" />;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={enCours}
        title="Ajouter une photo"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400 hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-50"
      >
        {enCours ? '…' : '+'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={choisirFichier} />
      {erreur && <p className="max-w-[140px] text-[10px] text-red-600">{erreur}</p>}
    </div>
  );
}

/** Réplique l'écran "Pin's à rajouter sur le site" de l'ancien admin (screen-to-add /
 * loadToAdd() dans public/index.html) : même tableau (photo, nom, SKU, fournisseur, stock),
 * même message vide "Aucun pin à rajouter 🎉". */
export function PinsUnitePageClient({
  pinsARajouter,
  autresPins,
  collections,
}: {
  pinsARajouter: PinARajouter[];
  autresPins: PinOption[];
  collections: CollectionOption[];
}) {
  const [urlCreee, setUrlCreee] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pin&apos;s à rajouter sur le site</h1>
          <p className="mt-1 text-sm text-slate-400">Pin&apos;s cochés &laquo;&nbsp;Pas dans pin&apos;s unité&nbsp;&raquo;</p>
        </div>
      </div>

      <div className="mb-4">
        <PinsUniteModal
          pinsARajouter={pinsARajouter}
          autresPins={autresPins}
          collections={collections}
          onCree={setUrlCreee}
        />
        {urlCreee && (
          <p className="mt-2 text-sm text-emerald-700">
            Produit Shopify créé :{' '}
            <a href={urlCreee} target="_blank" rel="noreferrer" className="underline">
              voir sur Shopify
            </a>
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3" />
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">SKU Pimpit</th>
              <th className="px-4 py-3">Fournisseur</th>
              <th className="px-4 py-3">Stock</th>
            </tr>
          </thead>
          <tbody>
            {pinsARajouter.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Aucun pin à rajouter 🎉
                </td>
              </tr>
            ) : (
              pinsARajouter.map((p) => (
                <tr key={p.airtable_id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5">
                    <CellulePhoto airtableId={p.airtable_id} imageUrl={p.image_url} />
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{p.name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                      {p.sku_pimpit ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{p.fournisseur ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                      {Math.round(p.stock)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
