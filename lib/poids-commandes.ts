// Poids réel des commandes Shopify (cf. discussion 2026-08-29 : "faut calculer avec le poids des
// articles") — le champ Shopify line_items[].grams existe mais n'est pas fiable sur ce catalogue
// (vérifié en session : ~1g par pin quel que soit le modèle, donc jamais renseigné pour de vrai).
// La vraie source, c'est stock_pins.poids_unitaire (App PIMP IT) : un poids en grammes réellement
// pesé par l'équipe (cf. migration 0056_stock_pins_poids_unitaire_vrai_unitaire.sql), rattaché au
// SKU Shopify via stock_pins.sku_pimpit.
import { creerClientSupabaseServeur } from './supabase/server';
import type { CommandeShopify } from './shopify';

/** En dessous de ce seuil (grammes), le poids réel calculé est remplacé par POIDS_PLANCHER_GRAMMES
 * (cf. discussion 2026-08-29) — quelques pins pesés individuellement peuvent sommer à quelques
 * grammes, bien en dessous du poids réel d'un colis emballé (enveloppe, carton...). */
const SEUIL_POIDS_FAIBLE_GRAMMES = 50;
const POIDS_PLANCHER_GRAMMES = 18;

/** Poids retenu pour une ligne sans SKU reconnu ou sans poids pesé en base (cf. discussion
 * 2026-08-29 : "si l'article n'a pas de poids tu mets 1g") — une valeur volontairement basse plutôt
 * qu'un abandon du calcul pour toute la commande ; le plancher ci-dessus rattrape le total si le
 * colis entier se retrouve trop léger. */
const POIDS_LIGNE_INCONNUE_GRAMMES = 1;

/** Poids total (grammes) par commande, calculé depuis stock_pins.poids_unitaire quand le SKU est
 * reconnu, sinon POIDS_LIGNE_INCONNUE_GRAMMES par unité pour cette ligne. Une commande absente de
 * la map (aucune ligne) n'a pas de poids calculable — à traiter avec le poids par défaut du
 * screen appelant. */
export async function calculerPoidsCommandes(commandes: CommandeShopify[]): Promise<Map<number, number>> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('stock_pins').select('sku_pimpit, poids_unitaire');
  if (error) throw new Error(error.message);

  const poidsParSku = new Map<string, number>();
  for (const p of (data ?? []) as { sku_pimpit: string | null; poids_unitaire: number | null }[]) {
    if (p.sku_pimpit && p.poids_unitaire && p.poids_unitaire > 0) poidsParSku.set(p.sku_pimpit, p.poids_unitaire);
  }

  const resultat = new Map<number, number>();
  for (const cmd of commandes) {
    if (cmd.lignes.length === 0) continue;
    let total = 0;
    for (const ligne of cmd.lignes) {
      const poidsUnite = (ligne.sku && poidsParSku.get(ligne.sku)) || POIDS_LIGNE_INCONNUE_GRAMMES;
      total += poidsUnite * ligne.quantite;
    }
    resultat.set(cmd.id, total < SEUIL_POIDS_FAIBLE_GRAMMES ? POIDS_PLANCHER_GRAMMES : total);
  }
  return resultat;
}
