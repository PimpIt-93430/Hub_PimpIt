'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  chargerCommandesActives,
  chargerDerniersRemplissages,
  chargerPopUpPinBoites,
  chargerStockPins,
  marquerCommandeRecue,
} from './actions';
import { BoitesTab } from './BoitesTab';
import { CaseDetailModal } from './CaseDetailModal';
import { CatalogueTab } from './CatalogueTab';
import { HistoriqueTab } from './HistoriqueTab';
import { LocalView } from './LocalView';
import { ModalePhotoPin } from './ModalePhotoPin';
import { PanneauCommande } from './PanneauCommande';
import { PanneauPin } from './PanneauPin';
import type { CommandeAvecLignes, DernierRemplissage, PopUpPinBoite, StockPin } from './stockLib';

interface PopUp {
  id: string;
  nom: string;
  couleur: string | null;
  est_local: boolean;
}

/** Écran "Pin's" (Boîtes / Catalogue / Historique + vue Local) — cf. StockScreen.tsx de l'app.
 * Le Hub est admin-only, donc pas de distinction de rôle : la vue Local s'affiche dès que le
 * pop-up sélectionné est celui marqué `est_local`, sans condition d'attribution supplémentaire. */
export function PinsScreen({
  popUps,
  popUpId,
  onRetour,
  initialPins,
  initialBoites,
  masquerRetour,
}: {
  popUps: PopUp[];
  popUpId: string | undefined;
  onRetour?: () => void;
  initialPins: StockPin[];
  initialBoites: PopUpPinBoite[];
  /** Espace Local (app/(local)/local) : cet écran est la seule page, il n'y a rien "avant" vers
   * quoi revenir — masque le bouton "← Pin's" plutôt que de le rendre inerte. */
  masquerRetour?: boolean;
}) {
  const [pins, setPins] = useState(initialPins);
  const [boites, setBoites] = useState(initialBoites);
  const [commandesActives, setCommandesActives] = useState<CommandeAvecLignes[]>([]);
  const [commandesChargees, setCommandesChargees] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [vue, setVue] = useState<'boites' | 'catalogue' | 'historique'>('boites');
  const [casePositionOuverte, setCasePositionOuverte] = useState<string | null>(null);
  const [pinOuvert, setPinOuvert] = useState<StockPin | null>(null);
  const [pinPhotoOuvert, setPinPhotoOuvert] = useState<StockPin | null>(null);
  const [commandeCreationOuverte, setCommandeCreationOuverte] = useState(false);
  const [commandeModifOuverte, setCommandeModifOuverte] = useState(false);
  const [derniersRemplissages, setDerniersRemplissages] = useState<DernierRemplissage[]>([]);

  const popUpActif = popUpId ?? popUps[0]?.id;
  const popUpLocal = useMemo(() => popUps.find((p) => p.est_local), [popUps]);
  const estVueLocaleActive = !!popUpLocal && popUpActif === popUpLocal.id;

  useEffect(() => {
    chargerCommandesActives().then((c) => {
      setCommandesActives(c);
      setCommandesChargees(true);
    });
  }, [refreshKey]);

  useEffect(() => {
    if (!popUpActif) return;
    chargerDerniersRemplissages(popUpActif).then(setDerniersRemplissages);
  }, [popUpActif, refreshKey]);

  const onChanged = () => {
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    if (refreshKey === 0) return;
    Promise.all([chargerStockPins(), chargerPopUpPinBoites()]).then(([nouveauxPins, nouvellesBoites]) => {
      setPins(nouveauxPins);
      setBoites(nouvellesBoites);
    });
  }, [refreshKey]);

  const nbACompleter = pins.filter((p) => p.a_completer).length;
  const commandeActiveDuPopUp = commandesActives.find((c) => c.commande.pop_up_id === popUpActif);
  const contenusCaseOuverte = useMemo(() => {
    if (!casePositionOuverte || !popUpActif) return [];
    const pinsParId = new Map(pins.map((p) => [p.id, p]));
    return boites
      .filter((b) => b.pop_up_id === popUpActif && b.case_position === casePositionOuverte)
      .map((b) => {
        const pin = pinsParId.get(b.pin_id);
        return pin ? { boiteId: b.id, pin, aCommander: b.a_commander, updatedAt: b.updated_at } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [casePositionOuverte, popUpActif, boites, pins]);

  const commandeLignes = useMemo(() => {
    if (!popUpActif) return [];
    const pinsParId = new Map(pins.map((p) => [p.id, p]));
    const parPin = new Map<string, { pin: StockPin; nbBoites: number }>();
    for (const b of boites) {
      if (b.pop_up_id !== popUpActif || !b.a_commander) continue;
      const pin = pinsParId.get(b.pin_id);
      if (!pin) continue;
      const existant = parPin.get(pin.id);
      if (existant) existant.nbBoites += 1;
      else parPin.set(pin.id, { pin, nbBoites: 1 });
    }
    return [...parPin.values()].sort((a, b) => b.nbBoites - a.nbBoites);
  }, [popUpActif, boites, pins]);

  const commandeLignesModifiables = useMemo(() => {
    if (!commandeActiveDuPopUp) return [];
    const parPin = new Map(commandeLignes.map((l) => [l.pin.id, l]));
    for (const ligne of commandeActiveDuPopUp.lignes) {
      if (!parPin.has(ligne.pin.id)) parPin.set(ligne.pin.id, { pin: ligne.pin, nbBoites: 0 });
    }
    return [...parPin.values()];
  }, [commandeActiveDuPopUp, commandeLignes]);

  if (!popUpActif) {
    return (
      <div>
        {onRetour && <BoutonRetour onRetour={onRetour} />}
        <p className="text-sm text-slate-400">Aucun pop-up disponible.</p>
      </div>
    );
  }

  return (
    <div>
      {!masquerRetour && onRetour && <BoutonRetour onRetour={onRetour} titre="Pin&apos;s" />}

      {estVueLocaleActive ? (
        <LocalView
          pins={pins}
          boites={boites}
          popUps={popUps}
          popUpLocalId={popUpLocal!.id}
          commandesActives={commandesChargees ? commandesActives : []}
          onChanged={onChanged}
          onOuvrirDetailPin={setPinOuvert}
          onOuvrirPhotoPin={setPinPhotoOuvert}
        />
      ) : (
        <>
          <div className="mb-5 flex gap-2">
            {(
              [
                { valeur: 'boites', label: 'Boîtes' },
                { valeur: 'catalogue', label: `Catalogue${nbACompleter > 0 ? ` (${nbACompleter})` : ''}` },
                { valeur: 'historique', label: 'Historique' },
              ] as { valeur: typeof vue; label: string }[]
            ).map((o) => (
              <button
                key={o.valeur}
                onClick={() => setVue(o.valeur)}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${vue === o.valeur ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {vue === 'catalogue' && (
            <CatalogueTab pins={pins} boites={boites} popUps={popUps} onChanged={onChanged} onOuvrirDetail={setPinOuvert} onOuvrirPhoto={setPinPhotoOuvert} />
          )}
          {vue === 'historique' && <HistoriqueTab popUpId={popUpActif} />}
          {vue === 'boites' && (
            <BoitesTab
              popUpId={popUpActif}
              popUpNom={popUps.find((p) => p.id === popUpActif)?.nom ?? '—'}
              pins={pins}
              boites={boites}
              commandeActive={commandeActiveDuPopUp}
              onOuvrirCase={setCasePositionOuverte}
              onOuvrirCommandeCreation={() => setCommandeCreationOuverte(true)}
              onOuvrirCommandeModif={() => setCommandeModifOuverte(true)}
              onMarquerRecue={() => {
                marquerCommandeRecue({ commandeId: commandeActiveDuPopUp!.commande.id, popUpId: popUpActif }).then(onChanged);
              }}
              refreshKey={refreshKey}
            />
          )}
        </>
      )}

      {casePositionOuverte && (
        <CaseDetailModal
          casePosition={casePositionOuverte}
          contenus={contenusCaseOuverte}
          pins={pins}
          popUpId={popUpActif}
          onClose={() => setCasePositionOuverte(null)}
          onChanged={onChanged}
          onOuvrirPhoto={setPinPhotoOuvert}
          dernierRemplissage={derniersRemplissages.find((r) => r.casePosition === casePositionOuverte)}
        />
      )}

      {pinOuvert && <PanneauPin pin={pinOuvert} onFermer={() => setPinOuvert(null)} onChanged={onChanged} />}
      {pinPhotoOuvert && <ModalePhotoPin pin={pinPhotoOuvert} onFermer={() => setPinPhotoOuvert(null)} />}

      {commandeCreationOuverte && (
        <PanneauCommande
          lignes={commandeLignes}
          popUpId={popUpActif}
          popUpNom={popUps.find((p) => p.id === popUpActif)?.nom ?? ''}
          onFermer={() => setCommandeCreationOuverte(false)}
          onChanged={onChanged}
        />
      )}

      {commandeModifOuverte && commandeActiveDuPopUp && (
        <PanneauCommande
          lignes={commandeLignesModifiables}
          popUpId={popUpActif}
          popUpNom={popUps.find((p) => p.id === popUpActif)?.nom ?? ''}
          commandeId={commandeActiveDuPopUp.commande.id}
          pinIdsInitialementCoches={commandeActiveDuPopUp.lignes.map((l) => l.pin_id)}
          onFermer={() => setCommandeModifOuverte(false)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function BoutonRetour({ onRetour, titre }: { onRetour: () => void; titre?: string }) {
  return (
    <button onClick={onRetour} className="mb-4 flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
      ← {titre ?? 'Retour'}
    </button>
  );
}
