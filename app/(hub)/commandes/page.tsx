import { chargerCommandes, chargerPinsPourCommandes } from './donnees';
import { CommandesClient } from './CommandesClient';

/** Rebuild interactif complet de l'écran "Commandes fournisseurs" de l'ancien admin
 * (Shopify Pimp IT/admin/public/index.html, id="screen-orders") : brouillon auto-suggéré par
 * fournisseur (stock normal / pop-up), commande manuelle, historique avec réception/édition/
 * suppression. Écrit uniquement Supabase désormais (voir app/(hub)/commandes/actions.ts). */
export default async function CommandesPage() {
  const [commandes, pins] = await Promise.all([chargerCommandes(), chargerPinsPourCommandes()]);

  return <CommandesClient commandesInitiales={commandes} pinsInitiaux={pins} />;
}
