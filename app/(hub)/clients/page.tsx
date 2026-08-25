import { atGet, TABLES } from '@/lib/airtable';

interface ClientFields {
  Email?: string;
  'Prénom'?: string;
  Nom?: string;
  'Téléphone'?: string;
  Ville?: string;
  'Code postal'?: string;
  Source?: string;
  'Date inscription'?: string;
  'Nb commandes'?: number;
  'Total dépensé'?: number;
}

const COULEURS_SOURCE: Record<string, string> = {
  TikTok: 'bg-slate-900 text-white',
  Site: 'bg-sky-50 text-sky-700',
  POS: 'bg-violet-50 text-violet-700',
  Import: 'bg-amber-50 text-amber-700',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMontant(montant: number): string {
  return `${montant.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Lecture seule pour l'instant (cf. plan) — même table Airtable que Shopify Pimp IT/admin
 * (T_CLIENTS), rien n'est modifié ici. */
export default async function ClientsPage() {
  const clients = await atGet<ClientFields>(TABLES.CLIENTS, {
    fields: [
      'Email',
      'Prénom',
      'Nom',
      'Téléphone',
      'Ville',
      'Code postal',
      'Source',
      'Date inscription',
      'Nb commandes',
      'Total dépensé',
    ],
  });

  const tries = [...clients].sort((a, b) => {
    const da = a.fields['Date inscription'] ? new Date(a.fields['Date inscription']).getTime() : 0;
    const db = b.fields['Date inscription'] ? new Date(b.fields['Date inscription']).getTime() : 0;
    return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Clients</h1>
      <p className="mb-6 text-sm text-slate-400">
        {clients.length} clients — depuis Airtable, lecture seule pour l&apos;instant.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Téléphone</th>
              <th className="px-4 py-3">Ville</th>
              <th className="px-4 py-3">Code postal</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Inscription</th>
              <th className="px-4 py-3 text-right">Commandes</th>
              <th className="px-4 py-3 text-right">Total dépensé</th>
            </tr>
          </thead>
          <tbody>
            {tries.map((c) => {
              const nomComplet = [c.fields['Prénom'], c.fields.Nom].filter(Boolean).join(' ');
              return (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{nomComplet || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{c.fields.Email ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{c.fields['Téléphone'] ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{c.fields.Ville ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">{c.fields['Code postal'] ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {c.fields.Source ? (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          COULEURS_SOURCE[c.fields.Source] ?? 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {c.fields.Source}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {c.fields['Date inscription'] ? formatDate(c.fields['Date inscription']) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{c.fields['Nb commandes'] ?? 0}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {typeof c.fields['Total dépensé'] === 'number' ? formatMontant(c.fields['Total dépensé']) : '—'}
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
