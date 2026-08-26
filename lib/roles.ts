import { creerClientSupabaseServeur } from './supabase/server';

export type RoleHub = 'admin' | 'local' | 'inconnu';

export interface ProfilConnecte {
  id: string;
  nom_complet: string | null;
  email: string;
  role: string;
  type_contrat: string;
  couleur: string | null;
}

/** Détermine ce que la personne connectée a le droit de voir dans le Hub. Ne fait aucune
 * vérification "en plus" — s'appuie entièrement sur les mêmes tables/RLS que l'app mobile
 * (profiles.role, profil_pop_ups × pop_ups.est_local), pour ne jamais diverger de ce que la
 * personne peut déjà faire ailleurs :
 *  - 'admin' : role = 'admin', accès complet au Hub.
 *  - 'local' : pas admin, mais attribuée (profil_pop_ups) au pop-up marqué est_local — l'équipe du
 *    local (préparation des commandes envoyées aux pop-up, pesée du stock général, catalogue).
 *  - 'inconnu' : connectée mais pas encore de rôle Hub défini (aucun accès, page d'attente).
 * Pas de rôle "manager pop-up" / "vendeur pop-up" pour l'instant — à ajouter au même endroit
 * quand ces espaces existeront (cf. discussion 2026-08-26 : on construit un rôle réel à la fois).
 */
export async function determinerRoleHub(): Promise<{ role: RoleHub; profil: ProfilConnecte | null }> {
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { role: 'inconnu', profil: null };

  const { data: profil } = await supabase
    .from('profiles')
    .select('id, nom_complet, email, role, type_contrat, couleur')
    .eq('id', user.id)
    .maybeSingle();
  if (!profil) return { role: 'inconnu', profil: null };

  if (profil.role === 'admin') return { role: 'admin', profil };

  const { data: attributionLocal } = await supabase
    .from('profil_pop_ups')
    .select('pop_up_id, pop_ups!inner(est_local)')
    .eq('profile_id', user.id)
    .eq('pop_ups.est_local', true)
    .maybeSingle();
  if (attributionLocal) return { role: 'local', profil };

  return { role: 'inconnu', profil };
}
