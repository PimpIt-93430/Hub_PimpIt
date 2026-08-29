'use client';

import { useRef, useState, useTransition } from 'react';

import { signalerPinInconnu } from './actions';
import { uploaderPhotoPinNavigateur } from '@/lib/uploadPhotoPin';

/** Signalement rapide d'un pin trouvé physiquement mais absent du catalogue — cf.
 * FormulaireSignalementPin (StockScreen.tsx) : juste une photo (+ note libre), reste "à compléter"
 * jusqu'à ce qu'un admin renseigne son vrai nom/seuil/poids depuis la fiche détail. */
export function FormulaireSignalementPin({ onFermer, onChanged }: { onFermer: () => void; onChanged: () => void }) {
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ dataUrl: string; fichier: File } | null>(null);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const choisirPhoto = (fichier: File | undefined) => {
    if (!fichier) return;
    setPhoto({ dataUrl: URL.createObjectURL(fichier), fichier });
  };

  const valider = () => {
    if (!photo) return;
    setErreur(null);
    demarrer(async () => {
      try {
        const photoUrl = await uploaderPhotoPinNavigateur(photo.fichier);
        await signalerPinInconnu(photoUrl, note.trim() || undefined);
        onChanged();
        onFermer();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec de l'envoi de la photo.");
      }
    });
  };

  return (
    <div className="mb-4 rounded-2xl border border-dashed border-amber-300 bg-white p-4">
      <p className="mb-3 text-sm text-slate-500">
        Pin trouvé physiquement mais absent du catalogue : prends-le en photo, un admin complètera le nom, le seuil et le poids ensuite.
      </p>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => choisirPhoto(e.target.files?.[0])} />
      <button
        onClick={() => inputRef.current?.click()}
        className="mb-3 flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl bg-slate-100"
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.dataUrl} alt="Pin signalé" className="h-24 w-24 object-cover" />
        ) : (
          <span className="px-2 text-center text-xs font-semibold text-slate-400">+ Photo</span>
        )}
      </button>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optionnel)"
        className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none"
      />
      {erreur && <p className="mb-3 text-xs text-red-600">{erreur}</p>}
      <div className="flex gap-2">
        <button onClick={onFermer} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600">
          Annuler
        </button>
        <button
          onClick={valider}
          disabled={!photo || enCours}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white ${!photo || enCours ? 'bg-amber-300' : 'bg-amber-600 hover:bg-amber-700'}`}
        >
          {enCours ? 'Envoi…' : 'Signaler'}
        </button>
      </div>
    </div>
  );
}
