'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type PeriodePreset = 'jour' | 'semaine' | 'mois' | 'debut_mois' | 'personnalise';

const PRESETS: { value: PeriodePreset; label: string }[] = [
  { value: 'jour', label: "Aujourd'hui" },
  { value: 'semaine', label: 'Cette semaine' },
  { value: 'debut_mois', label: 'Début de mois' },
  { value: 'mois', label: 'Ce mois' },
  { value: 'personnalise', label: 'Personnalisé' },
];

/** Sélecteur de période — porte la période choisie dans l'URL (?periode=...&debut=...&fin=...)
 * plutôt que dans un state client, pour que ventes/page.tsx (Server Component) refasse la requête
 * Supabase avec la bonne fenêtre de dates à chaque changement (cf. AGENTS.md du Hub, pattern
 * Server Component + navigation plutôt que fetch côté client). */
export function PeriodeSelecteur({ periode, debut, fin }: { periode: PeriodePreset; debut: string; fin: string }) {
  const router = useRouter();
  const [debutPerso, setDebutPerso] = useState(debut);
  const [finPerso, setFinPerso] = useState(fin);

  function allerA(p: PeriodePreset, d: string = debutPerso, f: string = finPerso) {
    const params = new URLSearchParams({ periode: p });
    if (p === 'personnalise') {
      params.set('debut', d);
      params.set('fin', f);
    }
    router.push(`/ventes?${params.toString()}`);
  }

  return (
    <div className="mb-4">
      <div className="mb-3 inline-flex gap-1 rounded-xl bg-slate-100 p-1">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => allerA(p.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              periode === p.value ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {periode === 'personnalise' && (
        <div className="mb-2 flex items-center gap-2">
          <input
            type="date"
            value={debutPerso}
            onChange={(e) => {
              setDebutPerso(e.target.value);
              allerA('personnalise', e.target.value, finPerso);
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={finPerso}
            onChange={(e) => {
              setFinPerso(e.target.value);
              allerA('personnalise', debutPerso, e.target.value);
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
