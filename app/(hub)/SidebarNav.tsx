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

const CLASSES_CHIP_ACTIF: Record<CouleurNav, string> = {
  indigo: 'bg-indigo-100 text-indigo-600',
  sky: 'bg-sky-100 text-sky-600',
  violet: 'bg-violet-100 text-violet-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
};

function EstActif(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** Menu en catégories repliables (Gestion des produits / Logistique / Planning & RH / Finance,
 * cf. discussion 2026-08-27) plutôt qu'un mur de liens à plat. La catégorie contenant la page
 * active s'ouvre automatiquement au chargement ; les autres restent repliées. "Tableau de bord"
 * reste épinglé au-dessus, hors catégorie (c'est l'accueil, pas un pôle d'activité). */
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
          accueilActif ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${accueilActif ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
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
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${CLASSES_CHIP_ACTIF[cat.couleur]}`}>
                {cat.icone}
              </span>
              <span className="flex-1">{cat.titre}</span>
              <span className={`text-[10px] text-slate-400 transition-transform ${ouverte ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {ouverte && (
              <div className="ml-3.5 flex flex-col gap-0.5 border-l border-slate-100 py-1 pl-3.5">
                {cat.liens.map((lien) => {
                  const actif = EstActif(lien.href, pathname);
                  return (
                    <Link
                      key={lien.href}
                      href={lien.href}
                      className={`rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        actif ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
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
