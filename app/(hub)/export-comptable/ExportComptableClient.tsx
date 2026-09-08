'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { ajouterJours, dateEnISO, formatDureeHeures } from '../planning/dateUtils';
import { definirExclusionDimanche } from './actions';
import {
  calculerSemainesProfil,
  HEURES_ECOLE_PAR_JOUR,
  joursCongesDuMois,
  totalHeuresDimancheMoisProfil,
  totalHeuresEcoleMoisProfil,
  totalHeuresMoisProfil,
  type CongeCalcul,
  type JourCalendrier,
  type JourEcoleCalcul,
  type SemaineCalendrier,
  type ShiftCalcul,
} from './calcul';

/** Heures affichées d'un jour, en tenant compte d'une éventuelle correction manuelle (cf. retour
 * utilisateur : "il faudrait pouvoir faire des modifications des heures sur les jours avant
 * d'enregistrer en pdf") — ne touche jamais le planning réel, purement local à cet export (même
 * principe que les lignes du résumé mensuel, cf. plus bas). */
type EditionsCalendrier = Record<string, Record<string, number>>;

function heuresJourResolues(profileId: string, jour: JourCalendrier, editions: EditionsCalendrier): number {
  const correction = editions[profileId]?.[jour.date];
  return correction ?? jour.heuresAffichees;
}

/** Total d'une semaine affichée : heures travaillées (corrigées si édité) + heures d'école (cf.
 * retour utilisateur : "dans le total semaine faut compter les heures de cours avec"). */
function totalSemaineResolu(profileId: string, semaine: SemaineCalendrier, editions: EditionsCalendrier): number {
  const total = semaine.jours.reduce((t, j) => t + heuresJourResolues(profileId, j, editions) + j.heuresEcole, 0);
  return Math.round(total * 100) / 100;
}

/** Total du mois affiché (jours du mois strict uniquement, cf. calcul.ts) — corrections + école
 * incluses, cohérent avec totalSemaineResolu ci-dessus. */
function totalMoisResolu(profileId: string, semaines: SemaineCalendrier[], editions: EditionsCalendrier): number {
  let total = 0;
  for (const s of semaines) {
    for (const j of s.jours) {
      if (j.horsMois) continue;
      total += heuresJourResolues(profileId, j, editions) + j.heuresEcole;
    }
  }
  return Math.round(total * 100) / 100;
}

type Role = 'admin' | 'employe';
type TypeContrat = 'manager' | 'employe' | 'alternant';

interface Profil {
  id: string;
  nom_complet: string;
  email: string;
  role: Role;
  type_contrat: TypeContrat;
}

interface InfoRh {
  profile_id: string;
  exclure_heures_dimanche: boolean | null;
}

const HEURES_ADMIN_PAR_JOUR = 7;

const LIBELLE_TYPE: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

/** Semaine standard lundi → vendredi (cf. discussion 2026-08-28 : confirmé que le samedi ne compte
 * PAS comme jour travaillé pour les admins, contrairement aux jours ouvrables — concept distinct de
 * estJourOuvrable côté calcul.ts, qui lui inclut le samedi pour le décompte légal des congés pris). */
function estJourOuvre(dateIso: string): boolean {
  const jour = new Date(`${dateIso}T00:00:00`).getDay();
  return jour !== 0 && jour !== 6;
}

/** Dates ISO d'un mois (bornes incluses). */
function datesDuMoisStrict(debutIso: string): string[] {
  const debut = new Date(`${debutIso}T00:00:00`);
  const mois = debut.getMonth();
  const dates: string[] = [];
  let d = debut;
  while (d.getMonth() === mois) {
    dates.push(dateEnISO(d));
    d = ajouterJours(d, 1);
  }
  return dates;
}

function moisPrecedent(moisIso: string): string {
  const d = new Date(`${moisIso}T00:00:00`);
  return dateEnISO(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}
function moisSuivant(moisIso: string): string {
  const d = new Date(`${moisIso}T00:00:00`);
  return dateEnISO(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}
function libelleMois(moisIso: string): string {
  return new Date(`${moisIso}T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function libelleSemaineCourte(lundiIso: string): string {
  const d = new Date(`${lundiIso}T00:00:00`);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

interface Ligne {
  id: string;
  nom: string;
  type: string;
  nbJoursPris: number;
  datesJoursPris: string;
  heuresDimanche: number;
  heuresEcole: number;
  heuresTravail: number;
  /** Ligne ajoutée à la main (cf. discussion 2026-08-28 : quelqu'un hors profils, ex. Louise
   * Gagliardi) plutôt que calculée depuis un profil réel — nom éditable, pas de recalcul au
   * changement de mois, supprimable. */
  manuelle?: boolean;
}

function calculerLignes(
  moisIso: string,
  profils: Profil[],
  exclusionParProfil: Map<string, boolean>,
  shifts: ShiftCalcul[],
  conges: CongeCalcul[],
  joursEcole: JourEcoleCalcul[],
): Ligne[] {
  const joursMoisStrict = datesDuMoisStrict(moisIso);

  // Règle admin (cf. discussion 2026-08-28) : 7h forfaitaires pour chaque jour ouvré du mois
  // (lundi → vendredi), un total identique pour tous les admins, sans lien avec le planning réel —
  // ce forfait ne comporte déjà aucune heure de dimanche, donc jamais concerné par la redistribution
  // "exclure dimanche" (cf. calcul.ts, en-tête).
  const joursTravaillesAdmin = joursMoisStrict.filter(estJourOuvre).length;

  return profils.map((p) => {
    if (p.role === 'admin') {
      return {
        id: p.id,
        nom: p.nom_complet || p.email,
        type: LIBELLE_TYPE.admin,
        nbJoursPris: 0,
        datesJoursPris: '',
        heuresDimanche: 0,
        heuresEcole: 0,
        heuresTravail: joursTravaillesAdmin * HEURES_ADMIN_PAR_JOUR,
      };
    }

    const exclureDimanche = exclusionParProfil.get(p.id) ?? false;
    const semaines = calculerSemainesProfil({ debutMoisIso: moisIso, profileId: p.id, exclureDimanche, shifts, conges, joursEcole });
    const datesPrises = joursCongesDuMois(moisIso, p.id, conges);

    return {
      id: p.id,
      nom: p.nom_complet || p.email,
      type: LIBELLE_TYPE[p.type_contrat] ?? p.type_contrat,
      nbJoursPris: datesPrises.length,
      datesJoursPris: datesPrises.join(', '),
      heuresDimanche: totalHeuresDimancheMoisProfil(semaines),
      heuresEcole: totalHeuresEcoleMoisProfil(semaines),
      heuresTravail: totalHeuresMoisProfil(semaines),
    };
  });
}

// PDF via l'impression native du navigateur plutôt qu'une lib type @react-pdf/renderer (cf.
// discussion 2026-08-28 : "un joli pdf clair pas un vieux csv") — tenté d'abord avec
// @react-pdf/renderer, qui a bloqué l'onglet entier (page insensible, aucune interaction possible)
// lors de la génération côté navigateur ; retiré. Le moteur d'impression de Chrome est nettement
// plus robuste : une vue imprimable dédiée (cf. plus bas, "print:block hidden") + "Enregistrer en
// PDF" comme destination dans la boîte de dialogue d'impression du navigateur.

const JOURS_LABELS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function CelluleJour({
  jour,
  profileId,
  editable,
  editions,
  onModifierHeure,
}: {
  jour: JourCalendrier;
  profileId: string;
  editable: boolean;
  editions: EditionsCalendrier;
  onModifierHeure: (dateIso: string, valeur: number) => void;
}) {
  const d = new Date(`${jour.date}T00:00:00`);
  const heures = heuresJourResolues(profileId, jour, editions);
  return (
    <td
      className={`border-b border-slate-200 px-2 py-1.5 align-top ${jour.horsMois ? 'text-slate-300' : ''} ${
        jour.estDimanche && !jour.horsMois && jour.heuresReelles > 0 ? 'bg-amber-50' : ''
      }`}
    >
      {/* Date bien séparée des heures (cf. retour utilisateur : "on peut confondre c'est pas
          beau") — petite étiquette grise au-dessus d'un filet, les heures nettement plus grosses
          et en dessous. */}
      <div className="mb-1 border-b border-slate-100 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        {d.getDate()}
      </div>
      {editable && !jour.horsMois ? (
        <input
          type="number"
          step="0.25"
          value={heures}
          onChange={(e) => onModifierHeure(jour.date, Number(e.target.value))}
          className="w-14 rounded border border-transparent bg-slate-50 px-1 py-0.5 text-sm font-bold text-slate-900 focus:border-indigo-300 focus:bg-white focus:outline-none"
        />
      ) : (
        <div className="text-sm font-bold">{heures > 0 ? formatDureeHeures(heures) : '—'}</div>
      )}
      <div className="mt-1 flex flex-col gap-0.5 text-[9px] font-semibold leading-tight">
        {jour.estEcole && <span className="text-cyan-600">École {formatDureeHeures(jour.heuresEcole)}</span>}
        {jour.estConge && <span className="text-red-500">Congé</span>}
        {jour.estDimanche && jour.heuresReelles > 0 && <span className="text-amber-600">Dimanche</span>}
      </div>
    </td>
  );
}

function LegendeCalendrier() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
      <span className="font-semibold text-slate-700">Légende :</span>
      <span>
        <span className="font-bold">Xh</span> — heures travaillées ce jour (dimanche redistribué si la case est cochée,
        modifiable à la main)
      </span>
      <span className="text-amber-600">Dimanche — dimanche travaillé</span>
      <span className="text-cyan-600">École — jour d&apos;école (compté dans le total semaine)</span>
      <span className="text-red-500">Congé — congé posé</span>
    </div>
  );
}

function CarteCalendrierEmploye({
  profil,
  semaines,
  heuresEcoleMois,
  exclureDimanche,
  enCoursBascule,
  onBasculerExclusion,
  editable,
  editions,
  onModifierHeure,
  onReinitialiserEditions,
}: {
  profil: Profil;
  semaines: SemaineCalendrier[];
  heuresEcoleMois: number;
  exclureDimanche: boolean;
  enCoursBascule: boolean;
  onBasculerExclusion: (valeur: boolean) => void;
  editable: boolean;
  editions: EditionsCalendrier;
  onModifierHeure: (dateIso: string, valeur: number) => void;
  onReinitialiserEditions: () => void;
}) {
  const totalMois = totalMoisResolu(profil.id, semaines, editions);
  const aDesCorrections = Object.keys(editions[profil.id] ?? {}).length > 0;
  return (
    <div className="mb-6 overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-sm print:break-inside-avoid print:rounded-none print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 print:bg-transparent">
        <div>
          <span className="text-sm font-bold text-slate-900">{profil.nom_complet || profil.email}</span>
          <span className="ml-2 text-xs text-slate-400">{LIBELLE_TYPE[profil.type_contrat]}</span>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <input
              type="checkbox"
              checked={exclureDimanche}
              disabled={enCoursBascule}
              onChange={(e) => onBasculerExclusion(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Ne pas compter les dimanches
          </label>
          {aDesCorrections && (
            <button
              type="button"
              onClick={onReinitialiserEditions}
              title="Annule les corrections manuelles des heures pour cette personne ce mois-ci"
              className="text-xs font-semibold text-slate-400 underline decoration-dotted hover:text-slate-600"
            >
              Réinitialiser les heures
            </button>
          )}
          <span className="text-xs font-bold text-indigo-600">Total mois : {formatDureeHeures(totalMois)}</span>
        </div>
        <span className="hidden text-xs font-bold text-slate-700 print:inline">Total mois : {formatDureeHeures(totalMois)}</span>
      </div>

      <table className="w-full border-collapse text-left text-[11px]">
        <thead>
          <tr className="bg-slate-900 text-white">
            <th className="px-2 py-1 font-semibold">Semaine</th>
            {JOURS_LABELS_COURTS.map((l) => (
              <th key={l} className="px-2 py-1 font-semibold">
                {l}
              </th>
            ))}
            <th className="px-2 py-1 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {semaines.map((s, i) => (
            <tr key={s.lundiIso} className={i % 2 === 1 ? 'bg-slate-50' : undefined}>
              <td className="border-b border-slate-200 px-2 py-1.5 font-semibold text-slate-500">
                {libelleSemaineCourte(s.lundiIso)}
              </td>
              {s.jours.map((j) => (
                <CelluleJour
                  key={j.date}
                  jour={j}
                  profileId={profil.id}
                  editable={editable}
                  editions={editions}
                  onModifierHeure={onModifierHeure}
                />
              ))}
              <td className="border-b border-slate-200 px-2 py-1.5 align-top">
                <div className="text-xs font-bold text-indigo-700">{formatDureeHeures(totalSemaineResolu(profil.id, s, editions))}</div>
                {s.alerteRedistributionImpossible && (
                  <div className="mt-0.5 text-[9px] font-semibold text-amber-600">⚠ dimanche seul, à vérifier</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {heuresEcoleMois > 0 && (
        <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          Dont {formatDureeHeures(heuresEcoleMois)} d&apos;école ce mois ({heuresEcoleMois / HEURES_ECOLE_PAR_JOUR} jour
          {heuresEcoleMois / HEURES_ECOLE_PAR_JOUR > 1 ? 's' : ''}) — déjà comptée dans le total.
        </div>
      )}
    </div>
  );
}

export function ExportComptableClient({
  moisIso,
  profils,
  informationsRh,
  shifts,
  conges,
  joursEcole,
}: {
  moisIso: string;
  profils: Profil[];
  informationsRh: InfoRh[];
  shifts: ShiftCalcul[];
  conges: CongeCalcul[];
  joursEcole: JourEcoleCalcul[];
}) {
  const router = useRouter();
  const [vue, setVue] = useState<'resume' | 'calendrier'>('resume');

  // État local optimiste pour la case "exclure dimanche" (cf. definirExclusionDimanche) — reflète
  // tout de suite le clic, resynchronisé avec la base via router.refresh() derrière.
  const [exclusionLocale, setExclusionLocale] = useState<Map<string, boolean>>(
    () => new Map(informationsRh.map((r) => [r.profile_id, r.exclure_heures_dimanche ?? false])),
  );
  const [profilEnCoursBascule, setProfilEnCoursBascule] = useState<string | null>(null);
  const [, demarrerBascule] = useTransition();

  useEffect(() => {
    setExclusionLocale(new Map(informationsRh.map((r) => [r.profile_id, r.exclure_heures_dimanche ?? false])));
  }, [informationsRh]);

  const basculerExclusion = (profileId: string, valeur: boolean) => {
    setExclusionLocale((m) => new Map(m).set(profileId, valeur));
    setProfilEnCoursBascule(profileId);
    demarrerBascule(async () => {
      try {
        await definirExclusionDimanche(profileId, valeur);
        router.refresh();
      } finally {
        setProfilEnCoursBascule(null);
      }
    });
  };

  const lignesCalculees = useMemo(
    () => calculerLignes(moisIso, profils, exclusionLocale, shifts, conges, joursEcole),
    [moisIso, profils, exclusionLocale, shifts, conges, joursEcole],
  );

  const semainesParProfil = useMemo(() => {
    const map = new Map<string, SemaineCalendrier[]>();
    for (const p of profils) {
      if (p.role === 'admin') continue; // forfait fixe, pas de vrai calendrier hebdo (cf. calculerLignes)
      const semaines = calculerSemainesProfil({
        debutMoisIso: moisIso,
        profileId: p.id,
        exclureDimanche: exclusionLocale.get(p.id) ?? false,
        shifts,
        conges,
        joursEcole,
      });
      map.set(p.id, semaines);
    }
    return map;
  }, [moisIso, profils, exclusionLocale, shifts, conges, joursEcole]);

  // Corrections manuelles des heures par jour, vue calendrier (cf. retour utilisateur : "il
  // faudrait pouvoir faire des modifications des heures sur les jours avant d'enregistrer en pdf")
  // — jamais en base (cf. réponse à la question posée avant de construire cet écran : uniquement
  // l'export, aucun impact sur le vrai planning), persisté dans localStorage par mois comme le
  // reste de cet export.
  const cleStockageCalendrier = (mois: string) => `export-comptable:calendrier:${mois}`;
  const [editionsCalendrier, setEditionsCalendrier] = useState<EditionsCalendrier>({});

  useEffect(() => {
    try {
      const sauvegarde = localStorage.getItem(cleStockageCalendrier(moisIso));
      setEditionsCalendrier(sauvegarde ? (JSON.parse(sauvegarde) as EditionsCalendrier) : {});
    } catch {
      setEditionsCalendrier({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moisIso]);

  const modifierHeureCalendrier = (profileId: string, dateIso: string, valeur: number) => {
    setEditionsCalendrier((prev) => {
      const suivant = { ...prev, [profileId]: { ...prev[profileId], [dateIso]: valeur } };
      try {
        localStorage.setItem(cleStockageCalendrier(moisIso), JSON.stringify(suivant));
      } catch {
        /* navigation privée / quota dépassé — la correction reste au moins visible en mémoire. */
      }
      return suivant;
    });
  };

  const reinitialiserEditionsCalendrier = (profileId: string) => {
    setEditionsCalendrier((prev) => {
      const suivant = { ...prev };
      delete suivant[profileId];
      try {
        localStorage.setItem(cleStockageCalendrier(moisIso), JSON.stringify(suivant));
      } catch {
        /* idem ci-dessus */
      }
      return suivant;
    });
  };

  // Toujours en local (jamais en base, cf. page.tsx — un export ponctuel, pas une nouvelle source
  // de vérité), mais persisté dans localStorage par mois (cf. retour utilisateur du 2026-08-28 :
  // "ça a tout bougé ce que j'avais fait" — sans ça, tout édit ou ligne ajoutée à la main
  // disparaissait au moindre rechargement/changement de mois puisque l'état ne survivait qu'en
  // mémoire React). Une fois sauvegardé pour un mois, ce mois ne se recalcule plus tout seul tant
  // que quelqu'un ne clique pas explicitement sur "Recalculer" — sinon un edit manuel pourrait être
  // silencieusement écrasé par un recalcul automatique.
  const cleStockage = (mois: string) => `export-comptable:${mois}`;

  interface Etat {
    lignes: Ligne[];
    notes: string;
  }
  const etatInitial: Etat = { lignes: lignesCalculees, notes: '' };

  const [etat, setEtat] = useState<Etat>(etatInitial);
  const { lignes, notes } = etat;
  const [moisAffiche, setMoisAffiche] = useState(moisIso);
  const [confirmerRecalcul, setConfirmerRecalcul] = useState(false);

  const chargerDepuisStockage = (mois: string, defaut: Etat): Etat => {
    try {
      const sauvegarde = localStorage.getItem(cleStockage(mois));
      if (!sauvegarde) return defaut;
      const parse: unknown = JSON.parse(sauvegarde);
      // Ancien format (avant l'ajout des notes) : un tableau de lignes brut plutôt que { lignes,
      // notes } — migration silencieuse à la lecture, pas de perte des éditions déjà sauvegardées.
      if (Array.isArray(parse)) return { lignes: parse as Ligne[], notes: '' };
      return parse as Etat;
    } catch {
      return defaut;
    }
  };

  // Recharge depuis localStorage (ou calcule à défaut) à chaque changement de mois — y compris au
  // tout premier rendu client, cf. useEffect ci-dessous qui gère spécifiquement ce cas initial pour
  // éviter un mismatch d'hydratation SSR/client.
  if (moisAffiche !== moisIso) {
    setMoisAffiche(moisIso);
    setEtat(chargerDepuisStockage(moisIso, { lignes: lignesCalculees, notes: '' }));
    setConfirmerRecalcul(false);
  }

  // Premier rendu client (hydratation) : le state initial était forcément lignesCalculees (rendu
  // serveur identique requis) — on relit localStorage juste après, une seule fois.
  useEffect(() => {
    setEtat((actuel) => chargerDepuisStockage(moisIso, actuel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sauvegarder = (nouvelEtat: Etat) => {
    setEtat(nouvelEtat);
    try {
      localStorage.setItem(cleStockage(moisIso), JSON.stringify(nouvelEtat));
    } catch {
      /* navigation privée / quota dépassé — l'édition reste au moins visible en mémoire. */
    }
  };

  const modifier = (id: string, patch: Partial<Ligne>) => {
    sauvegarder({ ...etat, lignes: lignes.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  };

  const modifierNotes = (texte: string) => sauvegarder({ ...etat, notes: texte });

  const recalculer = () => sauvegarder({ lignes: lignesCalculees, notes });

  // Ligne manuelle (cf. discussion 2026-08-28) : pour quelqu'un hors profils (ex. Louise Gagliardi,
  // pas dans l'équipe) ou une correction ponctuelle — tout est éditable, y compris le nom.
  const ajouterLigne = () => {
    sauvegarder({
      ...etat,
      lignes: [
        ...lignes,
        {
          id: `manuelle-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          nom: '',
          type: '—',
          nbJoursPris: 0,
          datesJoursPris: '',
          heuresDimanche: 0,
          heuresEcole: 0,
          heuresTravail: 0,
          manuelle: true,
        },
      ],
    });
  };

  const supprimerLigne = (id: string) => {
    sauvegarder({ ...etat, lignes: lignes.filter((l) => l.id !== id) });
  };

  return (
    <div>
      <style>{'@page { size: A4 landscape; margin: 14mm; }'}</style>

      {/* Vue imprimable "Résumé mensuel" (cf. discussion 2026-08-28 : "un joli pdf clair") —
          statique, sans les contrôles d'édition, visible uniquement à l'impression quand cette vue
          est active ("Imprimer / PDF" → destination "Enregistrer en PDF" du navigateur). */}
      {vue === 'resume' && (
        <div className="hidden print:block">
          <h1 className="mb-1 text-xl font-bold text-slate-900">Export comptable — {libelleMois(moisIso)}</h1>
          <p className="mb-4 text-xs text-slate-500">
            Pimp It — heures et jours de congé par personne · généré le{' '}
            {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-2 py-1.5 font-semibold">Nom</th>
                <th className="px-2 py-1.5 font-semibold">Type</th>
                <th className="px-2 py-1.5 font-semibold">Nb jours pris</th>
                <th className="px-2 py-1.5 font-semibold">Dates jours pris</th>
                <th className="px-2 py-1.5 font-semibold">Heures dim.</th>
                <th className="px-2 py-1.5 font-semibold">Heures école</th>
                <th className="px-2 py-1.5 font-semibold">Heures travail</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={l.id} className={i % 2 === 1 ? 'bg-slate-50' : undefined}>
                  <td className="border-b border-slate-200 px-2 py-1.5 font-semibold">{l.nom || '—'}</td>
                  <td className="border-b border-slate-200 px-2 py-1.5">{l.type}</td>
                  <td className="border-b border-slate-200 px-2 py-1.5">{l.nbJoursPris}</td>
                  <td className="border-b border-slate-200 px-2 py-1.5">{l.datesJoursPris || '—'}</td>
                  <td className="border-b border-slate-200 px-2 py-1.5">{l.heuresDimanche}</td>
                  <td className="border-b border-slate-200 px-2 py-1.5">{l.heuresEcole}</td>
                  <td className="border-b border-slate-200 px-2 py-1.5">{l.heuresTravail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {notes.trim() && (
            <div className="mt-6">
              <h2 className="mb-1.5 text-sm font-bold text-slate-900">Notes</h2>
              <p className="whitespace-pre-wrap text-xs text-slate-700">{notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Vue imprimable "Calendrier" — un bloc par employé, saut de page entre chacun (cf. retour
          utilisateur : "on voit tout le mois d'un employé sur chaque semaine... ensuite on passe à
          l'autre employé"). */}
      {vue === 'calendrier' && (
        <div className="hidden print:block">
          <h1 className="mb-1 text-xl font-bold text-slate-900">Calendrier comptable — {libelleMois(moisIso)}</h1>
          <p className="mb-3 text-xs text-slate-500">
            Pimp It · généré le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <LegendeCalendrier />
          {profils
            .filter((p) => p.role !== 'admin')
            .map((p, i, arr) => (
              <div key={p.id} className={i < arr.length - 1 ? 'print:break-after-page' : ''}>
                <CarteCalendrierEmploye
                  profil={p}
                  semaines={semainesParProfil.get(p.id) ?? []}
                  heuresEcoleMois={totalHeuresEcoleMoisProfil(semainesParProfil.get(p.id) ?? [])}
                  exclureDimanche={exclusionLocale.get(p.id) ?? false}
                  enCoursBascule={false}
                  onBasculerExclusion={() => {}}
                  editable={false}
                  editions={editionsCalendrier}
                  onModifierHeure={() => {}}
                  onReinitialiserEditions={() => {}}
                />
              </div>
            ))}
        </div>
      )}

      <div className="print:hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-[10px] border border-slate-200 bg-white px-1.5 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => router.push(`/export-comptable?mois=${moisPrecedent(moisIso)}`)}
              className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100"
            >
              ‹
            </button>
            <span className="px-2 text-sm font-semibold capitalize text-slate-800">{libelleMois(moisIso)}</span>
            <button
              type="button"
              onClick={() => router.push(`/export-comptable?mois=${moisSuivant(moisIso)}`)}
              className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100"
            >
              ›
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-[10px] border border-slate-200 bg-white px-1.5 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setVue('resume')}
              className={`rounded-md px-3 py-1.5 text-[13px] font-semibold ${
                vue === 'resume' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              Résumé mensuel
            </button>
            <button
              type="button"
              onClick={() => setVue('calendrier')}
              className={`rounded-md px-3 py-1.5 text-[13px] font-semibold ${
                vue === 'calendrier' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              Calendrier détaillé
            </button>
          </div>

          <div className="flex items-center gap-2">
            {vue === 'resume' &&
              (confirmerRecalcul ? (
                <>
                  <span className="text-xs font-semibold text-amber-600">Écrase tes modifs pour ce mois —</span>
                  <button
                    type="button"
                    onClick={() => {
                      recalculer();
                      setConfirmerRecalcul(false);
                    }}
                    className="rounded-[10px] bg-amber-500 px-3 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-amber-600"
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmerRecalcul(false)}
                    className="rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-500 shadow-sm hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmerRecalcul(true)}
                  title="Recalcule ce mois depuis le planning/congés réels — écrase tes modifications manuelles"
                  className="rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-500 shadow-sm hover:bg-slate-50"
                >
                  Recalculer
                </button>
              ))}
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-[10px] bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Imprimer / PDF
            </button>
          </div>
        </div>

        {vue === 'resume' ? (
          <>
            <p className="mb-4 -mt-2 text-xs text-slate-400">
              Tes modifications pour ce mois sont conservées dans ce navigateur (même après rechargement).
            </p>

            <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3">Nom</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Ne pas compter dim.</th>
                    <th className="px-4 py-3">Nb jours pris</th>
                    <th className="px-4 py-3">Dates jours pris</th>
                    <th className="px-4 py-3">Heures dimanche</th>
                    <th className="px-4 py-3">Heures école</th>
                    <th className="px-4 py-3">Heures travail</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">
                        {l.manuelle ? (
                          <input
                            value={l.nom}
                            onChange={(e) => modifier(l.id, { nom: e.target.value })}
                            placeholder="Nom"
                            className="w-full min-w-[140px] rounded-lg border border-transparent bg-slate-50 px-2 py-1 text-sm font-semibold focus:border-indigo-300 focus:bg-white focus:outline-none"
                          />
                        ) : (
                          l.nom
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{l.type}</td>
                      <td className="px-4 py-2.5 text-center">
                        {!l.manuelle && l.type !== LIBELLE_TYPE.admin && (
                          <input
                            type="checkbox"
                            checked={exclusionLocale.get(l.id) ?? false}
                            disabled={profilEnCoursBascule === l.id}
                            onChange={(e) => basculerExclusion(l.id, e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300"
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          step="1"
                          value={l.nbJoursPris}
                          onChange={(e) => modifier(l.id, { nbJoursPris: Number(e.target.value) })}
                          className="w-20 rounded-lg border border-transparent bg-slate-50 px-2 py-1 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          value={l.datesJoursPris}
                          onChange={(e) => modifier(l.id, { datesJoursPris: e.target.value })}
                          placeholder="—"
                          className="w-full min-w-[180px] rounded-lg border border-transparent bg-slate-50 px-2 py-1 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          step="0.25"
                          value={l.heuresDimanche}
                          onChange={(e) => modifier(l.id, { heuresDimanche: Number(e.target.value) })}
                          className="w-24 rounded-lg border border-transparent bg-slate-50 px-2 py-1 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          step="0.25"
                          value={l.heuresEcole}
                          onChange={(e) => modifier(l.id, { heuresEcole: Number(e.target.value) })}
                          className="w-24 rounded-lg border border-transparent bg-slate-50 px-2 py-1 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          step="0.25"
                          value={l.heuresTravail}
                          onChange={(e) => modifier(l.id, { heuresTravail: Number(e.target.value) })}
                          className="w-24 rounded-lg border border-transparent bg-slate-50 px-2 py-1 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => supprimerLigne(l.id)}
                          title="Supprimer cette ligne"
                          className="rounded-lg px-2 py-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lignes.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                        Personne à afficher pour ce mois.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <button
                type="button"
                onClick={ajouterLigne}
                className="w-full border-t border-slate-100 px-4 py-3 text-left text-sm font-semibold text-indigo-600 hover:bg-slate-50"
              >
                + Ajouter une ligne
              </button>
            </div>

            <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Notes (apparaissent à la fin du PDF)
              </label>
              <textarea
                value={notes}
                onChange={(e) => modifierNotes(e.target.value)}
                placeholder="Ex. congés d'une personne hors équipe sur d'autres mois, précision pour la compta…"
                rows={3}
                className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
              />
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 -mt-2 text-xs text-slate-400">
              Clique sur les heures d&apos;un jour pour les corriger avant l&apos;export — conservé dans ce navigateur, jamais
              enregistré dans le vrai planning.
            </p>
            <LegendeCalendrier />
            {profils
              .filter((p) => p.role !== 'admin')
              .map((p) => (
                <CarteCalendrierEmploye
                  key={p.id}
                  profil={p}
                  semaines={semainesParProfil.get(p.id) ?? []}
                  heuresEcoleMois={totalHeuresEcoleMoisProfil(semainesParProfil.get(p.id) ?? [])}
                  exclureDimanche={exclusionLocale.get(p.id) ?? false}
                  enCoursBascule={profilEnCoursBascule === p.id}
                  onBasculerExclusion={(valeur) => basculerExclusion(p.id, valeur)}
                  editable
                  editions={editionsCalendrier}
                  onModifierHeure={(dateIso, valeur) => modifierHeureCalendrier(p.id, dateIso, valeur)}
                  onReinitialiserEditions={() => reinitialiserEditionsCalendrier(p.id)}
                />
              ))}
            {profils.filter((p) => p.role !== 'admin').length === 0 && (
              <p className="py-10 text-center text-sm text-slate-400">Personne à afficher.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
