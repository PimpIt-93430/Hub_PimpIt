// Cache Supabase de l'écran "Commandes Shopify" (cf. migration 0089_hub_commandes_shopify_cache) —
// remplace l'appel Shopify complet (200 commandes) qui se refaisait à chaque visite, sans cache
// (gros contributeur de latence, audit du 2026-09-02). À chaque visite on ne redemande à Shopify que
// ce qui a changé depuis la dernière synchro, avec une minute de marge de sécurité pour ne rien
// manquer ("reviens à 14h59 pour être sûr de pas en louper").
//
// Purge : à l'origine une commande livrée sortait du cache immédiatement ("une fois que c'est livré
// tu la sors du cache, pas besoin de garder en mémoire") — revu suite au retour utilisateur du
// 2026-09-05 ("il faut pas supprimer le cache dès que c'est livré, il nous faut un suivi, à la
// limite on supprime le cache tous les 3 mois") : une commande livrée reste maintenant visible/
// réimprimable, seule l'ancienneté (AGE_MAX_CACHE_MS, cf. plus bas) fait sortir une commande du
// cache.
import {
  listerCommandesMiseAJourDepuis,
  listerCommandesRecentes,
  type CommandeShopify,
  type CommandeShopifyAvecMaj,
  type StatutExpeditionCommande,
} from './shopify';
import type { ExpeditionSendcloud } from './expeditions-sendcloud';
import { chargerExpeditionsLaPoste } from './expeditions-laposte';
import { chargerStatutsSuivi } from './laposte';
import { creerClientSupabaseServeur } from './supabase/server';

const MARGE_SECURITE_MS = 60_000;
/** Cf. retour utilisateur du 2026-09-05 : "à la limite on supprime le cache tous les 3 mois" — âge
 * (depuis la création Shopify de la commande) au-delà duquel une commande sort du cache, quel que
 * soit son statut de livraison. */
const AGE_MAX_CACHE_MS = 90 * 24 * 60 * 60 * 1000;

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

    // Cf. retour utilisateur du 2026-09-05 : "il faut pas supprimer le cache dès que c'est livré,
    // il nous faut un suivi, à la limite on supprime le cache tous les 3 mois" — revient sur le
    // choix initial (purge immédiate à la livraison, cf. discussion 2026-08-27) : une commande
    // livrée reste maintenant visible (permet de retrouver/réimprimer une étiquette en cas de
    // souci) et n'est marquée "livrée" que côté statut, jamais supprimée pour ce motif. Seul l'âge
    // (cf. purge en fin de fonction) fait sortir une commande du cache désormais.
    //
    // Sendcloud est la seule source de vérité pour "livrée" sur ces envois (Shopify ne le sait
    // jamais, cf. statutAffiche() côté client).
    const idsLivresSendcloud = [...expeditionsSendcloud.entries()]
      .filter(([, e]) => e.statutSuivi === 'DELIVERED')
      .map(([id]) => id);
    if (idsLivresSendcloud.length > 0) {
      await supabase.from('hub_commandes_shopify_cache').update({ statut_expedition: 'livree' }).in('shopify_id', idsLivresSendcloud);
    }

    // Même principe pour La Poste (API trackedItemStatus, cf. lib/laposte.ts) : Shopify ne saura
    // jamais qu'une lettre suivie est livrée non plus. Dans son propre try/catch — cette API est
    // en cours de mise en place côté La Poste (URL pas encore fonctionnelle) et ne doit jamais
    // bloquer la mise à jour Sendcloud ci-dessus ni la synchro Shopify qui suit. `isFinal` (pas un
    // code "distribué" précis) est le bon signal : pour une lettre suivie, La Poste ne garantit que
    // l'événement "mis en distribution", jamais forcément une confirmation de livraison explicite.
    try {
      const expeditionsLaPoste = await chargerExpeditionsLaPoste();
      const itemIds = [...expeditionsLaPoste.values()].map((e) => e.laposteItemId);
      const idsLivresLaPoste: number[] = [];
      for (let i = 0; i < itemIds.length; i += 10) {
        const statuts = await chargerStatutsSuivi(itemIds.slice(i, i + 10));
        for (const s of statuts) {
          if (!s.isFinal) continue;
          const expedition = [...expeditionsLaPoste.values()].find((e) => e.laposteItemId === s.itemId);
          if (expedition) idsLivresLaPoste.push(expedition.commandeShopifyId);
        }
      }
      if (idsLivresLaPoste.length > 0) {
        await supabase.from('hub_commandes_shopify_cache').update({ statut_expedition: 'livree' }).in('shopify_id', idsLivresLaPoste);
      }
    } catch (e) {
      console.warn('Suivi La Poste indisponible, ignoré pour cette synchro :', e instanceof Error ? e.message : e);
    }

    const commandesAJour: CommandeShopifyAvecMaj[] = etat?.derniere_synchro_le
      ? await listerCommandesMiseAJourDepuis(new Date(new Date(etat.derniere_synchro_le).getTime() - MARGE_SECURITE_MS).toISOString())
      : await listerCommandesRecentes(200);

    if (commandesAJour.length > 0) {
      const { error } = await supabase.from('hub_commandes_shopify_cache').upsert(commandesAJour.map(versLigneBrute));
      if (error) throw new Error(error.message);
    }

    // Purge par ancienneté plutôt que par statut de livraison (cf. commentaire plus haut) — une
    // commande de plus de 3 mois sort du cache quel que soit son statut, gardant la table utilisable
    // sans perdre le suivi/la capacité de réimprimer une étiquette juste après livraison.
    await supabase.from('hub_commandes_shopify_cache').delete().lt('cree_le', new Date(maintenant.getTime() - AGE_MAX_CACHE_MS).toISOString());

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
