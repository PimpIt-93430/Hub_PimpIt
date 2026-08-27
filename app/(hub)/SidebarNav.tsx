'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export interface LienNav {
  href: string;
  label: string;
  icone: string;
}

export type CouleurNav = 'indigo' | 'sky' | 'violet' | 'emerald' | 'amber';

export interface CategorieNav {
  titre: string;
  icone: string;
  couleur: CouleurNav;
  liens: LienNav[];
}

// Chips translucides (fond couleur/15, texte couleur clair) : les teintes pastel utilisées sur
// fond blanc (bg-indigo-100) deviennent illisibles sur la sidebar sombre — classes littérales pour
// que Tailwind les détecte à la compilation.
const CLASSES_CHIP: Record<CouleurNav, string> = {
  indigo: 'bg-indigo-500/15 text-indigo-300',
  sky: 'bg-sky-500/15 text-sky-300',
  violet: 'bg-violet-500/15 text-violet-300',
  emerald: 'bg-emerald-500/15 text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-300',
};

function EstActif(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** Menu en catégories repliables sur sidebar sombre (cf. référence visuelle 2026-08-27 — fintech
 * dashboard : sidebar foncée, icônes en chips colorées translucides, page active en pastille pleine
 * couleur accent). La catégorie contenant la page active s'ouvre automatiquement ; les autres
 * restent repliées. "Tableau de bord" reste épinglé au-dessus, hors catégorie. */
export function SidebarNav({ accueil, categories }: { accueil: LienNav; categories: CategorieNav[] }) {
  const pathname = usePathname();
  const [ouvertes, setOuvertes] = useState<Set<number>>(
    () => new Set(categories.map((c, i) => (c.liens.some((l) => EstActif(l.href, pathname)) ? i : -1)).filter((i) => i >= 0)),
  );

  const basculer = (i: number) => {
    setOuvertes((s) => {
      const suivant = new Set(s);
      if (suivant.has(i)) suivant.delete(i);
      else suivant.add(i);
      return suivant;
    });
  };

  const accueilActif = EstActif(accueil.href, pathname);

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
      <Link
        href={accueil.href}
        className={`mb-3 flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold transition-colors ${
          accueilActif ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/40' : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${accueilActif ? 'bg-white/20 text-white' : 'bg-indigo-500/15 text-indigo-300'}`}>
          {accueil.icone}
        </span>
        {accueil.label}
      </Link>

      {categories.map((cat, i) => {
        const ouverte = ouvertes.has(i);
        return (
          <div key={cat.titre} className="flex flex-col">
            <button
              onClick={() => basculer(i)}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${CLASSES_CHIP[cat.couleur]}`}>
                {cat.icone}
              </span>
              <span className="flex-1">{cat.titre}</span>
              <span className={`text-[10px] text-slate-500 transition-transform ${ouverte ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {ouverte && (
              <div className="ml-3.5 flex flex-col gap-0.5 border-l border-white/10 py-1 pl-3.5">
                {cat.liens.map((lien) => {
                  const actif = EstActif(lien.href, pathname);
                  return (
                    <Link
                      key={lien.href}
                      href={lien.href}
                      className={`rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        actif ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {lien.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
