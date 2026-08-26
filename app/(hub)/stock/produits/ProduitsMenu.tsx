'use client';

/** Menu "Produits" : Chaussures/Coques/Sacs (fonctionnels) + Goodies (à venir) — cf. ProduitsMenu.tsx. */
export function ProduitsMenu({ onOuvrir }: { onOuvrir: (categorie: 'chaussures' | 'coques' | 'sac' | 'goodies') => void }) {
  const tuiles: { valeur: 'chaussures' | 'coques' | 'sac' | 'goodies'; label: string; couleur: string }[] = [
    { valeur: 'chaussures', label: 'Chaussures', couleur: '#F59E0B' },
    { valeur: 'coques', label: 'Coques', couleur: '#6366F1' },
    { valeur: 'sac', label: 'Sac', couleur: '#EC4899' },
    { valeur: 'goodies', label: 'Goodies', couleur: '#10B981' },
  ];

  return (
    <div className="flex flex-wrap gap-4">
      {tuiles.map((t) => (
        <button
          key={t.valeur}
          onClick={() => onOuvrir(t.valeur)}
          style={{ backgroundColor: t.couleur }}
          className="flex w-[160px] flex-col items-center gap-2 rounded-2xl p-5 shadow-md"
        >
          <span className="text-base font-bold text-white">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
