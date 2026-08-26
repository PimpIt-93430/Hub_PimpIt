'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface LienNav {
  href: string;
  label: string;
  icone: string;
}

export interface SectionNav {
  titre: string | null;
  couleur: 'indigo' | 'emerald' | 'sky';
  liens: LienNav[];
}

/** Chip d'icône coloré par section (indigo pour Pin's/Tableau de bord, émeraude pour "Vérifiés" —
 * les écrans repris à l'identique de l'ancien site, bleu ciel pour "Application") — couleurs en
 * classes littérales (pas de template string) pour que Tailwind les détecte à la compilation. */
function classesChip(couleur: SectionNav['couleur'], actif: boolean): string {
  if (actif) return 'bg-white/20 text-white';
  if (couleur === 'emerald') return 'bg-emerald-100 text-emerald-600';
  if (couleur === 'sky') return 'bg-sky-100 text-sky-600';
  return 'bg-indigo-100 text-indigo-600';
}

export function SidebarNav({ sections }: { sections: SectionNav[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
      {sections.map((section, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {section.titre && (
            <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{section.titre}</p>
          )}
          {section.liens.map((lien) => {
            const actif = lien.href === '/' ? pathname === '/' : pathname.startsWith(lien.href);
            return (
              <Link
                key={lien.href}
                href={lien.href}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold transition-colors ${
                  actif ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${classesChip(section.couleur, actif)}`}>
                  {lien.icone}
                </span>
                {lien.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
