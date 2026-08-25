import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface HubPack {
  airtable_id: string;
  nom_du_pack: string | null;
  sku_shopify: string | null;
  photo_url: string | null;
  stock_max: number | null;
  probleme: boolean | null;
  qtes_pins: Record<string, number> | null;
  pins_inclus_count: number | null;
  synced_at: string | null;
}

/** `qtes_pins` est un objet jsonb, ex. {"recXXX": 2, "recYYY": 1} — une quantité par pin lié
 * (contrairement à `Articles` sur les commandes fournisseurs, qui est un tableau). On lit
 * défensivement pour ne pas faire échouer tout l'affichage sur un format inattendu. */
function quantiteTotalePins(qtesPins: Record<string, number> | null): number | null {
  if (!qtesPins || typeof qtesPins !== 'object' || Array.isArray(qtesPins)) return null;
  return Object.values(qtesPins).reduce((s, q) => s + (typeof q === 'number' ? q : 0), 0);
}

/** Lit le miroir Supabase (hub_packs), synchronisé depuis Airtable T_PACKS — plus d'appel direct à
 * Airtable ici (cf. script de synchronisation dans Pimp It Hub/scripts). */
export default async function PacksPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_packs').select('*').order('nom_du_pack');
  const packs = (data ?? []) as HubPack[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Packs de pin&apos;s</h1>
      <p className="mb-6 text-sm text-slate-400">
        {packs.length} packs — depuis Supabase (synchronisé depuis Airtable).
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Photo</th>
              <th className="px-4 py-3">Nom du pack</th>
              <th className="px-4 py-3">SKU Shopify</th>
              <th className="px-4 py-3 text-right">Pins inclus</th>
              <th className="px-4 py-3 text-right">Qté totale</th>
              <th className="px-4 py-3 text-right">Stock max</th>
              <th className="px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {packs.map((p) => {
              const thumb = p.photo_url;
              const nbPins = p.pins_inclus_count ?? 0;
              const qteTotale = quantiteTotalePins(p.qtes_pins);
              const probleme = Boolean(p.probleme);
              return (
                <tr key={p.airtable_id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-8 w-8 rounded-lg object-cover" />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{p.nom_du_pack ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.sku_shopify ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{nbPins || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{qteTotale ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{p.stock_max ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {probleme ? (
                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                        Problème
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {packs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Aucun pack.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
