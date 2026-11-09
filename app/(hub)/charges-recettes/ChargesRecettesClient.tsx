'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import {
  ajouterLigneFinance,
  enregistrerParametresFinance,
  modifierLigneFinance,
  supprimerLigneFinance,
  type FrequenceLigneFinance,
  type LigneFinance,
  type ParametresFinance,
  type TypeLigneFinance,
} from './actions';

// Calcul du point mort : la marge brute (en % du CA HT — 100 % = aucun coût d'achat déduit) doit
// couvrir les charges fixes moins les recettes fixes ; on repasse ensuite en TTC (les ventes SumUp
// et espèces sont TTC) avec le taux de TVA.

const CATEGORIES_CHARGES = [
  { value: 'loyer', label: 'Loyer / emplacement' },
  { value: 'salaires', label: 'Salaires' },
  { value: 'charges_sociales', label: 'Charges sociales' },
  { value: 'abonnements', label: 'Abonnements / logiciels' },
  { value: 'assurances', label: 'Assurances' },
  { value: 'transport', label: 'Transport / véhicule' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'banque', label: 'Banque / crédits' },
  { value: 'autre', label: 'Autre' },
];

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function libelleCategorie(value: string) {
  return CATEGORIES_CHARGES.find((c) => c.value === value)?.label ?? 'Autre';
}

function euros(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function lireNombre(texte: string) {
  return Number(texte.replace(/\s/g, '').replace(',', '.'));
}

function parMois(l: LigneFinance) {
  return l.frequence === 'annuelle' ? l.montant / 12 : l.montant;
}

function decalerMois(mois: string, delta: number) {
  const [a, m] = mois.split('-').map(Number);
  const total = a * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function Tuile({ label, valeur, sous, ton }: { label: string; valeur: string; sous?: string; ton?: 'primaire' | 'positif' | 'negatif' }) {
  const primaire = ton === 'primaire';
  return (
    <div
      className={`min-w-[180px] flex-1 rounded-[20px] border p-5 shadow-sm ${
        primaire ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-white'
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${primaire ? 'text-indigo-200' : 'text-slate-400'}`}>{label}</p>
      <p
        className={`mt-1 text-3xl font-bold tabular-nums ${
          primaire ? 'text-white' : ton === 'positif' ? 'text-emerald-600' : ton === 'negatif' ? 'text-red-600' : 'text-slate-900'
        }`}
      >
        {valeur}
      </p>
      {sous && <p className={`mt-1 text-xs ${primaire ? 'text-indigo-200' : 'text-slate-400'}`}>{sous}</p>}
    </div>
  );
}

function Formulaire({
  type,
  ligneEditee,
  onFini,
}: {
  type: TypeLigneFinance;
  ligneEditee: LigneFinance | null;
  onFini: () => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [libelle, setLibelle] = useState(ligneEditee?.libelle ?? '');
  const [montant, setMontant] = useState(ligneEditee ? String(ligneEditee.montant).replace('.', ',') : '');
  const [frequence, setFrequence] = useState<FrequenceLigneFinance>(ligneEditee?.frequence ?? 'mensuelle');
  const [categorie, setCategorie] = useState(ligneEditee?.categorie ?? 'autre');

  const valeur = lireNombre(montant);
  const valide = libelle.trim() !== '' && montant.trim() !== '' && Number.isFinite(valeur) && valeur >= 0;

  const enregistrer = () => {
    if (!valide) return;
    setErreur(null);
    demarrer(async () => {
      try {
        const params = { type, libelle, montant: valeur, frequence, categorie: type === 'charge' ? categorie : 'autre' };
        if (ligneEditee) await modifierLigneFinance(ligneEditee.id, params);
        else await ajouterLigneFinance(params);
        setLibelle('');
        setMontant('');
        setFrequence('mensuelle');
        setCategorie('autre');
        onFini();
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec de l'enregistrement.");
      }
    });
  };

  const puce = (actif: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${
      actif ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
    }`;

  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        enregistrer();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder={type === 'charge' ? 'Ex. Loyer Carré Sénart' : 'Ex. Sous-location'}
          className="min-w-[180px] flex-[2] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          placeholder="Montant €"
          inputMode="decimal"
          className="w-32 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['mensuelle', 'annuelle'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFrequence(f)} className={puce(frequence === f)}>
            {f === 'mensuelle' ? 'Par mois' : 'Par an'}
          </button>
        ))}
      </div>
      {type === 'charge' && (
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES_CHARGES.map((c) => (
            <button key={c.value} type="button" onClick={() => setCategorie(c.value)} className={puce(categorie === c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        {ligneEditee && (
          <button type="button" onClick={onFini} className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
            Annuler
          </button>
        )}
        <button
          type="submit"
          disabled={!valide || enCours}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {enCours ? 'Enregistrement…' : ligneEditee ? 'Enregistrer' : type === 'charge' ? 'Ajouter la charge' : 'Ajouter la recette'}
        </button>
      </div>
      {erreur && <p className="text-sm font-semibold text-red-600">{erreur}</p>}
    </form>
  );
}

function BlocLignes({ type, lignes }: { type: TypeLigneFinance; lignes: LigneFinance[] }) {
  const router = useRouter();
  const [ligneEditee, setLigneEditee] = useState<LigneFinance | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [, demarrer] = useTransition();

  const groupes = useMemo(() => {
    const map = new Map<string, LigneFinance[]>();
    for (const l of lignes) {
      const cle = type === 'charge' ? l.categorie : 'autre';
      map.set(cle, [...(map.get(cle) ?? []), l]);
    }
    return Array.from(map.entries())
      .map(([categorie, liste]) => ({ categorie, liste, total: liste.reduce((s, l) => s + parMois(l), 0) }))
      .sort((a, b) => b.total - a.total);
  }, [lignes, type]);
  const total = lignes.reduce((s, l) => s + parMois(l), 0);

  const supprimer = (id: string) => {
    setErreur(null);
    demarrer(async () => {
      try {
        await supprimerLigneFinance(id);
        setASupprimer(null);
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Échec de la suppression.');
      }
    });
  };

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{type === 'charge' ? 'Charges fixes' : 'Recettes fixes (hors ventes)'}</h2>
        <span className="text-sm font-bold tabular-nums text-indigo-600">{euros(total)} / mois</span>
      </div>

      <Formulaire key={ligneEditee?.id ?? 'nouvelle'} type={type} ligneEditee={ligneEditee} onFini={() => setLigneEditee(null)} />
      {erreur && <p className="mt-2 text-sm font-semibold text-red-600">{erreur}</p>}

      {lignes.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          {type === 'charge'
            ? 'Aucune charge pour l’instant : ajoute loyers, salaires, abonnements…'
            : 'Aucune recette fixe (ex. sous-location, partenariat). Facultatif.'}
        </p>
      ) : (
        groupes.map((g) => (
          <div key={g.categorie} className="mt-4">
            {type === 'charge' && (
              <div className="mb-1 flex justify-between text-xs font-bold uppercase tracking-wide text-slate-400">
                <span>{libelleCategorie(g.categorie)}</span>
                <span className="tabular-nums">{euros(g.total)} / mois</span>
              </div>
            )}
            {g.liste.map((l) => (
              <div
                key={l.id}
                className={`flex items-center gap-3 rounded-md border-t border-slate-100 px-2 py-2 ${
                  ligneEditee?.id === l.id ? 'bg-indigo-50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{l.libelle}</p>
                  {l.frequence === 'annuelle' && (
                    <p className="text-xs text-slate-400">
                      {euros(l.montant)} / an → {euros(l.montant / 12)} / mois
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold tabular-nums text-slate-900">{euros(parMois(l))}</span>
                {aSupprimer === l.id ? (
                  <>
                    <button onClick={() => supprimer(l.id)} className="text-xs font-semibold text-red-600">
                      Confirmer
                    </button>
                    <button onClick={() => setASupprimer(null)} className="text-xs font-semibold text-slate-400">
                      Non
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setLigneEditee(l)} className="text-xs font-semibold text-indigo-600">
                      Modifier
                    </button>
                    <button onClick={() => setASupprimer(l.id)} className="text-xs font-semibold text-red-500">
                      Supprimer
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function BlocParametres({ parametres }: { parametres: ParametresFinance }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [marge, setMarge] = useState(String(parametres.tauxMarge).replace('.', ','));
  const [tva, setTva] = useState(String(parametres.tauxTva).replace('.', ','));
  const m = lireNombre(marge);
  const t = lireNombre(tva);
  const modifie = m !== parametres.tauxMarge || t !== parametres.tauxTva;

  const enregistrer = () => {
    setErreur(null);
    demarrer(async () => {
      try {
        await enregistrerParametresFinance({ tauxMarge: m, tauxTva: t });
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec de l'enregistrement.");
      }
    });
  };

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-bold text-slate-900">Paramètres du calcul</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">Marge brute (% du CA HT)</span>
          <input
            value={marge}
            onChange={(e) => setMarge(e.target.value)}
            inputMode="decimal"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
          />
          <span className="text-xs text-slate-400">
            Ce qui reste après le coût d’achat des produits. À 100 %, le coût des produits n’est pas compté.
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500">TVA (%)</span>
          <input
            value={tva}
            onChange={(e) => setTva(e.target.value)}
            inputMode="decimal"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
          />
          <span className="text-xs text-slate-400">Les ventes SumUp et espèces sont TTC : on retire la TVA pour le calcul.</span>
        </label>
      </div>
      {modifie && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={enregistrer}
            disabled={enCours}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
      {erreur && <p className="mt-2 text-sm font-semibold text-red-600">{erreur}</p>}
    </div>
  );
}

export function ChargesRecettesClient({
  mois,
  moisCourant,
  lignes,
  parametres,
  caRealise,
}: {
  mois: string;
  moisCourant: string;
  lignes: LigneFinance[];
  parametres: ParametresFinance;
  caRealise: number;
}) {
  const charges = lignes.filter((l) => l.type === 'charge');
  const recettes = lignes.filter((l) => l.type === 'recette');
  const chargesMois = charges.reduce((s, l) => s + parMois(l), 0);
  const recettesMois = recettes.reduce((s, l) => s + parMois(l), 0);

  const { tauxMarge, tauxTva } = parametres;
  const aCouvrir = Math.max(0, chargesMois - recettesMois);
  const pointMortHT = aCouvrir / (tauxMarge / 100);
  const pointMortTTC = pointMortHT * (1 + tauxTva / 100);
  const resultat = (caRealise / (1 + tauxTva / 100)) * (tauxMarge / 100) + recettesMois - chargesMois;
  const resteAFaire = Math.max(0, pointMortTTC - caRealise);
  const progression = pointMortTTC > 0 ? Math.min(1, caRealise / pointMortTTC) : 1;

  const [annee, numMois] = mois.split('-').map(Number);
  const joursDansMois = new Date(annee, numMois, 0).getDate();
  const estMoisCourant = mois === moisCourant;
  const joursRestants = estMoisCourant ? joursDansMois - new Date().getDate() + 1 : 0;
  const libelleMois = `${NOMS_MOIS[numMois - 1]} ${annee}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/charges-recettes?mois=${decalerMois(mois, -1)}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-indigo-600 hover:bg-slate-200"
          aria-label="Mois précédent"
        >
          ‹
        </Link>
        <span className="min-w-[160px] text-center text-base font-bold capitalize text-slate-800">{libelleMois}</span>
        {estMoisCourant ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-300">›</span>
        ) : (
          <Link
            href={`/charges-recettes?mois=${decalerMois(mois, 1)}`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-indigo-600 hover:bg-slate-200"
            aria-label="Mois suivant"
          >
            ›
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <Tuile
          label="CA à faire pour être flat"
          valeur={euros(pointMortTTC)}
          sous={`TTC · ${euros(pointMortHT)} HT · ${euros(pointMortTTC / joursDansMois)} / jour`}
          ton="primaire"
        />
        <Tuile label="Charges fixes" valeur={euros(chargesMois)} sous="par mois" />
        {recettesMois > 0 && <Tuile label="Recettes fixes" valeur={euros(recettesMois)} sous="par mois, hors ventes" />}
        <Tuile label="CA fait (pop-ups)" valeur={euros(caRealise)} sous="SumUp + espèces appli, TTC" />
        <Tuile
          label={resultat >= 0 ? 'Bénéfice estimé' : 'Perte estimée'}
          valeur={euros(Math.abs(resultat))}
          sous={estMoisCourant ? 'à ce jour' : 'sur le mois'}
          ton={resultat >= 0 ? 'positif' : 'negatif'}
        />
      </div>

      <div className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-bold text-slate-900">Objectif du mois</h2>
          <span className="text-sm font-bold tabular-nums text-indigo-600">{Math.round(progression * 100)} %</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${progression >= 1 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
            style={{ width: `${progression * 100}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {pointMortTTC === 0
            ? 'Ajoute tes charges fixes pour calculer le CA à faire.'
            : resteAFaire === 0
              ? `Équilibre atteint : ${euros(caRealise - pointMortTTC)} au-dessus du point mort.`
              : estMoisCourant
                ? `Reste ${euros(resteAFaire)} à faire, soit ${euros(resteAFaire / joursRestants)} par jour sur les ${joursRestants} jour(s) restant(s).`
                : `Il a manqué ${euros(resteAFaire)} pour être à l’équilibre.`}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Le CA du site (Shopify / TikTok) n’est pas compté, seulement les pop-ups. Les charges sont les montants actuels,
          appliqués à tous les mois.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BlocLignes type="charge" lignes={charges} />
        <div className="flex flex-col gap-6">
          <BlocLignes type="recette" lignes={recettes} />
          <BlocParametres key={`${tauxMarge}-${tauxTva}`} parametres={parametres} />
        </div>
      </div>
    </div>
  );
}
