'use client';

import { Modal } from './Modal';
import type { StockPin } from './stockLib';

export function ModalePhotoPin({ pin, onFermer }: { pin: StockPin; onFermer: () => void }) {
  return (
    <Modal onClose={onFermer}>
      <h2 className="mb-3 text-base font-bold text-slate-900">{pin.nom}</h2>
      {pin.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pin.photo_url} alt={pin.nom} className="h-56 w-full rounded-2xl bg-slate-100 object-contain" />
      ) : (
        <p className="text-sm text-slate-400">Pas de photo pour ce pin.</p>
      )}
    </Modal>
  );
}
