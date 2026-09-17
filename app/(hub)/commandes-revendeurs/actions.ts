'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

export interface LigneCommandeRevendeurHub {
  id: string;
  nom: string;
  skuFournisseur: string | null;
  prixUnitaireHt: number;
  quantite: number;
}

export interface CommandeRevendeurHub {
  id: string;
  entreprise: string;
  statut: 'nouvelle' | 'traitee';
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
    .select('id, entreprise, statut, total_ht, created_at')
    .order('created_at', { ascending: false });
  if (eCommandes) throw new Error(eCommandes.message);

  const { data: lignes, error: eLignes } = await supabase
    .from('commandes_revendeurs_lignes')
    .select('commande_id, id, nom, sku_fournisseur, prix_unitaire_ht, quantite');
  if (eLignes) throw new Error(eLignes.message);

  const lignesParCommande = new Map<string, LigneCommandeRevendeurHub[]>();
  for (const l of lignes ?? []) {
    const liste = lignesParCommande.get(l.commande_id) ?? [];
    liste.push({ id: l.id, nom: l.nom, skuFournisseur: l.sku_fournisseur, prixUnitaireHt: Number(l.prix_unitaire_ht), quantite: l.quantite });
    lignesParCommande.set(l.commande_id, liste);
  }

  return (commandes ?? []).map((c) => ({
    id: c.id,
    entreprise: c.entreprise,
    statut: c.statut,
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
