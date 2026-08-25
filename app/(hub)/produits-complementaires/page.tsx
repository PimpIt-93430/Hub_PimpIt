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

interface ProduitComplFields {
  Nom?: string;
  Photo?: AirtableAttachment[];
  Prix?: number;
  Actif?: boolean;
  Description?: string;
}

function formatPrix(prix: number): string {
  return `${prix.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function tronquer(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max)}…` : texte;
}

/** Lecture seule pour l'instant (cf. plan) — même table Airtable que Shopify Pimp IT/admin
 * (T_PRODUITS_COMPL), rien n'est modifié ici. */
export default async function ProduitsComplementairesPage() {
  const produits = await atGet<ProduitComplFields>(TABLES.PRODUITS_COMPL, {
    fields: ['Nom', 'Photo', 'Prix', 'Actif', 'Description'],
  });

  const tries = [...produits].sort((a, b) => (a.fields.Nom ?? '').localeCompare(b.fields.Nom ?? ''));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Produits complémentaires</h1>
      <p className="mb-6 text-sm text-slate-400">
        {produits.length} produits — depuis Airtable, lecture seule pour l&apos;instant.
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
            {tries.map((p) => {
              const thumb = p.fields.Photo?.[0]?.thumbnails?.small?.url;
              const description = p.fields.Description ?? '';
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
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{p.fields.Nom ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {typeof p.fields.Prix === 'number' ? formatPrix(p.fields.Prix) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        p.fields.Actif ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.fields.Actif ? 'Actif' : 'Inactif'}
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
