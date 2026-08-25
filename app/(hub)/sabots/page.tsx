import { atGet, TABLES } from '@/lib/airtable';

interface SabotFields {
  Couleur?: string;
  Taille?: string;
  Stock?: number;
  SKU?: string;
  'Inventory Item ID'?: string | number;
}

/** Lecture seule pour l'instant (cf. plan) — même table Airtable que Shopify Pimp IT/admin
 * (T_SABOTS), rien n'est modifié ici. */
export default async function SabotsPage() {
  const sabots = await atGet<SabotFields>(TABLES.SABOTS, {
    fields: ['Couleur', 'Taille', 'Stock', 'SKU', 'Inventory Item ID'],
  });

  const tries = [...sabots].sort((a, b) => {
    const couleur = (a.fields.Couleur ?? '').localeCompare(b.fields.Couleur ?? '');
    if (couleur !== 0) return couleur;
    return (a.fields.Taille ?? '').localeCompare(b.fields.Taille ?? '');
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Sabots</h1>
      <p className="mb-6 text-sm text-slate-400">
        {sabots.length} sabots — depuis Airtable, lecture seule pour l&apos;instant.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Couleur</th>
              <th className="px-4 py-3">Taille</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Stock</th>
            </tr>
          </thead>
          <tbody>
            {tries.map((s) => (
              <tr key={s.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-slate-800">{s.fields.Couleur ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.fields.Taille ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.fields.SKU ?? '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{s.fields.Stock ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
