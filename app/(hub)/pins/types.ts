export interface HubPin {
  id: string;
  // Cf. retour utilisateur du 2026-09-17 : "je n'arrive toujours pas à supprimer" — certains pins
  // n'ont pas d'airtable_record_id (jamais synchronisés depuis Airtable), donc nullable ici. Les
  // actions (modifier/supprimerPin) sont keyées sur `id` (uuid, toujours renseigné), jamais sur ce
  // champ — cf. actions.ts.
  airtable_id: string | null;
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
