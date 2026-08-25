import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { NouveauPopUpForm } from './NouveauPopUpForm';
import { PopUpCard } from './PopUpCard';

/** Réplique l'écran admin Pop-up de l'app Pimp It (app/(app)/admin/popups.tsx) — gestion complète
 * (créer/renommer/supprimer, dates, coordonnées GPS, créneaux prédéfinis, effectifs attribués,
 * horaires d'ouverture), mêmes tables réelles (pop_ups, regles_horaires_ouverture,
 * profil_pop_ups), pas un miroir hub_*. */
export default async function PopUpsPage() {
  const supabase = await creerClientSupabaseServeur();
  const [{ data: popUps }, { data: profils }, { data: affectations }] = await Promise.all([
    supabase.from('pop_ups').select('*').eq('actif', true).order('nom'),
    supabase.from('profiles').select('id, nom_complet, email, role').eq('actif', true),
    supabase.from('profil_pop_ups').select('profile_id, pop_up_id'),
  ]);

  const popUpsParProfil = new Map<string, Set<string>>();
  for (const a of affectations ?? []) {
    const ensemble = popUpsParProfil.get(a.profile_id) ?? new Set<string>();
    ensemble.add(a.pop_up_id);
    popUpsParProfil.set(a.profile_id, ensemble);
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Pop-up</h1>
      <p className="mb-6 text-sm text-slate-400">Géré depuis Supabase — même données que l&apos;app Pimp It.</p>

      {(popUps ?? []).map((popUp) => (
        <PopUpCard key={popUp.id} popUp={popUp} profils={profils ?? []} popUpsParProfil={popUpsParProfil} />
      ))}

      <NouveauPopUpForm />
    </div>
  );
}
