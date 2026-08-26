'use client';

import { useMemo, useState, useTransition } from 'react';

import { peserStockGeneral } from './actions';
import { CatalogueTab } from './CatalogueTab';
import { PanneauPreparationCommande } from './PanneauPreparationCommande';
import { formatEmplacement } from './stockLib';
import type { CommandeAvecLignes, PopUpPinBoite, StockPin } from './stockLib';

interface PopUpDemandeur {
  popUpNom: string;
}

function LigneLocalPin({
  pin,
  demandeurs,
  popUpLocalId,
  onChanged,
}: {
  pin: StockPin;
  demandeurs: PopUpDemandeur[];
  popUpLocalId: string;
  onChanged: () => void;
}) {
  const enRupture = pin.seuil_cible !== null && pin.stock_general < pin.seuil_cible;
  const [poids, setPoids] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const poidsNum = Number(poids.trim().replace(',', '.'));
  const poidsValide = poids.trim() !== '' && Number.isFinite(poidsNum) && poidsNum >= 0;

  const confirmer = () => {
    if (!poidsValide) return;
    setErreur(null);
    demarrer(async () => {
      try {
        await peserStockGeneral({ pinId: pin.id, popUpLocalId, poidsPese: poidsNum });
        setPoids('');
        onChanged();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Impossible d'enregistrer la pesée.");
      }
    });
  };

  return (
    <div className={`mb-2.5 flex items-center gap-3 rounded-2xl p-3 shadow-sm ${enRupture ? 'border border-red-200 bg-red-50' : 'border border-slate-100 bg-white'}`}>
      {pin.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pin.photo_url} alt={pin.nom} className="h-12 w-12 rounded-xl bg-slate-100 object-cover" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-300">?</div>
      )}
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800">{pin.nom}</p>
        <p className="text-[11px] text-slate-400">
          SKU {pin.sku_pimpit ?? pin.sku_fournisseur ?? '—'}
          {formatEmplacement(pin) ? ` · ${formatEmplacement(pin)}` : ''}
        </p>
        <p className={`text-xs ${enRupture ? 'font-bold text-red-600' : 'text-slate-400'}`}>
          {pin.stock_general} en stock{pin.seuil_cible !== null ? ` · seuil ${pin.seuil_cible}` : ''}
        </p>
        {demandeurs.length > 0 && (
          <p className="line-clamp-1 text-[11px] text-amber-600">Demandé par {demandeurs.map((d) => d.popUpNom).join(', ')}</p>
        )}
        {pin.poids_unitaire === null && (
          <p className="mt-1 text-[11px] text-amber-600">Poids unité (g) manquant — à renseigner dans Catalogue avant de peser.</p>
        )}
        {erreur && <p className="mt-1 text-[11px] font-semibold text-red-600">{erreur}</p>}
      </div>
      {pin.poids_unitaire !== null && (
        <div className="flex items-center gap-1.5">
          <input
            value={poids}
            onChange={(e) => setPoids(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmer()}
            inputMode="decimal"
            placeholder="Poids (g)"
            className="w-20 rounded-xl border border-slate-200 px-2.5 py-2 text-sm focus:outline-none"
          />
          <button
            onClick={confirmer}
            disabled={!poidsValide || enCours}
            className={`rounded-xl px-3 py-2 text-xs font-bold text-white ${poidsValide ? 'bg-indigo-600' : 'bg-slate-200 text-slate-500'}`}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}

export function LocalView({
  pins,
  boites,
  popUps,
  popUpLocalId,
  commandesActives,
  onChanged,
  onOuvrirDetailPin,
  onOuvrirPhotoPin,
}: {
  pins: StockPin[];
  boites: PopUpPinBoite[];
  popUps: { id: string; nom: string }[];
  popUpLocalId: string;
  commandesActives: CommandeAvecLignes[];
  onChanged: () => void;
  onOuvrirDetailPin: (pin: StockPin) => void;
  onOuvrirPhotoPin: (pin: StockPin) => void;
}) {
  const [sousOnglet, setSousOnglet] = useState<'commandes' | 'stock' | 'catalogue'>('commandes');
  const [rechercheLocal, setRechercheLocal] = useState('');
  const [commandeOuverte, setCommandeOuverte] = useState<string | null>(null);

  const nomsPopUp = useMemo(() => new Map(popUps.map((p) => [p.id, p.nom])), [popUps]);

  const demandesParPin = useMemo(() => {
    const map = new Map<string, PopUpDemandeur[]>();
    const dejaVus = new Map<string, Set<string>>();
    for (const b of boites) {
      if (!b.a_commander || b.pop_up_id === popUpLocalId) continue;
      const vus = dejaVus.get(b.pin_id) ?? new Set<string>();
      if (vus.has(b.pop_up_id)) continue;
      vus.add(b.pop_up_id);
      dejaVus.set(b.pin_id, vus);
      const liste = map.get(b.pin_id) ?? [];
      liste.push({ popUpNom: nomsPopUp.get(b.pop_up_id) ?? '?' });
      map.set(b.pin_id, liste);
    }
    return map;
  }, [boites, popUpLocalId, nomsPopUp]);

  const pinsTries = useMemo(() => {
    const q = rechercheLocal.trim().toLowerCase();
    const liste = q ? pins.filter((p) => p.nom.toLowerCase().includes(q)) : pins;
    return [...liste].sort((a, b) => {
      const skuA = a.sku_pimpit ?? a.sku_fournisseur;
      const skuB = b.sku_pimpit ?? b.sku_fournisseur;
      if (skuA && skuB) return skuA.localeCompare(skuB, undefined, { numeric: true });
      if (skuA) return -1;
      if (skuB) return 1;
      return a.nom.localeCompare(b.nom);
    });
  }, [pins, rechercheLocal]);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(
          [
            { valeur: 'commandes', label: 'Commandes' },
            { valeur: 'stock', label: 'Stock local' },
            { valeur: 'catalogue', label: 'Catalogue' },
          ] as { valeur: typeof sousOnglet; label: string }[]
        ).map((o) => (
          <button
            key={o.valeur}
            onClick={() => setSousOnglet(o.valeur)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold ${sousOnglet === o.valeur ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {sousOnglet === 'commandes' && (
        <div className="mx-auto w-full max-w-[960px]">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Commandes</p>
          <p className="mb-3 text-xs text-slate-400">
            Pèse chaque pin (ça coche automatiquement la case), puis valide la commande comme prête.
          </p>
          {commandesActives.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
              Aucune commande en attente.
            </p>
          ) : (
            commandesActives.map((c) => {
              const nbFaites = c.lignes.filter((l) => l.fait).length;
              return (
                <button
                  key={c.commande.id}
                  onClick={() => setCommandeOuverte(c.commande.id)}
                  className="mb-2.5 flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{nomsPopUp.get(c.commande.pop_up_id) ?? '?'}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {nbFaites}/{c.lignes.length} pin(s) prêt(s) · envoyée{' '}
                      {new Date(c.commande.envoyee_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {c.commande.statut === 'envoyee' ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">À préparer</span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Prête</span>
                  )}
                  <span className="ml-3 text-lg text-indigo-400">›</span>
                </button>
              );
            })
          )}
        </div>
      )}

      {sousOnglet === 'stock' && (
        <div className="mx-auto w-full max-w-[960px]">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Stock local</p>
          <p className="mb-3 text-xs text-slate-400">
            En rouge : sous le seuil cible. &laquo; Demandé par &raquo; : au moins une case pop-up a coché &laquo; Commander &raquo;
            pour ce pin. Pèse ce qu&apos;il reste après avoir servi une commande pour recalculer le stock automatiquement.
          </p>
          <input
            value={rechercheLocal}
            onChange={(e) => setRechercheLocal(e.target.value)}
            placeholder="Rechercher un pin à peser…"
            className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none"
          />
          {pinsTries.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun résultat.</p>
          ) : (
            pinsTries.map((pin) => (
              <LigneLocalPin
                key={pin.id}
                pin={pin}
                demandeurs={demandesParPin.get(pin.id) ?? []}
                popUpLocalId={popUpLocalId}
                onChanged={onChanged}
              />
            ))
          )}
        </div>
      )}

      {sousOnglet === 'catalogue' && (
        <CatalogueTab
          pins={pins}
          boites={boites}
          popUps={popUps}
          onChanged={onChanged}
          onOuvrirDetail={onOuvrirDetailPin}
          onOuvrirPhoto={onOuvrirPhotoPin}
        />
      )}

      {commandeOuverte && (
        <PanneauPreparationCommande
          commandeId={commandeOuverte}
          onFermer={() => setCommandeOuverte(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
