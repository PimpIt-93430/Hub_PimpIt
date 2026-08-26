import { PinsScreen } from '@/app/(hub)/stock/pins/PinsScreen';
import { normaliserStockPin, type StockPin } from '@/app/(hub)/stock/pins/stockLib';
import { determinerRoleHub } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

/** Accueil de l'espace Local : directement la vue Local de Pin's (préparation des commandes
 * envoyées aux pop-up, pesée du stock général, catalogue) — cf. LocalView.tsx, déjà construite
 * pour l'écran Stock du Hub et déjà branchée sur les bonnes RLS (profil_pop_ups × est_local).
 * Pas de sélecteur de pop-up ni de menu de catégories ici : c'est la seule chose que cette
 * personne a besoin de voir, contrairement à l'admin qui choisit parmi tout. */
export default async function LocalPage() {
  const { role } = await determinerRoleHub();

  if (role === 'inconnu') {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-base font-semibold text-slate-800">Pas encore d&apos;accès configuré</p>
        <p className="mt-2 text-sm text-slate-400">
          Ton compte est bien connecté, mais aucun espace ne t&apos;est encore attribué. Demande à un
          administrateur de te rattacher au bon pop-up.
        </p>
      </div>
    );
  }

  const supabase = await creerClientSupabaseServeur();
  const [{ data: popUps }, { data: stockPins }, { data: popUpPinBoites }] = await Promise.all([
    supabase.from('pop_ups').select('id, nom, couleur, est_local').eq('actif', true).order('nom'),
    supabase.from('stock_pins').select('*').eq('actif', true).order('nom'),
    supabase.from('pop_up_pin_boites').select('id, pop_up_id, pin_id, case_position, a_commander, updated_at'),
  ]);

  const tousPopUps = popUps ?? [];
  const popUpLocal = tousPopUps.find((p) => p.est_local);

  if (!popUpLocal) {
    return (
      <p className="text-sm text-slate-400">
        Aucun pop-up « Local » configuré pour l&apos;instant — préviens un administrateur.
      </p>
    );
  }

  return (
    <PinsScreen
      popUps={tousPopUps}
      popUpId={popUpLocal.id}
      initialPins={((stockPins ?? []) as StockPin[]).map(normaliserStockPin)}
      initialBoites={popUpPinBoites ?? []}
      masquerRetour
    />
  );
}
