'use client';

import type { HubPin } from './types';

const SEUIL_PCT = 0.3;

/** Réplique openAlertes() de l'ancien admin : pin's dont le stock est sous 30% du seuil cible,
 * triés du plus critique au moins critique, avec un code couleur à 3 paliers. */
export function AlertesModal({ pins, onClose }: { pins: HubPin[]; onClose: () => void }) {
  const alertes = pins
    .filter((p) => {
      const stock = Math.round(p.stock ?? 0);
      const cible = p.seuil_cible ?? 0;
      return cible > 0 && stock < cible * SEUIL_PCT;
    })
    .map((p) => {
      const stock = Math.round(p.stock ?? 0);
      const cible = p.seuil_cible ?? 0;
      const pct = Math.round((stock / cible) * 100);
      return { pin: p, stock, cible, pct };
    })
    .sort((a, b) => a.pct - b.pct);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-16" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[75vh] w-[560px] max-w-[90vw] flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-base font-bold text-slate-900">🔔 Alertes stock</p>
            <p className="mt-0.5 text-xs text-slate-400">Pin&apos;s en dessous de 30% du seuil cible</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto px-6 py-4">
          {alertes.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">✅ Tous les stocks sont au-dessus de 30% du seuil cible</p>
          ) : (
            alertes.map(({ pin, stock, cible, pct }) => {
              const couleur = pct <= 10 ? 'text-red-600' : pct <= 20 ? 'text-amber-500' : 'text-amber-600';
              return (
                <div key={pin.airtable_id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  {pin.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pin.image_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-md bg-slate-200" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{pin.name ?? '—'}</p>
                    <p className="mt-0.5 text-xs text-slate-400">Seuil cible : {cible}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-lg font-bold ${couleur}`}>{stock}</p>
                    <p className={`text-[11px] font-semibold ${couleur}`}>{pct}% du seuil</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
