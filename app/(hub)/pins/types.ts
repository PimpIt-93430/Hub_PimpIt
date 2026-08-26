export interface HubPin {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  sku_fournisseur: string | null;
  stock: number | null;
  seuil_cible: number | null;
  fournisseur: string | null;
  boite: string | null;
  poids_unitaire: number | null;
  poids_total: number | null;
  custom: boolean | null;
  pas_dans_unite: boolean | null;
  description: string | null;
  image_url: string | null;
}

export const BOITE_VALEURS = ['A', 'B', 'C', 'D', 'E', '1', '2', '3', '4', '5', 'A ranger'] as const;

export const FOURNISSEUR_VALEURS = ['J', 'W', 'Wu', 'JO'] as const;
