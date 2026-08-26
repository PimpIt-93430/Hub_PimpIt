'use client';

/** Panneau modal générique (équivalent web de FeuilleModale côté app) — fond semi-transparent,
 * carte blanche centrée, scroll interne si le contenu dépasse. */
export function Modal({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`max-h-[85vh] w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} overflow-y-auto rounded-2xl bg-white p-6 shadow-xl`}
      >
        {children}
        <button onClick={onClose} className="mt-4 w-full py-2 text-center text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          Fermer
        </button>
      </div>
    </div>
  );
}
