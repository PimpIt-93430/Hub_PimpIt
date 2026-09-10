'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  creerDepenseFlux,
  creerRecetteFlux,
  modifierDepenseFlux,
  modifierRecetteFlux,
  supprimerDepenseFlux,
  supprimerRecetteFlux,
  type DepenseFlux,
  type FrequenceDepense,
  type RecetteFlux,
  type TypeDepense,
} from './actions';

function formatMontant(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function formatDateCourte(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function dateEnISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function ajouterMois(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

const LIBELLE_FREQUENCE: Record<FrequenceDepense, string> = {
  mensuelle: 'Tous les mois',
  trimestrielle: 'Tous les trimestres',
  annuelle: 'Tous les ans',
};

interface Occurrence {
  date: Date;
  montant: number;
  libelle: string;
  /** 'depense' réduit le solde, 'recette' l'augmente — cf. GraphiqueSolde (retour utilisateur du
   * 2026-09-11 : "maintenant on va travailler sur les recettes"). */
  nature: 'depense' | 'recette';
}

/** Toutes les échéances d'une dépense qui tombent entre `debut` et `fin` inclus — une seule pour
 * une ponctuelle, une par échéance de la fréquence choisie pour une récurrente (cf. retour
 * utilisateur : "ponctuelles + récurrentes"). */
function occurrencesDansLaPeriode(d: DepenseFlux, debut: Date, fin: Date): Occurrence[] {
  const premiere = new Date(`${d.date}T00:00:00`);
  if (d.type === 'ponctuelle') {
    return premiere >= debut && premiere <= fin
      ? [{ date: premiere, montant: d.montant, libelle: d.libelle, nature: 'depense' as const }]
      : [];
  }
  const limite = d.dateFin ? new Date(`${d.dateFin}T00:00:00`) : fin;
  const finEffective = limite < fin ? limite : fin;
  const pas = d.frequence === 'mensuelle' ? 1 : d.frequence === 'trimestrielle' ? 3 : 12;
  const occurrences: Occurrence[] = [];
  let courante = premiere;
  let garde = 0;
  while (courante <= finEffective && garde < 500) {
    if (courante >= debut) occurrences.push({ date: courante, montant: d.montant, libelle: d.libelle, nature: 'depense' });
    courante = ajouterMois(courante, pas);
    garde += 1;
  }
  return occurrences;
}

/** Nom du pop-up porté par une dépense "loyer" marquée estPopUp — le préfixe "Loyer " (ou "Loyer
 * et charges ") est retiré pour ne garder que le nom comparable à celui saisi côté recette (cf.
 * retour utilisateur : "les revenus commencent au premier jour du loyer"). */
function nomPopUpDepuisLibelle(libelle: string): string {
  return libelle.replace(/^loyer(\s+et\s+charges)?\s+/i, '').trim();
}

/** Date de la première échéance du loyer du pop-up nommé `popUpNom` (comparaison insensible à la
 * casse/aux espaces) — null si aucune dépense estPopUp ne correspond. */
function trouverDateDebutPopUp(popUpNom: string, depenses: DepenseFlux[]): Date | null {
  const cible = popUpNom.trim().toLowerCase();
  const depense = depenses.find((d) => d.estPopUp && nomPopUpDepuisLibelle(d.libelle).toLowerCase() === cible);
  return depense ? new Date(`${depense.date}T00:00:00`) : null;
}

/** Échéances mensuelles d'une recette entre `debut` et `fin`, à partir du 1er jour du loyer du
 * pop-up correspondant (cf. trouverDateDebutPopUp) — montant net des charges variables
 * (caMoisHt × (1 - taux/100)), cf. retour utilisateur : "pour 1€ vendu HT on a 30% de charges". */
function occurrencesRecetteDansLaPeriode(r: RecetteFlux, debut: Date, fin: Date, depenses: DepenseFlux[]): Occurrence[] {
  const dateDebutPopUp = trouverDateDebutPopUp(r.popUpNom, depenses);
  if (!dateDebutPopUp) return [];
  const montantNet = r.caMoisHt * (1 - r.tauxChargesVariables / 100);
  const occurrences: Occurrence[] = [];
  let courante = dateDebutPopUp;
  let garde = 0;
  while (courante <= fin && garde < 500) {
    if (courante >= debut) {
      occurrences.push({ date: courante, montant: montantNet, libelle: `Recette ${r.popUpNom}`, nature: 'recette' });
    }
    courante = ajouterMois(courante, 1);
    garde += 1;
  }
  return occurrences;
}

const LARGEUR = 760;
const HAUTEUR = 260;
const MARGE = { haut: 16, bas: 28, gauche: 8, droite: 8 };

function GraphiqueSolde({ soldeDepart, occurrences, debut, fin }: { soldeDepart: number; occurrences: Occurrence[]; debut: Date; fin: Date }) {
  const points = useMemo(() => {
    let solde = soldeDepart;
    const pts: { x: number; y: number; date: Date; solde: number }[] = [{ x: 0, y: 0, date: debut, solde }];
    const dureeMs = fin.getTime() - debut.getTime();
    for (const occ of occurrences) {
      solde += occ.nature === 'recette' ? occ.montant : -occ.montant;
      const x = (occ.date.getTime() - debut.getTime()) / dureeMs;
      pts.push({ x, y: 0, date: occ.date, solde });
    }
    pts.push({ x: 1, y: 0, date: fin, solde });
    return pts;
  }, [soldeDepart, occurrences, debut, fin]);

  const min = Math.min(0, ...points.map((p) => p.solde));
  const max = Math.max(soldeDepart, ...points.map((p) => p.solde));
  const etendue = max - min || 1;
  const zoneH = HAUTEUR - MARGE.haut - MARGE.bas;
  const zoneW = LARGEUR - MARGE.gauche - MARGE.droite;

  const xPix = (x: number) => MARGE.gauche + x * zoneW;
  const yPix = (solde: number) => MARGE.haut + zoneH - ((solde - min) / etendue) * zoneH;

  // Ligne en escalier (le solde ne change qu'aux dates d'échéance, pas de façon linéaire entre
  // deux échéances) : pour chaque point, un segment horizontal jusqu'à sa date puis vertical vers
  // le nouveau solde.
  let chemin = `M ${xPix(points[0].x)} ${yPix(points[0].solde)}`;
  for (let i = 1; i < points.length; i++) {
    chemin += ` L ${xPix(points[i].x)} ${yPix(points[i - 1].solde)} L ${xPix(points[i].x)} ${yPix(points[i].solde)}`;
  }

  const yZero = yPix(0);
  const premierNegatif = points.find((p) => p.solde < 0 && p.date > debut);

  const moisRepere = useMemo(() => {
    const reperes: { x: number; label: string }[] = [];
    let d = new Date(debut.getFullYear(), debut.getMonth(), 1);
    d = ajouterMois(d, 1);
    const dureeMs = fin.getTime() - debut.getTime();
    while (d <= fin) {
      reperes.push({ x: (d.getTime() - debut.getTime()) / dureeMs, label: d.toLocaleDateString('fr-FR', { month: 'short' }) });
      d = ajouterMois(d, 1);
    }
    return reperes;
  }, [debut, fin]);

  return (
    <div>
      <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} className="w-full" role="img" aria-label="Évolution du solde sur 12 mois">
        {min < 0 && (
          <rect x={0} y={yZero} width={LARGEUR} height={MARGE.haut + zoneH - yZero} fill="#FEF2F2" />
        )}
        <line x1={0} y1={yZero} x2={LARGEUR} y2={yZero} stroke="#CBD5E1" strokeWidth={1} strokeDasharray={min < 0 ? '4 3' : undefined} />
        {moisRepere.map((r) => (
          <g key={r.label + r.x}>
            <line x1={xPix(r.x)} y1={MARGE.haut} x2={xPix(r.x)} y2={MARGE.haut + zoneH} stroke="#F1F5F9" strokeWidth={1} />
            <text x={xPix(r.x)} y={HAUTEUR - 8} fontSize={10} fill="#94A3B8" textAnchor="middle">
              {r.label}
            </text>
          </g>
        ))}
        <path d={chemin} fill="none" stroke="#4F46E5" strokeWidth={2} />
        {points.slice(1, -1).map((p, i) => (
          <circle key={i} cx={xPix(p.x)} cy={yPix(p.solde)} r={3} fill={p.solde < 0 ? '#DC2626' : '#4F46E5'} />
        ))}
      </svg>
      {premierNegatif && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          ⚠ Le solde passerait sous 0 € le {formatDateCourte(dateEnISO(premierNegatif.date))} ({formatMontant(premierNegatif.solde)}).
        </p>
      )}
    </div>
  );
}

interface FormulaireDepense {
  libelle: string;
  montant: string;
  type: TypeDepense;
  date: string;
  frequence: FrequenceDepense;
  dateFin: string;
  note: string;
  estPopUp: boolean;
}

const FORMULAIRE_VIDE: FormulaireDepense = {
  libelle: '',
  montant: '',
  type: 'ponctuelle',
  date: '',
  frequence: 'mensuelle',
  dateFin: '',
  note: '',
  estPopUp: false,
};

interface FormulaireRecette {
  popUpNom: string;
  caJourHt: string;
  caMoisHt: string;
  tauxChargesVariables: string;
}

const FORMULAIRE_RECETTE_VIDE: FormulaireRecette = { popUpNom: '', caJourHt: '', caMoisHt: '', tauxChargesVariables: '' };

export function FluxTresorerieClient({
  soldeActuel,
  depensesInitiales,
  recettesInitiales,
}: {
  soldeActuel: number;
  depensesInitiales: DepenseFlux[];
  recettesInitiales: RecetteFlux[];
}) {
  const router = useRouter();
  const [depenses, setDepenses] = useState(depensesInitiales);
  const [recettes, setRecettes] = useState(recettesInitiales);
  // router.refresh() (après ajout/modification/suppression) refait le rendu serveur et passe de
  // nouvelles props, mais un useState initialisé une fois ne les reprend jamais tout seul — sans
  // cet effet, une ligne fraîchement créée reste invisible malgré son insertion réussie en base
  // (cf. bug trouvé en testant : "TEST TVA T4" enregistrée en base mais jamais affichée).
  useEffect(() => setDepenses(depensesInitiales), [depensesInitiales]);
  useEffect(() => setRecettes(recettesInitiales), [recettesInitiales]);

  const [form, setForm] = useState<FormulaireDepense>(FORMULAIRE_VIDE);
  // null = mode "ajouter" ; sinon id de la dépense en cours de modification (cf. retour
  // utilisateur : "il faut pouvoir aussi modifier les dépenses déjà mises").
  const [editionId, setEditionId] = useState<string | null>(null);

  const [formRecette, setFormRecette] = useState<FormulaireRecette>(FORMULAIRE_RECETTE_VIDE);
  const [editionRecetteId, setEditionRecetteId] = useState<string | null>(null);

  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);
  const [enCoursRecette, demarrerRecette] = useTransition();
  const [erreurRecette, setErreurRecette] = useState<string | null>(null);
  const [suppressionRecetteEnCours, setSuppressionRecetteEnCours] = useState<string | null>(null);

  const debut = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const fin = useMemo(() => ajouterMois(debut, 12), [debut]);

  const occurrences = useMemo(() => {
    const depensesOcc = depenses.flatMap((d) => occurrencesDansLaPeriode(d, debut, fin));
    const recettesOcc = recettes.flatMap((r) => occurrencesRecetteDansLaPeriode(r, debut, fin, depenses));
    return [...depensesOcc, ...recettesOcc].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [depenses, recettes, debut, fin]);

  const totalDepensesSurUnAn = occurrences.filter((o) => o.nature === 'depense').reduce((s, o) => s + o.montant, 0);
  const totalRecettesSurUnAn = occurrences.filter((o) => o.nature === 'recette').reduce((s, o) => s + o.montant, 0);

  const demarrerEdition = (d: DepenseFlux) => {
    setErreur(null);
    setEditionId(d.id);
    setForm({
      libelle: d.libelle,
      montant: String(d.montant),
      type: d.type,
      date: d.date,
      frequence: d.frequence ?? 'mensuelle',
      dateFin: d.dateFin ?? '',
      note: d.note ?? '',
      estPopUp: d.estPopUp,
    });
  };

  const annulerEdition = () => {
    setEditionId(null);
    setForm(FORMULAIRE_VIDE);
    setErreur(null);
  };

  const soumettre = () => {
    setErreur(null);
    const montantNombre = Number(form.montant.replace(',', '.'));
    if (!form.libelle.trim() || !form.date || !form.montant || Number.isNaN(montantNombre) || montantNombre <= 0) {
      setErreur('Libellé, date et montant sont obligatoires.');
      return;
    }
    const params = {
      libelle: form.libelle,
      montant: montantNombre,
      type: form.type,
      date: form.date,
      frequence: form.type === 'recurrente' ? form.frequence : null,
      dateFin: form.type === 'recurrente' ? form.dateFin : null,
      note: form.note,
      estPopUp: form.estPopUp,
    };
    demarrer(async () => {
      try {
        if (editionId) {
          await modifierDepenseFlux(editionId, params);
        } else {
          await creerDepenseFlux(params);
        }
        setForm(FORMULAIRE_VIDE);
        setEditionId(null);
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec de l'enregistrement.");
      }
    });
  };

  const supprimer = (d: DepenseFlux) => {
    const confirme = window.confirm(`Supprimer "${d.libelle}" (${formatMontant(d.montant)}) ?`);
    if (!confirme) return;
    if (editionId === d.id) annulerEdition();
    setSuppressionEnCours(d.id);
    setDepenses((liste) => liste.filter((l) => l.id !== d.id));
    supprimerDepenseFlux(d.id)
      .catch((e) => {
        setErreur(e instanceof Error ? e.message : 'Échec de la suppression.');
        setDepenses(depensesInitiales);
      })
      .finally(() => {
        setSuppressionEnCours(null);
        router.refresh();
      });
  };

  const demarrerEditionRecette = (r: RecetteFlux) => {
    setErreurRecette(null);
    setEditionRecetteId(r.id);
    setFormRecette({
      popUpNom: r.popUpNom,
      caJourHt: String(r.caJourHt),
      caMoisHt: String(r.caMoisHt),
      tauxChargesVariables: String(r.tauxChargesVariables),
    });
  };

  const annulerEditionRecette = () => {
    setEditionRecetteId(null);
    setFormRecette(FORMULAIRE_RECETTE_VIDE);
    setErreurRecette(null);
  };

  const soumettreRecette = () => {
    setErreurRecette(null);
    const caJour = Number(formRecette.caJourHt.replace(',', '.'));
    const caMois = Number(formRecette.caMoisHt.replace(',', '.'));
    const taux = Number(formRecette.tauxChargesVariables.replace(',', '.'));
    if (!formRecette.popUpNom.trim() || !formRecette.caJourHt || !formRecette.caMoisHt || !formRecette.tauxChargesVariables) {
      setErreurRecette('Pop-up, CA jour, CA mois et taux de charges sont obligatoires.');
      return;
    }
    if (Number.isNaN(caJour) || Number.isNaN(caMois) || Number.isNaN(taux) || taux < 0 || taux > 100) {
      setErreurRecette('Vérifie les montants (le taux de charges doit être entre 0 et 100).');
      return;
    }
    const params = { popUpNom: formRecette.popUpNom, caJourHt: caJour, caMoisHt: caMois, tauxChargesVariables: taux };
    demarrerRecette(async () => {
      try {
        if (editionRecetteId) {
          await modifierRecetteFlux(editionRecetteId, params);
        } else {
          await creerRecetteFlux(params);
        }
        setFormRecette(FORMULAIRE_RECETTE_VIDE);
        setEditionRecetteId(null);
        router.refresh();
      } catch (e) {
        setErreurRecette(e instanceof Error ? e.message : "Échec de l'enregistrement.");
      }
    });
  };

  const supprimerRecette = (r: RecetteFlux) => {
    const confirme = window.confirm(`Supprimer la recette "${r.popUpNom}" ?`);
    if (!confirme) return;
    if (editionRecetteId === r.id) annulerEditionRecette();
    setSuppressionRecetteEnCours(r.id);
    setRecettes((liste) => liste.filter((l) => l.id !== r.id));
    supprimerRecetteFlux(r.id)
      .catch((e) => {
        setErreurRecette(e instanceof Error ? e.message : 'Échec de la suppression.');
        setRecettes(recettesInitiales);
      })
      .finally(() => {
        setSuppressionRecetteEnCours(null);
        router.refresh();
      });
  };

  return (
    <div className="mt-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Flux de trésorerie — 12 mois</p>
      <h2 className="mb-4 text-lg font-bold text-slate-900">Dépenses à venir</h2>

      <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="text-sm text-slate-500">
            Solde de départ : <span className="font-bold text-slate-800">{formatMontant(soldeActuel)}</span>
          </p>
          <p className="text-sm text-slate-500">
            Dépenses/12 mois : <span className="font-bold text-red-600">{formatMontant(totalDepensesSurUnAn)}</span>
          </p>
          <p className="text-sm text-slate-500">
            Recettes nettes/12 mois : <span className="font-bold text-emerald-600">{formatMontant(totalRecettesSurUnAn)}</span>
          </p>
        </div>
        <GraphiqueSolde soldeDepart={soldeActuel} occurrences={occurrences} debut={debut} fin={fin} />
        <p className="mt-2 text-[11px] text-slate-400">
          Recettes = CA mois HT × (1 − taux de charges variables) de chaque pop-up, à partir du 1er jour de son loyer. Les revenus du
          site ne sont pas encore intégrés.
        </p>
      </div>

      <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {editionId ? 'Modifier la dépense' : 'Ajouter une dépense'}
          </p>
          {editionId && (
            <button type="button" onClick={annulerEdition} className="text-xs font-semibold text-slate-400 hover:underline">
              Annuler la modification
            </button>
          )}
        </div>

        <div className="mb-3 flex gap-2">
          {(['ponctuelle', 'recurrente'] as TypeDepense[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((f) => ({ ...f, type: t }))}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                form.type === t ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {t === 'ponctuelle' ? 'Ponctuelle' : 'Récurrente'}
            </button>
          ))}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="col-span-2 block sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Libellé</span>
            <input
              value={form.libelle}
              onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
              placeholder="Ex. TVA T1, Loyer, Assurance…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Montant HT (€)</span>
            <input
              value={form.montant}
              onChange={(e) => setForm((f) => ({ ...f, montant: e.target.value }))}
              placeholder="Ex. 3500"
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {form.type === 'ponctuelle' ? "Date d'échéance" : '1ère échéance'}
            </span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>

          {form.type === 'recurrente' && (
            <>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fréquence</span>
                <select
                  value={form.frequence}
                  onChange={(e) => setForm((f) => ({ ...f, frequence: e.target.value as FrequenceDepense }))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                >
                  {(Object.keys(LIBELLE_FREQUENCE) as FrequenceDepense[]).map((f) => (
                    <option key={f} value={f}>
                      {LIBELLE_FREQUENCE[f]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fin (optionnel)</span>
                <input
                  type="date"
                  value={form.dateFin}
                  onChange={(e) => setForm((f) => ({ ...f, dateFin: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                />
              </label>
            </>
          )}
        </div>

        <label className="mb-3 flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={form.estPopUp}
            onChange={(e) => setForm((f) => ({ ...f, estPopUp: e.target.checked }))}
            className="h-3.5 w-3.5 rounded border-slate-300"
          />
          <span className="font-semibold">C&apos;est un pop-up</span>
          <span className="text-slate-400">(y compris un pop-up pas encore créé dans l&apos;appli)</span>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Note (optionnel)</span>
          <input
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
          />
        </label>

        {erreur && <p className="mb-2 text-xs font-semibold text-red-600">{erreur}</p>}

        <button
          type="button"
          onClick={soumettre}
          disabled={enCours}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {enCours ? 'Enregistrement…' : editionId ? 'Enregistrer les modifications' : 'Ajouter la dépense'}
        </button>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Libellé</th>
              <th className="px-4 py-3">Pop-up</th>
              <th className="px-4 py-3">Montant HT</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Échéance</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">Ajouté par</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {depenses.map((d) => (
              <tr key={d.id} className={`border-b border-slate-50 last:border-0 ${editionId === d.id ? 'bg-indigo-50/50' : ''}`}>
                <td className="px-4 py-2.5 font-semibold text-slate-800">{d.libelle}</td>
                <td className="px-4 py-2.5">
                  {d.estPopUp ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Pop-up</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-bold text-red-600">{formatMontant(d.montant)}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {d.type === 'ponctuelle' ? 'Ponctuelle' : d.frequence ? LIBELLE_FREQUENCE[d.frequence] : 'Récurrente'}
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {formatDateCourte(d.date)}
                  {d.dateFin ? ` → ${formatDateCourte(d.dateFin)}` : ''}
                </td>
                <td className="max-w-[160px] px-4 py-2.5 text-slate-500">{d.note ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-400">{d.creeParNom}</td>
                <td className="px-2 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => demarrerEdition(d)}
                      title="Modifier cette dépense"
                      className="rounded-lg px-2 py-1 text-slate-300 hover:bg-indigo-50 hover:text-indigo-500"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => supprimer(d)}
                      disabled={suppressionEnCours === d.id}
                      className="rounded-lg px-2 py-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {depenses.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                  Aucune dépense enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-4 mt-10 text-lg font-bold text-slate-900">Recettes par pop-up</h2>

      <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {editionRecetteId ? 'Modifier la recette' : 'Ajouter une recette'}
          </p>
          {editionRecetteId && (
            <button type="button" onClick={annulerEditionRecette} className="text-xs font-semibold text-slate-400 hover:underline">
              Annuler la modification
            </button>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pop-up</span>
            <input
              value={formRecette.popUpNom}
              onChange={(e) => setFormRecette((f) => ({ ...f, popUpNom: e.target.value }))}
              placeholder="Ex. Carré Sénart"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">CA moyen/jour HT (€)</span>
            <input
              value={formRecette.caJourHt}
              onChange={(e) => setFormRecette((f) => ({ ...f, caJourHt: e.target.value }))}
              placeholder="Ex. 800"
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">CA moyen/mois HT (€)</span>
            <input
              value={formRecette.caMoisHt}
              onChange={(e) => setFormRecette((f) => ({ ...f, caMoisHt: e.target.value }))}
              placeholder="Ex. 24000"
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Charges variables (%)</span>
            <input
              value={formRecette.tauxChargesVariables}
              onChange={(e) => setFormRecette((f) => ({ ...f, tauxChargesVariables: e.target.value }))}
              placeholder="Ex. 30"
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
        </div>

        <p className="mb-3 text-[11px] text-slate-400">
          Le nom du pop-up doit correspondre à celui utilisé dans le libellé de son loyer (ex. &quot;Loyer Carré Sénart&quot; →
          &quot;Carré Sénart&quot;) — les revenus démarrent automatiquement au 1er jour de ce loyer.
        </p>

        {erreurRecette && <p className="mb-2 text-xs font-semibold text-red-600">{erreurRecette}</p>}

        <button
          type="button"
          onClick={soumettreRecette}
          disabled={enCoursRecette}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {enCoursRecette ? 'Enregistrement…' : editionRecetteId ? 'Enregistrer les modifications' : 'Ajouter la recette'}
        </button>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Pop-up</th>
              <th className="px-4 py-3">CA/jour HT</th>
              <th className="px-4 py-3">CA/mois HT</th>
              <th className="px-4 py-3">Charges var.</th>
              <th className="px-4 py-3">Net/mois</th>
              <th className="px-4 py-3">Démarre le</th>
              <th className="px-4 py-3">Ajouté par</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {recettes.map((r) => {
              const dateDebutPopUp = trouverDateDebutPopUp(r.popUpNom, depenses);
              const net = r.caMoisHt * (1 - r.tauxChargesVariables / 100);
              return (
                <tr key={r.id} className={`border-b border-slate-50 last:border-0 ${editionRecetteId === r.id ? 'bg-indigo-50/50' : ''}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{r.popUpNom}</td>
                  <td className="px-4 py-2.5 text-slate-500">{formatMontant(r.caJourHt)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{formatMontant(r.caMoisHt)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.tauxChargesVariables}%</td>
                  <td className="px-4 py-2.5 font-bold text-emerald-600">{formatMontant(net)}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {dateDebutPopUp ? (
                      formatDateCourte(dateEnISO(dateDebutPopUp))
                    ) : (
                      <span className="font-semibold text-amber-600" title="Aucun loyer estPopUp ne correspond à ce nom">
                        ⚠ pop-up introuvable
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{r.creeParNom}</td>
                  <td className="px-2 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => demarrerEditionRecette(r)}
                        title="Modifier cette recette"
                        className="rounded-lg px-2 py-1 text-slate-300 hover:bg-indigo-50 hover:text-indigo-500"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => supprimerRecette(r)}
                        disabled={suppressionRecetteEnCours === r.id}
                        className="rounded-lg px-2 py-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {recettes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                  Aucune recette enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
