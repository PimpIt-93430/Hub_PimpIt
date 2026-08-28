'use client';

import { useEffect, useMemo, useState } from 'react';

import type { OptionExpedition } from '@/lib/sendcloud';
import { chargerOptionsExpeditionCompte } from './actions';
import { chargerExpediteur, versSendcloudAddress } from './expedition-commun';

/** Consultation des offres Sendcloud disponibles sur le compte (cf. discussion 2026-08-29 : "un
 * bouton qui affiche les codes transporteurs", migré de Boxtal) — interrogées en direct (plus de
 * table figée à tenir à jour à la main comme lib/boxtal-codes.ts). Lecture seule : le code utilisé
 * pour créer une étiquette reste résolu automatiquement par les règles de livraison ou choisi dans
 * le panneau d'expédition, ce panneau sert juste à vérifier/retrouver un code. */
export function PanneauCodesTransporteurs({ onFermer }: { onFermer: () => void }) {
  const [options, setOptions] = useState<OptionExpedition[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    const expediteur = chargerExpediteur();
    if (!expediteur.adresse1) {
      setChargement(false);
      return;
    }
    chargerOptionsExpeditionCompte(versSendcloudAddress(expediteur))
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setChargement(false));
  }, []);

  const filtrees = useMemo(() => {
    const r = recherche.trim().toLowerCase();
    if (!r) return options;
    return options.filter((o) => `${o.transporteurNom} ${o.nom} ${o.code}`.toLowerCase().includes(r));
  }, [options, recherche]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={onFermer}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Offres Sendcloud</h2>
          <button type="button" onClick={onFermer} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="border-b border-slate-100 px-6 py-3">
          <input
            placeholder="Rechercher un transporteur, une offre, un code"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="w-full rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3">
          {chargement && <p className="py-6 text-center text-xs text-slate-400">Chargement…</p>}
          {!chargement && options.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-400">
              Renseigne d&apos;abord ton adresse expéditeur (ouvre une commande, section &quot;Expéditeur&quot;).
            </p>
          )}
          {!chargement && options.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="py-1.5">Transporteur</th>
                  <th className="py-1.5">Offre</th>
                  <th className="py-1.5">Code</th>
                </tr>
              </thead>
              <tbody>
                {filtrees.map((o) => (
                  <tr key={o.code} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2 text-slate-500">{o.transporteurNom}</td>
                    <td className="py-1.5 pr-2 text-slate-700">
                      {o.nom}
                      {o.pointRelaisRequis && <span className="ml-1 text-slate-400">(point relais)</span>}
                    </td>
                    <td className="py-1.5 font-mono font-semibold text-indigo-600">{o.code}</td>
                  </tr>
                ))}
                {filtrees.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">
                      Aucun code ne correspond.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
