export interface ArticleBrouillon {
  airtableId: string;
  name: string;
  skuPimpit: string | null;
  skuFournisseur: string;
  photo: string;
  stockActuel: number;
  seuilCible: number;
  qty: number;
  creteilSoleil?: boolean;
  dejaCommande?: number;
  enAttente?: number;
}

export interface Brouillon {
  supplier: string;
  label: string;
  type: 'normal' | 'popup';
  items: ArticleBrouillon[];
}
