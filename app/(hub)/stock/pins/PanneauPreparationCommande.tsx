'use client';

import { useEffect, useState, useTransition } from 'react';

import { basculerLigneCommandeFaite, basculerToutesLignesCommande, chargerDetailCommande, validerCommandePrete } from './actions';
import { Modal } from './Modal';
import { formatEmplacement } from './stockLib';
import type { CommandeAvecLignes } from './stockLib';

/** Écran de préparation d'une commande (Local) : coche chaque pin (photo, SKU, bac) puis valide
 * comme prête — cf. PanneauPreparationCommande (StockScreen.tsx). */
export function PanneauPreparationCommande({
  commandeId,
  onFermer,
  onChanged,
}: {
  commandeId: string;
  onFermer: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<(CommandeAvecLignes & { popUpNom: string }) | null>(null);
  const [enCours, demarrer] = useTransition();

  const recharger = () => {
    chargerDetailCommande(commandeId).then(setData);
  };

  useEffect(recharger, [commandeId]);

  if (!data) {
    return (
      <Modal onClose={onFermer}>
        <p className="text-sm text-slate-400">Chargement…</p>
      </Modal>
    );
  }

  const { commande, popUpNom, lignes } = data;
  const dejaPrete = commande.statut === 'prete';

  const basculerFait = (ligneId: string, fait: boolean) => {
    demarrer(async () => {
      await basculerLigneCommandeFaite(ligneId, fait);
      recharger();
    });
  };

  const toutCocher = () => {
    demarrer(async () => {
      await basculerToutesLignesCommande(commandeId, true);
      recharger();
    });
  };

  const confirmerValidation = () => {
    if (
      !confirm(
        `${popUpNom} sera prévenu que la commande est prête à récupérer. Les pins non cochés seront enregistrés comme non trouvés.`,
      )
    )
      return;
    demarrer(async () => {
      await validerCommandePrete({
        commandeId,
        popUpId: commande.pop_up_id,
        lignes: lignes.map((l) => ({ pinId: l.pin_id, fait: l.fait })),
      });
      onChanged();
      onFermer();
    });
  };

  return (
    <Modal onClose={onFermer} wide>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Commande — {popUpNom}</h2>
          <p className="text-sm text-slate-400">Prépare chaque pin (photo, SKU, bac) puis coche-le.</p>
        </div>
        <button onClick={toutCocher} disabled={enCours} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600">
          Tout cocher
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {lignes.map((ligne) => (
          <button
            key={ligne.id}
            onClick={() => basculerFait(ligne.id, !ligne.fait)}
            className={`mb-2 flex w-full items-center gap-3 rounded-xl p-2 text-left ${ligne.fait ? 'bg-emerald-50' : 'bg-slate-50'}`}
          >
            {ligne.pin.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ligne.pin.photo_url} alt={ligne.pin.nom} className="h-14 w-14 rounded-lg bg-slate-100 object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-300">?</div>
            )}
            <div className="flex-1">
              <p className={`text-sm font-semibold ${ligne.fait ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{ligne.pin.nom}</p>
              <p className="text-xs text-slate-400">
                SKU {ligne.pin.sku_pimpit ?? ligne.pin.sku_fournisseur ?? '—'}
                {formatEmplacement(ligne.pin) ? ` · ${formatEmplacement(ligne.pin)}` : ''}
              </p>
            </div>
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
                ligne.fait ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
              }`}
            >
              {ligne.fait && <span className="text-xs font-bold text-white">✓</span>}
            </div>
          </button>
        ))}
      </div>

      {!dejaPrete && (
        <button
          onClick={confirmerValidation}
          disabled={enCours}
          className="mt-4 w-full rounded-xl bg-emerald-500 py-3.5 text-base font-bold text-white hover:bg-emerald-600"
        >
          {enCours ? 'Validation…' : 'Valider la commande'}
        </button>
      )}
    </Modal>
  );
}
