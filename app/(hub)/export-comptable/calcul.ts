// Calcul du calendrier comptable — logique pure (aucune dépendance React), partagée entre la vue
// résumé mensuel et la vue calendrier détaillée/impression (cf. retour utilisateur : "un calendrier
// comptable pour compter les heures... cocher une case pour ne pas compter le dimanche... tout le
// monde doit avoir 35h").
//
// Règle "exclure les dimanches" (par personne, informations_rh.exclure_heures_dimanche) : les
// heures du dimanche ne doivent plus apparaître dans le total travaillé de la semaine — mais sans
// jamais FAIRE BAISSER un total qui atteignait déjà 35h avant retrait. Les heures retirées au
// dimanche sont donc redistribuées, réparties au prorata, sur les autres jours travaillés de la
// même semaine (lundi → samedi), jusqu'à revenir à min(35, total réel de la semaine dimanche
// inclus) — jamais au-delà du total réellement prévu : une semaine dont le total réel était déjà
// sous 35h (congé, jour d'école pour un alternant...) reste sous 35h, on n'invente pas d'heures qui
// n'ont jamais été prévues. Si la personne n'a travaillé QUE le dimanche cette semaine-là, il n'y a
// nulle part où reporter ces heures : `alerteRedistributionImpossible` le signale plutôt que de
// laisser disparaître silencieusement des heures réellement travaillées.
import { ajouterJours, dateEnISO, dureeShiftMinutes, lundiDeLaSemaine } from '../planning/dateUtils';

export const HEURES_ECOLE_PAR_JOUR = 7;
const CIBLE_HEBDO_MAX = 35;

export interface ProfilCalendrier {
  id: string;
  nom_complet: string;
  email: string;
  role: 'admin' | 'employe';
  type_contrat: 'manager' | 'employe' | 'alternant';
}

export interface ShiftCalcul {
  profile_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  pause_debut: string | null;
  pause_fin: string | null;
}

export interface CongeCalcul {
  profile_id: string;
  date_debut: string;
  date_fin: string;
  type: 'conge' | 'indisponibilite' | 'absence' | 'repos';
  statut: 'en_attente' | 'validee' | 'refusee';
}

export interface JourEcoleCalcul {
  profile_id: string;
  date: string;
}

export interface JourCalendrier {
  date: string;
  horsMois: boolean;
  estDimanche: boolean;
  estEcole: boolean;
  estConge: boolean;
  heuresReelles: number;
  /** Après redistribution éventuelle des heures du dimanche (cf. en-tête du fichier). Identique à
   * heuresReelles si la personne n'a pas coché "exclure les dimanches". */
  heuresAffichees: number;
}

export interface SemaineCalendrier {
  lundiIso: string;
  jours: JourCalendrier[];
  totalHeures: number;
  heuresDimancheRetirees: number;
  dimancheTravaille: boolean;
  alerteRedistributionImpossible: boolean;
}

function estDimancheDate(dateIso: string): boolean {
  return new Date(`${dateIso}T00:00:00`).getDay() === 0;
}

/** Congé "posé" au sens légal français (cf. export existant) : jours ouvrables lundi → samedi,
 * dimanche exclu, jours fériés non déduits. */
function estJourOuvrable(dateIso: string): boolean {
  return !estDimancheDate(dateIso);
}

/** Toutes les dates ISO du mois calendaire commençant à `debutMoisIso`. */
export function datesDuMois(debutMoisIso: string): string[] {
  const debut = new Date(`${debutMoisIso}T00:00:00`);
  const mois = debut.getMonth();
  const dates: string[] = [];
  let d = debut;
  while (d.getMonth() === mois) {
    dates.push(dateEnISO(d));
    d = ajouterJours(d, 1);
  }
  return dates;
}

/** Lundi de la première semaine affichée et dimanche de la dernière — la fenêtre à charger côté
 * serveur doit couvrir ces semaines complètes (pas juste le mois strict) pour que le total
 * hebdomadaire "35h" des semaines à cheval sur deux mois reste juste. */
export function fenetreSemainesDuMois(debutMoisIso: string): { debut: string; fin: string } {
  const dates = datesDuMois(debutMoisIso);
  const premierLundi = lundiDeLaSemaine(new Date(`${dates[0]}T00:00:00`));
  const dernierLundi = lundiDeLaSemaine(new Date(`${dates[dates.length - 1]}T00:00:00`));
  const dernierDimanche = ajouterJours(dernierLundi, 6);
  return { debut: dateEnISO(premierLundi), fin: dateEnISO(dernierDimanche) };
}

function heuresJour(shifts: ShiftCalcul[], profileId: string, dateIso: string): number {
  return (
    shifts
      .filter((s) => s.profile_id === profileId && s.date === dateIso)
      .reduce((total, s) => total + dureeShiftMinutes(s), 0) / 60
  );
}

/** Calendrier hebdomadaire d'UNE personne pour le mois, avec redistribution "exclure dimanche" si
 * demandée. Les alternants gardent leurs heures d'école à part (jamais mélangées au 35h/dimanche,
 * cf. en-tête). Les admins gardent leur forfait fixe (cf. calculerLigneAdmin ci-dessous) — un
 * forfait Lun-Ven qui ne comporte déjà aucune heure de dimanche, donc jamais concerné par cette
 * redistribution. */
export function calculerSemainesProfil(params: {
  debutMoisIso: string;
  profileId: string;
  exclureDimanche: boolean;
  shifts: ShiftCalcul[];
  conges: CongeCalcul[];
}): SemaineCalendrier[] {
  const { debutMoisIso, profileId, exclureDimanche, shifts, conges } = params;
  const joursDuMois = new Set(datesDuMois(debutMoisIso));
  const { debut } = fenetreSemainesDuMois(debutMoisIso);
  const premierLundi = new Date(`${debut}T00:00:00`);

  const nombreSemaines = Math.ceil(
    (new Date(`${fenetreSemainesDuMois(debutMoisIso).fin}T00:00:00`).getTime() - premierLundi.getTime()) /
      (7 * 24 * 60 * 60 * 1000),
  );

  const semaines: SemaineCalendrier[] = [];
  for (let s = 0; s < nombreSemaines; s++) {
    const lundi = ajouterJours(premierLundi, s * 7);
    const datesSemaine = Array.from({ length: 7 }, (_, i) => dateEnISO(ajouterJours(lundi, i)));

    const heuresParJour = datesSemaine.map((date) => heuresJour(shifts, profileId, date));
    const totalReelSemaine = heuresParJour.reduce((a, b) => a + b, 0);
    const indexDimanche = 6;
    const heuresDimanche = heuresParJour[indexDimanche];

    let heuresAffichees = [...heuresParJour];
    let heuresDimancheRetirees = 0;
    let alerteRedistributionImpossible = false;

    if (exclureDimanche && heuresDimanche > 0) {
      heuresDimancheRetirees = heuresDimanche;
      const cible = Math.min(CIBLE_HEBDO_MAX, totalReelSemaine);
      const totalHorsDimanche = totalReelSemaine - heuresDimanche;
      const manque = Math.max(0, cible - totalHorsDimanche);
      heuresAffichees[indexDimanche] = 0;

      if (manque > 0) {
        if (totalHorsDimanche > 0) {
          // Réparti au prorata des heures déjà travaillées les autres jours (cf. retour
          // utilisateur : "réparties sur plusieurs jours").
          for (let i = 0; i < 6; i++) {
            if (heuresParJour[i] <= 0) continue;
            heuresAffichees[i] = heuresParJour[i] + manque * (heuresParJour[i] / totalHorsDimanche);
          }
        } else {
          // Travaillé UNIQUEMENT le dimanche cette semaine-là : aucun autre jour où reporter les
          // heures — on ne les fait pas disparaître silencieusement, on signale plutôt.
          alerteRedistributionImpossible = true;
          heuresAffichees[indexDimanche] = heuresDimanche;
          heuresDimancheRetirees = 0;
        }
      }
    }

    const totalHeuresAffichees = heuresAffichees.reduce((a, b) => a + b, 0);

    const jours: JourCalendrier[] = datesSemaine.map((date, i) => ({
      date,
      horsMois: !joursDuMois.has(date),
      estDimanche: i === indexDimanche,
      estEcole: false, // renseigné par l'appelant (calculerLigneEmploye), pas connu ici par jour
      estConge: conges.some(
        (c) =>
          c.profile_id === profileId &&
          date >= c.date_debut &&
          date <= c.date_fin &&
          (c.type !== 'conge' || c.statut === 'validee'),
      ),
      heuresReelles: Math.round(heuresParJour[i] * 100) / 100,
      heuresAffichees: Math.round(heuresAffichees[i] * 100) / 100,
    }));

    semaines.push({
      lundiIso: dateEnISO(lundi),
      jours,
      totalHeures: Math.round(totalHeuresAffichees * 100) / 100,
      heuresDimancheRetirees: Math.round(heuresDimancheRetirees * 100) / 100,
      dimancheTravaille: heuresDimanche > 0,
      alerteRedistributionImpossible,
    });
  }

  return semaines;
}

/** Marque les jours d'école (alternants) sur un calendrier déjà calculé — appelé séparément de
 * calculerSemainesProfil pour garder cette fonction-là indépendante du type de contrat. */
export function appliquerJoursEcole(semaines: SemaineCalendrier[], profileId: string, joursEcole: JourEcoleCalcul[]): SemaineCalendrier[] {
  const datesEcole = new Set(joursEcole.filter((j) => j.profile_id === profileId).map((j) => j.date));
  if (datesEcole.size === 0) return semaines;
  return semaines.map((s) => ({ ...s, jours: s.jours.map((j) => (datesEcole.has(j.date) ? { ...j, estEcole: true } : j)) }));
}

/** Total mensuel des heures affichées (redistribution "exclure dimanche" déjà appliquée par
 * semaine, cf. calculerSemainesProfil) — ne compte que les jours réellement dans le mois : une
 * semaine à cheval sur deux mois garde son total hebdomadaire "35h" exact (calculé sur les 7
 * jours), mais seule la part du mois en cours entre dans ce total mensuel. */
export function totalHeuresMoisProfil(semaines: SemaineCalendrier[]): number {
  let total = 0;
  for (const s of semaines) for (const j of s.jours) if (!j.horsMois) total += j.heuresAffichees;
  return Math.round(total * 100) / 100;
}

/** Heures réellement travaillées le dimanche dans le mois (informatif — indépendant de
 * "exclure dimanche", pour que la compta voie toujours combien d'heures ont réellement eu lieu un
 * dimanche, que ce soit compté dans le total ou redistribué ailleurs). */
export function totalHeuresDimancheMoisProfil(semaines: SemaineCalendrier[]): number {
  let total = 0;
  for (const s of semaines) for (const j of s.jours) if (!j.horsMois && j.estDimanche) total += j.heuresReelles;
  return Math.round(total * 100) / 100;
}

export function totalHeuresEcoleMoisProfil(semaines: SemaineCalendrier[]): number {
  const joursEcoleDansLeMois = semaines.flatMap((s) => s.jours).filter((j) => !j.horsMois && j.estEcole);
  return joursEcoleDansLeMois.length * HEURES_ECOLE_PAR_JOUR;
}

/** Nombre de jours de congé "posés" (validés) dans le mois, décompte légal jours ouvrables
 * lundi → samedi (cf. estJourOuvrable). */
export function joursCongesDuMois(debutMoisIso: string, profileId: string, conges: CongeCalcul[]): string[] {
  const jours = datesDuMois(debutMoisIso);
  const dates: string[] = [];
  for (const c of conges) {
    if (c.profile_id !== profileId || c.type !== 'conge' || c.statut !== 'validee') continue;
    for (const jour of jours) {
      if (jour >= c.date_debut && jour <= c.date_fin && estJourOuvrable(jour)) dates.push(jour);
    }
  }
  return dates;
}
