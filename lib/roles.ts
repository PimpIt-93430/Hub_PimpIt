import { cookies } from 'next/headers';

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

export const COOKIE_APERCU_PROFIL = 'apercu_profil_id';

/** Détermine ce que la personne connectée a le droit de voir dans le Hub — et, si c'est un admin
 * qui a choisi de "se connecter en tant que" quelqu'un d'autre (cookie posé depuis Profil, cf.
 * app/(hub)/profil/actions.ts), calcule le rôle comme si c'était CETTE personne, exactement comme
 * la bascule "vue admin" déjà présente côté app mobile (useVueAdminStore). Toutes les requêtes
 * Supabase continuent de tourner sous la vraie session admin (is_admin() reste vrai), donc rien ne
 * casse pendant la prévisualisation — seul le rôle Hub calculé change.
 *
 *  - 'admin' : role = 'admin', accès complet au Hub.
 *  - 'local' : pas admin, mais attribuée (profil_pop_ups) au pop-up marqué est_local — l'équipe du
 *    local (préparation des commandes envoyées aux pop-up, pesée du stock général, catalogue).
 *  - 'inconnu' : connectée mais pas encore de rôle Hub défini (aucun accès, page d'attente).
 * Pas de rôle "manager pop-up" / "vendeur pop-up" pour l'instant — à ajouter au même endroit
 * quand ces espaces existeront (cf. discussion 2026-08-26 : on construit un rôle réel à la fois).
 */
export async function determinerRoleHub(): Promise<{
  role: RoleHub;
  profil: ProfilConnecte | null;
  enApercu: boolean;
  profilReel: ProfilConnecte | null;
}> {
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { role: 'inconnu', profil: null, enApercu: false, profilReel: null };

  const { data: profilReel } = await supabase
    .from('profiles')
    .select('id, nom_complet, email, role, type_contrat, couleur')
    .eq('id', user.id)
    .maybeSingle();
  if (!profilReel) return { role: 'inconnu', profil: null, enApercu: false, profilReel: null };

  let profilEffectif: ProfilConnecte = profilReel;
  let enApercu = false;

  if (profilReel.role === 'admin') {
    const jar = await cookies();
    const apercuId = jar.get(COOKIE_APERCU_PROFIL)?.value;
    if (apercuId && apercuId !== profilReel.id) {
      const { data: profilApercu } = await supabase
        .from('profiles')
        .select('id, nom_complet, email, role, type_contrat, couleur')
        .eq('id', apercuId)
        .maybeSingle();
      if (profilApercu) {
        profilEffectif = profilApercu;
        enApercu = true;
      }
    }
  }

  if (profilEffectif.role === 'admin') return { role: 'admin', profil: profilEffectif, enApercu, profilReel };

  // En deux requêtes simples plutôt qu'un filtre sur ressource imbriquée (pop_ups.est_local) —
  // plus facile à vérifier/déboguer, et pop_ups est une toute petite table (4 lignes).
  const { data: popUpLocal } = await supabase.from('pop_ups').select('id').eq('est_local', true).maybeSingle();
  if (popUpLocal) {
    const { data: attribution } = await supabase
      .from('profil_pop_ups')
      .select('pop_up_id')
      .eq('profile_id', profilEffectif.id)
      .eq('pop_up_id', popUpLocal.id)
      .maybeSingle();
    if (attribution) return { role: 'local', profil: profilEffectif, enApercu, profilReel };
  }

  return { role: 'inconnu', profil: profilEffectif, enApercu, profilReel };
}
