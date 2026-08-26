'use client';

import { useState } from 'react';

import { ChaussuresScreen } from './ChaussuresScreen';
import { CoquesScreen } from './CoquesScreen';
import { ProduitsMenu } from './ProduitsMenu';
import type { ChaussureMappingSumup, ChaussureStock, CoqueMappingSumup, CoqueStock, SacMappingSumup, SacStock } from './produitsLib';
import { SacsScreen } from './SacsScreen';

type SousCategorie = 'menu' | 'chaussures' | 'coques' | 'sac' | 'goodies';

export function ProduitsScreen({
  popUpId,
  popUpNom,
  chaussuresStock,
  coquesStock,
  sacsStock,
  mappingChaussures,
  mappingCoques,
  mappingSacs,
  onRetour,
}: {
  popUpId: string;
  popUpNom: string;
  chaussuresStock: ChaussureStock[];
  coquesStock: CoqueStock[];
  sacsStock: SacStock[];
  mappingChaussures: ChaussureMappingSumup[];
  mappingCoques: CoqueMappingSumup[];
  mappingSacs: SacMappingSumup[];
  onRetour: () => void;
}) {
  const [sousCategorie, setSousCategorie] = useState<SousCategorie>('menu');

  if (sousCategorie === 'menu') {
    return (
      <div>
        <BoutonRetour onRetour={onRetour} titre="Produits" />
        <ProduitsMenu onOuvrir={setSousCategorie} />
      </div>
    );
  }

  return (
    <div>
      <BoutonRetour onRetour={() => setSousCategorie('menu')} titre="Produits" />
      {sousCategorie === 'chaussures' && (
        <ChaussuresScreen popUpId={popUpId} popUpNom={popUpNom} stock={chaussuresStock} mapping={mappingChaussures} />
      )}
      {sousCategorie === 'coques' && <CoquesScreen popUpId={popUpId} popUpNom={popUpNom} stock={coquesStock} mapping={mappingCoques} />}
      {sousCategorie === 'sac' && <SacsScreen popUpId={popUpId} popUpNom={popUpNom} stock={sacsStock} mapping={mappingSacs} />}
      {sousCategorie === 'goodies' && (
        <div className="flex flex-col items-center justify-center px-8 py-16">
          <p className="text-center text-base text-slate-400">Bientôt disponible — on y travaille prochainement.</p>
        </div>
      )}
    </div>
  );
}

function BoutonRetour({ onRetour, titre }: { onRetour: () => void; titre: string }) {
  return (
    <button onClick={onRetour} className="mb-4 flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
      ← {titre}
    </button>
  );
}
