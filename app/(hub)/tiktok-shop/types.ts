export interface PinOption {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  image_url: string | null;
  stock: number;
}

export interface ProduitTikTokExistant {
  id: string;
  title: string;
  status: string;
  variantCount: number;
  image: string | null;
  adminUrl: string;
}
