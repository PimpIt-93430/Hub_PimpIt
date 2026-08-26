'use client';

import { useState, useTransition } from 'react';

import { basculerLigneCommande, envoyerCommande } from './actions';
import { Modal } from './Modal';
import type { LigneCommande } from './stockLib';

/** Aperçu/édition de la commande envoyée au local — cf. PanneauCommande (StockScreen.tsx). En
 * création : tout démarre coché, décocher exclut un pin de cet envoi (il reste "à commander").
 * En modification (commande déjà envoyée, pas encore prise en charge) : chaque coche s'enregistre
 * immédiatement en base plutôt qu'au clic sur un bouton "Envoyer". */
export function PanneauCommande({
  lignes,
  popUpId,
  popUpNom,
  commandeId,
  pinIdsInitialementCoches,
  onFermer,
  onChanged,
}: {
  lignes: LigneCommande[];
  popUpId: string;
  popUpNom: string;
  commandeId?: string;
  pinIdsInitialementCoches?: string[];
  onFermer: () => void;
  onChanged: () => void;
}) {
  const modeModification = pinIdsInitialementCoches !== undefined;
  const [pinsExclus, setPinsExclus] = useState<Set<string>>(
    () => new Set(pinIdsInitialementCoches ? lignes.filter((l) => !pinIdsInitialementCoches.includes(l.pin.id)).map((l) => l.pin.id) : []),
  );
  const [enCours, demarrer] = useTransition();

  const lignesRetenues = lignes.filter((l) => !pinsExclus.has(l.pin.id));

  const basculerPin = (pinId: string) => {
    const inclusApres = pinsExclus.has(pinId);
    setPinsExclus((prev) => {
      const next = new Set(prev);
      if (next.has(pinId)) next.delete(pinId);
      else next.add(pinId);
      return next;
    });
    if (modeModification && commandeId) {
      demarrer(async () => {
        await basculerLigneCommande({ commandeId, pinId, inclus: inclusApres });
        onChanged();
      });
    }
  };

  const toutSelectionner = () => {
    if (modeModification && commandeId) {
      const aInclure = lignes.filter((l) => pinsExclus.has(l.pin.id)).map((l) => l.pin.id);
      demarrer(async () => {
        await Promise.all(aInclure.map((pinId) => basculerLigneCommande({ commandeId, pinId, inclus: true })));
        onChanged();
      });
    }
    setPinsExclus(new Set());
  };

  const envoyer = () => {
    if (!confirm(`Le local va préparer ces pins pour ${popUpNom}. Tu ne pourras pas envoyer de nouvelle commande tant que celle-ci n'est pas reçue.`)) return;
    demarrer(async () => {
      await envoyerCommande({ popUpId, pinIds: lignesRetenues.map((l) => l.pin.id) });
      onChanged();
      onFermer();
    });
  };

  return (
    <Modal onClose={onFermer} wide>
      <h2 className="mb-1 text-lg font-bold text-slate-900">Commande — {popUpNom}</h2>
      <p className="mb-2 text-sm text-slate-400">
        {modeModification
          ? "La commande est encore modifiable tant que le local ne l'a pas prise en charge. Coche/décoche pour ajuster les pins envoyés — chaque changement est enregistré tout de suite."
          : 'Pins signalés "à commander" sur les boîtes de ce pop-up. Décoche ceux à ne pas envoyer tout de suite.'}
      </p>

      {lignes.length > 0 && (
        <button onClick={toutSelectionner} className="mb-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          Tout sélectionner
        </button>
      )}

      <div className="max-h-[420px] overflow-y-auto">
        {lignes.length === 0 ? (
          <p className="text-sm text-slate-400">Rien à commander pour l&apos;instant.</p>
        ) : (
          lignes.map((ligne) => {
            const retenu = !pinsExclus.has(ligne.pin.id);
            return (
              <button
                key={ligne.pin.id}
                onClick={() => basculerPin(ligne.pin.id)}
                className="mb-2 flex w-full items-center gap-3 rounded-xl bg-slate-50 p-2 text-left"
              >
                {ligne.pin.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ligne.pin.photo_url} alt={ligne.pin.nom} className="h-14 w-14 rounded-lg bg-slate-100 object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-300">?</div>
                )}
                <span className="flex-1 text-sm font-semibold text-slate-800">{ligne.pin.nom}</span>
                <span className="text-xs text-slate-400">{ligne.nbBoites} boîte(s)</span>
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
                    retenu ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                  }`}
                >
                  {retenu && <span className="text-xs font-bold text-white">✓</span>}
                </div>
              </button>
            );
          })
        )}
      </div>

      {modeModification ? (
        <button onClick={onFermer} className="mt-4 w-full rounded-xl bg-slate-100 py-3.5 text-base font-bold text-slate-700">
          Terminé
        </button>
      ) : (
        <button
          onClick={envoyer}
          disabled={enCours || lignesRetenues.length === 0}
          className={`mt-4 w-full rounded-xl py-3.5 text-base font-bold text-white ${lignesRetenues.length === 0 ? 'bg-slate-200 text-slate-500' : 'bg-emerald-500 hover:bg-emerald-600'}`}
        >
          {enCours ? 'Envoi…' : `Envoyer la commande${lignesRetenues.length > 0 ? ` (${lignesRetenues.length})` : ''}`}
        </button>
      )}
    </Modal>
  );
}
