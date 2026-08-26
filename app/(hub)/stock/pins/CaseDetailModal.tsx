'use client';

import { useMemo, useState, useTransition } from 'react';

import { attribuerPinsACase, basculerCommandePin, creerPin, validerRemplissageBoite } from './actions';
import { Modal } from './Modal';
import type { ContenuCase, DernierRemplissage, StockPin } from './stockLib';

function LigneCommandePin({
  contenu,
  enCours,
  onBasculer,
  onOuvrirPhoto,
}: {
  contenu: ContenuCase;
  enCours: boolean;
  onBasculer: () => void;
  onOuvrirPhoto: () => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-200 p-3">
      <button
        onClick={onOuvrirPhoto}
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100"
      >
        {contenu.pin.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={contenu.pin.photo_url} alt={contenu.pin.nom} className="h-12 w-12 object-cover" />
        ) : (
          <span className="text-xs text-slate-300">?</span>
        )}
      </button>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800">{contenu.pin.nom}</p>
        <p className="text-xs text-slate-400">Sac avec moins de 20 pin&apos;s ?</p>
      </div>
      <button
        onClick={onBasculer}
        disabled={enCours}
        className={`rounded-lg px-4 py-2.5 text-sm font-bold text-white ${contenu.aCommander ? 'bg-amber-500' : 'bg-indigo-600'}`}
      >
        {enCours ? '…' : contenu.aCommander ? 'Annuler' : 'Commander'}
      </button>
    </div>
  );
}

function LignePinAttribution({ pin, coche, onPress }: { pin: StockPin; coche: boolean; onPress: () => void }) {
  return (
    <button onClick={onPress} className="mb-1 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
      {pin.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pin.photo_url} alt={pin.nom} className="h-10 w-10 rounded-md bg-slate-100 object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-300">?</div>
      )}
      <span className="flex-1 text-sm text-slate-800">{pin.nom}</span>
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${
          coche ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200'
        }`}
      >
        {coche && <span className="text-xs font-bold text-white">✓</span>}
      </div>
    </button>
  );
}

export function CaseDetailModal({
  casePosition,
  contenus,
  pins,
  popUpId,
  onClose,
  onChanged,
  onOuvrirPhoto,
  dernierRemplissage,
}: {
  casePosition: string;
  contenus: ContenuCase[];
  pins: StockPin[];
  popUpId: string;
  onClose: () => void;
  onChanged: () => void;
  onOuvrirPhoto: (pin: StockPin) => void;
  dernierRemplissage: DernierRemplissage | undefined;
}) {
  const [onglet, setOnglet] = useState<'commander' | 'contenu'>(contenus.length === 0 ? 'contenu' : 'commander');
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState<Set<string>>(() => new Set(contenus.map((c) => c.pin.id)));
  const [pinsRapides, setPinsRapides] = useState<StockPin[]>([]);
  const [nomRapide, setNomRapide] = useState('');
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [boiteEnCours, setBoiteEnCours] = useState<string | null>(null);
  const [attribuerEnCours, demarrerAttribuer] = useTransition();
  const [creerEnCours, demarrerCreer] = useTransition();
  const [remplissageEnCours, demarrerRemplissage] = useTransition();

  const pinsTous = useMemo(() => {
    const vus = new Set(pins.map((p) => p.id));
    return [...pins, ...pinsRapides.filter((p) => !vus.has(p.id))];
  }, [pins, pinsRapides]);

  const pinsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? pinsTous.filter((p) => p.nom.toLowerCase().includes(q)) : pinsTous;
  }, [pinsTous, recherche]);

  const basculerSelection = (pinId: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(pinId)) next.delete(pinId);
      else next.add(pinId);
      return next;
    });
  };

  const validerAttribution = () => {
    demarrerAttribuer(async () => {
      await attribuerPinsACase({
        popUpId,
        casePosition,
        pinIdsActuels: contenus.map((c) => c.pin.id),
        pinIdsVoulus: [...selection],
      });
      onChanged();
      onClose();
    });
  };

  const ajouterPinRapide = () => {
    const nom = nomRapide.trim();
    if (!nom) return;
    demarrerCreer(async () => {
      const pin = await creerPin(nom);
      setPinsRapides((prev) => [...prev, pin]);
      setSelection((prev) => new Set(prev).add(pin.id));
      setNomRapide('');
      setAjoutOuvert(false);
    });
  };

  const basculerCommande = (contenu: ContenuCase) => {
    setBoiteEnCours(contenu.boiteId);
    demarrerAttribuer(async () => {
      await basculerCommandePin({ boiteId: contenu.boiteId, aCommander: !contenu.aCommander });
      setBoiteEnCours(null);
      onChanged();
    });
  };

  return (
    <Modal onClose={onClose} wide>
      <h2 className="mb-4 text-lg font-bold text-slate-900">Case {casePosition}</h2>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setOnglet('commander')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${onglet === 'commander' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Commander
        </button>
        <button
          onClick={() => setOnglet('contenu')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${onglet === 'contenu' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Contenu ({contenus.length})
        </button>
      </div>

      {onglet === 'commander' ? (
        contenus.length === 0 ? (
          <p className="mb-4 text-center text-sm text-slate-400">
            Cette case est vide — passe dans l&apos;onglet &laquo; Contenu &raquo; pour y ajouter des pins.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {contenus.map((contenu) => (
              <LigneCommandePin
                key={contenu.boiteId}
                contenu={contenu}
                enCours={attribuerEnCours && boiteEnCours === contenu.boiteId}
                onBasculer={() => basculerCommande(contenu)}
                onOuvrirPhoto={() => onOuvrirPhoto(contenu.pin)}
              />
            ))}
          </div>
        )
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-400">
            {selection.size} pin{selection.size > 1 ? 's' : ''} sélectionné{selection.size > 1 ? 's' : ''}
          </p>
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un pin…"
            className="mb-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
          />

          {!ajoutOuvert ? (
            <button onClick={() => setAjoutOuvert(true)} className="mb-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
              + Ajouter un pin à la main
            </button>
          ) : (
            <div className="mb-3 flex gap-2">
              <input
                value={nomRapide}
                onChange={(e) => setNomRapide(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ajouterPinRapide()}
                placeholder="Nom du pin"
                autoFocus
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
              />
              <button
                onClick={ajouterPinRapide}
                disabled={creerEnCours}
                className="rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                {creerEnCours ? '…' : 'Ajouter'}
              </button>
            </div>
          )}

          <div className="max-h-[320px] overflow-y-auto">
            {pinsFiltres.length === 0 ? (
              <p className="p-3 text-center text-sm text-slate-400">Aucun pin trouvé.</p>
            ) : (
              pinsFiltres.map((pin) => (
                <LignePinAttribution key={pin.id} pin={pin} coche={selection.has(pin.id)} onPress={() => basculerSelection(pin.id)} />
              ))
            )}
          </div>

          <button
            onClick={validerAttribution}
            disabled={attribuerEnCours}
            className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {attribuerEnCours ? 'Enregistrement…' : 'Valider les pins de la case'}
          </button>
        </>
      )}

      {onglet === 'commander' && (
        <>
          <button
            onClick={() => demarrerRemplissage(async () => {
              await validerRemplissageBoite({ popUpId, casePosition });
              onChanged();
            })}
            disabled={remplissageEnCours}
            className="mt-3 w-full rounded-xl bg-emerald-500 py-3.5 text-base font-bold text-white hover:bg-emerald-600"
          >
            {remplissageEnCours ? 'Enregistrement…' : '✓ Valider le remplissage'}
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">
            {dernierRemplissage
              ? `Dernier remplissage : ${dernierRemplissage.profileNom} le ${new Date(dernierRemplissage.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
              : 'Jamais validé'}
          </p>
        </>
      )}
    </Modal>
  );
}
