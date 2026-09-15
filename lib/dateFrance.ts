// Bornes de journée/mois "France" (Europe/Paris, DST géré automatiquement) — cf. incident du
// 2026-09-15 : le tableau de bord affichait 11 € Shopify + 128 € TikTok au lieu de 436 €. Cause :
// `new Date(); setHours(0, 0, 0, 0)` calcule "minuit" dans le fuseau du SERVEUR (UTC sur Railway,
// jamais configuré autrement), pas celui de la France — "aujourd'hui" démarrait donc 1h à 2h trop
// tard (fuseau Paris toujours en avance sur UTC), excluant en silence les ventes du tout début de
// journée. Ici, un pic de ventes TikTok juste après minuit avait disparu. Ces fonctions calculent
// la même chose mais ancré sur l'heure de Paris, quel que soit le fuseau du serveur qui exécute le
// code.

const FUSEAU = 'Europe/Paris';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function partiesDate(instant: Date): { annee: number; mois: number; jour: number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  return { annee: Number(parts.year), mois: Number(parts.month), jour: Number(parts.day) };
}

/** Décalage UTC actuel de Paris (+01:00 l'hiver, +02:00 l'été) pour l'instant donné — via Intl
 * plutôt qu'une règle DST codée en dur, qui se déréglerait au premier changement de date légal. */
function decalageUtc(instant: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: FUSEAU, timeZoneName: 'shortOffset' });
  const partie = fmt.formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const heures = parseInt(partie.replace('GMT', ''), 10) || 0;
  return `${heures >= 0 ? '+' : '-'}${String(Math.abs(heures)).padStart(2, '0')}:00`;
}

/** Minuit à Paris du jour de `reference` (par défaut maintenant), comme véritable instant UTC —
 * safe à comparer/sérialiser (.toISOString()) pour une requête Supabase. */
export function debutJourFrance(reference: Date = new Date()): Date {
  const { annee, mois, jour } = partiesDate(reference);
  return new Date(`${annee}-${pad(mois)}-${pad(jour)}T00:00:00.000${decalageUtc(reference)}`);
}

/** Minuit à Paris du 1er jour du mois de `reference`. */
export function debutMoisFrance(reference: Date = new Date()): Date {
  const { annee, mois } = partiesDate(reference);
  return new Date(`${annee}-${pad(mois)}-01T00:00:00.000${decalageUtc(reference)}`);
}

/** Date du jour "AAAA-MM-JJ" telle qu'affichée à Paris — jamais `.toISOString().slice(0, 10)`, qui
 * reste bloqué sur la veille pendant les 1-2 premières heures de chaque journée (heure de Paris en
 * avance sur UTC). */
export function dateDuJourFrance(reference: Date = new Date()): string {
  const { annee, mois, jour } = partiesDate(reference);
  return `${annee}-${pad(mois)}-${pad(jour)}`;
}

// ---- Bornes de fin de période (écran Ventes/Finance) — construites en ancrant l'arithmétique de
// calendrier sur midi UTC (jamais de bascule de jour possible à cette heure-là, quel que soit le
// fuseau), pour ne jamais mélanger arithmétique de date et fuseau Paris dans le même calcul. ----

/** Instant "midi UTC" du jour calendaire donné — sert uniquement de point d'ancrage neutre pour
 * additionner/soustraire des jours sans risquer de changer de jour civil à cause d'un fuseau. */
function ancrageMidiUtc(annee: number, mois: number, jour: number): Date {
  return new Date(Date.UTC(annee, mois - 1, jour, 12));
}

export function finJourFrance(reference: Date = new Date()): Date {
  const { annee, mois, jour } = partiesDate(reference);
  const lendemain = ancrageMidiUtc(annee, mois, jour + 1);
  return new Date(debutJourFrance(lendemain).getTime() - 1);
}

export function finMoisFrance(reference: Date = new Date()): Date {
  const { annee, mois } = partiesDate(reference);
  const moisSuivant = ancrageMidiUtc(annee, mois + 1, 1);
  return new Date(debutMoisFrance(moisSuivant).getTime() - 1);
}

/** 0 = lundi … 6 = dimanche (même convention que app/(hub)/planning). */
function jourSemaineIso(annee: number, mois: number, jour: number): number {
  return (ancrageMidiUtc(annee, mois, jour).getUTCDay() + 6) % 7;
}

export function debutSemaineFrance(reference: Date = new Date()): Date {
  const { annee, mois, jour } = partiesDate(reference);
  const lundi = ancrageMidiUtc(annee, mois, jour - jourSemaineIso(annee, mois, jour));
  return debutJourFrance(lundi);
}

export function finSemaineFrance(reference: Date = new Date()): Date {
  const { annee, mois, jour } = partiesDate(reference);
  const lundi = ancrageMidiUtc(annee, mois, jour - jourSemaineIso(annee, mois, jour));
  const dimanche = ancrageMidiUtc(lundi.getUTCFullYear(), lundi.getUTCMonth() + 1, lundi.getUTCDate() + 6);
  return finJourFrance(dimanche);
}

/** "AAAA-MM-JJ" → instant Paris minuit/23h59 pour un `<input type="date">` (période personnalisée)
 * — jamais `new Date(\`${iso}T00:00:00\`)`, qui interprète l'heure locale dans le fuseau du
 * serveur, pas celui de la France. */
export function debutJourIsoFrance(dateIso: string): Date {
  const [annee, mois, jour] = dateIso.split('-').map(Number);
  return debutJourFrance(ancrageMidiUtc(annee, mois, jour));
}

export function finJourIsoFrance(dateIso: string): Date {
  const [annee, mois, jour] = dateIso.split('-').map(Number);
  return finJourFrance(ancrageMidiUtc(annee, mois, jour));
}
