import { chargerCatalogueRevendeurs } from './actions';
import { RevendeursClient } from './RevendeursClient';

export const dynamic = 'force-dynamic';

/** Page publique "Espace Revendeur" (cf. actions.ts) — reconstruction de l'ancienne page Railway
 * gestionpimpit-production.up.railway.app/b2b.html, retour utilisateur du 2026-09-17. Chargement
 * du catalogue côté serveur (évite un aller-retour supplémentaire au premier affichage). */
export default async function RevendeursPage() {
  const pins = await chargerCatalogueRevendeurs();
  return <RevendeursClient pins={pins} />;
}
