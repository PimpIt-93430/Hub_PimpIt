'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  ajouterMoisRecetteFlux,
  creerDepenseFlux,
  creerRecetteExceptionnelleFlux,
  creerRecetteFlux,
  definirPourcentageMoisRecette,
  definirTauxChargesVariablesPourTous,
  modifierDepenseFlux,
  modifierRecetteExceptionnelleFlux,
  modifierRecetteFlux,
  supprimerDepenseFlux,
  supprimerRecetteExceptionnelleFlux,
  supprimerRecetteFlux,
  type DepenseFlux,
  type FrequenceDepense,
  type MensualiteRecette,
  type RecetteExceptionnelleFlux,
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

/** Les `n` mois (clé "AAAA-MM") à partir du mois de `debut`, dans l'ordre — sert de colonnes au
 * récapitulatif mensuel (cf. construireRecapMensuel). */
function clesMoisPeriode(debut: Date, n: number): string[] {
  const cles: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = ajouterMois(new Date(debut.getFullYear(), debut.getMonth(), 1), i);
    cles.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return cles;
}

interface LigneRecap {
  cle: string;
  label: string;
  parMois: Record<string, number>;
  emphase?: boolean;
}

/** Récapitulatif mensuel détaillé (cf. retour utilisateur : "recap des dépenses et des recettes
 * par mois détaillé, les salaires tu les regroupes, les loyers pareil" puis "les revenus détaillé
 * au moins revenu pop-up, revenu ponctuelle, revenu récurrent") — les dépenses "Salaire ..." et
 * "Loyer ..." sont regroupées en une seule ligne chacune, les autres dépenses restent détaillées
 * ligne par ligne, et les revenus sont regroupés par categorieRecap (cf. Occurrence) plutôt qu'en
 * une seule ligne "Revenus". */
function construireRecapMensuel(occurrences: Occurrence[], moisCles: string[]): LigneRecap[] {
  const videParMois = (): Record<string, number> => Object.fromEntries(moisCles.map((c) => [c, 0]));

  const parCategorieDepense = new Map<string, Record<string, number>>();
  const parCategorieRevenu = new Map<string, Record<string, number>>();

  for (const occ of occurrences) {
    const cle = `${occ.date.getFullYear()}-${String(occ.date.getMonth() + 1).padStart(2, '0')}`;
    if (!moisCles.includes(cle)) continue;
    if (occ.nature === 'recette') {
      const categorie = occ.categorieRecap ?? 'Revenus';
      if (!parCategorieRevenu.has(categorie)) parCategorieRevenu.set(categorie, videParMois());
      parCategorieRevenu.get(categorie)![cle] += occ.montant;
      continue;
    }
    const categorie = /^salaire/i.test(occ.libelle) ? 'Salaires' : /^loyer/i.test(occ.libelle) ? 'Loyers' : occ.libelle;
    if (!parCategorieDepense.has(categorie)) parCategorieDepense.set(categorie, videParMois());
    parCategorieDepense.get(categorie)![cle] += occ.montant;
  }

  const trierParOrdre = (cles: string[], ordrePrioritaire: string[]) =>
    cles.sort((a, b) => {
      const pa = ordrePrioritaire.indexOf(a);
      const pb = ordrePrioritaire.indexOf(b);
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      return a.localeCompare(b);
    });

  const categoriesDepenses = trierParOrdre([...parCategorieDepense.keys()], ['Salaires', 'Loyers']);
  const lignesDepenses: LigneRecap[] = categoriesDepenses.map((c) => ({ cle: `d-${c}`, label: c, parMois: parCategorieDepense.get(c)! }));
  const totalDepensesParMois = videParMois();
  for (const cle of moisCles) totalDepensesParMois[cle] = lignesDepenses.reduce((s, l) => s + l.parMois[cle], 0);

  const categoriesRevenus = trierParOrdre(
    [...parCategorieRevenu.keys()],
    ['Revenu pop-up', 'Revenu ponctuel', 'Revenu récurrent'],
  );
  const lignesRevenus: LigneRecap[] = categoriesRevenus.map((c) => ({ cle: `r-${c}`, label: c, parMois: parCategorieRevenu.get(c)! }));
  const totalRevenusParMois = videParMois();
  for (const cle of moisCles) totalRevenusParMois[cle] = lignesRevenus.reduce((s, l) => s + l.parMois[cle], 0);

  const soldeParMois = videParMois();
  for (const cle of moisCles) soldeParMois[cle] = totalRevenusParMois[cle] - totalDepensesParMois[cle];

  return [
    ...lignesDepenses,
    { cle: 'total-depenses', label: 'Total dépenses', parMois: totalDepensesParMois, emphase: true },
    ...lignesRevenus,
    { cle: 'total-revenus', label: 'Total revenus', parMois: totalRevenusParMois, emphase: true },
    { cle: 'solde', label: 'Solde du mois', parMois: soldeParMois, emphase: true },
  ];
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
  /** Sous-catégorie d'une recette pour le récap mensuel ("Revenu pop-up", "Revenu ponctuel",
   * "Revenu récurrent") — cf. retour utilisateur : "revenu pop up, revenu ponctuelle, revenu
   * récurrent". Sans effet sur le graphique de solde, qui ne distingue pas la nature du revenu. */
  categorieRecap?: string;
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

/** Même principe que occurrencesDansLaPeriode, pour une recette exceptionnelle (nature 'recette'
 * au lieu de 'depense') — cf. retour utilisateur du 2026-09-11 : "rajouter les recettes
 * exceptionnelles qui peuvent être récurrentes ou une ponctuelle". */
function occurrencesRecetteExceptionnelleDansLaPeriode(r: RecetteExceptionnelleFlux, debut: Date, fin: Date): Occurrence[] {
  const categorieRecap = r.type === 'ponctuelle' ? 'Revenu ponctuel' : 'Revenu récurrent';
  const premiere = new Date(`${r.date}T00:00:00`);
  if (r.type === 'ponctuelle') {
    return premiere >= debut && premiere <= fin
      ? [{ date: premiere, montant: r.montant, libelle: r.libelle, nature: 'recette' as const, categorieRecap }]
      : [];
  }
  const limite = r.dateFin ? new Date(`${r.dateFin}T00:00:00`) : fin;
  const finEffective = limite < fin ? limite : fin;
  const pas = r.frequence === 'mensuelle' ? 1 : r.frequence === 'trimestrielle' ? 3 : 12;
  const occurrences: Occurrence[] = [];
  let courante = premiere;
  let garde = 0;
  while (courante <= finEffective && garde < 500) {
    if (courante >= debut) occurrences.push({ date: courante, montant: r.montant, libelle: r.libelle, nature: 'recette', categorieRecap });
    courante = ajouterMois(courante, pas);
    garde += 1;
  }
  return occurrences;
}

/** Normalise un nom de pop-up pour comparaison (casse, espaces superflus) — les noms réels (table
 * pop_ups, ex. "Creteil soleil") et ceux saisis dans Trésorerie (ex. "creteil") ne sont jamais
 * identiques au caractère près, cf. estPopUpDejaOuvert/trouverDateDebutPopUp. */
function normaliser(nom: string): string {
  return nom.trim().toLowerCase();
}

/** Nom du pop-up porté par une dépense "loyer" marquée estPopUp — le préfixe "Loyer " (ou "Loyer
 * et charges ") est retiré pour ne garder que le nom comparable à celui saisi côté recette. */
function nomPopUpDepuisLibelle(libelle: string): string {
  return libelle.replace(/^loyer(\s+et\s+charges)?\s+/i, '').trim();
}

/** Date de la première échéance du loyer du pop-up nommé `popUpNom` (comparaison insensible à la
 * casse/aux espaces) — null si aucune dépense estPopUp ne correspond. */
function trouverDateDebutPopUp(popUpNom: string, depenses: DepenseFlux[]): Date | null {
  const cible = normaliser(popUpNom);
  const depense = depenses.find((d) => d.estPopUp && normaliser(nomPopUpDepuisLibelle(d.libelle)) === cible);
  return depense ? new Date(`${depense.date}T00:00:00`) : null;
}

/** Un pop-up déjà créé dans l'appli (table pop_ups, ex. "Creteil soleil") — ses revenus comptent
 * dès sa grille de mensualités, sans attendre son 1er loyer (cf. retour utilisateur du
 * 2026-09-11 : "ça compte à partir du premier loyer... sauf ceux qui sont déjà enregistrés").
 * Comparaison par inclusion (pas d'égalité stricte) : "Parinor" doit matcher "Oparinord". */
function estPopUpDejaOuvert(popUpNom: string, popUpsReels: string[]): boolean {
  const cible = normaliser(popUpNom);
  return popUpsReels.some((nom) => {
    const n = normaliser(nom);
    return n.includes(cible) || cible.includes(n);
  });
}

/** Une occurrence par mois de la grille de mensualités qui tombe entre `debut` et `fin` — montant
 * net des charges variables (cf. calculMensualite). Un pop-up déjà ouvert (cf. estPopUpDejaOuvert)
 * compte dès que sa grille a un mois à un pourcentage non nul ; un pop-up pas encore ouvert ne
 * compte qu'à partir du mois de son 1er loyer (cf. trouverDateDebutPopUp), et pas du tout si aucun
 * loyer ne lui correspond (cf. retour utilisateur du 2026-09-11 : "Bordeaux j'ai un chiffre en
 * septembre alors qu'il est pas ouvert"). */
function occurrencesRecetteDansLaPeriode(
  r: RecetteFlux,
  debut: Date,
  fin: Date,
  depenses: DepenseFlux[],
  popUpsReels: string[],
): Occurrence[] {
  const dejaOuvert = estPopUpDejaOuvert(r.popUpNom, popUpsReels);
  const dateDebutPopUp = dejaOuvert ? null : trouverDateDebutPopUp(r.popUpNom, depenses);
  if (!dejaOuvert && !dateDebutPopUp) return [];

  const occurrences: Occurrence[] = [];
  for (const m of r.mensualites) {
    const dateMois = new Date(`${m.mois}T00:00:00`);
    if (dateMois < debut || dateMois > fin || m.pourcentage <= 0) continue;
    if (dateDebutPopUp && (dateMois.getFullYear() < dateDebutPopUp.getFullYear() ||
      (dateMois.getFullYear() === dateDebutPopUp.getFullYear() && dateMois.getMonth() < dateDebutPopUp.getMonth()))) {
      continue;
    }
    occurrences.push({
      date: dateMois,
      montant: calculMensualite(r, m).net,
      libelle: `Recette ${r.popUpNom}`,
      nature: 'recette',
      categorieRecap: 'Revenu pop-up',
    });
  }
  return occurrences;
}

/** Montant compact pour l'échelle du graphique (ex. "12 k€") — un montant complet ("12 450 €")
 * prendrait trop de place à côté de la ligne, cf. retour utilisateur : "sur le graphique j'arrive
 * pas bien à voir, y'a pas les chiffres, l'échelle". */
function formatMontantCourt(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

const LARGEUR = 760;
const HAUTEUR = 260;
const MARGE = { haut: 16, bas: 28, gauche: 56, droite: 8 };
const NB_GRADUATIONS = 4;

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

  // Graduations de l'axe vertical — sans ça, la ligne bouge mais rien n'indique à quelle échelle
  // (cf. retour utilisateur : "j'arrive pas bien à voir, y'a pas les chiffres, l'échelle").
  const graduations = Array.from({ length: NB_GRADUATIONS + 1 }, (_, i) => min + (etendue * i) / NB_GRADUATIONS);

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
          <rect x={MARGE.gauche} y={yZero} width={zoneW} height={MARGE.haut + zoneH - yZero} fill="#FEF2F2" />
        )}
        {graduations.map((valeur) => (
          <g key={valeur}>
            <line x1={MARGE.gauche} y1={yPix(valeur)} x2={LARGEUR} y2={yPix(valeur)} stroke="#F1F5F9" strokeWidth={1} />
            <text x={MARGE.gauche - 6} y={yPix(valeur)} dy={3} fontSize={10} fill="#94A3B8" textAnchor="end">
              {formatMontantCourt(valeur)}
            </text>
          </g>
        ))}
        <line x1={MARGE.gauche} y1={yZero} x2={LARGEUR} y2={yZero} stroke="#CBD5E1" strokeWidth={1} strokeDasharray={min < 0 ? '4 3' : undefined} />
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
  recettesExceptionnellesInitiales,
  popUpsReels,
}: {
  soldeActuel: number;
  depensesInitiales: DepenseFlux[];
  recettesInitiales: RecetteFlux[];
  recettesExceptionnellesInitiales: RecetteExceptionnelleFlux[];
  popUpsReels: string[];
}) {
  const router = useRouter();
  const [depenses, setDepenses] = useState(depensesInitiales);
  const [recettes, setRecettes] = useState(recettesInitiales);
  const [recettesExceptionnelles, setRecettesExceptionnelles] = useState(recettesExceptionnellesInitiales);
  // router.refresh() (après ajout/modification/suppression) refait le rendu serveur et passe de
  // nouvelles props, mais un useState initialisé une fois ne les reprend jamais tout seul — sans
  // cet effet, une ligne fraîchement créée reste invisible malgré son insertion réussie en base
  // (cf. bug trouvé en testant : "TEST TVA T4" enregistrée en base mais jamais affichée).
  useEffect(() => setDepenses(depensesInitiales), [depensesInitiales]);
  useEffect(() => setRecettes(recettesInitiales), [recettesInitiales]);
  useEffect(() => setRecettesExceptionnelles(recettesExceptionnellesInitiales), [recettesExceptionnellesInitiales]);

  const [form, setForm] = useState<FormulaireDepense>(FORMULAIRE_VIDE);
  // null = mode "ajouter" ; sinon id de la dépense en cours de modification (cf. retour
  // utilisateur : "il faut pouvoir aussi modifier les dépenses déjà mises").
  const [editionId, setEditionId] = useState<string | null>(null);

  const [formRecette, setFormRecette] = useState<FormulaireRecette>(FORMULAIRE_RECETTE_VIDE);
  const [editionRecetteId, setEditionRecetteId] = useState<string | null>(null);

  const [formRecetteExceptionnelle, setFormRecetteExceptionnelle] = useState<FormulaireDepense>(FORMULAIRE_VIDE);
  const [editionRecetteExceptionnelleId, setEditionRecetteExceptionnelleId] = useState<string | null>(null);

  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);
  const [enCoursRecette, demarrerRecette] = useTransition();
  const [erreurRecette, setErreurRecette] = useState<string | null>(null);
  const [suppressionRecetteEnCours, setSuppressionRecetteEnCours] = useState<string | null>(null);
  const [enCoursRecetteExceptionnelle, demarrerRecetteExceptionnelle] = useTransition();
  const [erreurRecetteExceptionnelle, setErreurRecetteExceptionnelle] = useState<string | null>(null);
  const [suppressionRecetteExceptionnelleEnCours, setSuppressionRecetteExceptionnelleEnCours] = useState<string | null>(null);

  const debut = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const fin = useMemo(() => ajouterMois(debut, 12), [debut]);

  const occurrences = useMemo(() => {
    const depensesOcc = depenses.flatMap((d) => occurrencesDansLaPeriode(d, debut, fin));
    const recettesOcc = recettes.flatMap((r) => occurrencesRecetteDansLaPeriode(r, debut, fin, depenses, popUpsReels));
    const recettesExceptionnellesOcc = recettesExceptionnelles.flatMap((r) => occurrencesRecetteExceptionnelleDansLaPeriode(r, debut, fin));
    return [...depensesOcc, ...recettesOcc, ...recettesExceptionnellesOcc].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [depenses, recettes, recettesExceptionnelles, popUpsReels, debut, fin]);

  const totalDepensesSurUnAn = occurrences.filter((o) => o.nature === 'depense').reduce((s, o) => s + o.montant, 0);
  const totalRecettesSurUnAn = occurrences.filter((o) => o.nature === 'recette').reduce((s, o) => s + o.montant, 0);

  const [recapOuvert, setRecapOuvert] = useState(false);
  const moisClesRecap = useMemo(() => clesMoisPeriode(debut, NOMBRE_MOIS_PREREMPLIS), [debut]);
  const recap = useMemo(() => construireRecapMensuel(occurrences, moisClesRecap), [occurrences, moisClesRecap]);

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

  // Applique un taux de charges variables à tous les pop-up d'un coup — cf. retour utilisateur :
  // "donne-moi la possibilité de changer toutes les charges variables des pop-up".
  const [tauxPourTous, setTauxPourTous] = useState('30');
  const [applicationTauxEnCours, setApplicationTauxEnCours] = useState(false);
  const [erreurTauxPourTous, setErreurTauxPourTous] = useState<string | null>(null);

  const appliquerTauxPourTous = () => {
    setErreurTauxPourTous(null);
    const taux = Number(tauxPourTous.replace(',', '.'));
    if (Number.isNaN(taux) || taux < 0 || taux > 100) {
      setErreurTauxPourTous('Le taux doit être un nombre entre 0 et 100.');
      return;
    }
    const confirme = window.confirm(`Mettre ${taux}% de charges variables sur tous les pop-up (${recettes.length}) ?`);
    if (!confirme) return;
    setApplicationTauxEnCours(true);
    setRecettes((liste) => liste.map((r) => ({ ...r, tauxChargesVariables: taux })));
    definirTauxChargesVariablesPourTous(taux)
      .then(() => router.refresh())
      .catch((e) => {
        setErreurTauxPourTous(e instanceof Error ? e.message : "Échec de l'enregistrement.");
        setRecettes(recettesInitiales);
      })
      .finally(() => setApplicationTauxEnCours(false));
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

  const demarrerEditionRecetteExceptionnelle = (r: RecetteExceptionnelleFlux) => {
    setErreurRecetteExceptionnelle(null);
    setEditionRecetteExceptionnelleId(r.id);
    setFormRecetteExceptionnelle({
      libelle: r.libelle,
      montant: String(r.montant),
      type: r.type,
      date: r.date,
      frequence: r.frequence ?? 'mensuelle',
      dateFin: r.dateFin ?? '',
      note: r.note ?? '',
      estPopUp: false,
    });
  };

  const annulerEditionRecetteExceptionnelle = () => {
    setEditionRecetteExceptionnelleId(null);
    setFormRecetteExceptionnelle(FORMULAIRE_VIDE);
    setErreurRecetteExceptionnelle(null);
  };

  const soumettreRecetteExceptionnelle = () => {
    setErreurRecetteExceptionnelle(null);
    const montantNombre = Number(formRecetteExceptionnelle.montant.replace(',', '.'));
    if (
      !formRecetteExceptionnelle.libelle.trim() ||
      !formRecetteExceptionnelle.date ||
      !formRecetteExceptionnelle.montant ||
      Number.isNaN(montantNombre) ||
      montantNombre <= 0
    ) {
      setErreurRecetteExceptionnelle('Libellé, date et montant sont obligatoires.');
      return;
    }
    const params = {
      libelle: formRecetteExceptionnelle.libelle,
      montant: montantNombre,
      type: formRecetteExceptionnelle.type,
      date: formRecetteExceptionnelle.date,
      frequence: formRecetteExceptionnelle.type === 'recurrente' ? formRecetteExceptionnelle.frequence : null,
      dateFin: formRecetteExceptionnelle.type === 'recurrente' ? formRecetteExceptionnelle.dateFin : null,
      note: formRecetteExceptionnelle.note,
    };
    demarrerRecetteExceptionnelle(async () => {
      try {
        if (editionRecetteExceptionnelleId) {
          await modifierRecetteExceptionnelleFlux(editionRecetteExceptionnelleId, params);
        } else {
          await creerRecetteExceptionnelleFlux(params);
        }
        setFormRecetteExceptionnelle(FORMULAIRE_VIDE);
        setEditionRecetteExceptionnelleId(null);
        router.refresh();
      } catch (e) {
        setErreurRecetteExceptionnelle(e instanceof Error ? e.message : "Échec de l'enregistrement.");
      }
    });
  };

  const supprimerRecetteExceptionnelle = (r: RecetteExceptionnelleFlux) => {
    const confirme = window.confirm(`Supprimer "${r.libelle}" (${formatMontant(r.montant)}) ?`);
    if (!confirme) return;
    if (editionRecetteExceptionnelleId === r.id) annulerEditionRecetteExceptionnelle();
    setSuppressionRecetteExceptionnelleEnCours(r.id);
    setRecettesExceptionnelles((liste) => liste.filter((l) => l.id !== r.id));
    supprimerRecetteExceptionnelleFlux(r.id)
      .catch((e) => {
        setErreurRecetteExceptionnelle(e instanceof Error ? e.message : 'Échec de la suppression.');
        setRecettesExceptionnelles(recettesExceptionnellesInitiales);
      })
      .finally(() => {
        setSuppressionRecetteExceptionnelleEnCours(null);
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
          Recettes = pour chaque pop-up et chaque mois, (% des ventes × CA/jour de référence × nb de jours du mois) moins les charges
          variables — cf. grille &quot;Recettes par pop-up&quot; ci-dessous. Les revenus du site ne sont pas encore intégrés.
        </p>

        <button
          type="button"
          onClick={() => setRecapOuvert((v) => !v)}
          className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          {recapOuvert ? 'Masquer le récap mensuel' : '📊 Récap mensuel détaillé'}
        </button>

        {recapOuvert && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="sticky left-0 bg-white px-3 py-2.5">Catégorie</th>
                  {moisClesRecap.map((cle) => (
                    <th key={cle} className="whitespace-nowrap px-3 py-2.5 text-right">
                      {formatMoisCourt(`${cle}-01`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recap.map((ligne) => (
                  <tr
                    key={ligne.cle}
                    className={`border-b border-slate-50 last:border-0 ${ligne.emphase ? 'bg-slate-50 font-bold' : ''} ${
                      ligne.cle === 'total-revenus'
                        ? 'text-emerald-700'
                        : ligne.cle === 'total-depenses'
                          ? 'text-red-600'
                          : ligne.cle.startsWith('r-')
                            ? 'text-emerald-600'
                            : ''
                    }`}
                  >
                    <td className={`sticky left-0 px-3 py-2 ${ligne.emphase ? 'bg-slate-50' : 'bg-white'} ${!ligne.emphase ? 'text-slate-600' : ''}`}>
                      {ligne.label}
                    </td>
                    {moisClesRecap.map((cle) => (
                      <td key={cle} className="whitespace-nowrap px-3 py-2 text-right">
                        {ligne.parMois[cle] === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : ligne.cle === 'solde' ? (
                          <span className={ligne.parMois[cle] < 0 ? 'text-red-600' : 'text-emerald-600'}>
                            {formatMontant(ligne.parMois[cle])}
                          </span>
                        ) : (
                          formatMontant(ligne.parMois[cle])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

      <h2 className="mb-4 mt-10 text-lg font-bold text-slate-900">Recettes exceptionnelles</h2>

      <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {editionRecetteExceptionnelleId ? 'Modifier la recette exceptionnelle' : 'Ajouter une recette exceptionnelle'}
          </p>
          {editionRecetteExceptionnelleId && (
            <button
              type="button"
              onClick={annulerEditionRecetteExceptionnelle}
              className="text-xs font-semibold text-slate-400 hover:underline"
            >
              Annuler la modification
            </button>
          )}
        </div>

        <div className="mb-3 flex gap-2">
          {(['ponctuelle', 'recurrente'] as TypeDepense[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFormRecetteExceptionnelle((f) => ({ ...f, type: t }))}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                formRecetteExceptionnelle.type === t ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 bg-white text-slate-500'
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
              value={formRecetteExceptionnelle.libelle}
              onChange={(e) => setFormRecetteExceptionnelle((f) => ({ ...f, libelle: e.target.value }))}
              placeholder="Ex. Subvention, remboursement assurance…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-emerald-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Montant HT (€)</span>
            <input
              value={formRecetteExceptionnelle.montant}
              onChange={(e) => setFormRecetteExceptionnelle((f) => ({ ...f, montant: e.target.value }))}
              placeholder="Ex. 1500"
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-emerald-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {formRecetteExceptionnelle.type === 'ponctuelle' ? "Date d'encaissement" : '1er encaissement'}
            </span>
            <input
              type="date"
              value={formRecetteExceptionnelle.date}
              onChange={(e) => setFormRecetteExceptionnelle((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-emerald-300 focus:bg-white focus:outline-none"
            />
          </label>

          {formRecetteExceptionnelle.type === 'recurrente' && (
            <>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fréquence</span>
                <select
                  value={formRecetteExceptionnelle.frequence}
                  onChange={(e) => setFormRecetteExceptionnelle((f) => ({ ...f, frequence: e.target.value as FrequenceDepense }))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-emerald-300 focus:bg-white focus:outline-none"
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
                  value={formRecetteExceptionnelle.dateFin}
                  onChange={(e) => setFormRecetteExceptionnelle((f) => ({ ...f, dateFin: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-emerald-300 focus:bg-white focus:outline-none"
                />
              </label>
            </>
          )}
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Note (optionnel)</span>
          <input
            value={formRecetteExceptionnelle.note}
            onChange={(e) => setFormRecetteExceptionnelle((f) => ({ ...f, note: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-emerald-300 focus:bg-white focus:outline-none"
          />
        </label>

        {erreurRecetteExceptionnelle && <p className="mb-2 text-xs font-semibold text-red-600">{erreurRecetteExceptionnelle}</p>}

        <button
          type="button"
          onClick={soumettreRecetteExceptionnelle}
          disabled={enCoursRecetteExceptionnelle}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {enCoursRecetteExceptionnelle
            ? 'Enregistrement…'
            : editionRecetteExceptionnelleId
              ? 'Enregistrer les modifications'
              : 'Ajouter la recette'}
        </button>
      </div>

      <div className="mb-10 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Libellé</th>
              <th className="px-4 py-3">Montant HT</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Échéance</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">Ajouté par</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {recettesExceptionnelles.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-slate-50 last:border-0 ${editionRecetteExceptionnelleId === r.id ? 'bg-emerald-50/50' : ''}`}
              >
                <td className="px-4 py-2.5 font-semibold text-slate-800">{r.libelle}</td>
                <td className="px-4 py-2.5 font-bold text-emerald-600">{formatMontant(r.montant)}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {r.type === 'ponctuelle' ? 'Ponctuelle' : r.frequence ? LIBELLE_FREQUENCE[r.frequence] : 'Récurrente'}
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {formatDateCourte(r.date)}
                  {r.dateFin ? ` → ${formatDateCourte(r.dateFin)}` : ''}
                </td>
                <td className="max-w-[160px] px-4 py-2.5 text-slate-500">{r.note ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-400">{r.creeParNom}</td>
                <td className="px-2 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => demarrerEditionRecetteExceptionnelle(r)}
                      title="Modifier cette recette"
                      className="rounded-lg px-2 py-1 text-slate-300 hover:bg-emerald-50 hover:text-emerald-500"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => supprimerRecetteExceptionnelle(r)}
                      disabled={suppressionRecetteExceptionnelleEnCours === r.id}
                      className="rounded-lg px-2 py-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {recettesExceptionnelles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  Aucune recette exceptionnelle enregistrée.
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

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Charges variables (%) pour tous les pop-up
          </span>
          <input
            value={tauxPourTous}
            onChange={(e) => setTauxPourTous(e.target.value)}
            placeholder="Ex. 30"
            inputMode="decimal"
            className="w-32 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={appliquerTauxPourTous}
          disabled={applicationTauxEnCours || recettes.length === 0}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {applicationTauxEnCours ? 'Application…' : 'Appliquer à tous les pop-up'}
        </button>
        {erreurTauxPourTous && <p className="text-xs font-semibold text-red-600">{erreurTauxPourTous}</p>}
      </div>

      <div className="flex flex-col gap-4">
        {recettes.map((r) => {
          const dejaOuvert = estPopUpDejaOuvert(r.popUpNom, popUpsReels);
          const dateDebutPopUp = dejaOuvert ? null : trouverDateDebutPopUp(r.popUpNom, depenses);
          return (
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
                {dejaOuvert ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Déjà ouvert — compte depuis le début
                  </span>
                ) : dateDebutPopUp ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Compte à partir du {formatDateCourte(dateEnISO(dateDebutPopUp))} (1er loyer)
                  </span>
                ) : (
                  <span
                    className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700"
                    title="Ni un pop-up réel, ni de dépense loyer estPopUp correspondante — revenus non comptés"
                  >
                    ⚠ Aucun loyer trouvé — revenus pas comptés
                  </span>
                )}
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
          );
        })}
        {recettes.length === 0 && (
          <p className="rounded-[20px] border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-sm">
            Aucune recette enregistrée.
          </p>
        )}
      </div>
    </div>
  );
}
