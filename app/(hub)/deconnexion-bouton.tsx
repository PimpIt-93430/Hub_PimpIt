'use client';

import { useRouter } from 'next/navigation';

import { creerClientSupabaseNavigateur } from '@/lib/supabase/browser';

export function DeconnexionBouton() {
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
      className="rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-500 hover:bg-red-50"
    >
      Se déconnecter
    </button>
  );
}
