import { atGet, TABLES } from '@/lib/airtable';

interface AirtableAttachment {
  id: string;
  url: string;
  thumbnails?: {
    small?: { url: string; width: number; height: number };
    large?: { url: string; width: number; height: number };
  };
}

interface SabotCustomFields {
  Nom?: string;
  'SKU Shopify'?: string;
  "Pin's inclus"?: string[];
  'Qtes pins'?: string;
  'Shopify Product ID'?: string | number;
  Photo?: AirtableAttachment[];
}

/** Lecture seule pour l'instant (cf. plan) — même table Airtable que Shopify Pimp IT/admin
 * (T_SABOTS_CUSTOM), rien n'est modifié ici. */
export default async function SabotsCustomPage() {
  const sabotsCustom = await atGet<SabotCustomFields>(TABLES.SABOTS_CUSTOM, {
    fields: ['Nom', 'SKU Shopify', "Pin's inclus", 'Qtes pins', 'Shopify Product ID', 'Photo'],
  });

  const tries = [...sabotsCustom].sort((a, b) => (a.fields.Nom ?? '').localeCompare(b.fields.Nom ?? ''));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Sabots personnalisés</h1>
      <p className="mb-6 text-sm text-slate-400">
        {sabotsCustom.length} sabots personnalisés — depuis Airtable, lecture seule pour l&apos;instant.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Photo</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">SKU Shopify</th>
              <th className="px-4 py-3">Pin&apos;s inclus</th>
            </tr>
          </thead>
          <tbody>
            {tries.map((s) => {
              const vignette = s.fields.Photo?.[0]?.thumbnails?.small?.url;
              const nbPins = comptePins(s.fields);
              return (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5">
                    {vignette ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={vignette} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{s.fields.Nom ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{s.fields['SKU Shopify'] ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {nbPins > 0 ? `${nbPins} pin${nbPins > 1 ? "'s" : "'"}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "Qtes pins" est un tableau JSON encodé dans un champ texte (même convention que le champ
 * "Articles" des commandes fournisseur, cf. lib/purchase-orders.ts) : on additionne les quantités
 * s'il est exploitable, sinon on retombe sur le nombre de pin's liés plutôt que de faire échouer
 * l'affichage. */
function comptePins(f: SabotCustomFields): number {
  const raw = f['Qtes pins'];
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const total = parsed.reduce((somme: number, item) => {
          const qty = typeof item === 'object' && item ? Number((item as Record<string, unknown>).qty ?? 0) : Number(item);
          return somme + (Number.isFinite(qty) ? qty : 0);
        }, 0);
        if (total > 0) return total;
      }
    } catch {
      // Champ vide ou format inattendu : on retombe sur le nombre de pin's liés.
    }
  }
  return (f["Pin's inclus"] ?? []).length;
}
