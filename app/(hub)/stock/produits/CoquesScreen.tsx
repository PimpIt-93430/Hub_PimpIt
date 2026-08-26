'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { chargerCoquesInventaires, chargerVentesSumupLignes, enregistrerInventaireCoques, synchroniserVentesSumup } from './actions';
import {
  MODELES_COQUES,
  VARIANTES_COQUES,
  calculerARamenerCoques,
  resoudreVentesSumupCoques,
  type CoqueInventaire,
  type CoqueMappingSumup,
  type CoqueStock,
  type VenteSumupLigne,
} from './produitsLib';

function CelluleComptage({ couleur, valeur, onChange }: { couleur: string; valeur: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col items-center">
      <span className="mb-1 text-[11px] font-semibold text-slate-400">{couleur}</span>
      <input
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="0"
        className={`h-11 w-14 rounded-lg border text-center text-sm font-semibold focus:outline-none ${
          valeur.trim() !== '' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'
        }`}
      />
    </div>
  );
}

/** Réplique CoquesScreen.tsx de l'app — mêmes principes que ChaussuresScreen, groupé par
 * modèle > variante > couleur. */
export function CoquesScreen({
  popUpId,
  popUpNom,
  stock,
  mapping,
}: {
  popUpId: string;
  popUpNom: string;
  stock: CoqueStock[];
  mapping: CoqueMappingSumup[];
}) {
  const [inventaires, setInventaires] = useState<CoqueInventaire[] | null>(null);
  const [ventesLignes, setVentesLignes] = useState<VenteSumupLigne[] | null>(null);
  const [onglet, setOnglet] = useState<'inventaire' | 'reappro'>('inventaire');
  const [comptage, setComptage] = useState<Record<string, string>>({});
  const [modeEdition, setModeEdition] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [synchroEnCours, demarrerSynchro] = useTransition();
  const [derniereSynchro, setDerniereSynchro] = useState<Date | null>(null);

  const recharger = () => {
    chargerCoquesInventaires(popUpId).then(setInventaires);
    chargerVentesSumupLignes(popUpId).then(setVentesLignes);
  };

  useEffect(() => {
    setInventaires(null);
    setVentesLignes(null);
    recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popUpId]);

  const ventes = useMemo(() => resoudreVentesSumupCoques(ventesLignes ?? [], mapping), [ventesLignes, mapping]);
  const avecARamener = useMemo(() => calculerARamenerCoques(stock, inventaires ?? [], ventes), [stock, inventaires, ventes]);
  const parModele = useMemo(() => {
    const map = new Map<string, CoqueStock[]>();
    for (const item of stock) map.set(item.modele, [...(map.get(item.modele) ?? []), item]);
    return map;
  }, [stock]);

  const aRamener = avecARamener.filter((i) => i.aRamener > 0);
  const chargement = inventaires === null || ventesLignes === null;

  const validerInventaire = () => {
    const lignes = stock.map((item) => ({ modele: item.modele, variante: item.variante, couleur: item.couleur, quantite_comptee: Number(comptage[item.id]) || 0 }));
    if (!confirm("Enregistre ce comptage — ça recalcule directement ce qu'il faut ramener.")) return;
    demarrer(async () => {
      await enregistrerInventaireCoques(lignes, popUpId);
      setComptage({});
      setModeEdition(false);
      recharger();
    });
  };

  const modifierInventaire = () => {
    const nouveau: Record<string, string> = {};
    for (const item of avecARamener) if (item.stockEstime !== null) nouveau[item.id] = String(item.stockEstime);
    setComptage(nouveau);
    setModeEdition(true);
  };

  const synchroniser = () => {
    demarrerSynchro(async () => {
      await synchroniserVentesSumup();
      setDerniereSynchro(new Date());
      recharger();
    });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Coques</h2>
          <p className="text-sm font-semibold text-slate-500">{popUpNom}</p>
        </div>
        <button
          onClick={synchroniser}
          disabled={synchroEnCours}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          {synchroEnCours ? 'Synchronisation…' : 'Synchroniser les ventes SumUp'}
        </button>
      </div>
      {derniereSynchro && (
        <p className="mb-3 text-xs text-slate-400">Dernière synchro le {derniereSynchro.toLocaleString('fr-FR')}</p>
      )}

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setOnglet('inventaire')}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${onglet === 'inventaire' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Inventaire
        </button>
        <button
          onClick={() => setOnglet('reappro')}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${onglet === 'reappro' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Réapprovisionnement
        </button>
      </div>

      {chargement ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : onglet === 'inventaire' && !modeEdition ? (
        <>
          <p className="mb-3 text-xs text-slate-400">
            Stock estimé en temps réel, par modèle/variante/couleur — dernier comptage moins les ventes SumUp survenues depuis.
          </p>
          {MODELES_COQUES.map((modele) => (
            <div key={modele} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-base font-bold text-slate-900">{modele}</p>
              {VARIANTES_COQUES.map((variante) => (
                <div key={variante} className="mb-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-500">{variante}</p>
                  <div className="flex flex-wrap gap-3">
                    {avecARamener
                      .filter((item) => item.modele === modele && item.variante === variante)
                      .map((item) => (
                        <div key={item.id} className="flex flex-col items-center">
                          <span className="mb-1 text-[11px] font-semibold text-slate-400">{item.couleur}</span>
                          <div className="flex h-11 w-14 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                            <span className="text-sm font-semibold text-slate-700">{item.stockEstime !== null ? item.stockEstime : '—'}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <button onClick={modifierInventaire} className="mt-2 w-full rounded-xl bg-slate-900 py-3.5 text-base font-bold text-white hover:bg-slate-800">
            Modifier l&apos;inventaire
          </button>
        </>
      ) : onglet === 'inventaire' && modeEdition ? (
        <>
          <p className="mb-3 text-xs text-slate-400">Compte ce qu&apos;il reste vraiment, par modèle/variante/couleur, puis valide.</p>
          {MODELES_COQUES.map((modele) => (
            <div key={modele} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-base font-bold text-slate-900">{modele}</p>
              {VARIANTES_COQUES.map((variante) => (
                <div key={variante} className="mb-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-500">{variante}</p>
                  <div className="flex flex-wrap gap-3">
                    {(parModele.get(modele) ?? [])
                      .filter((item) => item.variante === variante)
                      .map((item) => (
                        <CelluleComptage
                          key={item.id}
                          couleur={item.couleur}
                          valeur={comptage[item.id] ?? ''}
                          onChange={(v) => setComptage((prev) => ({ ...prev, [item.id]: v }))}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <button
            onClick={validerInventaire}
            disabled={enCours}
            className="mt-2 w-full rounded-xl bg-emerald-500 py-3.5 text-base font-bold text-white hover:bg-emerald-600"
          >
            {enCours ? 'Enregistrement…' : "Valider l'inventaire"}
          </button>
          <button onClick={() => setModeEdition(false)} className="mt-2 w-full py-2 text-center text-sm font-semibold text-slate-400">
            Annuler
          </button>
        </>
      ) : (
        <>
          {aRamener.length === 0 ? (
            <p className="text-sm text-slate-400">Rien à ramener pour l&apos;instant — ou aucun inventaire n&apos;a encore été fait.</p>
          ) : (
            aRamener.map((item) => (
              <div key={item.id} className="mb-1.5 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2.5">
                <div>
                  <p className="text-sm text-slate-700">
                    {item.modele} — {item.variante} — {item.couleur}
                  </p>
                  {item.venduDepuisInventaire > 0 && (
                    <p className="text-xs text-slate-400">
                      dont {item.venduDepuisInventaire} vendue{item.venduDepuisInventaire > 1 ? 's' : ''} sur SumUp depuis le dernier inventaire
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold text-amber-700">{item.aRamener}</span>
              </div>
            ))
          )}
          <p className="mt-4 text-xs text-slate-400">
            Calculé à partir du stock visé, du dernier inventaire et des ventes SumUp survenues depuis.
          </p>
        </>
      )}
    </div>
  );
}
