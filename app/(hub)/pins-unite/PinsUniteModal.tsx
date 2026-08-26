'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { ajouterVarianteAProduitExistant, chargerProduitsUniteExistants, creerProduitUnite } from './actions';
import { PinsUniteSelector } from './PinsUniteSelector';

interface PinOption {
  airtable_id: string;
  name: string | null;
  sku_pimpit: string | null;
  image_url: string | null;
}
interface CollectionOption {
  id: string;
  title: string;
  handle: string;
}
interface ProduitUniteExistant {
  id: string;
  title: string;
  variantCount: number;
  image: string;
}

const champLabel = 'mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400';
const champInput = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400';
const TITRE_DEFAUT = "Pin's pour Clogs - ";

type Etape = 'choix' | 'creer' | 'ajouter-a' | 'ajouter-b';

/** Réplique le tiroir "Produits Pin's à l'unité" de l'ancien admin (unite-modal dans
 * public/index.html) : un menu de choix (unite-step0) entre "Créer un nouveau produit"
 * (unite-step-create) et "Ajouter un pin's à un produit existant" (unite-step-add). L'option
 * "Propositions IA" de l'ancien site n'est pas reprise (appel payant à un service tiers). */
export function PinsUniteModal({
  pinsARajouter,
  autresPins,
  collections,
  onCree,
}: {
  pinsARajouter: PinOption[];
  autresPins: PinOption[];
  collections: CollectionOption[];
  onCree: (url: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etape, setEtape] = useState<Etape>('choix');

  if (!ouvert) {
    return (
      <button
        onClick={() => {
          setEtape('choix');
          setOuvert(true);
        }}
        className="mb-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        + Nouveaux produits pin&apos;s à l&apos;unité
      </button>
    );
  }

  const titres: Record<Etape, string> = {
    choix: "Produits Pin's à l'unité",
    creer: 'Créer un nouveau produit',
    'ajouter-a': 'Ajouter à un produit existant',
    'ajouter-b': 'Ajouter à un produit existant',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={(e) => e.target === e.currentTarget && setOuvert(false)}>
      <div className="flex max-h-[85vh] w-[640px] max-w-full flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <p className="text-lg font-bold text-slate-900">{titres[etape]}</p>
          <button onClick={() => setOuvert(false)} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {etape === 'choix' && <EtapeChoix onChoisir={setEtape} />}
          {etape === 'creer' && (
            <EtapeCreer
              pinsARajouter={pinsARajouter}
              autresPins={autresPins}
              collections={collections}
              onRetour={() => setEtape('choix')}
              onCree={(url) => {
                setOuvert(false);
                onCree(url);
              }}
            />
          )}
          {(etape === 'ajouter-a' || etape === 'ajouter-b') && (
            <EtapeAjouter
              etape={etape}
              pinsARajouter={pinsARajouter}
              onEtape={setEtape}
              onRetourChoix={() => setEtape('choix')}
              onAjoute={(url) => {
                setOuvert(false);
                onCree(url);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EtapeChoix({ onChoisir }: { onChoisir: (e: Etape) => void }) {
  return (
    <div className="flex flex-col gap-3 p-6">
      <button
        onClick={() => onChoisir('creer')}
        className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
      >
        <span className="text-2xl">📦</span>
        <span>
          <span className="block text-sm font-semibold text-slate-900">Créer un nouveau produit</span>
          <span className="block text-xs text-slate-400">Sélectionner des pin&apos;s et créer un nouveau produit Shopify</span>
        </span>
      </button>
      <button
        onClick={() => onChoisir('ajouter-a')}
        className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
      >
        <span className="text-2xl">➕</span>
        <span>
          <span className="block text-sm font-semibold text-slate-900">Ajouter un pin&apos;s à un produit existant</span>
          <span className="block text-xs text-slate-400">Ajouter une variante à un produit déjà en ligne</span>
        </span>
      </button>
    </div>
  );
}

function EtapeCreer({
  pinsARajouter,
  autresPins,
  collections,
  onRetour,
  onCree,
}: {
  pinsARajouter: PinOption[];
  autresPins: PinOption[];
  collections: CollectionOption[];
  onRetour: () => void;
  onCree: (url: string) => void;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  // Réplique unite-ia-section de l'ancien site : Description/SEO/Tags/Collections restent
  // repliés tant qu'on n'a pas cliqué le bouton — sur l'ancien site ce bouton appelait un service
  // IA payant pour pré-remplir ces champs ; ici, sans backend IA, il se contente de les révéler
  // vides pour un remplissage manuel (le reste du comportement — ordre des champs, repli par
  // défaut, bouton "Créer sur Shopify" toujours accessible sans avoir à déplier — est identique).
  const [detailsDepliés, setDetailsDepliés] = useState(false);
  const [collectionsCochees, setCollectionsCochees] = useState<Set<string>>(new Set());

  function basculerCollection(id: string) {
    setCollectionsCochees((s) => {
      const copie = new Set(s);
      if (copie.has(id)) copie.delete(id);
      else copie.add(id);
      return copie;
    });
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setErreur(null);
        demarrer(async () => {
          try {
            const { shopifyUrl } = await creerProduitUnite(formData);
            onCree(shopifyUrl);
          } catch (e) {
            setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
          }
        });
      }}
      className="flex flex-col gap-4 px-6 py-6"
    >
      <input type="hidden" name="collection_ids" value={JSON.stringify([...collectionsCochees])} />

      <button type="button" onClick={onRetour} className="w-fit text-xs font-semibold text-slate-500 hover:text-slate-900">
        ← Retour
      </button>

      <PinsUniteSelector pinsARajouter={pinsARajouter} autresPins={autresPins} />

      <div>
        <p className={champLabel}>Nom du produit</p>
        <input name="titre" defaultValue={TITRE_DEFAUT} required className={champInput} />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setDetailsDepliés(true)}
          disabled={detailsDepliés}
          className="rounded-lg border border-indigo-200 px-3.5 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
        >
          + Description, SEO, tags, collections
        </button>
      </div>

      {detailsDepliés && (
        <>
          <div>
            <p className={champLabel}>Description</p>
            <textarea name="description" rows={4} className={`${champInput} resize-y`} />
          </div>

          <div>
            <p className={champLabel}>
              Balise SEO titre <span className="font-normal normal-case text-slate-400">(50-60 car.)</span>
            </p>
            <input name="meta_titre" defaultValue={TITRE_DEFAUT} className={champInput} />
          </div>

          <div>
            <p className={champLabel}>
              Balise SEO description <span className="font-normal normal-case text-slate-400">(150-160 car.)</span>
            </p>
            <textarea name="meta_description" rows={2} className={`${champInput} resize-y`} />
          </div>

          <div>
            <p className={champLabel}>Tags</p>
            <input name="tags" placeholder="tag1, tag2…" className={champInput} />
          </div>

          {collections.length > 0 && (
            <div>
              <p className={champLabel}>Collections</p>
              <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2.5">
                {collections.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
                    <input
                      type="checkbox"
                      disabled={c.handle === 'tous-les-pins'}
                      checked={c.handle === 'tous-les-pins' || collectionsCochees.has(c.id)}
                      onChange={() => basculerCollection(c.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    {c.title}
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={onRetour} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50">
          Annuler
        </button>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {enCours ? 'Création…' : 'Créer sur Shopify'}
        </button>
      </div>
    </form>
  );
}

function EtapeAjouter({
  etape,
  pinsARajouter,
  onEtape,
  onRetourChoix,
  onAjoute,
}: {
  etape: 'ajouter-a' | 'ajouter-b';
  pinsARajouter: PinOption[];
  onEtape: (e: Etape) => void;
  onRetourChoix: () => void;
  onAjoute: (url: string) => void;
}) {
  const [rechercheA, setRechercheA] = useState('');
  const [pinChoisi, setPinChoisi] = useState<PinOption | null>(null);

  const [produits, setProduits] = useState<ProduitUniteExistant[] | null>(null);
  const [rechercheB, setRechercheB] = useState('');
  const [produitChoisi, setProduitChoisi] = useState<ProduitUniteExistant | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [urlSucces, setUrlSucces] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    if (etape !== 'ajouter-b' || produits !== null) return;
    chargerProduitsUniteExistants()
      .then(setProduits)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur de chargement'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape]);

  const pinsFiltres = useMemo(() => {
    const q = rechercheA.trim().toLowerCase();
    return q ? pinsARajouter.filter((p) => (p.name ?? '').toLowerCase().includes(q)) : pinsARajouter;
  }, [pinsARajouter, rechercheA]);

  const produitsFiltres = useMemo(() => {
    if (!produits) return [];
    const q = rechercheB.trim().toLowerCase();
    return q ? produits.filter((p) => p.title.toLowerCase().includes(q)) : produits;
  }, [produits, rechercheB]);

  function choisirPin(p: PinOption) {
    setPinChoisi(p);
    setProduitChoisi(null);
    setUrlSucces(null);
    setErreur(null);
    onEtape('ajouter-b');
  }

  function valider() {
    if (!pinChoisi || !produitChoisi) return;
    setErreur(null);
    demarrer(async () => {
      try {
        const { shopifyUrl } = await ajouterVarianteAProduitExistant(pinChoisi.airtable_id, produitChoisi.id);
        setUrlSucces(shopifyUrl);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
      }
    });
  }

  if (etape === 'ajouter-a') {
    return (
      <div className="flex flex-col gap-3 px-6 py-6">
        <button onClick={onRetourChoix} className="w-fit text-xs font-semibold text-slate-500 hover:text-slate-900">
          ← Retour
        </button>
        <p className={champLabel}>Choisir un pin&apos;s (pas encore dans un produit)</p>
        <input
          value={rechercheA}
          onChange={(e) => setRechercheA(e.target.value)}
          placeholder="Rechercher…"
          className={champInput}
        />
        <div className="max-h-[340px] overflow-y-auto rounded-lg border border-slate-200 p-1">
          {pinsFiltres.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">Tous les pin&apos;s sont déjà dans des produits</p>
          ) : (
            pinsFiltres.map((p) => (
              <button
                key={p.airtable_id}
                onClick={() => choisirPin(p)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
              >
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-7 w-7 shrink-0 rounded-md bg-slate-100" />
                )}
                <span className="font-medium text-slate-800">{p.name}</span>
                {p.sku_pimpit && <span className="ml-auto text-xs text-slate-400">#{p.sku_pimpit}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-6 py-6">
      <div className="flex items-center gap-2.5">
        <button onClick={() => onEtape('ajouter-a')} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
          ← Retour
        </button>
        {pinChoisi && (
          <span className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800">
            {pinChoisi.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pinChoisi.image_url} alt="" className="h-5 w-5 rounded object-cover" />
            )}
            {pinChoisi.name}
          </span>
        )}
      </div>

      {urlSucces ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed">
          <p className="font-bold text-emerald-800">Variante ajoutée au prix de 2 € ✓</p>
          <p className="mt-1 text-emerald-700">
            N&apos;oublie pas de modifier les photos de ce produit —{' '}
            <a href={urlSucces} target="_blank" rel="noreferrer" className="font-semibold underline">
              Ouvrir le produit sur Shopify →
            </a>
          </p>
          <button
            onClick={() => onAjoute(urlSucces)}
            className="mt-3 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Fermer
          </button>
        </div>
      ) : (
        <>
          <p className={champLabel}>Choisir un produit</p>
          <input
            value={rechercheB}
            onChange={(e) => setRechercheB(e.target.value)}
            placeholder="Rechercher un produit…"
            className={champInput}
          />
          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 p-1">
            {produits === null ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">Chargement…</p>
            ) : produitsFiltres.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">Aucun produit trouvé</p>
            ) : (
              produitsFiltres.map((p) => {
                const sel = produitChoisi?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setProduitChoisi(p)}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left text-sm ${
                      sel ? 'border-emerald-400 bg-emerald-50' : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded-md bg-slate-100" />
                    )}
                    <span className="font-medium text-slate-800">{p.title}</span>
                    <span className="ml-auto whitespace-nowrap text-xs text-slate-400">
                      {p.variantCount} variante{p.variantCount > 1 ? 's' : ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {erreur && <p className="text-sm text-red-600">{erreur}</p>}

          <div className="flex justify-end">
            <button
              onClick={valider}
              disabled={!produitChoisi || enCours}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {enCours ? 'Ajout en cours…' : 'Ajouter la variante →'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
