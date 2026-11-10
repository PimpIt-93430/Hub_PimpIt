import { exigerAdmin } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { InformationsClient, type Guide } from './InformationsClient';

/** Informations (guides globaux : procédures pop-up, fonctionnement caisse…) — retour utilisateur
 * du 2026-11-10 : "j'ai pas sur le hub, rajoute sur le hub". Mêmes table `guides` et bucket privé
 * "guides" que l'appli (Profil > "Afficher les informations", migration 0074) : un guide ajouté
 * ici apparaît immédiatement dans l'appli pour tout le monde. Écriture réservée aux admins (RLS). */
export default async function InformationsPage() {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('guides')
    .select('id, titre, nom_fichier, chemin_stockage, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Informations</h1>
      <p className="mb-6 text-sm text-slate-400">
        Les guides visibles par toute l&apos;équipe dans l&apos;appli (Profil → Afficher les informations).
      </p>
      <InformationsClient guides={(data ?? []) as Guide[]} />
    </div>
  );
}
