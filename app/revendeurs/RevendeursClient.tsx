'use client';

import { useMemo, useState } from 'react';

import { envoyerCommandeRevendeur, type PinRevendeur } from './actions';

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' €';
}

type EtapeModal = 'fermee' | 'recap' | 'envoi' | 'faite';

/** Reconstruction à l'identique de l'ancienne page Railway "Espace Revendeur"
 * (gestionpimpit-production.up.railway.app/b2b.html, cf. retour utilisateur du 2026-09-17) — même
 * mise en page (CSS quasi verbatim ci-dessous), mêmes règles (quantité min/pas de 10), même
 * catalogue et mêmes prix (vue catalogue_revendeurs, cf. actions.ts). Différence : la commande
 * s'enregistre dans commandes_revendeurs/lignes (visible dans le Hub, cf.
 * app/(hub)/commandes-revendeurs) au lieu de partir vers l'ancien backend Railway. */
export function RevendeursClient({ pins }: { pins: PinRevendeur[] }) {
  const [recherche, setRecherche] = useState('');
  const [entreprise, setEntreprise] = useState('');
  const [entrepriseErreur, setEntrepriseErreur] = useState(false);
  const [panier, setPanier] = useState<Record<string, number>>({});
  const [modal, setModal] = useState<EtapeModal>('fermee');
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);

  const q = recherche.trim().toLowerCase();
  const pinsFiltres = useMemo(
    () =>
      q
        ? pins.filter((p) => (p.name ?? '').toLowerCase().includes(q) || (p.skuFournisseur ?? '').toLowerCase().includes(q))
        : pins,
    [pins, q],
  );

  const lignesPanier = useMemo(
    () =>
      Object.entries(panier)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ pin: pins.find((p) => p.id === id), qty }))
        .filter((l): l is { pin: PinRevendeur; qty: number } => !!l.pin),
    [panier, pins],
  );
  const totalArticles = lignesPanier.reduce((s, l) => s + l.qty, 0);
  const totalHT = lignesPanier.reduce((s, l) => s + l.qty * l.pin.priceHT, 0);

  function ajuster(id: string, delta: number) {
    setPanier((p) => {
      const cur = p[id] ?? 0;
      let next = cur + delta;
      if (next < 0) next = 0;
      if (next > 0 && next < 10) next = delta > 0 ? 10 : 0;
      return { ...p, [id]: next };
    });
  }

  function definirQte(id: string, valeur: string) {
    let n = parseInt(valeur, 10) || 0;
    if (n < 0) n = 0;
    if (n > 0 && n < 10) n = 10;
    setPanier((p) => ({ ...p, [id]: n }));
  }

  function ouvrirRecap() {
    if (!entreprise.trim()) {
      setEntrepriseErreur(true);
      return;
    }
    setEntrepriseErreur(false);
    setErreurEnvoi(null);
    setModal('recap');
  }

  async function envoyer() {
    setModal('envoi');
    try {
      await envoyerCommandeRevendeur(
        entreprise,
        lignesPanier.map((l) => ({ id: l.pin.id, name: l.pin.name ?? '', skuFournisseur: l.pin.skuFournisseur, priceHT: l.pin.priceHT, qty: l.qty })),
      );
      setModal('faite');
    } catch (e) {
      setErreurEnvoi(e instanceof Error ? e.message : 'Erreur inconnue');
      setModal('recap');
    }
  }

  function nouvelleCommande() {
    setModal('fermee');
    setPanier({});
  }

  return (
    <>
      <style>{`
        * , *::before, *::after { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #f8fafc; margin: 0; }
        .rv-header { background: #1e1b4b; color: white; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; }
        .rv-header-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
        .rv-header-logo em { color: #a78bfa; font-style: normal; }
        .rv-company-bar { background: white; border-bottom: 1px solid #e5e7eb; padding: 16px 24px; }
        .rv-company-bar-inner { max-width: 1400px; margin: 0 auto; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .rv-company-label { font-size: 13px; font-weight: 700; color: #374151; white-space: nowrap; }
        .rv-company-input { flex: 1; min-width: 220px; max-width: 380px; padding: 10px 14px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 15px; color: #111; }
        .rv-company-input:focus { outline: none; border-color: #7c3aed; }
        .rv-company-input.rv-error { border-color: #ef4444; }
        .rv-company-desc { font-size: 12px; color: #9ca3af; }
        .rv-filter-bar { background: white; border-bottom: 1px solid #e5e7eb; padding: 12px 24px; position: sticky; top: 0; z-index: 50; }
        .rv-filter-bar-inner { max-width: 1400px; margin: 0 auto; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .rv-search-input { flex: 1; min-width: 200px; max-width: 340px; padding: 9px 14px; border: 1.5px solid #e5e7eb; border-radius: 9px; font-size: 14px; }
        .rv-search-input:focus { outline: none; border-color: #7c3aed; }
        .rv-count-lbl { font-size: 12px; color: #9ca3af; margin-left: auto; }
        .rv-btn-reset { padding: 7px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 13px; cursor: pointer; background: white; color: #6b7280; }
        .rv-btn-reset:hover { border-color: #7c3aed; color: #7c3aed; }
        .rv-grid { max-width: 1400px; margin: 0 auto; padding: 20px 24px 140px; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
        .rv-grid-empty { grid-column: 1 / -1; text-align: center; padding: 80px 0; color: #9ca3af; font-size: 15px; }
        .rv-card { background: white; border-radius: 12px; overflow: hidden; border: 2px solid #e5e7eb; transition: box-shadow .15s, border-color .15s; }
        .rv-card.rv-selected { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,.12); }
        .rv-card:hover { box-shadow: 0 4px 14px rgba(0,0,0,.07); }
        .rv-card-img { aspect-ratio: 1; background: #f9f5ff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .rv-card-img img { width: 100%; height: 100%; object-fit: contain; }
        .rv-card-body { padding: 10px 12px 12px; }
        .rv-card-name { font-size: 13px; font-weight: 600; color: #111; line-height: 1.3; margin-bottom: 5px; }
        .rv-card-sku { font-size: 11px; color: #9ca3af; margin-bottom: 8px; display: block; }
        .rv-card-price { font-size: 16px; font-weight: 800; color: #111; margin-bottom: 10px; }
        .rv-card-price small { font-size: 11px; font-weight: 500; color: #9ca3af; }
        .rv-qty-row { display: flex; align-items: center; gap: 6px; }
        .rv-qty-btn { width: 30px; height: 30px; border-radius: 7px; border: 1.5px solid #e5e7eb; background: white; cursor: pointer; font-size: 17px; line-height: 1; display: flex; align-items: center; justify-content: center; color: #374151; flex-shrink: 0; }
        .rv-qty-btn:hover { border-color: #7c3aed; color: #7c3aed; background: #faf5ff; }
        .rv-qty-input { width: 50px; height: 30px; border: 1.5px solid #e5e7eb; border-radius: 7px; text-align: center; font-size: 14px; font-weight: 700; color: #111; }
        .rv-qty-input:focus { outline: none; border-color: #7c3aed; }
        .rv-qty-hint { font-size: 10px; color: #9ca3af; margin-left: auto; }
        .rv-bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #1e1b4b; color: white; padding: 14px 24px; z-index: 100; box-shadow: 0 -4px 20px rgba(0,0,0,.2); }
        .rv-bottom-bar-inner { max-width: 1400px; margin: 0 auto; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
        .rv-stat-val { font-size: 20px; font-weight: 800; line-height: 1; }
        .rv-stat-lbl { font-size: 11px; color: #a5b4fc; margin-top: 2px; }
        .rv-sep { width: 1px; height: 30px; background: rgba(255,255,255,.15); }
        .rv-spacer { flex: 1; }
        .rv-btn-generate { padding: 13px 28px; background: #7c3aed; color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .rv-btn-generate:hover:not(:disabled) { background: #6d28d9; }
        .rv-btn-generate:disabled { background: #374151; cursor: default; color: #6b7280; }
        .rv-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 200; padding: 24px; display: flex; align-items: center; justify-content: center; }
        .rv-modal { background: white; border-radius: 20px; max-width: 480px; width: 100%; padding: 36px 32px; text-align: center; }
        .rv-modal-icon { font-size: 48px; line-height: 1; margin-bottom: 12px; }
        .rv-modal-title { font-size: 22px; font-weight: 800; color: #111; margin-bottom: 6px; }
        .rv-modal-sub { font-size: 14px; color: #6b7280; margin-bottom: 24px; }
        .rv-summary-box { background: #f3eeff; border-radius: 14px; padding: 22px; margin-bottom: 24px; }
        .rv-summary-total-lbl { font-size: 12px; font-weight: 700; color: #7c3aed; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
        .rv-summary-total-amt { font-size: 48px; font-weight: 800; color: #7c3aed; line-height: 1; margin-bottom: 8px; }
        .rv-summary-detail { font-size: 13px; color: #9ca3af; }
        .rv-btn-send { width: 100%; padding: 16px; background: #7c3aed; color: white; border: none; border-radius: 13px; font-size: 16px; font-weight: 700; cursor: pointer; margin-bottom: 10px; }
        .rv-btn-send:hover:not(:disabled) { background: #6d28d9; }
        .rv-btn-send:disabled { background: #a78bfa; cursor: default; }
        .rv-btn-cancel { width: 100%; padding: 13px; background: white; color: #6b7280; border: 1.5px solid #e5e7eb; border-radius: 13px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .rv-error-msg { font-size: 13px; color: #ef4444; margin-bottom: 16px; }
        .rv-success-icon { font-size: 56px; margin-bottom: 12px; }
        .rv-success-title { font-size: 22px; font-weight: 800; color: #111; margin-bottom: 8px; }
        .rv-success-msg { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 28px; }
        .rv-btn-done { width: 100%; padding: 14px; background: #1e1b4b; color: white; border: none; border-radius: 13px; font-size: 15px; font-weight: 700; cursor: pointer; }
        @media (max-width: 640px) {
          .rv-header { padding: 14px 16px; }
          .rv-company-bar, .rv-filter-bar { padding: 12px 16px; }
          .rv-grid { padding: 12px 12px 130px; grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .rv-bottom-bar { padding: 12px 16px; }
          .rv-stat-val { font-size: 16px; }
          .rv-sep { display: none; }
        }
      `}</style>

      <header className="rv-header">
        <div className="rv-header-logo">
          Pimp<em>-It</em>
        </div>
      </header>

      <div className="rv-company-bar">
        <div className="rv-company-bar-inner">
          <span className="rv-company-label">Votre entreprise :</span>
          <input
            value={entreprise}
            onChange={(e) => setEntreprise(e.target.value)}
            className={`rv-company-input${entrepriseErreur ? ' rv-error' : ''}`}
            placeholder="Ex : Boutique XYZ"
            autoComplete="organization"
          />
          <span className="rv-company-desc">Requis pour générer les bons de commande</span>
        </div>
      </div>

      <div className="rv-filter-bar">
        <div className="rv-filter-bar-inner">
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="rv-search-input"
            placeholder="Rechercher un pin's…"
          />
          <span className="rv-count-lbl">
            {pinsFiltres.length} produit{pinsFiltres.length > 1 ? 's' : ''}
          </span>
          <button
            className="rv-btn-reset"
            onClick={() => {
              if (Object.values(panier).some((v) => v > 0) && !window.confirm('Remettre toutes les quantités à zéro ?')) return;
              setPanier({});
            }}
          >
            Vider
          </button>
        </div>
      </div>

      <main className="rv-grid">
        {pinsFiltres.length === 0 ? (
          <div className="rv-grid-empty">Aucun produit trouvé</div>
        ) : (
          pinsFiltres.map((p) => {
            const qty = panier[p.id] ?? 0;
            return (
              <div key={p.id} className={`rv-card${qty > 0 ? ' rv-selected' : ''}`}>
                <div className="rv-card-img">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt={p.name ?? ''} loading="lazy" />
                  ) : (
                    <div style={{ fontSize: 40 }}>📌</div>
                  )}
                </div>
                <div className="rv-card-body">
                  <div className="rv-card-name">{p.name}</div>
                  {p.skuFournisseur && <span className="rv-card-sku">{p.skuFournisseur}</span>}
                  <div className="rv-card-price">
                    {fmt(p.priceHT)} <small>HT / unité</small>
                  </div>
                  <div className="rv-qty-row">
                    <button className="rv-qty-btn" onClick={() => ajuster(p.id, -10)}>
                      −
                    </button>
                    <input
                      className="rv-qty-input"
                      type="number"
                      min={0}
                      step={10}
                      value={qty}
                      onChange={(e) => definirQte(p.id, e.target.value)}
                    />
                    <button className="rv-qty-btn" onClick={() => ajuster(p.id, 10)}>
                      +
                    </button>
                    <span className="rv-qty-hint">min 10</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      <div className="rv-bottom-bar">
        <div className="rv-bottom-bar-inner">
          <div>
            <div className="rv-stat-val">{totalArticles.toLocaleString('fr')}</div>
            <div className="rv-stat-lbl">articles</div>
          </div>
          <div className="rv-sep" />
          <div>
            <div className="rv-stat-val">{lignesPanier.length}</div>
            <div className="rv-stat-lbl">références</div>
          </div>
          <div className="rv-sep" />
          <div>
            <div className="rv-stat-val">{fmt(totalHT)}</div>
            <div className="rv-stat-lbl">total HT</div>
          </div>
          <div className="rv-spacer" />
          <button className="rv-btn-generate" disabled={lignesPanier.length === 0} onClick={ouvrirRecap}>
            Générer ma commande →
          </button>
        </div>
      </div>

      {modal !== 'fermee' && (
        <div
          className="rv-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && modal !== 'envoi') setModal('fermee');
          }}
        >
          <div className="rv-modal">
            {modal === 'faite' ? (
              <>
                <div className="rv-success-icon">✅</div>
                <div className="rv-success-title">Commande envoyée !</div>
                <div className="rv-success-msg">
                  Votre commande a bien été transmise à Pimp-It.
                  <br />
                  Nous vous recontacterons très vite.
                </div>
                <button className="rv-btn-done" onClick={nouvelleCommande}>
                  Nouvelle commande
                </button>
              </>
            ) : (
              <>
                <div className="rv-modal-icon">🛒</div>
                <div className="rv-modal-title">Récapitulatif</div>
                <div className="rv-modal-sub">{entreprise}</div>
                <div className="rv-summary-box">
                  <div className="rv-summary-total-lbl">Total de votre commande</div>
                  <div className="rv-summary-total-amt">{fmt(totalHT)}</div>
                  <div className="rv-summary-detail">
                    {totalArticles.toLocaleString('fr')} articles · {lignesPanier.length} références
                  </div>
                </div>
                {erreurEnvoi && <div className="rv-error-msg">Erreur : {erreurEnvoi}</div>}
                <button className="rv-btn-send" disabled={modal === 'envoi'} onClick={envoyer}>
                  {modal === 'envoi' ? 'Envoi en cours…' : 'Envoyer ma commande à Pimp-It →'}
                </button>
                <button className="rv-btn-cancel" onClick={() => setModal('fermee')}>
                  Modifier ma sélection
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
