// Modèle de données partagé pour "Commandes fournisseurs" — réplique le domaine métier de
// l'ancien admin (Shopify Pimp IT/admin/lib/purchase-orders.js, ~server.js:1087-1279), mais lit
// et écrit uniquement Supabase (hub_purchase_orders, hub_pins) : plus d'écriture Airtable. Les
// mutations vivent dans app/(hub)/commandes/actions.ts ('use server') ; ce fichier ne fait que
// lire et expose les constantes/types partagés entre le composant serveur (page.tsx) et les
// actions.
//
// hub_purchase_orders n'avait pas de colonne "type" au moment du backfill Airtable (le type
// normal/popup/b2b vivait dans le JSON `Articles`, aplati/perdu lors de la synchronisation) : une
// migration l'a ajoutée (défaut 'normal'), avec un backfill best-effort qui tague 'b2b' les
// commandes dont au moins un article porte `priceHT` (marqueur fiable, jamais présent sur les
// commandes fournisseur normales/pop-up) — l'historique pop-up éventuel est donc affiché comme
// 'normal' faute de pouvoir le distinguer rétroactivement ; les commandes créées depuis cet écran
// portent désormais toujours le bon type dès la création.
// Types et constantes uniquement (pas de fonctions de chargement Supabase ici) : ce fichier est
// importé aussi bien par des Server Components (page.tsx) que par des Client Components
// (CommandesClient.tsx et les modales) — y mettre `creerClientSupabaseServeur` (qui importe
// `next/headers`) casse le build webpack pour tout composant client qui importe ce module, même
// s'il n'utilise que les types. Le chargement des données vit dans
// app/(hub)/commandes/donnees.ts (Server-only).

export const FOURNISSEURS: Record<string, { label: string; codes: string[] }> = {
  J: { label: 'Fournisseur J', codes: ['J', 'JO'] },
  W: { label: "WU Pin's", codes: ['W', 'Wu'] },
};

/** SKU des pins attribués à une case du pop-up Créteil Soleil — snapshot figé porté depuis
 * `Shopify Pimp IT/admin/data/creteil-soleil-skus.json` (634 SKU Pimpit), au 2026-08-06. Sert à
 * étiqueter et faire remonter ces pins en haut du brouillon de commande fournisseur en mode
 * pop-up, et à préremplir "Créteil Soleil : 200/0". Fichier source non touché (repo lecture
 * seule) ; à régénérer manuellement si l'attribution des cases évolue significativement. */
export const CRETEIL_SOLEIL_SKUS = new Set<string>([
  '10115','181','10106','277','135','295','441','10107','442','444','496','493','475','476','279','497','492','10108','10109','10110','325','10111','511','10112','10113','10114','432','433','434','435','436','437','438','439','440','10001','10079','10053','10027','569','431','372','405','298','426','287','467','31','259','339','327','527','75','10002','10080','10054','10028','577','78','45','39','553','191','266','291','290','268','199','157','124','27','490','361','371','280','278','376','53','400','397','494','212','304','340','187','62','69','132','238','82','92','319','390','314','358','498','526','141','333','44','142','59','118','234','261','70','366','412','273','10003','10081','10055','10029','477','13','403','488','404','332','532','210','145','112','102','578','579','254','320','388','509','55','76','52','64','14','152','225','385','217','177','249','334','46','207','383','572','256','128','165','227','229','24','4','422','460','502','205','133','32','95','156','393','130','34','515','120','99','453','216','429','419','421','406','41','242','459','461','408','262','109','18','74','84','89','94','97','16','337','282','104','88','564','519','521','81','392','96','265','10004','10082','10056','10030','483','456','264','136','342','5','395','58','233','236','43','336','206','79','255','302','491','471','418','293','443','10005','10083','10057','10031','6','389','430','480','251','513','517','126','457','451','455','10006','10084','10058','10032','354','349','60','61','66','54','150','129','213','87','345','51','510','10','131','224','168','458','11','445','452','175','288','486','505','454','409','201','77','343','10007','10085','10059','10033','286','534','200','401','30','26','353','504','274','396','176','57','411','415','10008','10086','10060','10034','424','209','381','29','447','357','315','330','348','352','10009','10035','47','49','10087','10061','80','482','428','10010','10088','10062','10036','410','267','323','328','365','284','297','10011','10089','10063','10037','360','10012','10090','10064','10038','485','530','529','478','23','100','20','247','173','143','531','275','566','557','399','394','281','1','103','113','169','235','331','164','182','184','137','370','363','139','9','10013','10091','10065','533','10039','374','495','188','263','158','71','423','351','244','246','416','414','481','484','270','276','269','119','562','329','364','472','503','289','10014','10066','10092','10040','368','48','528','548','407','12','140','189','214','223','252','7','83','163','42','186','448','230','10015','10093','10067','10041','93','167','570','303','155','479','305','222','387','115','122','125','162','248','110','114','226','237','15','153','17','195','218','245','98','121','196','107','108','148','193','197','172','10016','10094','308','10068','10042','449','384','260','134','161','183','190','219','221','253','86','166','90','499','3','8','313','111','123','117','292','522','294','239','356','68','22','174','202','67','65','144','306','220','35','192','170','355','73','317','72','567','146','147','427','25','10017','10095','10069','10043','322','101','36','85','37','10018','10096','10070','10044','379','446','402','378','474','568','285','283','127','10019','10097','10071','10045','344','38','350','243','50','417','391','500','501','63','359','301','299','300','561','338','326','318','377','367','563','272','380','369','362','375','420','151','10020','10098','10072','10046','33','535','56','470','116','347','185','40','105','346','91','341','28','518','487','321','310','154','536','2','232','171','550','179','382','296','549','413','309','425','10021','10099','10073','10047','466','10022','10100','10074','10048','386','241','271','138','204','506','316','10023','10101','10075','10049','324','250','469','10024','10102','10076','10050','159','311','307','10025','10103','10077','10051','489','257','231','10026','10104','10078','10052','520','373',
]);

export type TypeCommande = 'normal' | 'popup' | 'b2b';
export type StatutCommande = 'pending' | 'received';

export interface ArticleCommande {
  airtableId: string;
  name: string;
  skuPimpit: string | null;
  skuFournisseur: string;
  stockActuel: number;
  qty: number;
  /** Legacy B2B (hors périmètre de cet écran) — conservé tel quel pour ne pas perdre la donnée. */
  priceHT?: number;
}

export interface CommandeFournisseur {
  id: string; // = airtable_id (identifiant applicatif hérité de l'ère Airtable)
  ref: string;
  createdAt: string;
  supplier: string;
  label: string;
  status: StatutCommande;
  receivedAt: string | null;
  type: TypeCommande;
  items: ArticleCommande[];
  nbArticles: number;
  quantiteTotale: number;
  /** cf. migration 0095 (App PIMP IT) — le stock local est-il actuellement incrémenté par cette
   * commande ? Indépendant de `status` : une commande reçue peut avoir été reçue sans incrément
   * (choix explicite à la réception), ou incrémentée puis décrémentée (rollback). */
  stockIncremente: boolean;
}

export interface HubPinLite {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  sku_fournisseur: string | null;
  fournisseur: string | null;
  stock: number | null;
  seuil_cible: number | null;
  image_url: string | null;
}
