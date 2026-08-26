'use client';

// Port de App PIMP IT/src/components/calendrier/VueParPopUps.tsx — une ligne par pop-up, une
// colonne par jour, chaque cellule empile un chip par personne présente ce jour-là (nom + horaire).

import { dateEnISO, estAujourdhui, formatCreneauShift, nomJourCourt, numeroJour } from './dateUtils';
import type { PlanningShift, PopUp, Profile } from './types';

export function VuePopUps({
  jours,
  popUps,
  shifts,
  profilParId,
  onPressCellule,
}: {
  jours: Date[];
  popUps: PopUp[];
  shifts: PlanningShift[];
  profilParId: Map<string, Profile>;
  onPressCellule: (popUp: PopUp, dateIso: string, shiftsCellule: PlanningShift[]) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
      <div className="flex shrink-0 border-b border-slate-100">
        <div className="w-[180px] shrink-0 border-r border-slate-100" />
        <div className="flex flex-1">
          {jours.map((j) => (
            <div
              key={dateEnISO(j)}
              className={`flex flex-1 flex-col items-center justify-center border-l border-slate-100 py-2 first:border-l-0 ${estAujourdhui(j) ? 'bg-indigo-50' : ''}`}
            >
              <span className="text-[10px] font-semibold text-slate-400">{nomJourCourt(j)}</span>
              <span className="text-sm font-bold text-slate-900">{numeroJour(j)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div className="w-[180px] shrink-0 border-r border-slate-100">
          {popUps.map((p) => (
            <div key={p.id} className="flex min-h-[68px] items-center gap-2 border-b border-slate-100 px-3.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.couleur }} />
              <span className="truncate text-[13px] font-semibold text-slate-800">{p.nom}</span>
            </div>
          ))}
          {popUps.length === 0 && <p className="px-3.5 py-5 text-sm text-slate-400">Aucun pop-up.</p>}
        </div>

        <div className="flex-1">
          {popUps.map((popUp) => (
            <div key={popUp.id} className="flex">
              {jours.map((j) => {
                const dateIso = dateEnISO(j);
                const shiftsCellule = shifts.filter((s) => s.pop_up_id === popUp.id && s.date === dateIso);
                return (
                  <button
                    key={dateIso}
                    type="button"
                    onClick={() => onPressCellule(popUp, dateIso, shiftsCellule)}
                    className="flex min-h-[68px] flex-1 flex-col gap-1 border-b border-l border-slate-100 p-1.5 text-left hover:bg-slate-50"
                  >
                    {shiftsCellule.map((s) => {
                      const employe = profilParId.get(s.profile_id);
                      return (
                        <span
                          key={s.id}
                          className="rounded-lg px-2 py-1 text-white"
                          style={{ backgroundColor: employe?.couleur ?? '#6366F1' }}
                        >
                          <span className="block truncate text-[11px] font-bold">{employe?.nom_complet || employe?.email || '—'}</span>
                          <span className="block text-[10px] text-white/90">{formatCreneauShift(s)}</span>
                        </span>
                      );
                    })}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
