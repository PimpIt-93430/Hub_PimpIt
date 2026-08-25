// Petits utilitaires portés depuis App PIMP IT/src/utils/dateUtils.ts (mêmes noms/logique) — juste
// ce dont l'écran Équipe a besoin : durée d'un créneau, total hebdo "un jour sur deux", formatage.

export const JOURS_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const LIBELLE_TYPE_CONTRAT: Record<string, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

export function formatHeure(heure: string): string {
  return heure.slice(0, 5);
}

function differenceMinutes(debut: string, fin: string): number {
  const [h1, m1] = debut.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

/** Durée effective d'un créneau en minutes, pause déjeuner déduite quand elle est renseignée. */
function dureeShiftMinutes(shift: {
  heure_debut: string;
  heure_fin: string;
  pause_debut?: string | null;
  pause_fin?: string | null;
}): number {
  const brut = differenceMinutes(shift.heure_debut, shift.heure_fin);
  if (!shift.pause_debut || !shift.pause_fin) return brut;
  return brut - differenceMinutes(shift.pause_debut, shift.pause_fin);
}

/** Total d'heures (décimal) d'un horaire récurrent pour chacune des deux semaines d'un rythme "un
 * jour sur deux" — un horaire "toutes" compte dans les deux, un horaire "premiere"/"deuxieme" ne
 * compte que dans celle-là. */
export function totalHeuresRecurrentesParSemaine(
  horaires: {
    actif: boolean;
    heure_debut: string;
    heure_fin: string;
    pause_debut?: string | null;
    pause_fin?: string | null;
    semaine_reference: 'toutes' | 'premiere' | 'deuxieme';
  }[],
): { premiere: number; deuxieme: number } {
  let minutesPremiere = 0;
  let minutesDeuxieme = 0;
  for (const h of horaires) {
    if (!h.actif) continue;
    const minutes = dureeShiftMinutes(h);
    if (h.semaine_reference === 'toutes' || h.semaine_reference === 'premiere') minutesPremiere += minutes;
    if (h.semaine_reference === 'toutes' || h.semaine_reference === 'deuxieme') minutesDeuxieme += minutes;
  }
  return { premiere: minutesPremiere / 60, deuxieme: minutesDeuxieme / 60 };
}

/** Formate un nombre d'heures décimal en "12h" ou "12h30". */
export function formatDureeHeures(heures: number): string {
  const totalMinutes = Math.round(heures * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export function initiales(nom: string | null | undefined, email: string): string {
  const source = (nom ?? '').trim();
  if (source) {
    const mots = source.split(/\s+/).filter(Boolean);
    if (mots.length >= 2) return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
    return mots[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}
