'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

export interface LigneCommandeRevendeurHub {
  id: string;
  nom: string;
  skuFournisseur: string | null;
  skuPimpit: string | null;
  photoUrl: string | null;
  prixUnitaireHt: number;
  quantite: number;
}

export interface CommandeRevendeurHub {
  id: string;
  entreprise: string;
  statut: 'nouvelle' | 'traitee';
  sousTotalHt: number;
  remisePourcentage: number;
  totalHt: number;
  createdAt: string;
  lignes: LigneCommandeRevendeurHub[];
}

/** Commandes revendeurs (page publique app/revendeurs) à traiter — cf. migration 0115. Pas de
 * notification automatique pour l'instant (aucun service d'email/push configuré côté Hub), donc
 * cet écran est la seule façon de les voir : à consulter régulièrement tant que ce n'est pas
 * câblé. */
export async function chargerCommandesRevendeurs(): Promise<CommandeRevendeurHub[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data: commandes, error: eCommandes } = await supabase
    .from('commandes_revendeurs')
    .select('id, entreprise, statut, sous_total_ht, remise_pourcentage, total_ht, created_at')
    .order('created_at', { ascending: false });
  if (eCommandes) throw new Error(eCommandes.message);

  const { data: lignes, error: eLignes } = await supabase
    .from('commandes_revendeurs_lignes')
    .select('commande_id, id, nom, sku_fournisseur, airtable_record_id, prix_unitaire_ht, quantite');
  if (eLignes) throw new Error(eLignes.message);

  // Photo + SKU interne repris de stock_pins pour le PDF/impression (retour utilisateur du
  // 2026-09-17 : "exactement comme les commandes fournisseurs", même gabarit — cf.
  // imprimerCommande dans commandes/CommandesClient.tsx) — pas stockés sur la ligne elle-même,
  // recherchés ici par airtable_record_id comme photoParId le fait déjà côté commandes.
  const idsAirtable = [...new Set((lignes ?? []).map((l) => l.airtable_record_id).filter((v): v is string => !!v))];
  const { data: pins } =
    idsAirtable.length > 0
      ? await supabase.from('stock_pins').select('airtable_record_id, sku_pimpit, photo_url').in('airtable_record_id', idsAirtable)
      : { data: [] };
  const pinParAirtableId = new Map((pins ?? []).map((p) => [p.airtable_record_id, p]));

  const lignesParCommande = new Map<string, LigneCommandeRevendeurHub[]>();
  for (const l of lignes ?? []) {
    const pin = l.airtable_record_id ? pinParAirtableId.get(l.airtable_record_id) : undefined;
    const liste = lignesParCommande.get(l.commande_id) ?? [];
    liste.push({
      id: l.id,
      nom: l.nom,
      skuFournisseur: l.sku_fournisseur,
      skuPimpit: pin?.sku_pimpit ?? null,
      photoUrl: pin?.photo_url ?? null,
      prixUnitaireHt: Number(l.prix_unitaire_ht),
      quantite: l.quantite,
    });
    lignesParCommande.set(l.commande_id, liste);
  }

  return (commandes ?? []).map((c) => ({
    id: c.id,
    entreprise: c.entreprise,
    statut: c.statut,
    sousTotalHt: Number(c.sous_total_ht ?? c.total_ht),
    remisePourcentage: Number(c.remise_pourcentage ?? 0),
    totalHt: Number(c.total_ht),
    createdAt: c.created_at,
    lignes: lignesParCommande.get(c.id) ?? [],
  }));
}

export async function marquerCommandeRevendeurTraitee(id: string): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const { error, data } = await supabase.from('commandes_revendeurs').update({ statut: 'traitee' }).eq('id', id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/commandes-revendeurs');
}

/** Retour utilisateur du 2026-09-17 : pouvoir supprimer une commande revendeur. Les lignes
 * (commandes_revendeurs_lignes) partent avec via ON DELETE CASCADE (migration 0115) — pas de
 * suppression séparée nécessaire. */
export async function supprimerCommandeRevendeur(id: string): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const { error, data } = await supabase.from('commandes_revendeurs').delete().eq('id', id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/commandes-revendeurs');
}
