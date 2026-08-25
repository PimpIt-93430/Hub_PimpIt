import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { NouveauPinForm } from './NouveauPinForm';
import { PinRow } from './PinRow';

interface HubPin {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  sku_fournisseur: string | null;
  stock: number | null;
  seuil_cible: number | null;
  fournisseur: string | null;
  boite: string | null;
}

/** Gestion complète sur Supabase (hub_pins) — Supabase est désormais la base d'origine du Hub :
 * créer/modifier/supprimer ici n'écrit que dans Supabase, pas dans Airtable (cf. actions.ts). Les
 * pins déjà synchronisés depuis Airtable restent affichés normalement. */
export default async function PinsPage() {
  const supabase = await creerClientSupabaseServeur();
  const { data } = await supabase.from('hub_pins').select('*').order('name');
  const pins = (data ?? []) as HubPin[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Pin&apos;s</h1>
      <p className="mb-6 text-sm text-slate-400">{pins.length} pin&apos;s — géré depuis Supabase.</p>

      <NouveauPinForm />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">SKU Pimp It</th>
              <th className="px-4 py-3">SKU Fournisseur</th>
              <th className="px-4 py-3">Fournisseur</th>
              <th className="px-4 py-3">Boîte</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Seuil cible</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {pins.map((p) => (
              <PinRow key={p.airtable_id} pin={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
