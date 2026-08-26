import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { normaliserStockPin, type StockPin } from './pins/stockLib';
import { StockAccueilClient } from './StockAccueilClient';

/** `numeric` côté Postgres peut revenir sous forme de string selon le client (cf. commentaire dans
 * normaliserStockPin) — même normalisation pour stock_initial (chaussures/coques/sacs_stock). */
function normaliserStockInitial<T extends { stock_initial: number | string }>(rows: T[]): (T & { stock_initial: number })[] {
  return rows.map((r) => ({ ...r, stock_initial: Number(r.stock_initial) }));
}

/** Réplique l'écran "Stock" de l'app Pimp It (src/components/stock/StockAccueil.tsx et ses
 * sous-écrans) — mêmes tables réelles, pas un miroir hub_*. Trois catégories : Pin's (catalogue/
 * boîtes/commandes), Produits (chaussures/coques/sacs/goodies) et Consommables. Distinct de
 * /stock-cible (stock VISÉ, partagé entre pop-ups) : ici c'est le suivi du stock RÉEL par lieu
 * (inventaires, boîtes, commandes) — cf. commentaire de tête dans StockAccueilClient.tsx.
 *
 * Le Hub est admin-only : toujours tous les pop-ups (pas de restriction "pop-up attribué"), donc
 * pas besoin de charger le profil de la personne connectée ici (contrairement à StockAccueil qui
 * le reçoit en prop). */
export default async function StockPage() {
  const supabase = await creerClientSupabaseServeur();

  const [
    { data: popUps },
    { data: stockPins },
    { data: popUpPinBoites },
    { data: chaussuresStock },
    { data: coquesStock },
    { data: sacsStock },
    { data: mappingChaussures },
    { data: mappingCoques },
    { data: mappingSacs },
  ] = await Promise.all([
    supabase.from('pop_ups').select('id, nom, couleur, est_local').eq('actif', true).order('nom'),
    supabase.from('stock_pins').select('*').eq('actif', true).order('nom'),
    supabase.from('pop_up_pin_boites').select('id, pop_up_id, pin_id, case_position, a_commander, updated_at'),
    supabase.from('chaussures_stock').select('*').order('couleur').order('taille'),
    supabase.from('coques_stock').select('*').order('modele').order('variante').order('couleur'),
    supabase.from('sacs_stock').select('*').order('produit').order('couleur'),
    supabase.from('chaussures_mapping_sumup').select('*'),
    supabase.from('coques_mapping_sumup').select('*'),
    supabase.from('sacs_mapping_sumup').select('*'),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Stock pop-up</h1>
      <p className="mb-6 text-sm text-slate-400">
        Suivi du stock réel par lieu — depuis Supabase, même données que l&apos;app Pimp It.
      </p>

      <StockAccueilClient
        popUps={popUps ?? []}
        stockPins={((stockPins ?? []) as StockPin[]).map(normaliserStockPin)}
        popUpPinBoites={popUpPinBoites ?? []}
        chaussuresStock={normaliserStockInitial(chaussuresStock ?? [])}
        coquesStock={normaliserStockInitial(coquesStock ?? [])}
        sacsStock={normaliserStockInitial(sacsStock ?? [])}
        mappingChaussures={mappingChaussures ?? []}
        mappingCoques={mappingCoques ?? []}
        mappingSacs={mappingSacs ?? []}
      />
    </div>
  );
}
