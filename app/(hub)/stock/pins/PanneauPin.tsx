'use client';

import { useEffect, useState, useTransition } from 'react';

import { chargerMouvements, modifierPin } from './actions';
import { Modal } from './Modal';
import type { StockMouvement, StockPin } from './stockLib';

/** Fiche détail d'un pin — uniquement poids unité (édition), seuil cible (édition) et historique des
 * mouvements, cf. PanneauPin (StockScreen.tsx) : le reste (nom, fournisseur, stock général, taille,
 * ajustement manuel du stock) a été volontairement retiré côté app, donc pas répliqué ici non plus. */
export function PanneauPin({ pin, onFermer, onChanged }: { pin: StockPin; onFermer: () => void; onChanged: () => void }) {
  const [seuil, setSeuil] = useState(String(pin.seuil_cible ?? ''));
  const [poidsUnite, setPoidsUnite] = useState(pin.poids_unitaire !== null ? String(pin.poids_unitaire) : '');
  const [mouvements, setMouvements] = useState<StockMouvement[] | null>(null);
  const [, demarrer] = useTransition();

  useEffect(() => {
    chargerMouvements(pin.id).then(setMouvements);
  }, [pin.id]);

  const enregistrerSeuil = () => {
    const valeur = seuil.trim() === '' ? null : Number(seuil);
    if (valeur !== null && !Number.isFinite(valeur)) return;
    if (valeur === pin.seuil_cible) return;
    demarrer(async () => {
      await modifierPin(pin.id, { seuil_cible: valeur });
      onChanged();
    });
  };

  const enregistrerPoids = () => {
    const brut = poidsUnite.trim() === '' ? null : Number(poidsUnite.replace(',', '.'));
    if (brut !== null && !Number.isFinite(brut)) return;
    if (brut === pin.poids_unitaire) return;
    demarrer(async () => {
      await modifierPin(pin.id, { poids_unitaire: brut });
      onChanged();
    });
  };

  return (
    <Modal onClose={onFermer}>
      <h2 className="mb-4 text-lg font-bold text-slate-900">{pin.nom}</h2>

      <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Poids unité (g)</label>
      <input
        value={poidsUnite}
        onChange={(e) => setPoidsUnite(e.target.value)}
        onBlur={enregistrerPoids}
        inputMode="decimal"
        placeholder="—"
        className={`mb-4 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${
          pin.poids_unitaire === null ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200'
        }`}
      />

      <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">
        Seuil cible (quantité de réapprovisionnement)
      </label>
      <input
        value={seuil}
        onChange={(e) => setSeuil(e.target.value)}
        onBlur={enregistrerSeuil}
        inputMode="numeric"
        placeholder="—"
        className="mb-5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none"
      />

      <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Historique</p>
      {mouvements === null ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : mouvements.length === 0 ? (
        <p className="mb-2 text-sm text-slate-400">Aucun mouvement enregistré.</p>
      ) : (
        mouvements.map((m) => (
          <div key={m.id} className="mb-1.5 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-xs text-slate-500">
              {new Date(m.created_at).toLocaleString('fr-FR')} — {m.type}
            </span>
            <span className="text-xs font-semibold text-slate-700">
              {m.quantite_delta !== null ? `${m.quantite_delta > 0 ? '+' : ''}${m.quantite_delta}` : `${m.quantite_calculee} restant(s)`}
            </span>
          </div>
        ))
      )}
    </Modal>
  );
}
