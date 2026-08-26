'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { COOKIE_APERCU_PROFIL } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

/** Pose ou retire le cookie de prévisualisation ("Se connecter en tant que", cf. lib/roles.ts) —
 * réservé aux vrais admins, vérifié ici même si l'appel ne peut de toute façon venir que de la
 * page Profil du Hub (elle-même déjà admin-only). Redirige vers "/" ensuite : le rôle recalculé
 * (cf. determinerRoleHub) renvoie automatiquement vers le bon espace (Hub ou /local). */
export async function definirApercuProfil(profileId: string | null): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté');

  const { data: profilReel } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profilReel?.role !== 'admin') throw new Error('Réservé aux administrateurs');

  const jar = await cookies();
  if (profileId) {
    jar.set(COOKIE_APERCU_PROFIL, profileId, { httpOnly: true, sameSite: 'lax', path: '/' });
  } else {
    jar.delete(COOKIE_APERCU_PROFIL);
  }

  redirect('/');
}
