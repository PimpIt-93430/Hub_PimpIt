import { chargerCommandesRevendeurs } from './actions';
import { CommandesRevendeursClient } from './CommandesRevendeursClient';

export default async function CommandesRevendeursPage() {
  const commandes = await chargerCommandesRevendeurs();
  return <CommandesRevendeursClient commandesInitiales={commandes} />;
}
