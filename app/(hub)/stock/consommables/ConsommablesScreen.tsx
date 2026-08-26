'use client';

import { useEffect, useState, useTransition } from 'react';

import {
  basculerLigneConsommable,
  chargerCommandeActiveConsommables,
  demanderConsommables,
  marquerConsommablesEnvoyee,
  marquerConsommablesRecue,
} from './actions';
import { TYPES_CONSOMMABLES } from './consommablesLib';
import type { CommandeConsommablesAvecLignes, TypeConsommable } from './consommablesLib';

const LABEL_TYPE: Record<TypeConsommable, string> = Object.fromEntries(TYPES_CONSOMMABLES.map((t) => [t.valeur, t.label])) as Record<
  TypeConsommable,
  string
>;

/** Réplique ConsommablesScreen.tsx de l'app — liste fixe à cocher, même circuit que les commandes
 * de pin's (demandée → envoyée → reçue), sans étape de pesée. Le Hub étant admin-only (pas de
 * distinction pop-up/local), les deux actions possibles selon le statut sont proposées ensemble :
 * cocher/décocher tant que "demandée", "Marquer comme envoyée" puis "Marquer reçue". */
export function ConsommablesScreen({ popUpId, popUpNom, onRetour }: { popUpId: string; popUpNom: string; onRetour: () => void }) {
  const [commandeActive, setCommandeActive] = useState<CommandeConsommablesAvecLignes | null | undefined>(undefined);
  const [selection, setSelection] = useState<Set<TypeConsommable>>(new Set());
  const [descriptionAutre, setDescriptionAutre] = useState('');
  const [enCours, demarrer] = useTransition();

  const recharger = () => {
    chargerCommandeActiveConsommables(popUpId).then(setCommandeActive);
  };

  useEffect(() => {
    setCommandeActive(undefined);
    recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popUpId]);

  const toggleType = (type: TypeConsommable) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const envoyerDemande = () => {
    if (selection.size === 0) return;
    const lignes = [...selection].map((type) => ({ type, description: type === 'autre' ? descriptionAutre.trim() || null : null }));
    demarrer(async () => {
      await demanderConsommables(popUpId, lignes);
      setSelection(new Set());
      setDescriptionAutre('');
      recharger();
    });
  };

  return (
    <div>
      <button onClick={onRetour} className="mb-4 flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
        ← Consommables
      </button>

      <h2 className="mb-5 text-xl font-bold text-slate-900">{popUpNom}</h2>

      {commandeActive === undefined ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : !commandeActive ? (
        <>
          <p className="mb-3 text-sm text-slate-400">Coche ce dont tu as besoin, puis envoie la demande au local.</p>
          {TYPES_CONSOMMABLES.map((t) => {
            const coche = selection.has(t.valeur);
            return (
              <button
                key={t.valeur}
                onClick={() => toggleType(t.valeur)}
                className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow-sm"
              >
                <span className="text-sm font-semibold text-slate-800">{t.label}</span>
                <div className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${coche ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
                  {coche && <span className="text-xs font-bold text-white">✓</span>}
                </div>
              </button>
            );
          })}
          {selection.has('autre') && (
            <input
              value={descriptionAutre}
              onChange={(e) => setDescriptionAutre(e.target.value)}
              placeholder="Précise ce dont tu as besoin…"
              className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none"
            />
          )}
          <button
            onClick={envoyerDemande}
            disabled={selection.size === 0 || enCours}
            className={`mt-3 w-full rounded-xl py-3.5 text-base font-bold ${selection.size === 0 ? 'bg-slate-200 text-slate-500' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}
          >
            {enCours ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </>
      ) : commandeActive.commande.statut === 'demandee' ? (
        <>
          <p className="mb-3 text-sm text-slate-400">
            Demande en cours, modifiable tant que le local ne l&apos;a pas prise en charge. Coche/décoche pour ajuster — chaque changement
            est enregistré tout de suite.
          </p>
          {TYPES_CONSOMMABLES.map((t) => {
            const ligneExistante = commandeActive.lignes.find((l) => l.type === t.valeur);
            const coche = !!ligneExistante;
            return (
              <div key={t.valeur} className="mb-2">
                <button
                  onClick={() =>
                    demarrer(async () => {
                      await basculerLigneConsommable({
                        commandeId: commandeActive.commande.id,
                        type: t.valeur,
                        description: t.valeur === 'autre' ? descriptionAutre.trim() || null : null,
                        inclus: !coche,
                      });
                      recharger();
                    })
                  }
                  className="flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow-sm"
                >
                  <span className="text-sm font-semibold text-slate-800">
                    {t.label}
                    {t.valeur === 'autre' && ligneExistante?.description ? ` — ${ligneExistante.description}` : ''}
                  </span>
                  <div className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${coche ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
                    {coche && <span className="text-xs font-bold text-white">✓</span>}
                  </div>
                </button>
                {t.valeur === 'autre' && !coche && (
                  <input
                    value={descriptionAutre}
                    onChange={(e) => setDescriptionAutre(e.target.value)}
                    placeholder="Précise ce dont tu as besoin, puis coche…"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none"
                  />
                )}
              </div>
            );
          })}

          <button
            onClick={() =>
              demarrer(async () => {
                await marquerConsommablesEnvoyee(commandeActive.commande.id);
                recharger();
              })
            }
            disabled={enCours}
            className="mt-4 w-full rounded-xl bg-indigo-600 py-3.5 text-base font-bold text-white hover:bg-indigo-700"
          >
            Marquer comme envoyée
          </button>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs font-semibold uppercase text-slate-400">Demande en cours</p>
          {commandeActive.lignes.map((ligne) => (
            <div key={ligne.id} className="mb-2 rounded-xl bg-white p-3.5 shadow-sm">
              <p className="text-sm font-semibold text-slate-800">{LABEL_TYPE[ligne.type]}</p>
              {ligne.description && <p className="mt-0.5 text-xs text-slate-400">{ligne.description}</p>}
            </div>
          ))}

          <button
            onClick={() => {
              if (!confirm('Confirmer que ces consommables ont bien été récupérés ?')) return;
              demarrer(async () => {
                await marquerConsommablesRecue(commandeActive.commande.id);
                recharger();
              });
            }}
            disabled={enCours}
            className="mt-4 w-full rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white hover:bg-emerald-700"
          >
            {enCours ? 'Validation…' : 'Commande reçue ?'}
          </button>
        </>
      )}
    </div>
  );
}
