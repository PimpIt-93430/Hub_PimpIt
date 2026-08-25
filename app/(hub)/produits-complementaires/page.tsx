import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { NouveauProduitComplementaireForm } from './NouveauProduitComplementaireForm';
import { ProduitComplementaireRow } from './ProduitComplementaireRow';

interface HubProduitComplementaire {
  airtable_id: string;
  nom: string | null;
  photo_url: string | null;
  prix: number | null;
  actif: boolean | null;
  description: string | null;
  synced_at: string | null;
  lien1: string | null;
  titre_lien1: string | null;
  lien2: string | null;
  titre_lien2: string | null;
  variantes: string | null;
}

/** Gestion complète sur Supabase (hub_produits_complementaires) — Supabase est désormais la base
 * d'origine du Hub : créer/modifier/supprimer ici n'écrit que dans Supabase, pas dans Airtable
 * (cf. actions.ts). Les produits déjà synchronisés depuis Airtable restent affichés normalement. */
export default async function ProduitsComplementairesPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_produits_complementaires').select('*').order('nom');
  const produits = (data ?? []) as HubProduitComplementaire[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Produits complémentaires</h1>
      <p className="mb-6 text-sm text-slate-400">{produits.length} produits — géré depuis Supabase.</p>

      <NouveauProduitComplementaireForm />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Photo</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3 text-right">Prix</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {produits.map((p) => (
              <ProduitComplementaireRow key={p.airtable_id} produit={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
