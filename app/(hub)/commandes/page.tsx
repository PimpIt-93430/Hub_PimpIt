import { chargerCommandes, FOURNISSEURS } from '@/lib/purchase-orders';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function libelleFournisseur(code: string): string {
  return FOURNISSEURS[code]?.label ?? code ?? '—';
}

/** Lecture seule pour l'instant (cf. plan) — lit le miroir Supabase hub_purchase_orders,
 * synchronisé depuis Airtable. Synchronisation initiale partielle : les grosses commandes de
 * réassort (100+ articles) restent à ajouter dans une prochaine synchronisation. */
export default async function CommandesPage() {
  const commandes = await chargerCommandes();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Commandes fournisseurs</h1>
      <p className="mb-6 text-sm text-slate-400">
        {commandes.length} commandes — depuis Supabase (synchronisé depuis Airtable, synchronisation partielle pour l&apos;instant).
      </p>

      <div className="flex flex-col gap-2">
        {commandes.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {c.ref || 'Sans référence'} · {libelleFournisseur(c.supplier)}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {formatDate(c.createdAt)} · {c.nbArticles} article{c.nbArticles > 1 ? 's' : ''} ·{' '}
                {c.quantiteTotale} unités
                {c.label ? ` · ${c.label}` : ''}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                c.status === 'received' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {c.status === 'received' ? 'Reçue' : 'En attente'}
            </span>
          </div>
        ))}
        {commandes.length === 0 && <p className="text-sm text-slate-400">Aucune commande.</p>}
      </div>
    </div>
  );
}
