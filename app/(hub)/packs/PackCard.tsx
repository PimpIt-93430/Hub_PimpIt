import type { HubPack, PinOption } from './types';

/** Une carte de la grille (`.pack-card` / `renderPacks` dans l'ancien admin) : photo, nom, SKU,
 * badge gris "N pin(s)", "!" rouge si problème, puis la liste des pin's inclus sous forme de
 * puces avec vignette + "×N" si quantité > 1. Cliquer la carte (hors bouton) ouvre l'édition. */
export function PackCard({ pack, pinsParId, onClick }: { pack: HubPack; pinsParId: Map<string, PinOption>; onClick: () => void }) {
  const qtesPins = pack.qtes_pins ?? {};
  const puces = Object.entries(qtesPins);
  const total = pack.pins_inclus_count ?? puces.reduce((s, [, q]) => s + q, 0);
  const probleme = Boolean(pack.probleme);

  return (
    <button
      onClick={onClick}
      className={`flex flex-col rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md ${
        probleme ? 'border-red-300 hover:border-red-400' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {pack.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pack.photo_url}
          alt=""
          className="mb-3 h-40 w-full rounded-lg bg-slate-50 object-contain"
        />
      ) : (
        <div className="mb-3 flex h-40 w-full items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-300">
          Pas de photo
        </div>
      )}

      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{pack.nom_du_pack || '—'}</p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{pack.sku_shopify || '—'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {probleme && (
            <span className="text-lg font-black leading-none text-red-500" title="Problème signalé">
              !
            </span>
          )}
          <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {total} pin{total > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {puces.length === 0 ? (
          <span className="text-xs text-slate-300">Cliquer pour ajouter des pins</span>
        ) : (
          puces.map(([id, qty]) => {
            const pin = pinsParId.get(id);
            return (
              <span
                key={id}
                className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600"
              >
                {pin?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pin.image_url} alt="" className="h-5 w-5 rounded-sm object-cover" />
                ) : null}
                {pin?.name ?? id}
                {qty > 1 && <b className="font-semibold text-slate-800">×{qty}</b>}
              </span>
            );
          })
        )}
      </div>
    </button>
  );
}
