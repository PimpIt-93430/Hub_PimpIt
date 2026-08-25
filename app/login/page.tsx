'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { creerClientSupabaseNavigateur } from '@/lib/supabase/browser';

/** Connexion avec un compte Supabase existant (même projet que l'app Pimp It) — l'accès aux
 * pages du Hub reste conditionné à role='admin' côté RLS, pas de vérification supplémentaire
 * ici : quelqu'un de non-admin peut se connecter mais ne verra que ce que la RLS lui laisse voir. */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const seConnecter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    const supabase = creerClientSupabaseNavigateur();
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    router.replace('/');
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={seConnecter} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-slate-900">Pimp It Hub</h1>
        <p className="mb-6 text-sm text-slate-500">Connecte-toi avec ton compte Pimp It.</p>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mb-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600"
        />

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Mot de passe</label>
        <input
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          required
          className="mb-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600"
        />

        {erreur && <p className="mb-4 text-sm text-red-600">{erreur}</p>}

        <button
          type="submit"
          disabled={enCours}
          className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
