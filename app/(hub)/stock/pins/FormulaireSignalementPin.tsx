'use client';

import { useRef, useState, useTransition } from 'react';

import { signalerPinInconnu, uploaderPhotoPin } from './actions';

function lireFichierEnBase64(fichier: File): Promise<{ dataUrl: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const dataUrl = lecteur.result as string;
      resolve({ dataUrl, base64: dataUrl.split(',')[1] ?? '' });
    };
    lecteur.onerror = reject;
    lecteur.readAsDataURL(fichier);
  });
}

/** Signalement rapide d'un pin trouvé physiquement mais absent du catalogue — cf.
 * FormulaireSignalementPin (StockScreen.tsx) : juste une photo (+ note libre), reste "à compléter"
 * jusqu'à ce qu'un admin renseigne son vrai nom/seuil/poids depuis la fiche détail. */
export function FormulaireSignalementPin({ onFermer, onChanged }: { onFermer: () => void; onChanged: () => void }) {
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ dataUrl: string; base64: string; contentType: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const choisirPhoto = async (fichier: File | undefined) => {
    if (!fichier) return;
    const { dataUrl, base64 } = await lireFichierEnBase64(fichier);
    setPhoto({ dataUrl, base64, contentType: fichier.type || 'image/jpeg' });
  };

  const valider = () => {
    if (!photo) return;
    demarrer(async () => {
      const photoUrl = await uploaderPhotoPin(photo.base64, photo.contentType);
      await signalerPinInconnu(photoUrl, note.trim() || undefined);
      onChanged();
      onFermer();
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
