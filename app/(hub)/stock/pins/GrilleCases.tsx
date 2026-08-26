'use client';

import { statutBoiteCommande, type CaseGrille, type StatutBoiteCommande } from './stockLib';

const COLONNES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const LIGNES = [1, 2, 3];

const COULEURS_STATUT: Record<StatutBoiteCommande, string> = {
  vide: '#E2E8F0',
  ok: '#34D399',
  a_commander: '#EF4444',
};

export function GrilleCases({ grille, onPressCase }: { grille: CaseGrille[]; onPressCase: (casePosition: string) => void }) {
  const parPosition = new Map(grille.map((c) => [c.casePosition, c]));

  return (
    <div className="flex flex-col gap-2">
      {LIGNES.map((ligne) => (
        <div key={ligne} className="flex gap-2">
          {COLONNES.map((colonne) => {
            const position = `${colonne}${ligne}`;
            const c = parPosition.get(position);
            const contenus = c?.contenus ?? [];
            const statut = statutBoiteCommande(contenus);

            return (
              <button
                key={position}
                onClick={() => onPressCase(position)}
                className={`flex aspect-square flex-1 flex-col justify-between overflow-hidden rounded-xl border p-1.5 text-left shadow-sm ${
                  statut === 'a_commander'
                    ? 'border-red-200 bg-red-50'
                    : contenus.length > 0
                      ? 'border-slate-100 bg-white'
                      : 'border-dashed border-slate-200 bg-slate-50'
                }`}
              >
                <span className="text-[10px] font-semibold text-slate-400">{position}</span>
                {contenus.length > 0 ? (
                  <>
                    <span className="line-clamp-2 text-[11px] font-semibold text-slate-800">
                      {contenus.length === 1 ? contenus[0].pin.nom : `${contenus.length} pins`}
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-400">{contenus.length} pin(s)</span>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COULEURS_STATUT[statut] }} />
                    </div>
                  </>
                ) : (
                  <span className="self-center text-lg text-slate-300">+</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
