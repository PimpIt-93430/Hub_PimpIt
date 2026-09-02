// Cache Supabase de l'écran "Commandes Shopify" (cf. migration 0089_hub_commandes_shopify_cache) —
// remplace l'appel Shopify complet (200 commandes) qui se refaisait à chaque visite, sans cache
// (gros contributeur de latence, audit du 2026-09-02). Nouveau fonctionnement, retour utilisateur
// explicite : seules les commandes PAS ENCORE livrées restent en cache ("une fois que c'est livré
// tu la sors du cache, pas besoin de garder en mémoire") ; à chaque visite on ne redemande à
// Shopify que ce qui a changé depuis la dernière synchro, avec une minute de marge de sécurité pour
// ne rien manquer ("reviens à 14h59 pour être sûr de pas en louper").
import {
  listerCommandesMiseAJourDepuis,
  listerCommandesRecentes,
  type CommandeShopify,
  type CommandeShopifyAvecMaj,
  type StatutExpeditionCommande,
} from './shopify';
import type { ExpeditionSendcloud } from './expeditions-sendcloud';
import { creerClientSupabaseServeur } from './supabase/server';

const MARGE_SECURITE_MS = 60_000;

interface LigneBrute {
  shopify_id: number;
  nom: string;
  cree_le: string;
  client: string;
  email: string | null;
  statut_paiement: string | null;
  statut_expedition: string;
  statut_expedition_brut: string | null;
  total_prix: string;
  devise: string;
  adresse: string | null;
  adresse_livraison: CommandeShopify['adresseLivraison'];
  moyen_expedition: string | null;
  lignes: CommandeShopify['lignes'];
  fulfillments: CommandeShopify['fulfillments'];
}

function versCommandeShopify(l: LigneBrute): CommandeShopify {
  return {
    id: l.shopify_id,
    nom: l.nom,
    creeLe: l.cree_le,
    client: l.client,
    email: l.email,
    statutPaiement: l.statut_paiement,
    statutExpedition: l.statut_expedition as StatutExpeditionCommande,
    statutExpeditionBrut: l.statut_expedition_brut,
    totalPrix: l.total_prix,
    devise: l.devise,
    adresse: l.adresse,
    adresseLivraison: l.adresse_livraison,
    moyenExpedition: l.moyen_expedition,
    lignes: l.lignes,
    fulfillments: l.fulfillments,
  };
}

function versLigneBrute(c: CommandeShopifyAvecMaj) {
  return {
    shopify_id: c.id,
    nom: c.nom,
    cree_le: c.creeLe,
    client: c.client,
    email: c.email,
    statut_paiement: c.statutPaiement,
    statut_expedition: c.statutExpedition,
    statut_expedition_brut: c.statutExpeditionBrut,
    total_prix: c.totalPrix,
    devise: c.devise,
    adresse: c.adresse,
    adresse_livraison: c.adresseLivraison,
    moyen_expedition: c.moyenExpedition,
    lignes: c.lignes,
    fulfillments: c.fulfillments,
    shopify_updated_at: c.shopifyUpdatedAt,
    synced_at: new Date().toISOString(),
  };
}

/** Commandes pas encore livrées, depuis le cache Supabase — synchronise d'abord avec Shopify
 * (backfill complet au tout premier appel, incrémental ensuite) avant de lire. Un échec Shopify
 * (rate limit, réseau) ne fait jamais planter l'écran : on retombe sur le contenu du cache tel
 * quel, déjà à jour de la dernière synchro réussie.
 *
 * `expeditionsSendcloud` : passé par l'appelant (page.tsx) plutôt que rechargé ici — il en a de
 * toute façon besoin pour l'affichage, inutile de faire la même requête Supabase deux fois par
 * visite (audit latence du 2026-09-02). */
export async function commandesShopifyEnCache(
  expeditionsSendcloud: Map<number, ExpeditionSendcloud>,
): Promise<CommandeShopify[]> {
  const supabase = await creerClientSupabaseServeur();

  try {
    const { data: etat } = await supabase.from('hub_commandes_shopify_sync_etat').select('*').single();
    const maintenant = new Date();

    // Sendcloud est la seule source de vérité pour "livrée" sur ces envois (Shopify ne le sait
    // jamais, cf. statutAffiche() côté client) — purge indépendante de la fenêtre Shopify
    // ci-dessous, sinon une commande confirmée livrée par Sendcloud resterait bloquée en cache tant
    // que Shopify lui-même n'a rien à mettre à jour dessus.
    const idsLivresSendcloud = [...expeditionsSendcloud.entries()]
      .filter(([, e]) => e.statutSuivi === 'DELIVERED')
      .map(([id]) => id);
    if (idsLivresSendcloud.length > 0) {
      await supabase.from('hub_commandes_shopify_cache').delete().in('shopify_id', idsLivresSendcloud);
    }

    const commandesAJour: CommandeShopifyAvecMaj[] = etat?.derniere_synchro_le
      ? await listerCommandesMiseAJourDepuis(new Date(new Date(etat.derniere_synchro_le).getTime() - MARGE_SECURITE_MS).toISOString())
      : await listerCommandesRecentes(200);

    const aSupprimer: number[] = [];
    const aEnregistrer: CommandeShopifyAvecMaj[] = [];
    for (const cmd of commandesAJour) {
      if (cmd.statutExpedition === 'livree') aSupprimer.push(cmd.id);
      else aEnregistrer.push(cmd);
    }

    if (aEnregistrer.length > 0) {
      const { error } = await supabase.from('hub_commandes_shopify_cache').upsert(aEnregistrer.map(versLigneBrute));
      if (error) throw new Error(error.message);
    }
    if (aSupprimer.length > 0) {
      await supabase.from('hub_commandes_shopify_cache').delete().in('shopify_id', aSupprimer);
    }

    await supabase
      .from('hub_commandes_shopify_sync_etat')
      .update({ derniere_synchro_le: maintenant.toISOString(), ok: true, message: null })
      .eq('id', true);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    console.warn('Synchro commandes Shopify échouée, on garde le cache tel quel :', message);
    await supabase
      .from('hub_commandes_shopify_sync_etat')
      .update({ ok: false, message })
      .eq('id', true);
  }

  const { data, error } = await supabase
    .from('hub_commandes_shopify_cache')
    .select('*')
    .order('cree_le', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as LigneBrute[]).map(versCommandeShopify);
}
