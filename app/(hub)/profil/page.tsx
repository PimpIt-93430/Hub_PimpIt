import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { InviterBouton } from './InviterBouton';

const LIBELLE_ROLE: Record<string, string> = {
  admin: 'Administrateur',
  employe: 'Employé',
};

/** Petite page "Profil" pour le Hub — contexte admin uniquement (pas de bascule multi-profils, pas
 * de calendrier d'école ni de SumUp : ce sont des concepts propres à l'app mobile, cf. App PIMP
 * IT/app/(app)/profil.tsx pris comme référence visuelle pour l'avatar/nom/email/rôle). */
export default async function ProfilPage() {
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profil } = user
    ? await supabase.from('profiles').select('nom_complet, email, role, couleur').eq('id', user.id).maybeSingle()
    : { data: null };

  const email = profil?.email ?? user?.email ?? '';
  const initiale = (profil?.nom_complet || email || '?').slice(0, 1).toUpperCase();
  const couleur = profil?.couleur ?? '#6366F1';

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Profil</h1>

      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: couleur }}
      >
        <span className="text-xl font-bold text-white">{initiale}</span>
      </div>

      <p className="text-lg font-bold text-slate-900">{profil?.nom_complet || 'Sans nom'}</p>
      <p className="mb-2 text-sm text-slate-500">{email}</p>
      {profil?.role && (
        <span className="mb-6 inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
          {LIBELLE_ROLE[profil.role] ?? profil.role}
        </span>
      )}

      <div className="mt-6">
        <InviterBouton />
      </div>
    </div>
  );
}
