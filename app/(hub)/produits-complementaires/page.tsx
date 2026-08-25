import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface HubProduitComplementaire {
  airtable_id: string;
  nom: string | null;
  photo_url: string | null;
  prix: number | null;
  actif: boolean | null;
  description: string | null;
  synced_at: string | null;
}

function formatPrix(prix: number): string {
  return `${prix.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function tronquer(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max)}…` : texte;
}

/** Lit le miroir Supabase (hub_produits_complementaires), synchronisé depuis Airtable
 * T_PRODUITS_COMPL — plus d'appel direct à Airtable ici (cf. script de synchronisation dans
 * Pimp It Hub/scripts). */
export default async function ProduitsComplementairesPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_produits_complementaires').select('*').order('nom');
  const produits = (data ?? []) as HubProduitComplementaire[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Produits complémentaires</h1>
      <p className="mb-6 text-sm text-slate-400">
        {produits.length} produits — depuis Supabase (synchronisé depuis Airtable).
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Photo</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3 text-right">Prix</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Description</th>
            </tr>
          </thead>
          <tbody>
            {produits.map((p) => {
              const description = p.description ?? '';
              return (
                <tr key={p.airtable_id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5">
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{p.nom ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {typeof p.prix === 'number' ? formatPrix(p.prix) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        p.actif ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{description ? tronquer(description, 60) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
