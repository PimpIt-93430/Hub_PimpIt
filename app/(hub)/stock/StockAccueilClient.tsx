'use client';

import { useState } from 'react';

import { ConsommablesScreen } from './consommables/ConsommablesScreen';
import { PinsScreen } from './pins/PinsScreen';
import type { PopUpPinBoite, StockPin } from './pins/stockLib';
import { ProduitsScreen } from './produits/ProduitsScreen';
import type { ChaussureMappingSumup, ChaussureStock, CoqueMappingSumup, CoqueStock, SacMappingSumup, SacStock } from './produits/produitsLib';

interface PopUp {
  id: string;
  nom: string;
  couleur: string | null;
  est_local: boolean;
}

type Categorie = 'menu' | 'pins' | 'produits' | 'consommables';

function TuileCategorie({ label, sousTitre, couleur, onPress }: { label: string; sousTitre: string; couleur: string; onPress: () => void }) {
  return (
    <button onClick={onPress} style={{ backgroundColor: couleur }} className="w-[220px] rounded-2xl p-5 text-left shadow-md">
      <p className="text-lg font-bold text-white">{label}</p>
      <p className="mt-1 text-xs text-white/80">{sousTitre}</p>
    </button>
  );
}

/** Point d'entrée de Stock — trois catégories (Pin's / Produits / Consommables), cf.
 * StockAccueil.tsx de l'app. Le choix du pop-up se fait une seule fois ici en arrivant et reste le
 * même en changeant de catégorie. Le Hub étant admin-only, toujours tous les pop-ups (pas de
 * restriction "attribué") — cf. commentaire de tête dans page.tsx. */
export function StockAccueilClient({
  popUps,
  stockPins,
  popUpPinBoites,
  chaussuresStock,
  coquesStock,
  sacsStock,
  mappingChaussures,
  mappingCoques,
  mappingSacs,
}: {
  popUps: PopUp[];
  stockPins: StockPin[];
  popUpPinBoites: PopUpPinBoite[];
  chaussuresStock: ChaussureStock[];
  coquesStock: CoqueStock[];
  sacsStock: SacStock[];
  mappingChaussures: ChaussureMappingSumup[];
  mappingCoques: CoqueMappingSumup[];
  mappingSacs: SacMappingSumup[];
}) {
  const [categorie, setCategorie] = useState<Categorie>('menu');
  const [popUpId, setPopUpId] = useState<string | undefined>(undefined);

  const popUpActif = popUpId ?? popUps[0]?.id;
  const popUpNom = popUps.find((p) => p.id === popUpActif)?.nom ?? '—';

  if (popUps.length === 0) {
    return <p className="text-sm text-slate-400">Aucun pop-up actif pour l&apos;instant.</p>;
  }

  if (categorie === 'pins') {
    return <PinsScreen popUps={popUps} popUpId={popUpActif} onRetour={() => setCategorie('menu')} initialPins={stockPins} initialBoites={popUpPinBoites} />;
  }
  if (categorie === 'produits' && popUpActif) {
    return (
      <ProduitsScreen
        popUpId={popUpActif}
        popUpNom={popUpNom}
        chaussuresStock={chaussuresStock}
        coquesStock={coquesStock}
        sacsStock={sacsStock}
        mappingChaussures={mappingChaussures}
        mappingCoques={mappingCoques}
        mappingSacs={mappingSacs}
        onRetour={() => setCategorie('menu')}
      />
    );
  }
  if (categorie === 'consommables' && popUpActif) {
    return <ConsommablesScreen popUpId={popUpActif} popUpNom={popUpNom} onRetour={() => setCategorie('menu')} />;
  }

  return (
    <div>
      <div className="mb-6 max-w-xs">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Pop-up</label>
        <select
          value={popUpActif}
          onChange={(e) => setPopUpId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
        >
          {popUps.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-4">
        <TuileCategorie label="Pin's" sousTitre="Catalogue, boîtes, commandes" couleur="#6366F1" onPress={() => setCategorie('pins')} />
        <TuileCategorie label="Produits" sousTitre="Chaussures, coques, sac, goodies" couleur="#F59E0B" onPress={() => setCategorie('produits')} />
        <TuileCategorie label="Consommables" sousTitre="Suivi du stock" couleur="#10B981" onPress={() => setCategorie('consommables')} />
      </div>
    </div>
  );
}
