import { cookies } from 'next/headers';

import { COOKIE_APERCU_PROFIL, determinerRoleHub } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { ApercuProfilSelect } from './ApercuProfilSelect';
import { InviterBouton } from './InviterBouton';

const LIBELLE_ROLE: Record<string, string> = {
  admin: 'Administrateur',
  employe: 'Employé',
};

/** Petite page "Profil" pour le Hub — infos de l'admin connecté, invitation, et "Se connecter en
 * tant que" (cf. ApercuProfilSelect) pour prévisualiser le Hub avec les yeux d'un autre profil,
 * notamment pour vérifier les espaces réservés aux rôles non-admin (ex. /local) sans avoir besoin
 * de leurs identifiants.
 *
 * Passe par `determinerRoleHub()` (déjà appelé par layout.tsx, donc gratuit ici grâce au `cache()`
 * de React, cf. lib/roles.ts) au lieu de refaire son propre `getUser()` + requête `profiles` — audit
 * latence du 2026-09-02. `profilReel` (jamais celui prévisualisé) : cette page montre bien l'admin
 * réellement connecté, pas le profil qu'il est en train de prévisualiser. */
export default async function ProfilPage() {
  const { profilReel } = await determinerRoleHub();
  const supabase = await creerClientSupabaseServeur();

  const [{ data: autresProfils }, jar] = await Promise.all([
    profilReel
      ? supabase
          .from('profiles')
          .select('id, nom_complet, email, type_contrat')
          .eq('actif', true)
          .neq('id', profilReel.id)
          .order('nom_complet')
      : Promise.resolve({ data: null }),
    cookies(),
  ]);

  const email = profilReel?.email ?? '';
  const initiale = (profilReel?.nom_complet || email || '?').slice(0, 1).toUpperCase();
  const couleur = profilReel?.couleur ?? '#6366F1';
  const apercuActuelId = jar.get(COOKIE_APERCU_PROFIL)?.value ?? null;

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Profil</h1>

      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: couleur }}
      >
        <span className="text-xl font-bold text-white">{initiale}</span>
      </div>

      <p className="text-lg font-bold text-slate-900">{profilReel?.nom_complet || 'Sans nom'}</p>
      <p className="mb-2 text-sm text-slate-500">{email}</p>
      {profilReel?.role && (
        <span className="mb-6 inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
          {LIBELLE_ROLE[profilReel.role] ?? profilReel.role}
        </span>
      )}

      <div className="mt-6">
        <InviterBouton />
      </div>

      <ApercuProfilSelect profils={autresProfils ?? []} apercuActuelId={apercuActuelId} />
    </div>
  );
}
