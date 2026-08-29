import { creerClientSupabaseNavigateur } from './supabase/browser';

/** Upload direct navigateur → Supabase Storage (bucket "stock-pins"), sans passer par un Server
 * Action — cf. discussion 2026-08-29 : une photo en base64 dans le body d'un Server Action dépasse
 * vite la limite par défaut (1 Mo), et même après l'avoir relevée (10 Mo) le gros payload base64
 * fait planter la sérialisation RSC ("Maximum array nesting exceeded") : les Server Actions ne
 * sont pas faites pour transporter des fichiers, l'upload direct au bucket est le chemin normal
 * côté Supabase. Écriture déjà ouverte à tout compte connecté (migration 0025, App PIMP IT). */
export async function uploaderPhotoPinNavigateur(fichier: File): Promise<string> {
  const supabase = creerClientSupabaseNavigateur();
  const extension = fichier.type === 'image/png' ? 'png' : 'jpg';
  const nomFichier = `catalogue-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage
    .from('stock-pins')
    .upload(nomFichier, fichier, { contentType: fichier.type || 'image/jpeg' });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('stock-pins').getPublicUrl(nomFichier);
  return data.publicUrl;
}
