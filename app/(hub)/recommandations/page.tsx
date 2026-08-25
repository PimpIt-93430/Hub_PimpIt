import { atGet, TABLES } from '@/lib/airtable';

interface RecoFields {
  Auteur?: string;
  Message?: string;
  Categorie?: string;
}

/** Lecture seule pour l'instant (cf. plan) — même table Airtable que Shopify Pimp IT/admin
 * (T_RECOS), rien n'est créé/modifié ici. */
export default async function RecommandationsPage() {
  const recos = await atGet<RecoFields>(TABLES.RECOS, {
    fields: ['Auteur', 'Message', 'Categorie'],
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Recommandations</h1>
      <p className="mb-6 text-sm text-slate-400">
        {recos.length} recommandations — depuis Airtable, lecture seule pour l&apos;instant.
      </p>

      <div className="flex flex-col gap-2">
        {recos.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">{r.fields.Auteur || 'Anonyme'}</p>
              {r.fields.Categorie && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {r.fields.Categorie}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-500">{r.fields.Message || '—'}</p>
          </div>
        ))}
        {recos.length === 0 && <p className="text-sm text-slate-400">Aucune recommandation.</p>}
      </div>
    </div>
  );
}
