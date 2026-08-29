import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { exigerAdmin } from '@/lib/roles';
import { EquipeClient } from './EquipeClient';
import type { PopUp, Profile, ProfilPopUp } from './types';

/** Réplique l'écran admin Équipe de l'app Pimp It (EquipeEcranBase.tsx + admin/equipe.web.tsx) :
 * master-detail complet (recherche, nouvel employé, 6 onglets dont Droits) sur les mêmes tables
 * réelles (profiles, pop_ups, profil_pop_ups...), via la session de l'admin connecté (RLS
 * existante, pas de service role). Seules les listes globales (profils actifs, pop-ups,
 * affectations) sont chargées ici ; le détail par personne (informations_rh, horaires, congés,
 * documents, droits) est chargé côté client au clic, cf. EquipeClient/FicheDetailMembre.
 * Réservée aux admins (cf. lib/roles.ts) : infos RH/salaires, pas pour le rôle "local". */
export default async function EquipePage() {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();

  const [{ data: profils }, { data: popUps }, { data: affectations }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, nom_complet, email, role, type_contrat, couleur, heures_max_semaine, actif')
      .eq('actif', true)
      .order('nom_complet', { ascending: true }),
    supabase.from('pop_ups').select('*').eq('actif', true).order('nom'),
    supabase.from('profil_pop_ups').select('profile_id, pop_up_id'),
  ]);

  return (
    <div className="flex h-full flex-col">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Équipe</h1>
      <p className="mb-4 text-sm text-slate-400">
        {(profils ?? []).length} personnes — depuis Supabase — même compte que l&apos;app Pimp It.
      </p>

      <EquipeClient
        profils={(profils ?? []) as Profile[]}
        popUps={(popUps ?? []) as PopUp[]}
        affectations={(affectations ?? []) as ProfilPopUp[]}
      />
    </div>
  );
}
