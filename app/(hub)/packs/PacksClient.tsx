'use client';

import { useMemo, useState } from 'react';

import { EditPackModal } from './EditPackModal';
import { NouveauPackModal } from './NouveauPackModal';
import { PackCard } from './PackCard';
import type { HubPack, PinOption } from './types';

/** Réplique l'écran "Packs de pin's" de l'ancien admin (id="screen-packs") : recherche, grille de
 * cartes (`renderPacks`), création et édition. Les boutons "📷 Sync photos" et "↕ Sync Shopify →
 * Airtable" de l'ancien site ne sont pas repris — c'étaient des outils de réconciliation
 * Airtable↔Shopify, sans objet maintenant que Supabase est la base d'origine. */
export function PacksClient({ packsInitiaux, pins }: { packsInitiaux: HubPack[]; pins: PinOption[] }) {
  const [recherche, setRecherche] = useState('');
  const [packEnEdition, setPackEnEdition] = useState<HubPack | null>(null);
  const [messageCreation, setMessageCreation] = useState<string | null>(null);

  const pinsParId = useMemo(() => new Map(pins.map((p) => [p.airtable_id, p])), [pins]);

  const packsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return packsInitiaux;
    return packsInitiaux.filter(
      (p) => (p.nom_du_pack ?? '').toLowerCase().includes(q) || (p.sku_shopify ?? '').toLowerCase().includes(q),
    );
  }, [packsInitiaux, recherche]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Packs de pin&apos;s</h1>
        <p className="mt-1 text-sm text-slate-400">Packs · gérés depuis Supabase, créés automatiquement sur Shopify</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un pack..."
          className="w-60 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
        />
        <div className="ml-auto">
          <NouveauPackModal
            pins={pins}
            onCree={(url) => setMessageCreation(url ? `Pack créé — produit Shopify créé.` : 'Pack créé.')}
          />
        </div>
      </div>

      {messageCreation && <p className="mb-4 text-sm text-emerald-700">{messageCreation}</p>}

      {packsFiltres.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
          {packsInitiaux.length === 0 ? 'Aucun pack.' : 'Aucun résultat.'}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
          {packsFiltres.map((p) => (
            <PackCard key={p.airtable_id} pack={p} pinsParId={pinsParId} onClick={() => setPackEnEdition(p)} />
          ))}
        </div>
      )}

      {packEnEdition && <EditPackModal pack={packEnEdition} pins={pins} onClose={() => setPackEnEdition(null)} />}
    </div>
  );
}
