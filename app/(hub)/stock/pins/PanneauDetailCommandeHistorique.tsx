'use client';

import { useEffect, useState } from 'react';

import { chargerDetailCommande } from './actions';
import { Modal } from './Modal';
import type { CommandeAvecLignes } from './stockLib';

/** Détail (lecture seule) d'une commande passée — cf. PanneauDetailCommandeHistorique. */
export function PanneauDetailCommandeHistorique({ commandeId, onFermer }: { commandeId: string; onFermer: () => void }) {
  const [data, setData] = useState<(CommandeAvecLignes & { popUpNom: string }) | null>(null);

  useEffect(() => {
    chargerDetailCommande(commandeId).then(setData);
  }, [commandeId]);

  if (!data) {
    return (
      <Modal onClose={onFermer}>
        <p className="text-sm text-slate-400">Chargement…</p>
      </Modal>
    );
  }

  const { commande, popUpNom, lignes } = data;

  return (
    <Modal onClose={onFermer} wide>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Commande — {popUpNom}</h2>
      <p className="mb-4 text-sm capitalize text-slate-400">
        {new Date(commande.envoyee_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <div className="max-h-[480px] overflow-y-auto">
        {lignes.map((ligne) => (
          <div key={ligne.id} className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 p-2">
            {ligne.pin.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ligne.pin.photo_url} alt={ligne.pin.nom} className="h-12 w-12 rounded-lg bg-slate-100 object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-300">?</div>
            )}
            <span className="flex-1 text-sm font-semibold text-slate-800">{ligne.pin.nom}</span>
            <span className={`text-xs font-semibold ${ligne.fait ? 'text-emerald-600' : 'text-slate-400'}`}>
              {ligne.fait ? 'Trouvé' : 'Pas trouvé'}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
