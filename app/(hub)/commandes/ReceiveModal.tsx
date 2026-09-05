'use client';

import { useState, useTransition } from 'react';

import { receptionnerCommande } from './actions';
import type { CommandeFournisseur, HubPinLite } from '@/lib/purchase-orders';

/** Réplique la modale "Valider la réception" de l'ancien admin (openReceiveModal/confirmReceive) :
 * checklist des articles, décocher exclut l'article du bump de stock sans le retirer de la
 * commande (même sémantique que l'ancien receivePO). */
export function ReceiveModal({
  commande,
  pinsParId,
  onClose,
  onReceptionne,
}: {
  commande: CommandeFournisseur;
  pinsParId: Map<string, HubPinLite>;
  onClose: () => void;
  onReceptionne: (nbRecus: number) => void;
}) {
  const [exclus, setExclus] = useState<Set<string>>(new Set());
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function toggle(id: string) {
    setExclus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toutBasculer(exclureTout: boolean) {
    setExclus(exclureTout ? new Set(commande.items.map((i) => i.airtableId)) : new Set());
  }

  function valider(incrementerStock: boolean) {
    setErreur(null);
    demarrer(async () => {
      try {
        const r = await receptionnerCommande(commande.id, [...exclus], incrementerStock);
        onReceptionne(r.received);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] w-[520px] max-w-full flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-lg font-bold text-slate-900">Réception — {commande.ref || 'Sans référence'}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between px-6 pt-4">
          <p className="text-sm text-slate-500">Décochez les pins non reçus avant de valider.</p>
          <div className="flex gap-1.5">
            <button onClick={() => toutBasculer(true)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Tout décocher
            </button>
            <button onClick={() => toutBasculer(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Tout cocher
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-2">
            {commande.items.map((item) => {
              const pin = pinsParId.get(item.airtableId);
              const decoche = exclus.has(item.airtableId);
              return (
                <label
                  key={item.airtableId}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 ${decoche ? 'border-slate-200 opacity-50' : 'border-slate-200'}`}
                >
                  <input type="checkbox" checked={!decoche} onChange={() => toggle(item.airtableId)} className="h-4 w-4 rounded border-slate-300" />
                  {pin?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pin.image_url} alt="" className="h-9 w-9 rounded-md object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-md bg-slate-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-400">
                      {item.qty} pcs · stock actuel : {pin?.stock ?? item.stockActuel}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {erreur && <p className="px-6 text-sm text-red-600">{erreur}</p>}

        {/* Cf. retour utilisateur du 2026-09-05 : "voulez-vous incrémenter le stock local oui ou
            non" — choix explicite à chaque réception plutôt qu'un incrément systématique,
            réversible ensuite (cf. bascule "Incrémenter/Décrémenter" dans l'historique). */}
        <div className="flex flex-col gap-2 border-t border-slate-100 px-6 py-4">
          <p className="text-sm font-medium text-slate-700">Incrémenter le stock local de ces pins ?</p>
          <div className="flex justify-end gap-2.5">
            <button onClick={onClose} className="mr-auto rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
              Annuler
            </button>
            <button
              onClick={() => valider(false)}
              disabled={enCours}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Non — reçue seulement
            </button>
            <button
              onClick={() => valider(true)}
              disabled={enCours}
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {enCours ? 'Réception…' : 'Oui — incrémenter'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
