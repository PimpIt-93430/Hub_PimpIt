'use client';

import { useRouter } from 'next/navigation';

import { creerClientSupabaseNavigateur } from '@/lib/supabase/browser';

/** `variant="dark"` : posé sur un fond sombre (sidebar du Hub) — hover translucide plutôt que le
 * rose clair habituel, qui serait illisible dessus. `variant="light"` (défaut) : posé sur du blanc
 * (header de l'espace Local). */
export function DeconnexionBouton({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const router = useRouter();

  const seDeconnecter = async () => {
    const supabase = creerClientSupabaseNavigateur();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <button
      onClick={seDeconnecter}
      className={
        variant === 'dark'
          ? 'rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-400 hover:bg-red-500/10'
          : 'rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-500 hover:bg-red-50'
      }
    >
      Se déconnecter
    </button>
  );
}
