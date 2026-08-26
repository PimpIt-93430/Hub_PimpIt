'use client';

import { useMemo, useState } from 'react';

import { AlertesModal } from './AlertesModal';
import { PinDrawer } from './PinDrawer';
import type { HubPin } from './types';

type ColonneOptionnelle = 'skuFourn' | 'boite' | 'poids' | 'cible' | 'fourn' | 'custom' | 'site';

const COLONNES_OPTIONNELLES: { cle: ColonneOptionnelle; label: string }[] = [
  { cle: 'skuFourn', label: 'SKU Fournisseur' },
  { cle: 'boite', label: 'Boîte' },
  { cle: 'poids', label: 'Poids' },
  { cle: 'cible', label: 'Seuil cible' },
  { cle: 'fourn', label: 'Fournisseur' },
  { cle: 'custom', label: 'Custom ?' },
  { cle: 'site', label: 'Sur le site' },
];

type CleTri = 'name' | 'sku_pimpit' | 'stock' | 'sku_fournisseur' | 'boite' | 'poids_unitaire' | 'seuil_cible' | 'fournisseur';

/** Réplique l'écran "Database Pin's" de l'ancien admin (renderPins/getVisibleCols/openAlertes de
 * public/index.html) : recherche, tri par colonne, colonnes optionnelles masquées par défaut,
 * badge stock coloré selon le seuil cible, tiroir latéral de création/édition. */
export function PinsClient({ pinsInitiaux }: { pinsInitiaux: HubPin[] }) {
  const [recherche, setRecherche] = useState('');
  const [colonnesVisibles, setColonnesVisibles] = useState<Record<ColonneOptionnelle, boolean>>({
    skuFourn: false,
    boite: false,
    poids: false,
    cible: false,
    fourn: false,
    custom: false,
    site: false,
  });
  const [colDropdownOuvert, setColDropdownOuvert] = useState(false);
  const [triCle, setTriCle] = useState<CleTri>('name');
  const [triDir, setTriDir] = useState<1 | -1>(1);
  const [alertesOuvert, setAlertesOuvert] = useState(false);
  const [drawerOuvert, setDrawerOuvert] = useState(false);
  const [pinEnEdition, setPinEnEdition] = useState<HubPin | null>(null);

  const trierPar = (cle: CleTri) => {
    if (cle === triCle) setTriDir((d) => (d === 1 ? -1 : 1));
    else {
      setTriCle(cle);
      setTriDir(1);
    }
  };

  const pinsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const filtres = q ? pinsInitiaux.filter((p) => (p.name ?? '').toLowerCase().includes(q)) : pinsInitiaux;
    return [...filtres].sort((a, b) => {
      const va = a[triCle];
      const vb = b[triCle];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      // sku_pimpit (et d'autres colonnes) sont du texte en base même quand la valeur est
      // numérique ("1", "10", "100"...) — sans ceci, le tri comparait les chaînes lettre par
      // lettre (1, 10, 100, 2, 20...) au lieu de l'ordre croissant attendu.
      const na = typeof va === 'number' ? va : Number(va);
      const nb = typeof vb === 'number' ? vb : Number(vb);
      if (Number.isFinite(na) && Number.isFinite(nb) && String(va).trim() !== '' && String(vb).trim() !== '') {
        return (na - nb) * triDir;
      }
      return String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) * triDir;
    });
  }, [pinsInitiaux, recherche, triCle, triDir]);

  const flecheTri = (cle: CleTri) => (triCle === cle ? (triDir === 1 ? ' ▲' : ' ▼') : '');

  const ouvrirCreation = () => {
    setPinEnEdition(null);
    setDrawerOuvert(true);
  };
  const ouvrirEdition = (pin: HubPin) => {
    setPinEnEdition(pin);
    setDrawerOuvert(true);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Database Pin&apos;s</h1>
        <p className="mt-1 text-sm text-slate-400">{pinsInitiaux.length} pin&apos;s — Supabase (anciennement Airtable)</p>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un pin's..."
          className="w-60 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setAlertesOuvert(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            🔔 Alertes
          </button>
          <button
            onClick={ouvrirCreation}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Nouveau pin
          </button>
          <div className="relative">
            <button
              onClick={() => setColDropdownOuvert((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Colonnes ▾
            </button>
            {colDropdownOuvert && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setColDropdownOuvert(false)} />
                <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[180px] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  {COLONNES_OPTIONNELLES.map((c) => (
                    <label
                      key={c.cle}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={colonnesVisibles[c.cle]}
                        onChange={(e) => setColonnesVisibles((cv) => ({ ...cv, [c.cle]: e.target.checked }))}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3" />
              <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3" onClick={() => trierPar('name')}>
                Nom{flecheTri('name')}
              </th>
              <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3" onClick={() => trierPar('sku_pimpit')}>
                SKU Pimpit{flecheTri('sku_pimpit')}
              </th>
              <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3" onClick={() => trierPar('stock')}>
                Stock{flecheTri('stock')}
              </th>
              {colonnesVisibles.skuFourn && (
                <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3" onClick={() => trierPar('sku_fournisseur')}>
                  SKU Fourn.{flecheTri('sku_fournisseur')}
                </th>
              )}
              {colonnesVisibles.boite && (
                <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3" onClick={() => trierPar('boite')}>
                  Boîte{flecheTri('boite')}
                </th>
              )}
              {colonnesVisibles.poids && (
                <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3" onClick={() => trierPar('poids_unitaire')}>
                  Poids{flecheTri('poids_unitaire')}
                </th>
              )}
              {colonnesVisibles.cible && (
                <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3" onClick={() => trierPar('seuil_cible')}>
                  Seuil cible{flecheTri('seuil_cible')}
                </th>
              )}
              {colonnesVisibles.fourn && (
                <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3" onClick={() => trierPar('fournisseur')}>
                  Fournisseur{flecheTri('fournisseur')}
                </th>
              )}
              {colonnesVisibles.custom && <th className="whitespace-nowrap px-4 py-3">Custom</th>}
              {colonnesVisibles.site && <th className="whitespace-nowrap px-4 py-3">Sur le site</th>}
            </tr>
          </thead>
          <tbody>
            {pinsFiltres.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-400">
                  Aucun résultat
                </td>
              </tr>
            ) : (
              pinsFiltres.map((p) => {
                const stock = Math.round(p.stock ?? 0);
                const seuil = p.seuil_cible ?? 0;
                const bas = stock <= seuil * 0.25;
                return (
                  <tr
                    key={p.airtable_id}
                    onClick={() => ouvrirEdition(p)}
                    className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-2.5">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt="" className="h-9 w-9 rounded-md object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-md bg-slate-100" />
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{p.name ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                        {p.sku_pimpit ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${bas ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}
                      >
                        {stock}
                      </span>
                    </td>
                    {colonnesVisibles.skuFourn && <td className="px-4 py-2.5 text-slate-500">{p.sku_fournisseur ?? '—'}</td>}
                    {colonnesVisibles.boite && <td className="px-4 py-2.5 text-slate-500">{p.boite ?? '—'}</td>}
                    {colonnesVisibles.poids && <td className="px-4 py-2.5 text-slate-500">{p.poids_unitaire ?? '—'}</td>}
                    {colonnesVisibles.cible && <td className="px-4 py-2.5 text-slate-500">{p.seuil_cible ?? '—'}</td>}
                    {colonnesVisibles.fourn && <td className="px-4 py-2.5 text-slate-500">{p.fournisseur ?? '—'}</td>}
                    {colonnesVisibles.custom && <td className="px-4 py-2.5">{p.custom ? '✓' : ''}</td>}
                    {colonnesVisibles.site && (
                      <td className="px-4 py-2.5">
                        {p.pas_dans_unite ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Non</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Oui</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {alertesOuvert && <AlertesModal pins={pinsInitiaux} onClose={() => setAlertesOuvert(false)} />}
      {drawerOuvert && <PinDrawer pin={pinEnEdition} onClose={() => setDrawerOuvert(false)} />}
    </div>
  );
}
