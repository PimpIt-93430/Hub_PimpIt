'use client';

import { useEffect, useMemo, useState } from 'react';

import { sauvegarderReglesLivraison, type RegleLivraison } from '@/lib/regles-livraison';
import type { OptionExpedition } from '@/lib/sendcloud';
import { chargerOptionsExpeditionCompte } from './actions';
import { chargerExpediteur, versSendcloudAddress } from './expedition-commun';

/** Éditeur des règles "mot-clé du mode de livraison → offre Sendcloud précise" (cf. discussion
 * 2026-08-28/29, migré de Boxtal). Le choix se fait dans la liste des offres disponibles sur le
 * compte (interrogée en direct, cf. actions.ts chargerOptionsExpeditionCompte) plutôt qu'en tapant
 * un code à la main — "faudrait mettre le code transporteur comme ça on est sûr y'a pas de
 * problème" : impossible de choisir un code inexistant. */
export function ReglesLivraisonPanel({
  regles,
  onChange,
  onFermer,
}: {
  regles: RegleLivraison[];
  onChange: (regles: RegleLivraison[]) => void;
  onFermer: () => void;
}) {
  const [brouillon, setBrouillon] = useState(regles);
  const [options, setOptions] = useState<OptionExpedition[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    const expediteur = chargerExpediteur();
    if (!expediteur.adresse1) {
      setChargement(false);
      return;
    }
    chargerOptionsExpeditionCompte(versSendcloudAddress(expediteur))
      .then(setOptions)
      .catch(() => setOptions([]))
      .finally(() => setChargement(false));
  }, []);

  const parTransporteur = useMemo(() => {
    const groupes = new Map<string, OptionExpedition[]>();
    for (const o of options) {
      const liste = groupes.get(o.transporteurNom) ?? [];
      liste.push(o);
      groupes.set(o.transporteurNom, liste);
    }
    return [...groupes.entries()];
  }, [options]);

  const sauvegarder = (suivant: RegleLivraison[]) => {
    setBrouillon(suivant);
    onChange(suivant);
    sauvegarderReglesLivraison(suivant);
  };

  const modifier = (id: string, patch: Partial<RegleLivraison>) => {
    sauvegarder(brouillon.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const supprimer = (id: string) => sauvegarder(brouillon.filter((r) => r.id !== id));

  const ajouter = () => {
    sauvegarder([...brouillon, { id: `regle-${Date.now()}`, motCle: '', code: '' }]);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/20" onClick={onFermer}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Règles de livraison</h2>
          <button type="button" onClick={onFermer} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Si le mode de livraison choisi par le client contient ce mot-clé, cette offre précise est utilisée (au lieu
          du simplement moins cher tous transporteurs confondus). Choisie dans la liste des offres Sendcloud
          disponibles sur le compte — pas de saisie libre, donc pas d&apos;erreur possible. Une règle peut être
          réservée aux produits légers (cf. profils d&apos;expédition Shopify).
        </p>

        {chargement && <p className="mb-3 text-xs text-slate-400">Chargement des offres disponibles…</p>}
        {!chargement && options.length === 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            Aucune offre trouvée — renseigne d&apos;abord ton adresse expéditeur (ouvre une commande, section
            &quot;Expéditeur&quot;), puis reviens ici.
          </p>
        )}

        <div className="mb-4 flex flex-col gap-3">
          {brouillon.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-100 p-2.5">
              <div className="flex items-center gap-3">
                <input
                  value={r.motCle}
                  onChange={(e) => modifier(r.id, { motCle: e.target.value })}
                  placeholder="mot-clé (ex. domicile)"
                  className="w-40 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-base focus:border-indigo-300 focus:bg-white focus:outline-none"
                />
                <span className="text-sm text-slate-400">→</span>
                <select
                  value={r.code}
                  onChange={(e) => modifier(r.id, { code: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-base focus:border-indigo-300 focus:bg-white focus:outline-none"
                >
                  <option value="" disabled>
                    Choisir une offre…
                  </option>
                  {parTransporteur.map(([transporteur, offres]) => (
                    <optgroup key={transporteur} label={transporteur}>
                      {offres.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.nom} {o.pointRelaisRequis ? '(point relais)' : ''} ({o.code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => supprimer(r.id)}
                  title="Supprimer cette règle"
                  className="rounded-lg px-2.5 py-1.5 text-lg text-slate-300 hover:bg-red-50 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
              <label className="mt-2 flex items-center gap-1.5 pl-0.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={Boolean(r.legerUniquement)}
                  onChange={(e) => modifier(r.id, { legerUniquement: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Uniquement si produit léger (profil Shopify &quot;Produits Légers&quot;) — sinon colis normal
              </label>
            </div>
          ))}
          {brouillon.length === 0 && <p className="text-sm text-slate-400">Aucune règle — le moins cher est toujours proposé.</p>}
        </div>

        <button
          type="button"
          onClick={ajouter}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
        >
          + Ajouter une règle
        </button>
      </div>
    </div>
  );
}
