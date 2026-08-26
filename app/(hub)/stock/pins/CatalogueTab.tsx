'use client';

import { useMemo, useState, useTransition } from 'react';

import { modifierPin } from './actions';
import { FormulaireSignalementPin } from './FormulaireSignalementPin';
import { POSITIONS_GRILLE } from './stockLib';
import type { PopUpPinBoite, StockPin } from './stockLib';

interface AttributionAffichage {
  popUpNom: string;
  casePosition: string;
}

type FiltreAttributionValeur = 'tous' | 'attribue' | 'non_attribue';

function caseMinimale(attributions: AttributionAffichage[] | undefined): string | null {
  if (!attributions || attributions.length === 0) return null;
  return attributions.reduce((min, a) => (a.casePosition < min ? a.casePosition : min), attributions[0].casePosition);
}

function TuileCataloguePin({
  pin,
  attributions,
  onOuvrirDetail,
  onOuvrirPhoto,
  onChanged,
}: {
  pin: StockPin;
  attributions: AttributionAffichage[];
  onOuvrirDetail: () => void;
  onOuvrirPhoto: () => void;
  onChanged: () => void;
}) {
  const [seuil, setSeuil] = useState(String(pin.seuil_cible ?? ''));
  const [, demarrer] = useTransition();

  const enregistrerSeuil = () => {
    const brut = seuil.trim();
    const valeur = brut === '' ? null : Number(brut);
    if (valeur !== null && !Number.isFinite(valeur)) return;
    if (valeur === pin.seuil_cible) return;
    demarrer(async () => {
      await modifierPin(pin.id, { seuil_cible: valeur });
      onChanged();
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <button onClick={onOuvrirPhoto} className="flex aspect-square w-full items-center justify-center bg-slate-50">
        {pin.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pin.photo_url} alt={pin.nom} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-slate-400">?</span>
        )}
      </button>
      <button onClick={onOuvrirDetail} className="block w-full px-2.5 pt-2.5 text-left">
        <span className="line-clamp-1 text-xs font-semibold text-slate-800">{pin.nom}</span>
      </button>
      <div className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-2">
        <span className="text-[10px] text-slate-400">Seuil</span>
        <input
          value={seuil}
          onChange={(e) => setSeuil(e.target.value)}
          onBlur={enregistrerSeuil}
          inputMode="numeric"
          placeholder="—"
          className="w-full flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs focus:outline-none"
        />
      </div>
      <div className="px-2.5 pb-2.5 pt-0.5">
        <div className={`inline-block rounded-full px-2 py-0.5 ${attributions.length > 0 ? 'bg-emerald-50' : 'bg-slate-100'}`}>
          <span className={`line-clamp-1 text-[10px] font-semibold ${attributions.length > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
            {attributions.length > 0 ? attributions.map((a) => `${a.popUpNom} ${a.casePosition}`).join(' · ') : 'Non attribué'}
          </span>
        </div>
        {pin.a_completer && <p className="mt-1 text-[10px] font-bold text-amber-600">À compléter</p>}
      </div>
    </div>
  );
}

export function CatalogueTab({
  pins,
  boites,
  popUps,
  onChanged,
  onOuvrirDetail,
  onOuvrirPhoto,
}: {
  pins: StockPin[];
  boites: PopUpPinBoite[];
  popUps: { id: string; nom: string }[];
  onChanged: () => void;
  onOuvrirDetail: (pin: StockPin) => void;
  onOuvrirPhoto: (pin: StockPin) => void;
}) {
  const [recherche, setRecherche] = useState('');
  const [caseFiltre, setCaseFiltre] = useState<string | null>(null);
  const [filtreAttribution, setFiltreAttribution] = useState<FiltreAttributionValeur>('tous');
  const [filtreACompleter, setFiltreACompleter] = useState(false);
  const [signalementOuvert, setSignalementOuvert] = useState(false);

  const nomsPopUp = useMemo(() => new Map(popUps.map((p) => [p.id, p.nom])), [popUps]);

  const attributionsParPin = useMemo(() => {
    const map = new Map<string, AttributionAffichage[]>();
    for (const b of boites) {
      const liste = map.get(b.pin_id) ?? [];
      liste.push({ popUpNom: nomsPopUp.get(b.pop_up_id) ?? '?', casePosition: b.case_position });
      map.set(b.pin_id, liste);
    }
    return map;
  }, [boites, nomsPopUp]);

  const nbACompleter = pins.filter((p) => p.a_completer).length;

  const pinsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let liste = pins;
    if (filtreACompleter) liste = liste.filter((p) => p.a_completer);
    if (filtreAttribution === 'attribue') liste = liste.filter((p) => (attributionsParPin.get(p.id)?.length ?? 0) > 0);
    else if (filtreAttribution === 'non_attribue') liste = liste.filter((p) => (attributionsParPin.get(p.id)?.length ?? 0) === 0);
    if (q) liste = liste.filter((p) => p.nom.toLowerCase().includes(q));
    if (caseFiltre) {
      liste = liste.filter((p) => (attributionsParPin.get(p.id) ?? []).some((a) => a.casePosition === caseFiltre));
    } else {
      liste = [...liste].sort((a, b) => {
        const caseA = caseMinimale(attributionsParPin.get(a.id));
        const caseB = caseMinimale(attributionsParPin.get(b.id));
        if (caseA === caseB) return a.nom.localeCompare(b.nom);
        if (caseA === null) return 1;
        if (caseB === null) return -1;
        return caseA.localeCompare(caseB);
      });
    }
    return liste;
  }, [pins, recherche, caseFiltre, attributionsParPin, filtreACompleter, filtreAttribution]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Catalogue</h2>
        <button
          onClick={() => setSignalementOuvert((v) => !v)}
          className="rounded-xl border border-dashed border-amber-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-amber-600 shadow-sm"
        >
          📷 Signaler un pin inconnu
        </button>
      </div>

      {signalementOuvert && <FormulaireSignalementPin onFermer={() => setSignalementOuvert(false)} onChanged={onChanged} />}

      {nbACompleter > 0 && (
        <button
          onClick={() => setFiltreACompleter((v) => !v)}
          className={`mb-4 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left shadow-sm ${filtreACompleter ? 'bg-amber-600' : 'bg-amber-50'}`}
        >
          <span className={`text-xs font-semibold ${filtreACompleter ? 'text-white' : 'text-amber-700'}`}>
            ⚠️ {nbACompleter} pin(s) signalé(s) à compléter
          </span>
          <span className={`text-xs font-semibold ${filtreACompleter ? 'text-white' : 'text-amber-700'}`}>
            {filtreACompleter ? 'Voir tout' : 'Voir'}
          </span>
        </button>
      )}

      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un pin…"
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Attribution</span>
          <div className="flex gap-2">
            {(
              [
                { valeur: 'tous', label: 'Tous' },
                { valeur: 'attribue', label: 'Attribué' },
                { valeur: 'non_attribue', label: 'Non attribué' },
              ] as { valeur: FiltreAttributionValeur; label: string }[]
            ).map((o) => (
              <button
                key={o.valeur}
                onClick={() => setFiltreAttribution(o.valeur)}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${filtreAttribution === o.valeur ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Filtrer par case</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCaseFiltre(null)}
              className={`rounded-full px-3 py-2 text-xs font-semibold ${caseFiltre === null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              Toutes
            </button>
            {POSITIONS_GRILLE.map((pos) => (
              <button
                key={pos}
                onClick={() => setCaseFiltre(pos === caseFiltre ? null : pos)}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${caseFiltre === pos ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pinsAffiches.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun résultat.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {pinsAffiches.map((pin) => (
            <TuileCataloguePin
              key={pin.id}
              pin={pin}
              attributions={attributionsParPin.get(pin.id) ?? []}
              onOuvrirDetail={() => onOuvrirDetail(pin)}
              onOuvrirPhoto={() => onOuvrirPhoto(pin)}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}
