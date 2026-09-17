'use server';

import { randomUUID } from 'crypto';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

export interface PinRevendeur {
  id: string;
  name: string | null;
  photo: string | null;
  skuFournisseur: string | null;
  priceHT: number;
}

/** Catalogue public "Espace Revendeur" — lit la vue catalogue_revendeurs (cf. migration 0115),
 * jamais stock_pins directement : la vue exclut déjà les colonnes internes (stock, prix
 * fournisseur, emplacement) et les pins sans prix revendeur. Page publique (middleware.ts exempte
 * /revendeurs de la connexion), donc pas de session ici — la RLS de la vue est ouverte à `anon`. */
export async function chargerCatalogueRevendeurs(): Promise<PinRevendeur[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('catalogue_revendeurs')
    .select('id, name, photo, sku_fournisseur, price_ht')
    .order('name');
  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    photo: p.photo,
    skuFournisseur: p.sku_fournisseur,
    priceHT: Number(p.price_ht),
  }));
}

export interface LigneCommandeRevendeur {
  id: string;
  name: string;
  skuFournisseur: string | null;
  priceHT: number;
  qty: number;
}

/** Enregistre une commande revendeur (retour utilisateur du 2026-09-17 : "enregistrer dans le Hub
 * + m'avertir" — la partie "avertir" n'est pas encore câblée, cf. message de fin de tâche : aucun
 * service d'email/notification n'est configuré côté Hub pour l'instant). Revérifie le prix et
 * l'existence de chaque ligne côté serveur (jamais confiance dans priceHT envoyé par le
 * navigateur) — recalcule le total à partir du catalogue actuel, pas de celui reçu du client. */
export async function envoyerCommandeRevendeur(entreprise: string, lignes: LigneCommandeRevendeur[]): Promise<void> {
  const nomEntreprise = entreprise.trim();
  if (!nomEntreprise) throw new Error('Entreprise requise');
  if (lignes.length === 0) throw new Error('Aucun article sélectionné');

  const supabase = await creerClientSupabaseServeur();
  const { data: catalogue, error: eCatalogue } = await supabase
    .from('catalogue_revendeurs')
    .select('id, name, sku_fournisseur, price_ht');
  if (eCatalogue) throw new Error(eCatalogue.message);
  const parId = new Map((catalogue ?? []).map((p) => [p.id, p]));

  const lignesValides = lignes
    .map((l) => {
      const pin = parId.get(l.id);
      if (!pin) return null;
      const qte = Math.max(0, Math.floor(l.qty));
      if (qte < 10) return null;
      return {
        airtable_record_id: pin.id,
        nom: pin.name ?? l.name,
        sku_fournisseur: pin.sku_fournisseur,
        prix_unitaire_ht: Number(pin.price_ht),
        quantite: qte,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (lignesValides.length === 0) throw new Error('Aucun article valide (quantité minimum 10)');

  const totalHT = lignesValides.reduce((s, l) => s + l.prix_unitaire_ht * l.quantite, 0);

  // Id généré ici (pas de .select() après l'insert) : une personne anonyme (page publique) n'a
  // aucune policy SELECT sur commandes_revendeurs — or Supabase exige que le rôle qui écrit ait le
  // droit de relire la ligne dès qu'on demande la représentation insérée (Prefer:
  // return=representation, déclenché par .select()), même pour un simple insert. Générer l'id
  // nous-mêmes évite ce aller-retour et garde la table illisible pour le public, comme voulu.
  const commandeId = randomUUID();
  const { error: eCommande } = await supabase
    .from('commandes_revendeurs')
    .insert({ id: commandeId, entreprise: nomEntreprise, total_ht: totalHT });
  if (eCommande) throw new Error(eCommande.message);

  const { error: eLignes } = await supabase
    .from('commandes_revendeurs_lignes')
    .insert(lignesValides.map((l) => ({ ...l, commande_id: commandeId })));
  if (eLignes) throw new Error(eLignes.message);
}
