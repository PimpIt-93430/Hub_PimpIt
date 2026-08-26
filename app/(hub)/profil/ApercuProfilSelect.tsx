'use client';

import { useTransition } from 'react';

import { definirApercuProfil } from './actions';

interface ProfilOption {
  id: string;
  nom_complet: string | null;
  email: string;
  type_contrat: string;
}

const LIBELLE_TYPE: Record<string, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

/** "Se connecter en tant que" — même principe que la bascule de l'app mobile (useVueAdminStore) :
 * pose un cookie de prévisualisation (cf. actions.ts/lib/roles.ts), sans changer de session
 * Supabase. Utile pour vérifier ce qu'un rôle non-admin voit réellement dans le Hub (ex. l'espace
 * /local) sans avoir ses identifiants. */
export function ApercuProfilSelect({
  profils,
  apercuActuelId,
}: {
  profils: ProfilOption[];
  apercuActuelId: string | null;
}) {
  const [enCours, demarrer] = useTransition();

  return (
    <div className="mt-6">
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        Se connecter en tant que
      </label>
      <select
        value={apercuActuelId ?? 'moi'}
        onChange={(e) => {
          const v = e.target.value;
          demarrer(() => {
            definirApercuProfil(v === 'moi' ? null : v);
          });
        }}
        disabled={enCours}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none disabled:opacity-50"
      >
        <option value="moi">Moi (mon compte admin)</option>
        {profils.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nom_complet || p.email} · {LIBELLE_TYPE[p.type_contrat] ?? p.type_contrat}
          </option>
        ))}
      </select>
      {apercuActuelId && (
        <p className="mt-2 text-xs text-slate-400">
          Tu vois le Hub comme cette personne le verrait — choisis &laquo;&nbsp;Moi&nbsp;&raquo; pour revenir.
        </p>
      )}
    </div>
  );
}
