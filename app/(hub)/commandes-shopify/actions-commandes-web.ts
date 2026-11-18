'use server';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import type { LigneCommande } from '@/lib/shopify';

export interface CommandeWebAEnvoyer {
  shopifyOrderId: number;
  nom: string;
  client: string | null;
  moyenExpedition: string | null;
  source: 'laposte' | 'sendcloud' | 'sendcloud_manuel';
  transporteur: string | null;
  lignes: LigneCommande[];
}

/** Envoi d'une seule commande (étiquette ouverte depuis le détail d'une commande). */
export async function envoyerCommandeWebUnique(
  commande: { id: number; nom: string; client: string | null; moyenExpedition: string | null; lignes: LigneCommande[] },
  source: 'laposte' | 'sendcloud',
  transporteur: string | null,
): Promise<{ envoyees: number }> {
  return envoyerCommandesWeb([
    {
      shopifyOrderId: commande.id,
      nom: commande.nom,
      client: commande.client,
      moyenExpedition: commande.moyenExpedition,
      source,
      transporteur,
      lignes: commande.lignes,
    },
  ]);
}

/** Envoie les commandes d'un lot imprimé vers l'appli Pimp It (table commandes_web, cf. migration
 * 0137) dans l'ordre du PDF, celles à faire sur Sendcloud à la main en dernier. Une commande déjà
 * envoyée n'est jamais dupliquée ni remise "à faire" (réimpression, double clic). */
export async function envoyerCommandesWeb(commandes: CommandeWebAEnvoyer[]): Promise<{ envoyees: number }> {
  if (commandes.length === 0) return { envoyees: 0 };
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const lotAt = new Date().toISOString();

  const lignes = commandes.map((c, i) => ({
    shopify_order_id: c.shopifyOrderId,
    nom: c.nom,
    client: c.client,
    moyen_expedition: c.moyenExpedition,
    source: c.source,
    transporteur: c.transporteur,
    lignes: c.lignes.map((l) => ({ titre: l.titre, variante: l.variante, sku: l.sku, quantite: l.quantite })),
    lot_at: lotAt,
    ordre: c.source === 'sendcloud_manuel' ? 100000 + i : i,
    envoyee_par: user?.id ?? null,
  }));

  const { data, error } = await supabase
    .from('commandes_web')
    .upsert(lignes, { onConflict: 'shopify_order_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(error.message);
  return { envoyees: data?.length ?? 0 };
}
