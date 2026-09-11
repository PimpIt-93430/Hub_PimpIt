'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  ajouterMoisRecetteFlux,
  creerDepenseFlux,
  creerRecetteFlux,
  definirPourcentageMoisRecette,
  modifierDepenseFlux,
  modifierRecetteFlux,
  supprimerDepenseFlux,
  supprimerRecetteFlux,
  type DepenseFlux,
  type FrequenceDepense,
  type MensualiteRecette,
  type RecetteFlux,
  type TypeDepense,
} from './actions';

// Doit rester égal à NOMBRE_MOIS_PREREMPLIS (actions.ts) — pas importable : un fichier "use
// server" ne peut exporter que des fonctions async.
const NOMBRE_MOIS_PREREMPLIS = 12;

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
function joursDansLeMois(moisIso: string): number {
  const [annee, mois] = moisIso.split('-').map(Number);
  return new Date(annee, mois, 0).getDate();
}
function formatMoisCourt(moisIso: string): string {
  return new Date(`${moisIso}T00:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}
/** CA jour/mois prévu et net d'un mois de la grille — pourcentage × la référence "100%/jour" du
 * pop-up × nb de jours du mois, moins les charges variables (cf. retour utilisateur du
 * 2026-09-11 : "un pourcentage par mois... à combien correspond 100% par jour... charges
 * variables 30% du CA HT"). */
function calculMensualite(r: RecetteFlux, m: MensualiteRecette) {
  const caJourPrevu = (r.caJourHt * m.pourcentage) / 100;
  const caMoisPrevu = caJourPrevu * joursDansLeMois(m.mois);
  const chargesVariables = caMoisPrevu * (r.tauxChargesVariables / 100);
  return { caJourPrevu, caMoisPrevu, chargesVariables, net: caMoisPrevu - chargesVariables };
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

/** Une occurrence par mois de la grille de mensualités qui tombe entre `debut` et `fin` — montant
 * net des charges variables (cf. calculMensualite). Ne dépend plus de la date du loyer : un
 * pop-up déjà ouvert démarre dès que sa grille a un mois à un pourcentage non nul (cf. retour
 * utilisateur du 2026-09-11 : "les pop-up déjà ouverts... commencent dès maintenant"). */
function occurrencesRecetteDansLaPeriode(r: RecetteFlux, debut: Date, fin: Date): Occurrence[] {
  const occurrences: Occurrence[] = [];
  for (const m of r.mensualites) {
    const dateMois = new Date(`${m.mois}T00:00:00`);
    if (dateMois < debut || dateMois > fin || m.pourcentage <= 0) continue;
    occurrences.push({ date: dateMois, montant: calculMensualite(r, m).net, libelle: `Recette ${r.popUpNom}`, nature: 'recette' });
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
  tauxChargesVariables: string;
}

// Charges variables à 30% par défaut (cf. retour utilisateur du 2026-09-11 : "pour les charges
// variables on va dire 30% du CA HT à chaque fois pour l'instant").
const FORMULAIRE_RECETTE_VIDE: FormulaireRecette = { popUpNom: '', caJourHt: '', tauxChargesVariables: '30' };

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
    const recettesOcc = recettes.flatMap((r) => occurrencesRecetteDansLaPeriode(r, debut, fin));
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
    const taux = Number(formRecette.tauxChargesVariables.replace(',', '.'));
    if (!formRecette.popUpNom.trim() || !formRecette.caJourHt || !formRecette.tauxChargesVariables) {
      setErreurRecette('Pop-up, CA jour (100%) et taux de charges sont obligatoires.');
      return;
    }
    if (Number.isNaN(caJour) || Number.isNaN(taux) || taux < 0 || taux > 100) {
      setErreurRecette('Vérifie les montants (le taux de charges doit être entre 0 et 100).');
      return;
    }
    const params = { popUpNom: formRecette.popUpNom, caJourHt: caJour, tauxChargesVariables: taux };
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

  // Édition du pourcentage d'un mois de la grille — état local optimiste (cf. TableauMensualites)
  // + appel serveur au blur, pour ne pas re-render toute la grille à chaque frappe.
  const [pourcentagesEnEdition, setPourcentagesEnEdition] = useState<Record<string, string>>({});
  const [mensualiteEnErreur, setMensualiteEnErreur] = useState<string | null>(null);

  const changerPourcentage = (mensualiteId: string, valeur: string) => {
    setPourcentagesEnEdition((etat) => ({ ...etat, [mensualiteId]: valeur }));
  };

  const validerPourcentage = (mensualiteId: string) => {
    const valeur = pourcentagesEnEdition[mensualiteId];
    if (valeur === undefined) return;
    const pourcentage = Number(valeur.replace(',', '.'));
    setPourcentagesEnEdition((etat) => {
      const { [mensualiteId]: _retire, ...reste } = etat;
      return reste;
    });
    if (Number.isNaN(pourcentage) || pourcentage < 0) {
      setMensualiteEnErreur('Le pourcentage doit être un nombre positif.');
      return;
    }
    setMensualiteEnErreur(null);
    setRecettes((liste) =>
      liste.map((r) => ({ ...r, mensualites: r.mensualites.map((m) => (m.id === mensualiteId ? { ...m, pourcentage } : m)) })),
    );
    definirPourcentageMoisRecette(mensualiteId, pourcentage)
      .then(() => router.refresh())
      .catch((e) => {
        setMensualiteEnErreur(e instanceof Error ? e.message : "Échec de l'enregistrement du pourcentage.");
        setRecettes(recettesInitiales);
      });
  };

  const [ajoutMoisEnCours, setAjoutMoisEnCours] = useState<string | null>(null);

  const ajouterUnMois = (r: RecetteFlux) => {
    const dernierMois = r.mensualites[r.mensualites.length - 1]?.mois;
    const base = dernierMois ? new Date(`${dernierMois}T00:00:00`) : new Date();
    const prochain = ajouterMois(base, 1);
    const moisIso = dateEnISO(new Date(prochain.getFullYear(), prochain.getMonth(), 1));
    setAjoutMoisEnCours(r.id);
    ajouterMoisRecetteFlux(r.id, moisIso)
      .then(() => router.refresh())
      .catch((e) => setErreurRecette(e instanceof Error ? e.message : "Échec de l'ajout du mois."))
      .finally(() => setAjoutMoisEnCours(null));
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
          Recettes = pour chaque pop-up et chaque mois, (% des ventes × CA/jour de référence × nb de jours du mois) moins les charges
          variables — cf. grille &quot;Recettes par pop-up&quot; ci-dessous. Les revenus du site ne sont pas encore intégrés.
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

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">CA/jour HT = 100% (€)</span>
            <input
              value={formRecette.caJourHt}
              onChange={(e) => setFormRecette((f) => ({ ...f, caJourHt: e.target.value }))}
              placeholder="Ex. 800"
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
          Le CA/jour HT est la référence &quot;100% des ventes&quot; du pop-up. À la création, les {NOMBRE_MOIS_PREREMPLIS} prochains
          mois sont pré-remplis à 100% (à baisser toi-même sur les mois où tu vises moins, ex. 80%, ou sur les mois avant
          l&apos;ouverture du pop-up en le mettant à 0%).
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

      {mensualiteEnErreur && <p className="mb-3 text-xs font-semibold text-red-600">{mensualiteEnErreur}</p>}

      <div className="flex flex-col gap-4">
        {recettes.map((r) => (
          <div key={r.id} className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="font-bold text-slate-900">{r.popUpNom}</p>
                <p className="text-xs text-slate-400">
                  100% = <span className="font-semibold text-slate-600">{formatMontant(r.caJourHt)}</span>/jour HT
                </p>
                <p className="text-xs text-slate-400">
                  Charges variables : <span className="font-semibold text-slate-600">{r.tauxChargesVariables}%</span> du CA HT
                </p>
                <p className="text-xs text-slate-300">Ajouté par {r.creeParNom}</p>
              </div>
              <div className="flex items-center gap-1">
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
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <th className="sticky left-0 bg-white px-4 py-2.5">Mois</th>
                    {r.mensualites.map((m) => (
                      <th key={m.id} className="whitespace-nowrap px-3 py-2.5 text-right">
                        {formatMoisCourt(m.mois)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-50">
                    <td className="sticky left-0 bg-white px-4 py-2 font-semibold text-slate-600">% des ventes</td>
                    {r.mensualites.map((m) => (
                      <td key={m.id} className="px-2 py-1.5 text-right">
                        <input
                          value={pourcentagesEnEdition[m.id] ?? String(m.pourcentage)}
                          onChange={(e) => changerPourcentage(m.id, e.target.value)}
                          onBlur={() => validerPourcentage(m.id)}
                          inputMode="decimal"
                          className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-right text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-50 text-slate-500">
                    <td className="sticky left-0 bg-white px-4 py-2">CA/jour prévu</td>
                    {r.mensualites.map((m) => (
                      <td key={m.id} className="whitespace-nowrap px-3 py-2 text-right">
                        {formatMontant(calculMensualite(r, m).caJourPrevu)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-50 text-slate-500">
                    <td className="sticky left-0 bg-white px-4 py-2">CA/mois prévu HT</td>
                    {r.mensualites.map((m) => (
                      <td key={m.id} className="whitespace-nowrap px-3 py-2 text-right">
                        {formatMontant(calculMensualite(r, m).caMoisPrevu)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-50 text-red-500">
                    <td className="sticky left-0 bg-white px-4 py-2">Charges var. ({r.tauxChargesVariables}%)</td>
                    {r.mensualites.map((m) => (
                      <td key={m.id} className="whitespace-nowrap px-3 py-2 text-right">
                        −{formatMontant(calculMensualite(r, m).chargesVariables)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="sticky left-0 bg-white px-4 py-2 font-bold text-emerald-700">Net prévu</td>
                    {r.mensualites.map((m) => (
                      <td key={m.id} className="whitespace-nowrap px-3 py-2 text-right font-bold text-emerald-600">
                        {formatMontant(calculMensualite(r, m).net)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 px-5 py-2.5">
              <button
                type="button"
                onClick={() => ajouterUnMois(r)}
                disabled={ajoutMoisEnCours === r.id}
                className="text-xs font-semibold text-indigo-500 hover:underline disabled:opacity-60"
              >
                {ajoutMoisEnCours === r.id ? 'Ajout…' : '+ Ajouter un mois'}
              </button>
            </div>
          </div>
        ))}
        {recettes.length === 0 && (
          <p className="rounded-[20px] border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-sm">
            Aucune recette enregistrée.
          </p>
        )}
      </div>
    </div>
  );
}
