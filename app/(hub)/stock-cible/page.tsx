import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { StockCibleClient } from './StockCibleClient';

/** Réplique l'écran "Stock cible" de l'app Pimp It (web uniquement, src/components/stock/
 * StockCibleEcran.tsx) — mêmes tables réelles (chaussures_stock/coques_stock + mapping SumUp),
 * pas un miroir hub_*. Sacs et Lanières n'ont plus de suivi de stock (retour utilisateur du
 * 2026-09-18). Le calcul des noms SumUp non mappés est fait ici plutôt que dans le client
 * component pour éviter d'exposer ventes_sumup_lignes côté navigateur. */
export default async function StockCiblePage() {
  const supabase = await creerClientSupabaseServeur();

  const [
    { data: chaussures },
    { data: coques },
    { data: mappingChaussures },
    { data: mappingCoques },
    { data: lignesVentes },
  ] = await Promise.all([
    supabase.from('chaussures_stock').select('*').order('couleur').order('taille'),
    supabase.from('coques_stock').select('*'),
    supabase.from('chaussures_mapping_sumup').select('*').order('nom_produit'),
    supabase.from('coques_mapping_sumup').select('*').order('nom_produit'),
    supabase.from('ventes_sumup_lignes').select('nom_produit'),
  ]);

  const nomsVus = new Set((lignesVentes ?? []).map((l) => l.nom_produit as string));
  const nomsNonMappes = (mappes: { nom_produit: string }[]) => {
    const mappesSet = new Set(mappes.map((m) => m.nom_produit));
    return [...nomsVus].filter((n) => !mappesSet.has(n)).sort();
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Stock cible</h1>
      <p className="mb-6 text-sm text-slate-400">
        Le stock visé par modèle/couleur ou taille, commun à tous les pop-ups — sert de référence
        pour calculer ce qu&apos;il faut ramener après un inventaire.
      </p>

      <StockCibleClient
        chaussures={chaussures ?? []}
        coques={coques ?? []}
        mappingChaussures={mappingChaussures ?? []}
        mappingCoques={mappingCoques ?? []}
        nomsNonMappesChaussures={nomsNonMappes(mappingChaussures ?? [])}
        nomsNonMappesCoques={nomsNonMappes(mappingCoques ?? [])}
      />
    </div>
  );
}
