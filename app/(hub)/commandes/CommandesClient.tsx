'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { basculerIncrementStock, basculerStatutCommande, creerCommande, supprimerCommande } from './actions';
import { EditOrderModal } from './EditOrderModal';
import { ReceiveModal } from './ReceiveModal';
import type { LigneCreation } from './types';
import { FOURNISSEURS, type ArticleCommande, type CommandeFournisseur, type HubPinLite } from '@/lib/purchase-orders';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function libelleFournisseur(code: string): string {
  return FOURNISSEURS[code]?.label ?? code ?? '—';
}

/** Pas des flèches (natives et clavier) sur les quantités : 0 → 50 → 100 → 200 puis +100 à chaque
 * cran — porté de l'ancien admin (public/index.html nextQtyStep/prevQtyStep). La saisie manuelle
 * au clavier (taper un nombre) reste libre — seul un delta de ±1 (ce que le navigateur applique
 * en interne au clic sur les flèches / touches ↑↓) est réinterprété avec ce pas personnalisé. */
function prochainPalier(v: number): number {
  v = Math.max(0, v || 0);
  if (v < 50) return 50;
  if (v < 100) return 100;
  if (v < 200) return 200;
  return Math.floor(v / 100) * 100 + 100;
}
function palierPrecedent(v: number): number {
  v = Math.max(0, v || 0);
  if (v <= 50) return 0;
  if (v <= 100) return 50;
  if (v <= 200) return 100;
  const arrondi = Math.ceil(v / 100) * 100;
  return arrondi === v ? v - 100 : arrondi - 100;
}

/** Miniature légère plutôt que l'image d'origine — cf. retour utilisateur du 2026-09-05 : un aperçu
 * PDF avec 400+ références (donc 400+ images) mettait ~10 min à charger. Les photos sont hébergées
 * sur Supabase Storage, qui sait re-générer une version réduite à la volée (endpoint
 * /render/image/, cf. doc Supabase Storage) : ~7,5 Ko contre ~100 Ko en pleine résolution pour la
 * même image, largement suffisant pour une vignette 64×64 imprimée. Retombe sur l'URL d'origine si
 * ce n'est pas une URL Supabase Storage reconnue (autre hébergeur, ou vide). */
function miniature(url: string): string {
  if (!url.includes('/storage/v1/object/public/')) return url;
  return `${url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}?width=80&quality=60`;
}

/** Bon de commande fournisseur imprimable (image, SKU interne, SKU fournisseur, quantité) — même
 * gabarit que l'ancien admin (server.js /api/orders/:id/print), généré ici côté client puisque le
 * Hub n'a pas de route serveur dédiée pour ça. Attend le chargement des images avant de proposer
 * l'impression (sinon le PDF/impression peut sortir avec des images manquantes). */
function imprimerCommande(c: { ref: string; label: string; createdAt: string; items: ArticleCommande[] }, photoParId: Map<string, string>) {
  const total = c.items.reduce((s, i) => s + (i.qty || 0), 0);
  const rows = c.items
    .map((i) => {
      const photo = photoParId.get(i.airtableId) ?? '';
      return `<tr>
        <td>${photo ? `<img src="${miniature(photo)}" style="width:64px;height:64px;object-fit:cover;border-radius:6px">` : ''}</td>
        <td>${i.name}</td>
        <td>${i.skuPimpit ?? '—'}</td>
        <td>${i.skuFournisseur || '—'}</td>
        <td style="text-align:right"><strong>${i.qty}</strong></td>
      </tr>`;
    })
    .join('');

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${c.ref}</title>
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
    <div><div class="company-name">Pimp It Store</div><div class="company-sub">Bon de commande — ${c.label}</div></div>
    <div class="po-info"><div class="po-number">${c.ref}</div><div class="po-date">${formatDate(c.createdAt)}</div></div>
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
  <div class="total-row">Total : ${total} pièces · ${c.items.length} références</div>
  <button class="print-btn" onclick="window.print()">Imprimer / PDF</button>
  </body></html>`);
  w.document.close();
}

/** Écran "Commandes fournisseurs" — refonte du 2026-09-05 (retour utilisateur) : plus de choix
 * préalable de fournisseur ni de type (stock normal / pop-up store), un seul tableau avec tous
 * les pins (stock actuel + quantité déjà commandée depuis toujours, pour se faire une idée du
 * volume vendu) et une quantité libre par ligne. À la validation, les lignes sont regroupées par
 * fournisseur réel du pin (hub_pins.fournisseur) : un bon de commande + un PDF par fournisseur
 * représenté, sans action supplémentaire à faire. */
export function CommandesClient({
  commandesInitiales,
  pinsInitiaux,
}: {
  commandesInitiales: CommandeFournisseur[];
  pinsInitiaux: HubPinLite[];
}) {
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [qtyParPin, setQtyParPin] = useState<Record<string, number>>({});
  const [commandeAEditer, setCommandeAEditer] = useState<CommandeFournisseur | null>(null);
  const [commandeAReceptionner, setCommandeAReceptionner] = useState<CommandeFournisseur | null>(null);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const pinsParId = useMemo(() => new Map(pinsInitiaux.map((p) => [p.airtable_id, p])), [pinsInitiaux]);
  const photoParId = useMemo(() => new Map(pinsInitiaux.map((p) => [p.airtable_id, p.image_url ?? ''])), [pinsInitiaux]);

  // "Stock commandé depuis toujours" — cf. retour utilisateur : "ça donne une idée de combien ont
  // été vendu", tout statut/toute commande confondu, pas juste les commandes en attente.
  const commandeDepuisToujoursParId = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of commandesInitiales) {
      for (const it of c.items) m.set(it.airtableId, (m.get(it.airtableId) ?? 0) + (it.qty || 0));
    }
    return m;
  }, [commandesInitiales]);

  const lignes: LigneCreation[] = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return pinsInitiaux
      .filter((p) => {
        if (!q) return true;
        return (
          (p.name ?? '').toLowerCase().includes(q) ||
          String(p.sku_pimpit ?? '').includes(q) ||
          (p.sku_fournisseur ?? '').toLowerCase().includes(q)
        );
      })
      .map((p) => ({
        airtableId: p.airtable_id,
        name: p.name ?? '',
        skuPimpit: p.sku_pimpit,
        skuFournisseur: p.sku_fournisseur ?? '',
        fournisseur: p.fournisseur,
        photo: p.image_url ?? '',
        stockActuel: Math.round(p.stock ?? 0),
        commandeDepuisToujours: commandeDepuisToujoursParId.get(p.airtable_id) ?? 0,
        qty: qtyParPin[p.airtable_id] ?? 0,
      }));
  }, [pinsInitiaux, recherche, commandeDepuisToujoursParId, qtyParPin]);

  const nbSelectionnes = Object.values(qtyParPin).filter((q) => q > 0).length;
  const totalPieces = Object.values(qtyParPin).reduce((s, q) => s + (q > 0 ? q : 0), 0);

  function definirQty(airtableId: string, brut: number) {
    setQtyParPin((prev) => {
      const precedent = prev[airtableId] ?? 0;
      let qty: number;
      if (brut === precedent + 1) qty = prochainPalier(precedent);
      else if (brut === precedent - 1) qty = palierPrecedent(precedent);
      else qty = Math.max(0, brut);
      return { ...prev, [airtableId]: qty };
    });
  }

  function allerAuPinSuivant(airtableId: string) {
    const idx = lignes.findIndex((l) => l.airtableId === airtableId);
    const suivante = lignes[idx + 1];
    if (suivante) inputsRef.current[suivante.airtableId]?.focus();
  }

  function grouperParFournisseur(items: LigneCreation[]): { parFournisseur: Map<string, LigneCreation[]>; sansFournisseur: LigneCreation[] } {
    const parFournisseur = new Map<string, LigneCreation[]>();
    const sansFournisseur: LigneCreation[] = [];
    for (const item of items) {
      const code = Object.keys(FOURNISSEURS).find((k) => item.fournisseur && FOURNISSEURS[k].codes.includes(item.fournisseur));
      if (!code) {
        sansFournisseur.push(item);
        continue;
      }
      const liste = parFournisseur.get(code) ?? [];
      liste.push(item);
      parFournisseur.set(code, liste);
    }
    return { parFournisseur, sansFournisseur };
  }

  function confirmerCommandes() {
    const items = lignes.filter((l) => l.qty > 0);
    if (!items.length) {
      setToast('Ajoutez au moins un pin avec une quantité');
      return;
    }
    const { parFournisseur, sansFournisseur } = grouperParFournisseur(items);
    if (parFournisseur.size === 0) {
      setToast('Aucun pin sélectionné n’a de fournisseur reconnu');
      return;
    }
    setErreur(null);
    demarrer(async () => {
      const creees: { ref: string; label: string; items: ArticleCommande[] }[] = [];
      try {
        for (const [code, lignesFournisseur] of parFournisseur) {
          const articles: ArticleCommande[] = lignesFournisseur.map((l) => ({
            airtableId: l.airtableId,
            name: l.name,
            skuPimpit: l.skuPimpit,
            skuFournisseur: l.skuFournisseur,
            stockActuel: l.stockActuel,
            qty: l.qty,
          }));
          const { ref } = await creerCommande(code, articles, 'normal');
          creees.push({ ref, label: FOURNISSEURS[code].label, items: articles });
        }
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
        return;
      }
      const maintenant = new Date().toISOString();
      for (const c of creees) imprimerCommande({ ...c, createdAt: maintenant }, photoParId);
      let msg = creees.map((c) => c.ref).join(' · ') + (creees.length > 1 ? ' créées' : ' créée');
      if (sansFournisseur.length) msg += ` — ${sansFournisseur.length} pin(s) sans fournisseur ignoré(s)`;
      setToast(msg);
      setQtyParPin({});
      setCreationOuverte(false);
    });
  }

  function basculerStatut(c: CommandeFournisseur) {
    const label = c.status === 'received' ? 'Repasser en attente ?' : 'Marquer comme reçue ?';
    if (!confirm(label)) return;
    demarrer(async () => {
      try {
        await basculerStatutCommande(c.id, c.status);
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  function basculerIncrement(c: CommandeFournisseur, incrementer: boolean) {
    demarrer(async () => {
      try {
        await basculerIncrementStock(c.id, incrementer);
        setToast(incrementer ? `Stock incrémenté pour ${c.ref}` : `Stock décrémenté pour ${c.ref}`);
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  function supprimer(c: CommandeFournisseur) {
    if (!confirm(`Supprimer ${c.ref} ?`)) return;
    if (!confirm(`Confirmer la suppression définitive de ${c.ref} ?`)) return;
    demarrer(async () => {
      try {
        await supprimerCommande(c.id);
        setToast(`${c.ref} supprimé`);
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Commandes fournisseurs</h1>
          <p className="mt-1 text-sm text-slate-400">Historique des bons de commande passés.</p>
        </div>
        {!creationOuverte && (
          <button
            onClick={() => setCreationOuverte(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
          >
            + Créer une nouvelle commande
          </button>
        )}
      </div>

      {creationOuverte && (
        <div className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-slate-400">
              Renseigne la quantité à commander pour chaque pin — un bon de commande et un PDF sont créés automatiquement par fournisseur.
            </p>
            <button onClick={() => setCreationOuverte(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700">
              Annuler
            </button>
          </div>

          <div className="mb-3">
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un pin (nom, SKU)…"
              className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </div>

          {/* Hauteur bornée + défilement interne — le catalogue compte ~600 pins, sans ça le bouton
              de création ne serait atteignable qu'après un défilement interminable. */}
          <div className="mb-4 max-h-[65vh] overflow-y-auto overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">SKU interne</th>
                  <th className="px-3 py-2">SKU fournisseur</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Commandé depuis toujours</th>
                  <th className="px-3 py-2 text-right">Qté à commander</th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      Aucun résultat
                    </td>
                  </tr>
                ) : (
                  lignes.map((l) => (
                    <tr key={l.airtableId} className={`border-b border-slate-50 last:border-0 ${l.qty > 0 ? 'bg-emerald-50/50' : ''}`}>
                      <td className="px-3 py-2">
                        {l.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.photo} alt="" className="h-9 w-9 rounded-md object-cover" />
                        ) : (
                          <div className="h-9 w-9 rounded-md bg-slate-100" />
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">{l.name}</td>
                      <td className="px-3 py-2 text-slate-500">{l.skuPimpit ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{l.skuFournisseur || '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{l.stockActuel}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{l.commandeDepuisToujours}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          ref={(el) => {
                            inputsRef.current[l.airtableId] = el;
                          }}
                          type="number"
                          min={0}
                          value={l.qty}
                          onChange={(e) => definirQty(l.airtableId, parseInt(e.target.value, 10) || 0)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              allerAuPinSuivant(l.airtableId);
                            }
                          }}
                          className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-slate-400"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {erreur && <p className="mb-3 text-sm text-red-600">{erreur}</p>}

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {nbSelectionnes} pin{nbSelectionnes > 1 ? 's' : ''} sélectionné{nbSelectionnes > 1 ? 's' : ''} · {totalPieces} pièce
              {totalPieces > 1 ? 's' : ''}
            </p>
            <button
              onClick={confirmerCommandes}
              disabled={enCours || nbSelectionnes === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {enCours ? 'Création…' : 'Créer le(s) bon(s) de commande'}
            </button>
          </div>
        </div>
      )}

      <div>
        <p className="mb-3 text-sm font-bold text-slate-900">Historique des commandes</p>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Fournisseur</th>
                <th className="px-4 py-3">Contenu</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {commandesInitiales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    Aucune commande
                  </td>
                </tr>
              ) : (
                commandesInitiales.map((c) => {
                  const total = c.items.reduce((s, i) => s + (i.qty || 0), 0);
                  const modifiable = c.status === 'pending' && c.type !== 'b2b';
                  const basculeIncrementPossible = c.status === 'received' && c.type !== 'popup' && c.type !== 'b2b';
                  return (
                    <tr key={c.id} className={`border-b border-slate-50 last:border-0 ${c.stockIncremente ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{c.ref || 'Sans référence'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {libelleFournisseur(c.supplier)}
                        {c.type === 'popup' && (
                          <span className="ml-1.5 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Pop-up</span>
                        )}
                        {c.type === 'b2b' && (
                          <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            B2B (lecture seule)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {c.items.length} réf. · {total} pcs
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => basculerStatut(c)}
                          disabled={enCours}
                          title={c.status === 'received' ? 'Cliquer pour repasser en attente' : 'Cliquer pour marquer comme reçue'}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            c.status === 'received' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {c.status === 'received' ? 'Reçue' : 'En attente'}
                        </button>
                        {basculeIncrementPossible &&
                          (c.stockIncremente ? (
                            <div className="mt-1 flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-500">Commande locale incrémentée</span>
                              <button
                                onClick={() => basculerIncrement(c, false)}
                                disabled={enCours}
                                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                              >
                                Décrémenter
                              </button>
                            </div>
                          ) : (
                            <div className="mt-1">
                              <button
                                onClick={() => basculerIncrement(c, true)}
                                disabled={enCours}
                                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                              >
                                Incrémenter le stock local
                              </button>
                            </div>
                          ))}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => imprimerCommande(c, photoParId)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Imprimer
                          </button>
                          {modifiable && (
                            <button
                              onClick={() => setCommandeAEditer(c)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Modifier
                            </button>
                          )}
                          {modifiable && (
                            <button
                              onClick={() => setCommandeAReceptionner(c)}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              Réceptionner
                            </button>
                          )}
                          {modifiable && (
                            <button
                              onClick={() => supprimer(c)}
                              className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {commandeAEditer && (
        <EditOrderModal
          commande={commandeAEditer}
          pinsInitiaux={pinsInitiaux}
          onClose={() => setCommandeAEditer(null)}
          onEnregistre={() => {
            setCommandeAEditer(null);
            setToast('Commande mise à jour');
          }}
        />
      )}

      {commandeAReceptionner && (
        <ReceiveModal
          commande={commandeAReceptionner}
          pinsParId={pinsParId}
          onClose={() => setCommandeAReceptionner(null)}
          onReceptionne={(n) => {
            setCommandeAReceptionner(null);
            setToast(`${n} article(s) reçu(s)`);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
