'use client';

import { useMemo, useState, useTransition } from 'react';

import { definirPrixFournisseur, definirPrixFournisseurEnMasse } from './actions';
import { PRIX_FOURNISSEUR_VALEURS, type PinPrix } from './types';

function formatPrix(p: number): string {
  return p.toFixed(2).replace('.', ',') + ' €';
}

type Filtre = 'tous' | 'non_defini' | number;

/** Sélecteur rapide des 5 prix autorisés — un clic = enregistré tout de suite (mise à jour
 * optimiste locale, revert si l'appel serveur échoue). Cf. retour utilisateur du 2026-09-15 :
 * "faut que ce soit rapide". */
function SelecteurPrix({
  valeur,
  enCours,
  onChoisir,
}: {
  valeur: number | null;
  enCours: boolean;
  onChoisir: (prix: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRIX_FOURNISSEUR_VALEURS.map((prix) => {
        const actif = valeur === prix;
        return (
          <button
            key={prix}
            disabled={enCours}
            onClick={(e) => {
              e.stopPropagation();
              onChoisir(prix);
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
              actif ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {formatPrix(prix)}
          </button>
        );
      })}
    </div>
  );
}

export function PrixPinsClient({ pinsInitiaux }: { pinsInitiaux: PinPrix[] }) {
  const [pins, setPins] = useState(pinsInitiaux);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [idEnCours, setIdEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const pinsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return pins.filter((p) => {
      if (q && !(p.nom ?? '').toLowerCase().includes(q)) return false;
      if (filtre === 'tous') return true;
      if (filtre === 'non_defini') return p.prix_fournisseur === null;
      return p.prix_fournisseur === filtre;
    });
  }, [pins, recherche, filtre]);

  const nonDefinis = pins.filter((p) => p.prix_fournisseur === null).length;

  const appliquerLocalement = (ids: string[], prix: number) => {
    setPins((ps) => ps.map((p) => (ids.includes(p.id) ? { ...p, prix_fournisseur: prix } : p)));
  };

  const choisirPrix = (id: string, prix: number) => {
    const avant = pins.find((p) => p.id === id)?.prix_fournisseur ?? null;
    setErreur(null);
    setIdEnCours(id);
    appliquerLocalement([id], prix);
    startTransition(async () => {
      try {
        await definirPrixFournisseur(id, prix);
      } catch (e) {
        appliquerLocalement([id], avant as number);
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      } finally {
        setIdEnCours(null);
      }
    });
  };

  const appliquerEnMasse = (prix: number) => {
    const ids = [...selection];
    if (ids.length === 0) return;
    const avant = new Map(pins.map((p) => [p.id, p.prix_fournisseur]));
    setErreur(null);
    appliquerLocalement(ids, prix);
    startTransition(async () => {
      try {
        await definirPrixFournisseurEnMasse(ids, prix);
        setSelection(new Set());
      } catch (e) {
        setPins((ps) => ps.map((p) => (ids.includes(p.id) ? { ...p, prix_fournisseur: avant.get(p.id) ?? null } : p)));
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  };

  const basculerSelection = (id: string) => {
    setSelection((s) => {
      const copie = new Set(s);
      if (copie.has(id)) copie.delete(id);
      else copie.add(id);
      return copie;
    });
  };

  const toutSelectionner = () => setSelection(new Set(pinsFiltres.map((p) => p.id)));
  const toutDeselectionner = () => setSelection(new Set());

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Prix fournisseurs des pin&apos;s</h1>
        <p className="mt-1 text-sm text-slate-400">
          {pins.length} pin&apos;s
          {nonDefinis > 0 && <span className="font-semibold text-red-500"> · {nonDefinis} sans prix</span>}
        </p>
      </div>

      {erreur && (
        <div className="mb-3.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm text-red-700">{erreur}</div>
      )}

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un pin's..."
          className="w-60 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFiltre('tous')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${filtre === 'tous' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Tous
          </button>
          <button
            onClick={() => setFiltre('non_defini')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${filtre === 'non_defini' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Sans prix
          </button>
          {PRIX_FOURNISSEUR_VALEURS.map((prix) => (
            <button
              key={prix}
              onClick={() => setFiltre(prix)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filtre === prix ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Actuellement {formatPrix(prix)}
            </button>
          ))}
        </div>
      </div>

      <div className="sticky top-0 z-10 mb-3.5 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="text-sm text-slate-500">
          {selection.size > 0 ? `${selection.size} sélectionné(s)` : `${pinsFiltres.length} affiché(s)`}
        </span>
        <button onClick={toutSelectionner} className="text-xs font-medium text-indigo-600 hover:underline">
          Tout sélectionner
        </button>
        {selection.size > 0 && (
          <button onClick={toutDeselectionner} className="text-xs font-medium text-slate-400 hover:underline">
            Désélectionner
          </button>
        )}
        {selection.size > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Appliquer :</span>
            {PRIX_FOURNISSEUR_VALEURS.map((prix) => (
              <button
                key={prix}
                onClick={() => appliquerEnMasse(prix)}
                className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                {formatPrix(prix)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {pinsFiltres.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Aucun résultat</p>
        ) : (
          pinsFiltres.map((p) => (
            <div
              key={p.id}
              onClick={() => basculerSelection(p.id)}
              className={`flex cursor-pointer items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0 hover:bg-slate-50/60 ${
                selection.has(p.id) ? 'bg-indigo-50/50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selection.has(p.id)}
                onChange={() => basculerSelection(p.id)}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 shrink-0"
              />
              {p.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-11 w-11 shrink-0 rounded-md bg-slate-100" />
              )}
              {/* Sélecteur juste après l'image (retour utilisateur du 2026-09-15 : "ils sont aux
                  deux extrémités je me fie mal aux yeux à voir quelle image est à quel prix") —
                  nom/SKU relégués à droite, moins critiques à associer visuellement à l'image. */}
              <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                <SelecteurPrix
                  valeur={p.prix_fournisseur}
                  enCours={idEnCours === p.id}
                  onChoisir={(prix) => choisirPrix(p.id, prix)}
                />
              </div>
              <div className="min-w-0 flex-1 text-right">
                <p className="truncate font-medium text-slate-900">{p.nom ?? '—'}</p>
                <p className="text-xs text-slate-400">
                  SKU {p.sku_pimpit ?? '—'}
                  {p.custom && <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Custom</span>}
                  {p.prix_fournisseur === null && (
                    <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Sans prix</span>
                  )}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
