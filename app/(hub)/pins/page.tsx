import { atGet, TABLES } from '@/lib/airtable';

interface PinFields {
  Name?: string;
  'SKU Pimpit'?: string;
  'SKU Fournisseur'?: string;
  Stock?: number;
  'Seuil cible'?: number;
  Fournisseur?: string;
  Boite?: string;
}

/** Lecture seule pour l'instant (cf. plan) — même table Airtable que Shopify Pimp IT/admin
 * (T_PINS), rien n'est modifié ici. */
export default async function PinsPage() {
  const pins = await atGet<PinFields>(TABLES.PINS, {
    fields: ['Name', 'SKU Pimpit', 'SKU Fournisseur', 'Stock', 'Seuil cible', 'Fournisseur', 'Boite'],
  });

  const tries = [...pins].sort((a, b) => (a.fields.Name ?? '').localeCompare(b.fields.Name ?? ''));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Pin&apos;s</h1>
      <p className="mb-6 text-sm text-slate-400">
        {pins.length} pin&apos;s — depuis Airtable, lecture seule pour l&apos;instant.
      </p>

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
            </tr>
          </thead>
          <tbody>
            {tries.map((p) => {
              const sousLeSeuil = (p.fields.Stock ?? 0) < (p.fields['Seuil cible'] ?? 0);
              return (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{p.fields.Name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.fields['SKU Pimpit'] ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.fields['SKU Fournisseur'] ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.fields.Fournisseur ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.fields.Boite ?? '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${sousLeSeuil ? 'text-amber-600' : 'text-slate-700'}`}>
                    {p.fields.Stock ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{p.fields['Seuil cible'] ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
