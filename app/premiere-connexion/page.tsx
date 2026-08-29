'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { creerClientSupabaseNavigateur } from '@/lib/supabase/browser';

/** Même flux que l'écran "Première connexion" de l'appli mobile (app/(auth)/premiere-connexion.tsx)
 * — un admin crée le profil avec un email mais aucun mot de passe, la personne choisit elle-même
 * son mot de passe ici avec cet email, puis est connectée directement. Réutilise la même Edge
 * Function `definir-mot-de-passe-initial` (même projet Supabase que l'appli) : elle refuse si le
 * compte s'est déjà connecté au moins une fois. */
export default function PremiereConnexionPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur(null);

    if (motDePasse.length < 6) {
      setErreur('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setEnCours(true);
    const supabase = creerClientSupabaseNavigateur();
    const emailPropre = email.trim();

    const { data, error } = await supabase.functions.invoke('definir-mot-de-passe-initial', {
      body: { email: emailPropre, password: motDePasse },
    });
    if (error) {
      const corps = await (error as { context?: Response }).context?.json().catch(() => null);
      setErreur(corps?.error ?? error.message);
      setEnCours(false);
      return;
    }
    if (data?.error) {
      setErreur(data.error);
      setEnCours(false);
      return;
    }

    const { error: erreurConnexion } = await supabase.auth.signInWithPassword({
      email: emailPropre,
      password: motDePasse,
    });
    setEnCours(false);
    if (erreurConnexion) {
      setErreur(erreurConnexion.message);
      return;
    }

    router.replace('/');
    router.refresh();
  };

  const pretAValider = !!email.trim() && !!motDePasse && !!confirmation;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={valider} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-slate-900">Première connexion</h1>
        <p className="mb-6 text-sm text-slate-500">
          Utilise l&apos;email que ton admin a renseigné pour toi, et choisis ton mot de passe.
        </p>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mb-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600"
        />

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Choisis un mot de passe
        </label>
        <input
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          required
          className="mb-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600"
        />

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Confirme ton mot de passe
        </label>
        <input
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          required
          className="mb-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600"
        />

        {erreur && <p className="mb-4 text-sm text-red-600">{erreur}</p>}

        <button
          type="submit"
          disabled={enCours || !pretAValider}
          className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {enCours ? 'Validation…' : 'Valider et me connecter'}
        </button>

        <button
          type="button"
          onClick={() => router.push('/login')}
          className="mt-4 w-full text-center text-sm font-semibold text-indigo-600"
        >
          Retour à la connexion
        </button>
      </form>
    </div>
  );
}
