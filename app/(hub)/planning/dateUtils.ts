// Petits utilitaires de date locaux à la page Planning — pas de date-fns côté Hub (absent du
// package.json), on reste en Date natif comme le reste du Hub (cf. l'ancien planning/page.tsx).
// Toujours en heure locale (jamais toISOString, qui convertirait en UTC et pourrait décaler le
// jour selon le fuseau du serveur).

const JOURS_LABELS_COURTS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const MOIS_LABELS_COURTS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateEnISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateDepuisISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** 0 = lundi ... 6 = dimanche, pour matcher regles_horaires_ouverture.jour_semaine. */
export function jourSemaineISO(date: Date): number {
  const jour = date.getDay();
  return jour === 0 ? 6 : jour - 1;
}

/** Lundi de la semaine contenant `date`. */
export function lundiDeLaSemaine(date: Date): Date {
  const decalage = jourSemaineISO(date);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - decalage);
}

export function ajouterJours(date: Date, jours: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + jours);
}

/** Les 7 dates (lundi -> dimanche) de la semaine contenant `date`. */
export function joursDeLaSemaine(date: Date): Date[] {
  const debut = lundiDeLaSemaine(date);
  return Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i));
}

export function estAujourdhui(date: Date): boolean {
  return dateEnISO(date) === dateEnISO(new Date());
}

export function nomJourCourt(date: Date): string {
  return JOURS_LABELS_COURTS[jourSemaineISO(date)];
}

export function numeroJour(date: Date): string {
  return String(date.getDate());
}

/** "20 juil. - 26 juil. 2026" façon Combo. */
export function libellePeriodeCourte(debut: Date, fin: Date): string {
  const d = `${debut.getDate()} ${MOIS_LABELS_COURTS[debut.getMonth()]}`;
  const f = `${fin.getDate()} ${MOIS_LABELS_COURTS[fin.getMonth()]} ${fin.getFullYear()}`;
  return `${d} - ${f}`;
}

export function formatDateCourte(dateIso: string): string {
  const date = dateDepuisISO(dateIso);
  const jour = JOURS_LABELS_COURTS[jourSemaineISO(date)];
  const jourCapitalise = jour.charAt(0) + jour.slice(1).toLowerCase();
  return `${jourCapitalise} ${date.getDate()} ${MOIS_LABELS_COURTS[date.getMonth()]}`;
}

export function formatHeure(heure: string): string {
  return heure.slice(0, 5);
}

function differenceMinutes(debut: string, fin: string): number {
  const [h1, m1] = debut.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

/** Durée effective d'un shift en minutes, pause déjeuner déduite quand elle est renseignée. */
export function dureeShiftMinutes(shift: {
  heure_debut: string;
  heure_fin: string;
  pause_debut?: string | null;
  pause_fin?: string | null;
}): number {
  const brut = differenceMinutes(shift.heure_debut, shift.heure_fin);
  if (!shift.pause_debut || !shift.pause_fin) return brut;
  return brut - differenceMinutes(shift.pause_debut, shift.pause_fin);
}

/** "10:00 – 13:00 · 14:00 – 18:00" si pause renseignée, sinon "10:00 – 18:00". */
export function formatCreneauShift(shift: {
  heure_debut: string;
  heure_fin: string;
  pause_debut?: string | null;
  pause_fin?: string | null;
}): string {
  if (!shift.pause_debut || !shift.pause_fin) {
    return `${formatHeure(shift.heure_debut)} – ${formatHeure(shift.heure_fin)}`;
  }
  return `${formatHeure(shift.heure_debut)} – ${formatHeure(shift.pause_debut)} · ${formatHeure(shift.pause_fin)} – ${formatHeure(shift.heure_fin)}`;
}

/** Formate un nombre d'heures décimal en "12h" ou "12h30". */
export function formatDureeHeures(heures: number): string {
  const totalMinutes = Math.round(heures * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export function totalHeuresTravaillees(
  shifts: { profile_id: string; heure_debut: string; heure_fin: string; pause_debut?: string | null; pause_fin?: string | null }[],
  profileId: string,
): number {
  const minutes = shifts
    .filter((s) => s.profile_id === profileId)
    .reduce((total, s) => total + dureeShiftMinutes(s), 0);
  return minutes / 60;
}

const HEURES_ECOLE_PAR_JOUR = 7;

export function totalHeuresSemaineAvecEcole(
  jours: Date[],
  shifts: { profile_id: string; heure_debut: string; heure_fin: string; pause_debut?: string | null; pause_fin?: string | null }[],
  joursEcole: { profile_id: string; date: string }[],
  profileId: string,
): { heuresTravaillees: number; heuresEcole: number; total: number } {
  const heuresTravaillees = totalHeuresTravaillees(shifts, profileId);
  const joursEcoleCount = jours.filter((jour) =>
    joursEcole.some((j) => j.profile_id === profileId && j.date === dateEnISO(jour)),
  ).length;
  const heuresEcole = joursEcoleCount * HEURES_ECOLE_PAR_JOUR;
  return { heuresTravaillees, heuresEcole, total: heuresTravaillees + heuresEcole };
}

export function seChevauchent(aDebut: string, aFin: string, bDebut: string, bFin: string): boolean {
  return aDebut < bFin && bDebut < aFin;
}
