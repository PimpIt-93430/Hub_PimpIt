'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { creerClientSupabaseNavigateur } from '@/lib/supabase/browser';

export interface Guide {
  id: string;
  titre: string;
  nom_fichier: string;
  chemin_stockage: string;
  created_at: string;
}

// Upload direct navigateur → bucket "guides" (pas de Server Action : limite de 1 Mo sur le body,
// cf. lib/uploadPhotoPin.ts), puis insertion de la ligne `guides` avec la session de l'admin.

export function InformationsClient({ guides }: { guides: Guide[] }) {
  const router = useRouter();
  const [titre, setTitre] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const choisirFichier = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!fichier) return;
    setErreur(null);
    if (fichier.type !== 'application/pdf') {
      setErreur('Seuls les fichiers PDF sont acceptés.');
      return;
    }
    const titreFinal = titre.trim() || fichier.name.replace(/\.pdf$/i, '');
    setEnCours(true);
    try {
      const supabase = creerClientSupabaseNavigateur();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Non connecté.');
      const nomPropre = fichier.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
      const chemin = `${Date.now()}-${nomPropre}`;
      const { error: erreurUpload } = await supabase.storage
        .from('guides')
        .upload(chemin, fichier, { contentType: 'application/pdf' });
      if (erreurUpload) throw new Error(erreurUpload.message);
      const { error } = await supabase.from('guides').insert({
        titre: titreFinal,
        nom_fichier: fichier.name,
        chemin_stockage: chemin,
        uploaded_by: user.id,
      });
      if (error) {
        await supabase.storage.from('guides').remove([chemin]);
        throw new Error(error.message);
      }
      setTitre('');
      router.refresh();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'envoi.");
    } finally {
      setEnCours(false);
    }
  };

  const ouvrir = async (g: Guide) => {
    setErreur(null);
    // Fenêtre ouverte tout de suite (sinon bloquée comme pop-up après l'await), URL renseignée ensuite.
    const fenetre = window.open('', '_blank');
    const supabase = creerClientSupabaseNavigateur();
    const { data, error } = await supabase.storage.from('guides').createSignedUrl(g.chemin_stockage, 300);
    if (error || !data) {
      fenetre?.close();
      setErreur(error?.message ?? "Impossible d'ouvrir ce guide.");
      return;
    }
    if (fenetre) fenetre.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  };

  const supprimer = async (g: Guide) => {
    setErreur(null);
    setEnCours(true);
    try {
      const supabase = creerClientSupabaseNavigateur();
      const { data, error } = await supabase.from('guides').delete().eq('id', g.id).select('id');
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
      await supabase.storage.from('guides').remove([g.chemin_stockage]);
      setASupprimer(null);
      router.refresh();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Échec de la suppression.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-600">Ajouter un guide</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Titre (ex. Fonctionnement de la caisse)"
            className="min-w-[260px] flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
          />
          <label
            className={`cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${
              enCours ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {enCours ? 'Envoi…' : '+ Choisir un PDF'}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={choisirFichier}
              disabled={enCours}
              className="hidden"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-400">Sans titre, le nom du fichier est utilisé.</p>
      </div>

      {erreur && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{erreur}</p>}

      {guides.length === 0 && <p className="text-sm text-slate-400">Aucun guide pour l&apos;instant.</p>}
      {guides.map((g) => (
        <div
          key={g.id}
          className="mb-2 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <button onClick={() => ouvrir(g)} className="flex-1 text-left">
            <p className="text-sm font-semibold text-slate-800 hover:underline">{g.titre}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {g.nom_fichier} · ajouté le {new Date(g.created_at).toLocaleDateString('fr-FR')}
            </p>
          </button>
          {aSupprimer === g.id ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Supprimer ?</span>
              <button
                onClick={() => supprimer(g)}
                disabled={enCours}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Oui
              </button>
              <button
                onClick={() => setASupprimer(null)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
              >
                Non
              </button>
            </div>
          ) : (
            <button
              onClick={() => setASupprimer(g.id)}
              className="text-xs font-semibold text-red-500 hover:text-red-700"
            >
              Supprimer
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
