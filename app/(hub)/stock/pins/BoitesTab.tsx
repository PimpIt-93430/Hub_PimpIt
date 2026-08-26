'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { chargerRemplissages, supprimerRemplissage } from './actions';
import { GrilleCases } from './GrilleCases';
import { calculerCommandes, construireGrille } from './stockLib';
import type { CommandeAvecLignes, DernierRemplissage, PopUpPinBoite, StockPin } from './stockLib';

interface GroupeJour {
  jourISO: string;
  lignes: DernierRemplissage[];
}

function grouperParJour(remplissages: DernierRemplissage[]): GroupeJour[] {
  const parJour = new Map<string, DernierRemplissage[]>();
  for (const r of remplissages) {
    const jourISO = r.createdAt.slice(0, 10);
    const liste = parJour.get(jourISO) ?? [];
    liste.push(r);
    parJour.set(jourISO, liste);
  }
  return [...parJour.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([jourISO, lignes]) => ({ jourISO, lignes: [...lignes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
}

function formatJour(jourISO: string): string {
  return new Date(`${jourISO}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function BoitesTab({
  popUpId,
  popUpNom,
  pins,
  boites,
  commandeActive,
  onOuvrirCase,
  onOuvrirCommandeCreation,
  onOuvrirCommandeModif,
  onMarquerRecue,
  refreshKey,
}: {
  popUpId: string;
  popUpNom: string;
  pins: StockPin[];
  boites: PopUpPinBoite[];
  commandeActive: CommandeAvecLignes | undefined;
  onOuvrirCase: (casePosition: string) => void;
  onOuvrirCommandeCreation: () => void;
  onOuvrirCommandeModif: () => void;
  onMarquerRecue: () => void;
  /** Change à chaque mutation touchant ce pop-up (case, remplissage, commande) — redéclenche le
   * rechargement des remplissages (pas couverts par les props boites/pins déjà tenues à jour côté
   * parent). */
  refreshKey: number;
}) {
  const pinsParId = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);
  const grille = useMemo(() => construireGrille(boites, popUpId, pinsParId), [boites, popUpId, pinsParId]);
  const commandeLignes = useMemo(() => calculerCommandes(grille), [grille]);

  const [remplissages, setRemplissages] = useState<DernierRemplissage[] | null>(null);
  const [, demarrer] = useTransition();

  useEffect(() => {
    setRemplissages(null);
    chargerRemplissages(popUpId).then(setRemplissages);
  }, [popUpId, refreshKey]);

  const remplissagesParJour = useMemo(() => grouperParJour(remplissages ?? []), [remplissages]);

  const supprimer = (id: string) => {
    if (!confirm('Supprimer ce remplissage ? Cette action est irréversible.')) return;
    demarrer(async () => {
      await supprimerRemplissage(id);
      chargerRemplissages(popUpId).then(setRemplissages);
    });
  };

  return (
    <div className="mx-auto w-full max-w-[960px]">
      <h2 className="mb-5 text-xl font-bold text-slate-900">{popUpNom}</h2>

      <GrilleCases grille={grille} onPressCase={onOuvrirCase} />

      <div className="mt-5">
        {!commandeActive ? (
          <button onClick={onOuvrirCommandeCreation} className="w-full rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white hover:bg-indigo-700">
            Voir la commande
          </button>
        ) : commandeActive.commande.statut === 'envoyee' ? (
          <button
            onClick={onOuvrirCommandeModif}
            className="w-full rounded-2xl bg-amber-100 py-4 text-sm font-semibold text-amber-700"
          >
            Commande envoyée le{' '}
            {new Date(commandeActive.commande.envoyee_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {' '}— en préparation · Modifier
          </button>
        ) : (
          <button
            onClick={() => {
              if (confirm('Confirmer que la commande a bien été récupérée au local ?')) onMarquerRecue();
            }}
            className="w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white hover:bg-emerald-700"
          >
            Commande prête — Reçue ?
          </button>
        )}
      </div>

      {commandeLignes.length === 0 && !commandeActive && (
        <p className="mt-2 text-center text-xs text-slate-400">Aucun pin signalé &laquo; à commander &raquo; pour l&apos;instant.</p>
      )}

      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">Contrôle des boîtes</p>
      {remplissages === null ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : remplissagesParJour.length === 0 ? (
        <p className="text-sm text-slate-400">Aucun remplissage enregistré pour l&apos;instant sur ce pop-up.</p>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white px-3.5 py-1">
          {remplissagesParJour.map((jour, indexJour) => (
            <div key={jour.jourISO} className={indexJour > 0 ? 'mt-2 border-t border-slate-100 pt-2' : ''}>
              <p className="mb-1 text-xs font-bold capitalize text-slate-400">{formatJour(jour.jourISO)}</p>
              {jour.lignes.map((ligne, indexLigne) => (
                <div
                  key={ligne.id}
                  className={`flex items-center justify-between py-1.5 ${indexLigne < jour.lignes.length - 1 ? 'border-b border-slate-50' : ''}`}
                >
                  <button onClick={() => onOuvrirCase(ligne.casePosition)} className="text-xs font-semibold text-slate-700 hover:text-indigo-600">
                    Boîte {ligne.casePosition}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      {ligne.profileNom} · {new Date(ligne.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button onClick={() => supprimer(ligne.id)} className="pl-2 text-[11px] font-semibold text-red-500 hover:text-red-700">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
