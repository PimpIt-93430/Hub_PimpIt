import { chargerComptesQonto } from '@/lib/qonto';
import { exigerAdmin } from '@/lib/roles';

function formatMontant(n: number, devise: string): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: devise });
}

function masquerIban(iban: string): string {
  return iban.length <= 8 ? iban : `${iban.slice(0, 6)} •••• ${iban.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Trésorerie (cf. retour utilisateur du 2026-09-10 : "un truc flux de trésorerie avec Qonto...
 * déjà on va connecter notre compte Qonto... l'affichage du solde de tous nos comptes") — première
 * brique : solde en direct de tous les comptes Qonto. La projection sur 1 an avec les grosses
 * dépenses à venir reste à construire par-dessus (pas encore de table pour les saisir). Réservée
 * aux admins (cf. exigerAdmin, comme Export comptable/Trou) : données financières. */
export default async function TresoreriePage() {
  await exigerAdmin();

  let organisation: Awaited<ReturnType<typeof chargerComptesQonto>> | null = null;
  let erreur: string | null = null;
  try {
    organisation = await chargerComptesQonto();
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Connexion à Qonto échouée.';
  }

  const parDevise = new Map<string, number>();
  for (const c of organisation?.comptes ?? []) {
    parDevise.set(c.devise, (parDevise.get(c.devise) ?? 0) + c.solde);
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Trésorerie</h1>
      <p className="mb-6 text-sm text-slate-400">
        Solde en direct de tous les comptes Qonto — {organisation?.nom ?? '…'}.
      </p>

      {erreur && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          Connexion à Qonto impossible : {erreur}
        </div>
      )}

      {organisation && (
        <>
          <div className="mb-6 flex flex-wrap gap-4">
            {Array.from(parDevise.entries()).map(([devise, total]) => (
              <div key={devise} className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Total {devise} ({organisation.comptes.filter((c) => c.devise === devise).length} compte
                  {organisation.comptes.filter((c) => c.devise === devise).length > 1 ? 's' : ''})
                </p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{formatMontant(total, devise)}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {organisation.comptes.map((c) => (
              <div key={c.id} className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-bold text-slate-900">{c.nom}</p>
                  <div className="flex gap-1.5">
                    {c.externe && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Compte externe
                      </span>
                    )}
                    {c.principal && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Principal</span>
                    )}
                  </div>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{formatMontant(c.solde, c.devise)}</p>
                {c.soldeAutorise !== c.solde && (
                  <p className="mt-0.5 text-xs text-slate-400">Autorisé : {formatMontant(c.soldeAutorise, c.devise)}</p>
                )}
                <p className="mt-3 font-mono text-xs text-slate-400">{masquerIban(c.iban)}</p>
                <p className="mt-2 text-[11px] text-slate-300">Mis à jour le {formatDate(c.majLe)}</p>
              </div>
            ))}
            {organisation.comptes.length === 0 && (
              <p className="text-sm text-slate-400">Aucun compte actif trouvé chez Qonto.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
