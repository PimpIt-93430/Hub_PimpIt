import { exigerAdmin } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { chargerTrousCaisse } from './actions';
import { TrouClient } from './TrouClient';

/** Trous de caisse (cf. retour utilisateur : "un coin qu'on appellera trou, que pour les admin") —
 * réservée aux admins (cf. exigerAdmin), comme Export comptable et Équipe : montants nominatifs par
 * pop-up/date, jamais pour les rôles "local" ou "comptable". */
export default async function TrouPage() {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();

  const [{ data: popUps }, trous] = await Promise.all([
    supabase.from('pop_ups').select('id, nom').order('nom', { ascending: true }),
    chargerTrousCaisse(),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Trou</h1>
      <p className="mb-6 text-sm text-slate-400">
        Trous de caisse par pop-up et par jour — personnel présent et fermeture pré-remplis depuis le planning.
      </p>

      <TrouClient popUps={popUps ?? []} trousInitiaux={trous} />
    </div>
  );
}
