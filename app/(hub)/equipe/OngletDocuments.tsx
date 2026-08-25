'use client';

import { useEffect, useRef, useState } from 'react';

import { obtenirDocuments, obtenirUrlDocument, supprimerDocument, uploaderDocument } from './actions';
import { TexteAlerte } from './ui';
import type { DocumentEmploye, Profile } from './types';

export function OngletDocuments({ profil }: { profil: Profile }) {
  const [documents, setDocuments] = useState<DocumentEmploye[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const charger = () => {
    obtenirDocuments(profil.id).then(setDocuments);
  };

  useEffect(() => {
    setDocuments(null);
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil.id]);

  const choisirFichier = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setEnCours(true);
    const lecteur = new FileReader();
    lecteur.onload = async () => {
      const base64 = String(lecteur.result).split(',')[1] ?? '';
      try {
        await uploaderDocument({
          profileId: profil.id,
          nomFichier: fichier.name,
          base64,
          contentType: fichier.type || 'application/octet-stream',
        });
        charger();
      } finally {
        setEnCours(false);
      }
    };
    lecteur.readAsDataURL(fichier);
    if (inputRef.current) inputRef.current.value = '';
  };

  const ouvrirDocument = async (chemin: string) => {
    const url = await obtenirUrlDocument(chemin);
    window.open(url, '_blank');
  };

  const supprimer = (d: DocumentEmploye) => {
    if (!window.confirm(`Supprimer le document « ${d.nom_fichier} » ?`)) return;
    supprimerDocument(d.id, d.chemin_stockage).then(charger);
  };

  if (documents === null) return <TexteAlerte>Chargement...</TexteAlerte>;

  return (
    <div className="pb-6">
      <label className="mb-4 inline-block cursor-pointer rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
        {enCours ? 'Envoi...' : '+ Ajouter un document'}
        <input ref={inputRef} type="file" onChange={choisirFichier} disabled={enCours} className="hidden" />
      </label>

      {documents.length === 0 && <TexteAlerte>Aucun document.</TexteAlerte>}
      {documents.map((d) => (
        <div
          key={d.id}
          className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <button onClick={() => ouvrirDocument(d.chemin_stockage)} className="flex-1 text-left text-sm text-slate-800 hover:underline">
            {d.nom_fichier}
          </button>
          <button onClick={() => supprimer(d)} className="text-xs font-semibold text-red-500 hover:text-red-700">
            Supprimer
          </button>
        </div>
      ))}
    </div>
  );
}
