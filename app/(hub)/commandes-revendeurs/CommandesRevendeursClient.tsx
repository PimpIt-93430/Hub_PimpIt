'use client';

import { useState, useTransition } from 'react';

import {
  marquerCommandeRevendeurTraitee,
  supprimerCommandeRevendeur,
  type CommandeRevendeurHub,
} from './actions';

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' €';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Miniature légère plutôt que l'image d'origine — même optimisation que photoParId dans
 * commandes/CommandesClient.tsx (imprimerCommande) : un PDF avec beaucoup de références et
 * l'image d'origine de chacune peut mettre très longtemps à charger. */
function miniature(url: string): string {
  if (!url.includes('/storage/v1/object/public/')) return url;
  return `${url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}?width=80&quality=60`;
}

/** Bon de commande imprimable pour une commande revendeur — retour utilisateur du 2026-09-17 :
 * "exactement comme les commandes fournisseurs [...] pour envoyer au chinois directement". Même
 * gabarit que imprimerCommande (commandes/CommandesClient.tsx) : mêmes colonnes (photo, SKU
 * interne, SKU fournisseur, quantité), pas de prix — ce document part tel quel vers le fabricant,
 * qui n'a pas à voir le prix de revente. */
function imprimerCommandeRevendeur(c: CommandeRevendeurHub) {
  const total = c.lignes.reduce((s, l) => s + l.quantite, 0);
  const rows = c.lignes
    .map(
      (l) => `<tr>
        <td>${l.photoUrl ? `<img src="${miniature(l.photoUrl)}" style="width:64px;height:64px;object-fit:cover;border-radius:6px">` : ''}</td>
        <td>${l.nom}</td>
        <td>${l.skuPimpit ?? '—'}</td>
        <td>${l.skuFournisseur || '—'}</td>
        <td style="text-align:right"><strong>${l.quantite}</strong></td>
      </tr>`,
    )
    .join('');

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Commande ${c.entreprise}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;padding:40px;max-width:960px;margin:auto;font-size:13px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
    .company-name{font-size:22px;font-weight:800;letter-spacing:-0.5px}
    .company-sub{font-size:12px;color:#666;margin-top:2px}
    .po-info{text-align:right}
    .po-number{font-size:20px;font-weight:700}
    .po-date{font-size:13px;color:#666;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    thead th{background:#f3f4f6;padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#666}
    thead th:last-child{text-align:right}
    tbody td{padding:8px 12px;border-bottom:1px solid #f0f0f0;vertical-align:middle}
    .addresses{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
    .addr-block{padding:14px 16px;border:1px solid #e5e7eb;border-radius:8px}
    .addr-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#999;margin-bottom:6px}
    .addr-name{font-weight:700;font-size:13px;margin-bottom:2px}
    .addr-line{color:#555;line-height:1.5}
    .total-row{margin-top:16px;text-align:right;font-weight:700;font-size:15px;padding-right:12px}
    .print-btn{margin-top:24px;padding:10px 24px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px}
    @media print{.print-btn{display:none}}
  </style></head><body>
  <script>
  window.addEventListener('load', () => {
    const imgs = Array.from(document.querySelectorAll('img'));
    if (!imgs.length) { setTimeout(() => window.print(), 300); return; }
    let pending = imgs.length;
    const tryPrint = () => { if (--pending <= 0) setTimeout(() => window.print(), 300); };
    imgs.forEach(img => { if (img.complete) tryPrint(); else { img.addEventListener('load', tryPrint); img.addEventListener('error', tryPrint); } });
    setTimeout(() => window.print(), 5000);
  });
  </script>
  <div class="header">
    <div><div class="company-name">Pimp It Store</div><div class="company-sub">Bon de commande — ${c.entreprise}</div></div>
    <div class="po-info"><div class="po-number">Revendeur</div><div class="po-date">${fmtDate(c.createdAt)}</div></div>
  </div>
  <div class="addresses">
    <div class="addr-block">
      <div class="addr-label">Livraison à</div>
      <div class="addr-name">Pimp It Store</div>
      <div class="addr-line">3 rue des Carrières<br>93800 Épinay-sur-Seine<br>France</div>
    </div>
    <div class="addr-block">
      <div class="addr-label">Facturation à</div>
      <div class="addr-name">Pimp It Store</div>
      <div class="addr-line">3 rue des Carrières<br>93800 Épinay-sur-Seine<br>France</div>
    </div>
  </div>
  <table>
    <thead><tr><th></th><th>Nom</th><th>SKU interne</th><th>SKU fournisseur</th><th style="text-align:right">Qté</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total-row">Total : ${total} pièces · ${c.lignes.length} références</div>
  <button class="print-btn" onclick="window.print()">Imprimer / PDF</button>
  </body></html>`);
  w.document.close();
}

/** Liste des commandes reçues depuis la page publique /revendeurs (cf. migration 0115) — pas
 * d'email/notification automatique pour l'instant, cet écran reste la seule façon de les voir. */
export function CommandesRevendeursClient({ commandesInitiales }: { commandesInitiales: CommandeRevendeurHub[] }) {
  const [commandes, setCommandes] = useState(commandesInitiales);
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const [enCours, demarrer] = useTransition();
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);
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

  function supprimer(commande: CommandeRevendeurHub) {
    if (!confirm(`Supprimer la commande de « ${commande.entreprise} » ? Cette action est irréversible.`)) return;
    setErreur(null);
    setSuppressionEnCours(commande.id);
    demarrer(async () => {
      try {
        await supprimerCommandeRevendeur(commande.id);
        setCommandes((cs) => cs.filter((c) => c.id !== commande.id));
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        setSuppressionEnCours(null);
      }
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Commandes revendeurs</h1>
          <p className="mt-1 text-sm text-slate-400">
            Reçues depuis l&apos;espace revendeur public. Aucune alerte automatique n&apos;est configurée pour
            l&apos;instant — pense à revenir régulièrement sur cet écran.
          </p>
        </div>
        <a
          href="/revendeurs"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 whitespace-nowrap rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Ouvrir l&apos;espace revendeur →
        </a>
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
              onSupprimer={() => supprimer(c)}
              enCours={enCours}
              suppressionEnCours={suppressionEnCours === c.id}
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
              <CarteCommande
                key={c.id}
                commande={c}
                ouverte={ouvertes.has(c.id)}
                onToggle={() => toggle(c.id)}
                onSupprimer={() => supprimer(c)}
                suppressionEnCours={suppressionEnCours === c.id}
              />
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
  onSupprimer,
  enCours,
  suppressionEnCours,
}: {
  commande: CommandeRevendeurHub;
  ouverte: boolean;
  onToggle: () => void;
  onMarquerTraitee?: () => void;
  onSupprimer: () => void;
  enCours?: boolean;
  suppressionEnCours?: boolean;
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
          {commande.remisePourcentage > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              -{commande.remisePourcentage}%
            </span>
          )}
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

          <div className="mt-3 flex flex-col items-end gap-0.5 text-sm">
            {commande.remisePourcentage > 0 && (
              <>
                <p className="text-slate-400">Sous-total : {fmt(commande.sousTotalHt)}</p>
                <p className="font-semibold text-emerald-700">
                  Réduction -{commande.remisePourcentage}% : -{fmt(commande.sousTotalHt - commande.totalHt)}
                </p>
              </>
            )}
            <p className="text-base font-bold text-slate-900">Total : {fmt(commande.totalHt)}</p>
          </div>

          <div className="mt-4 flex justify-end gap-2.5">
            <button
              onClick={onSupprimer}
              disabled={suppressionEnCours}
              className="rounded-lg bg-red-50 px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {suppressionEnCours ? 'Suppression…' : 'Supprimer'}
            </button>
            <button
              onClick={() => imprimerCommandeRevendeur(commande)}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Imprimer / PDF
            </button>
            {onMarquerTraitee && (
              <button
                onClick={onMarquerTraitee}
                disabled={enCours}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Marquer comme traitée
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
