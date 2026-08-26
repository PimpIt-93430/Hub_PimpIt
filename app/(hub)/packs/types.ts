export interface HubPack {
  airtable_id: string;
  nom_du_pack: string | null;
  sku_shopify: string | null;
  photo_url: string | null;
  probleme: boolean | null;
  qtes_pins: Record<string, number> | null;
  pins_inclus_count: number | null;
}

export interface PinOption {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  image_url: string | null;
}
