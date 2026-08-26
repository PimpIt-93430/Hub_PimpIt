'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { basculerStatutCommande, creerCommande, supprimerCommande } from './actions';
import { EditOrderModal } from './EditOrderModal';
import { ManualOrderModal } from './ManualOrderModal';
import { ReceiveModal } from './ReceiveModal';
import type { ArticleBrouillon, Brouillon } from './types';
import { CRETEIL_SOLEIL_SKUS, FOURNISSEURS, type CommandeFournisseur, type HubPinLite, type TypeCommande } from '@/lib/purchase-orders';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function libelleFournisseur(code: string): string {
  return FOURNISSEURS[code]?.label ?? code ?? '—';
}

/** Réplique l'écran "Nouvelle commande" de l'ancien admin (public/index.html id="screen-orders",
 * ~lignes 2305-2900 de la logique JS) : brouillon auto-suggéré par fournisseur (stock normal /
 * pop-up), commande manuelle, historique inline avec réception/édition/suppression. Écrit
 * uniquement Supabase désormais (app/(hub)/commandes/actions.ts) — voir le rapport de tâche pour
 * les écarts assumés avec l'ancien site (B2B et "+Stock Pop-up" hors périmètre).
 *
 * Les props (commandesInitiales / pinsInitiaux) viennent du composant serveur (page.tsx) et sont
 * automatiquement rafraîchies par Next.js après chaque action serveur (revalidatePath) : pas de
 * copie locale de ces données dans le state, comme sur l'écran Pin's. */
export function CommandesClient({
  commandesInitiales,
  pinsInitiaux,
}: {
  commandesInitiales: CommandeFournisseur[];
  pinsInitiaux: HubPinLite[];
}) {
  const [typeCommande, setTypeCommande] = useState<TypeCommande>('normal');
  const [fournisseurSelectionne, setFournisseurSelectionne] = useState<string | null>(null);
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [manuelOuvert, setManuelOuvert] = useState(false);
  const [commandeAEditer, setCommandeAEditer] = useState<CommandeFournisseur | null>(null);
  const [commandeAReceptionner, setCommandeAReceptionner] = useState<CommandeFournisseur | null>(null);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Réinitialise les quantités éditées quand on change de fournisseur/type — même comportement
  // que l'ancien selectSupplier (nouveau brouillon = nouvelles quantités suggérées).
  useEffect(() => {
    setQtyOverrides({});
  }, [fournisseurSelectionne, typeCommande]);

  const pinsParId = useMemo(() => new Map(pinsInitiaux.map((p) => [p.airtable_id, p])), [pinsInitiaux]);

  // Base du brouillon (avant application des éditions manuelles de quantité) : ne dépend PAS de
  // qtyOverrides, pour ne pas réordonner les lignes pendant que l'utilisateur tape (même
  // comportement que l'ancien renderDraft, qui mute draftData.items en place sans re-trier).
  const brouillonBase = useMemo<Brouillon | null>(() => {
    if (!fournisseurSelectionne) return null;
    const sup = FOURNISSEURS[fournisseurSelectionne];
    if (!sup) return null;
    const pinsFournisseur = pinsInitiaux.filter((p) => p.fournisseur && sup.codes.includes(p.fournisseur));

    if (typeCommande === 'popup') {
      const dejaCommandeParId = new Map<string, number>();
      for (const c of commandesInitiales) {
        if (c.type !== 'popup') continue;
        for (const it of c.items) dejaCommandeParId.set(it.airtableId, (dejaCommandeParId.get(it.airtableId) ?? 0) + (it.qty || 0));
      }
      const items: ArticleBrouillon[] = pinsFournisseur.map((p) => {
        const seuil = p.seuil_cible ?? 0;
        const creteilSoleil = CRETEIL_SOLEIL_SKUS.has(String(p.sku_pimpit ?? ''));
        return {
          airtableId: p.airtable_id,
          name: p.name ?? '',
          skuPimpit: p.sku_pimpit,
          skuFournisseur: p.sku_fournisseur ?? '',
          photo: p.image_url ?? '',
          stockActuel: 0,
          seuilCible: seuil,
          creteilSoleil,
          dejaCommande: dejaCommandeParId.get(p.airtable_id) ?? 0,
          qty: Math.round(seuil / 2),
        };
      });
      items.sort((a, b) => (Number(b.creteilSoleil) - Number(a.creteilSoleil)) || a.name.localeCompare(b.name));
      return { supplier: fournisseurSelectionne, label: sup.label, type: 'popup', items };
    }

    const enAttenteParId = new Map<string, number>();
    for (const c of commandesInitiales) {
      if (c.status !== 'pending' || c.type !== 'normal') continue;
      for (const it of c.items) enAttenteParId.set(it.airtableId, (enAttenteParId.get(it.airtableId) ?? 0) + (it.qty || 0));
    }
    const items: ArticleBrouillon[] = pinsFournisseur.map((p) => {
      const stock = Math.round(p.stock ?? 0);
      const seuil = p.seuil_cible ?? 0;
      const enAttente = enAttenteParId.get(p.airtable_id) ?? 0;
      const qty = Math.ceil(Math.max(0, seuil - stock - enAttente) / 10) * 10;
      return {
        airtableId: p.airtable_id,
        name: p.name ?? '',
        skuPimpit: p.sku_pimpit,
        skuFournisseur: p.sku_fournisseur ?? '',
        photo: p.image_url ?? '',
        stockActuel: stock,
        seuilCible: seuil,
        enAttente,
        qty,
      };
    });
    items.sort((a, b) => b.qty - a.qty);
    return { supplier: fournisseurSelectionne, label: sup.label, type: 'normal', items };
  }, [fournisseurSelectionne, typeCommande, pinsInitiaux, commandesInitiales]);

  const brouillon: Brouillon | null = useMemo(() => {
    if (!brouillonBase) return null;
    return { ...brouillonBase, items: brouillonBase.items.map((it) => ({ ...it, qty: qtyOverrides[it.airtableId] ?? it.qty })) };
  }, [brouillonBase, qtyOverrides]);

  const totalBrouillon = useMemo(() => brouillon?.items.reduce((s, i) => s + (i.qty || 0), 0) ?? 0, [brouillon]);

  function choisirFournisseur(code: string) {
    setFournisseurSelectionne(code);
  }

  function toutA0() {
    if (!brouillonBase) return;
    const next: Record<string, number> = {};
    for (const it of brouillonBase.items) next[it.airtableId] = 0;
    setQtyOverrides(next);
  }

  function presetCreteilSoleil() {
    if (!brouillonBase) return;
    const next: Record<string, number> = {};
    for (const it of brouillonBase.items) next[it.airtableId] = it.creteilSoleil ? 200 : 0;
    setQtyOverrides(next);
  }

  function confirmerCommande() {
    if (!brouillon) return;
    const items = brouillon.items.filter((i) => i.qty > 0);
    if (!items.length) {
      setToast('Aucun article à commander');
      return;
    }
    setErreur(null);
    demarrer(async () => {
      try {
        const { ref } = await creerCommande(
          brouillon.supplier,
          items.map((i) => ({
            airtableId: i.airtableId,
            name: i.name,
            skuPimpit: i.skuPimpit,
            skuFournisseur: i.skuFournisseur,
            stockActuel: i.stockActuel,
            qty: i.qty,
          })),
          brouillon.type,
        );
        setToast(`Bon de commande ${ref} créé`);
        setFournisseurSelectionne(null);
        setQtyOverrides({});
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  function imprimerApercuBrouillon() {
    if (!brouillon) return;
    const rows = brouillon.items
      .map(
        (i) => `<tr><td>${i.name}</td><td>${i.skuFournisseur || '—'}</td><td>${i.stockActuel}</td><td>${i.seuilCible}</td><td><strong>${i.qty}</strong></td></tr>`,
      )
      .join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Aperçu commande</title>
    <style>body{font-family:system-ui;padding:32px}table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#f3f4f6;padding:8px 10px;text-align:left}td{padding:8px 10px;border-bottom:1px solid #e5e7eb}
    @media print{button{display:none}}</style></head><body>
    <h2>${brouillon.label}</h2>
    <table><thead><tr><th>Nom</th><th>SKU Fourn.</th><th>Stock</th><th>Cible</th><th>Qté</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p style="margin-top:16px;font-weight:bold">Total : ${totalBrouillon} pièces</p>
    <button onclick="window.print()" style="margin-top:16px;padding:10px 20px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimer</button>
    </body></html>`);
    w.document.close();
  }

  function imprimerCommande(c: CommandeFournisseur) {
    const rows = c.items
      .map(
        (i) => `<tr><td>${i.name}</td><td>${i.skuFournisseur || '—'}</td><td>${i.stockActuel}</td><td><strong>${i.qty}</strong></td></tr>`,
      )
      .join('');
    const w = window.open('', '_blank');
    if (!w) return;
    const total = c.items.reduce((s, i) => s + (i.qty || 0), 0);
    w.document.write(`<html><head><title>${c.ref}</title>
    <style>body{font-family:system-ui;padding:32px}table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#f3f4f6;padding:8px 10px;text-align:left}td{padding:8px 10px;border-bottom:1px solid #e5e7eb}
    @media print{button{display:none}}</style></head><body>
    <h2>${c.ref} — ${c.label}</h2>
    <p style="color:#666;margin-bottom:16px">${formatDate(c.createdAt)}</p>
    <table><thead><tr><th>Nom</th><th>SKU Fourn.</th><th>Stock (à la commande)</th><th>Qté</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p style="margin-top:16px;font-weight:bold">Total : ${total} pièces · ${c.items.length} références</p>
    <button onclick="window.print()" style="margin-top:16px;padding:10px 20px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimer</button>
    </body></html>`);
    w.document.close();
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Commandes fournisseurs</h1>
        <p className="mt-1 text-sm text-slate-400">
          {typeCommande === 'popup' ? 'Quantité = seuil cible ÷ 2' : 'Quantité = seuil cible − stock actuel − déjà en attente'}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setTypeCommande('normal');
            setFournisseurSelectionne(null);
          }}
          className={`rounded-lg px-3.5 py-2 text-sm font-medium ${
            typeCommande === 'normal' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Stock normal
        </button>
        <button
          onClick={() => {
            setTypeCommande('popup');
            setFournisseurSelectionne(null);
          }}
          className={`rounded-lg px-3.5 py-2 text-sm font-medium ${
            typeCommande === 'popup' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Pop-up store
        </button>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <button
          onClick={() => setManuelOuvert(true)}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          + Commande manuelle
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        {Object.entries(FOURNISSEURS).map(([code, sup]) => (
          <button
            key={code}
            onClick={() => choisirFournisseur(code)}
            className={`flex min-w-[160px] flex-col items-start gap-1 rounded-2xl border bg-white px-5 py-4 text-left shadow-sm transition ${
              fournisseurSelectionne === code ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{code}</span>
            <span className="text-sm font-semibold text-slate-900">{sup.label}</span>
          </button>
        ))}
      </div>

      {brouillon && (
        <div className="mb-10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">
              {brouillon.label}
              {brouillon.type === 'popup' ? ' · Pop-up store' : ''} — {brouillon.items.length} références
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {brouillon.type === 'popup' && (
                <>
                  <button onClick={toutA0} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                    Tout à 0
                  </button>
                  <button
                    onClick={presetCreteilSoleil}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Créteil Soleil : 200 / 0
                  </button>
                </>
              )}
              <button
                onClick={imprimerApercuBrouillon}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Imprimer aperçu
              </button>
              <button
                onClick={confirmerCommande}
                disabled={enCours}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Créer le bon de commande
              </button>
            </div>
          </div>

          {erreur && <p className="mb-2 text-sm text-red-600">{erreur}</p>}

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3" />
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">SKU Fourn.</th>
                  {brouillon.type === 'popup' ? (
                    <th className="px-4 py-3 text-right">Déjà cmd.</th>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-right">En attente</th>
                      <th className="px-4 py-3 text-right">Cible</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right">Qté</th>
                </tr>
              </thead>
              <tbody>
                {brouillon.items.map((item) => (
                  <tr key={item.airtableId} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2">
                      {item.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.photo} alt="" className="h-9 w-9 rounded-md object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-md bg-slate-100" />
                      )}
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {item.name}
                      {item.creteilSoleil && (
                        <span className="ml-1.5 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          Créteil Soleil
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{item.skuFournisseur || '—'}</td>
                    {brouillon.type === 'popup' ? (
                      <td className="px-4 py-2 text-right text-slate-500">{item.dejaCommande ? item.dejaCommande : '—'}</td>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-right text-slate-700">{item.stockActuel}</td>
                        <td className="px-4 py-2 text-right">
                          {item.enAttente ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{item.enAttente}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-700">{item.seuilCible}</td>
                      </>
                    )}
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={item.qty}
                        onChange={(e) => setQtyOverrides((prev) => ({ ...prev, [item.airtableId]: parseInt(e.target.value, 10) || 0 }))}
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-slate-400"
                      />
                    </td>
                  </tr>
                ))}
                {brouillon.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                      Aucun pin pour ce fournisseur
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-right text-sm text-slate-500">Total : {totalBrouillon} pièces</p>
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
                  return (
                    <tr key={c.id} className="border-b border-slate-50 last:border-0">
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
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => imprimerCommande(c)}
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

      {manuelOuvert && (
        <ManualOrderModal
          pinsInitiaux={pinsInitiaux}
          onClose={() => setManuelOuvert(false)}
          onCree={(ref) => {
            setManuelOuvert(false);
            setToast(`Bon de commande ${ref} créé`);
          }}
        />
      )}

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
