import { atGet, TABLES } from '@/lib/airtable';

interface AirtableThumbnail {
  url: string;
  width: number;
  height: number;
}

interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  thumbnails?: {
    small?: AirtableThumbnail;
    large?: AirtableThumbnail;
    full?: AirtableThumbnail;
  };
}

interface PackFields {
  'Nom du pack'?: string;
  Photo?: AirtableAttachment[];
  'SKU Shopify'?: string;
  'Pins inclus'?: string[];
  'Stock max'?: number;
  'Qtes pins'?: string;
  Probleme?: boolean;
}

/** `Qtes pins` est un objet JSON encodé dans un champ texte, ex. {"recXXX": 2, "recYYY": 1} —
 * une quantité par pin lié (contrairement à `Articles` sur les commandes fournisseurs, qui est un
 * tableau). On parse défensivement pour ne pas faire échouer tout l'affichage sur un format
 * inattendu. */
function quantiteTotalePins(qtesPins: string | undefined): number | null {
  if (!qtesPins) return null;
  try {
    const parsed = JSON.parse(qtesPins);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.values(parsed as Record<string, number>).reduce(
        (s, q) => s + (typeof q === 'number' ? q : 0),
        0,
      );
    }
  } catch {
    // Champ vide ou format inattendu : on retombe sur "inconnu" plutôt que de faire échouer tout
    // l'affichage.
  }
  return null;
}

/** Lecture seule pour l'instant (cf. plan) — même table Airtable que Shopify Pimp IT/admin
 * (packs de pin's), rien n'est créé/modifié ici. */
export default async function PacksPage() {
  const packs = await atGet<PackFields>(TABLES.PACKS, {
    fields: ['Nom du pack', 'Photo', 'SKU Shopify', 'Pins inclus', 'Stock max', 'Qtes pins', 'Probleme'],
  });

  const tries = [...packs].sort((a, b) =>
    (a.fields['Nom du pack'] ?? '').localeCompare(b.fields['Nom du pack'] ?? ''),
  );

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Packs de pin&apos;s</h1>
      <p className="mb-6 text-sm text-slate-400">
        {packs.length} packs — depuis Airtable, lecture seule pour l&apos;instant.
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
            {tries.map((p) => {
              const thumb = p.fields.Photo?.[0]?.thumbnails?.small?.url;
              const nbPins = p.fields['Pins inclus']?.length ?? 0;
              const qteTotale = quantiteTotalePins(p.fields['Qtes pins']);
              const probleme = Boolean(p.fields.Probleme);
              return (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-8 w-8 rounded-lg object-cover" />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{p.fields['Nom du pack'] ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.fields['SKU Shopify'] ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{nbPins || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{qteTotale ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{p.fields['Stock max'] ?? '—'}</td>
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
