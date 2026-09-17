'use client';

import { useState, useTransition } from 'react';

import { marquerCommandeRevendeurTraitee, type CommandeRevendeurHub } from './actions';

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' €';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Liste des commandes reçues depuis la page publique /revendeurs (cf. migration 0115) — pas
 * d'email/notification automatique pour l'instant, cet écran reste la seule façon de les voir. */
export function CommandesRevendeursClient({ commandesInitiales }: { commandesInitiales: CommandeRevendeurHub[] }) {
  const [commandes, setCommandes] = useState(commandesInitiales);
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const nouvelles = commandes.filter((c) => c.statut === 'nouvelle');
  const traitees = commandes.filter((c) => c.statut === 'traitee');

  function toggle(id: string) {
    setOuvertes((s) => {
      const copie = new Set(s);
      if (copie.has(id)) copie.delete(id);
      else copie.add(id);
      return copie;
    });
  }

  function marquerTraitee(id: string) {
    setErreur(null);
    demarrer(async () => {
      try {
        await marquerCommandeRevendeurTraitee(id);
        setCommandes((cs) => cs.map((c) => (c.id === id ? { ...c, statut: 'traitee' } : c)));
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Commandes revendeurs</h1>
        <p className="mt-1 text-sm text-slate-400">
          Reçues depuis l&apos;espace revendeur public (pimpitstore.../revendeurs). Aucune alerte automatique
          n&apos;est configurée pour l&apos;instant — pense à revenir régulièrement sur cet écran.
        </p>
      </div>

      {erreur && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{erreur}</p>}

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Nouvelles ({nouvelles.length})
      </p>
      <div className="mb-8 flex flex-col gap-3">
        {nouvelles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
            Aucune commande en attente.
          </p>
        ) : (
          nouvelles.map((c) => (
            <CarteCommande
              key={c.id}
              commande={c}
              ouverte={ouvertes.has(c.id)}
              onToggle={() => toggle(c.id)}
              onMarquerTraitee={() => marquerTraitee(c.id)}
              enCours={enCours}
            />
          ))
        )}
      </div>

      {traitees.length > 0 && (
        <>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Traitées ({traitees.length})
          </p>
          <div className="flex flex-col gap-3">
            {traitees.map((c) => (
              <CarteCommande key={c.id} commande={c} ouverte={ouvertes.has(c.id)} onToggle={() => toggle(c.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CarteCommande({
  commande,
  ouverte,
  onToggle,
  onMarquerTraitee,
  enCours,
}: {
  commande: CommandeRevendeurHub;
  ouverte: boolean;
  onToggle: () => void;
  onMarquerTraitee?: () => void;
  enCours?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div>
          <p className="font-semibold text-slate-900">{commande.entreprise}</p>
          <p className="text-xs text-slate-400">
            {fmtDate(commande.createdAt)} · {commande.lignes.length} référence{commande.lignes.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-slate-900">{fmt(commande.totalHt)}</span>
          <span className="text-slate-400">{ouverte ? '▲' : '▼'}</span>
        </div>
      </button>

      {ouverte && (
        <div className="border-t border-slate-100 px-5 py-4">
          <table className="w-full text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-2">Pin&apos;s</th>
                <th className="pb-2">SKU</th>
                <th className="pb-2 text-right">Prix HT</th>
                <th className="pb-2 text-right">Qté</th>
                <th className="pb-2 text-right">Sous-total</th>
              </tr>
            </thead>
            <tbody>
              {commande.lignes.map((l) => (
                <tr key={l.id} className="border-t border-slate-50">
                  <td className="py-1.5">{l.nom}</td>
                  <td className="py-1.5 text-slate-400">{l.skuFournisseur ?? '—'}</td>
                  <td className="py-1.5 text-right">{fmt(l.prixUnitaireHt)}</td>
                  <td className="py-1.5 text-right">{l.quantite}</td>
                  <td className="py-1.5 text-right font-medium">{fmt(l.prixUnitaireHt * l.quantite)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {onMarquerTraitee && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={onMarquerTraitee}
                disabled={enCours}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Marquer comme traitée
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
