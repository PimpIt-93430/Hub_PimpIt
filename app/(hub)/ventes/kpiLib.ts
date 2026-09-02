/** Calculs de performance équipe pour l'écran Ventes : croise chaque vente SumUp avec le planning
 * (planning_shifts) pour savoir qui était réellement en poste au pop-up au moment de la vente —
 * bien plus précis que la seule attribution par email SumUp (ventes_sumup.profile_id), qui dépend
 * de qui a pensé à se connecter avec son propre compte sur le lecteur de carte. Sert de base au CA
 * par employé, au CA/heure travaillée, et aux rapports jour/mois.
 *
 * Attribution :
 *  - Si un ou plusieurs employés sont en poste à ce pop-up à cet horaire (planning), la vente leur
 *    est attribuée à parts égales entre eux (pas de moyen de savoir qui a précisément encaissé
 *    quand deux personnes travaillent ensemble sur le même point de vente — un partage à parts
 *    égales est le calcul le plus défendable, cf. retour utilisateur : "il faut gérer quand ils
 *    sont 2 pour faire un truc plus logique").
 *  - Sinon (aucun shift ne couvre ce moment — trou de planning, oubli de saisie), on retombe sur
 *    l'attribution SumUp existante (ventes_sumup.profile_id, via l'email du lecteur de carte) si
 *    elle existe, pour ne pas perdre la vente.
 *  - Sinon, la vente reste non attribuée (n'entre dans le CA de personne).
 */

// Les horodatages SumUp sont en UTC ; les horaires de planning (heure_debut/fin) sont des horaires
// muraux du point de vente (Europe/Paris). Le serveur Next (Vercel) tourne en UTC, donc `new
// Date(iso).getHours()` ne donnerait PAS l'heure locale du magasin — d'où ces deux formatters
// explicites, seule façon fiable de comparer une vente à un créneau de planning.
const FORMATTER_DATE_PARIS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const FORMATTER_HEURE_PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Date locale Europe/Paris d'un horodatage ISO, format "AAAA-MM-JJ" (même format que
 * planning_shifts.date). `en-CA` produit directement AAAA-MM-JJ, pas besoin de réassembler. */
export function dateParisISO(horodatageIso: string): string {
  return FORMATTER_DATE_PARIS.format(new Date(horodatageIso));
}

/** Heure locale Europe/Paris d'un horodatage ISO, format "HH:MM:SS" (comparable lexicographiquement
 * aux colonnes time de planning_shifts). */
export function heureParisHHMMSS(horodatageIso: string): string {
  const parts = FORMATTER_HEURE_PARIS.formatToParts(new Date(horodatageIso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  // Intl peut renvoyer "24" à minuit avec hour12:false selon l'environnement — ramené à "00".
  const heure = get('hour') === '24' ? '00' : get('hour');
  return `${heure}:${get('minute')}:${get('second')}`;
}

export interface VenteKpi {
  id: string;
  pop_up_id: string | null;
  profile_id: string | null;
  montant: number;
  horodatage: string;
}

export interface ShiftKpi {
  id: string;
  profile_id: string;
  pop_up_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  pause_debut: string | null;
  pause_fin: string | null;
}

/** Durée effective d'un shift en minutes, pause déjeuner déduite — réplique
 * App PIMP IT/src/utils/dateUtils.ts (dureeShiftMinutes), même convention RH partout ailleurs. */
export function dureeShiftMinutes(shift: {
  heure_debut: string;
  heure_fin: string;
  pause_debut?: string | null;
  pause_fin?: string | null;
}): number {
  const diff = (debut: string, fin: string) => {
    const [h1, m1] = debut.split(':').map(Number);
    const [h2, m2] = fin.split(':').map(Number);
    return h2 * 60 + m2 - (h1 * 60 + m1);
  };
  const brut = diff(shift.heure_debut, shift.heure_fin);
  if (!shift.pause_debut || !shift.pause_fin) return brut;
  return brut - diff(shift.pause_debut, shift.pause_fin);
}

/** Employés en poste à ce pop-up au moment précis de la vente (hors pause déjeuner), dédupliqués —
 * en théorie un seul shift par personne/moment, la déduplication protège juste d'une saisie en
 * double dans le planning. */
export function employesEnService(vente: VenteKpi, shifts: ShiftKpi[]): string[] {
  if (!vente.pop_up_id) return [];
  const jour = dateParisISO(vente.horodatage);
  const heure = heureParisHHMMSS(vente.horodatage);
  const ids = shifts
    .filter((s) => s.pop_up_id === vente.pop_up_id && s.date === jour)
    .filter((s) => heure >= s.heure_debut && heure < s.heure_fin)
    .filter((s) => !(s.pause_debut && s.pause_fin && heure >= s.pause_debut && heure < s.pause_fin))
    .map((s) => s.profile_id);
  return Array.from(new Set(ids));
}

export interface PartAttribuee {
  profileId: string;
  part: number;
}

/** Répartit une vente entre les employés en poste au moment T (à parts égales s'ils sont
 * plusieurs) ; à défaut retombe sur l'attribution SumUp existante ; sinon reste non attribuée. */
export function attribuerVente(vente: VenteKpi, shifts: ShiftKpi[]): PartAttribuee[] {
  const enService = employesEnService(vente, shifts);
  if (enService.length > 0) {
    const part = 1 / enService.length;
    return enService.map((profileId) => ({ profileId, part }));
  }
  if (vente.profile_id) return [{ profileId: vente.profile_id, part: 1 }];
  return [];
}

export interface EmployeAgg {
  profileId: string;
  caAttribue: number;
  nbVentesEquivalent: number;
  heuresTravaillees: number;
  nbShifts: number;
  joursTravailles: number;
}

/** Agrège CA attribué (via planning) et heures/jours travaillés par employé, sur les ventes
 * réussies et les shifts d'une période. `nbVentesEquivalent` compte les ventes en parts
 * fractionnaires (une vente partagée entre 2 personnes vaut 0,5 pour chacune) — mesure honnête de
 * l'activité, pas un arrondi qui gonflerait artificiellement le total si on additionnait des
 * entiers. `joursTravailles` compte les jours calendaires distincts (pas les shifts : un même jour
 * coupé matin/après-midi en 2 shifts ne compte que pour 1 jour) — cf. retour utilisateur : "mettre
 * en rapport le CA de la personne avec le jour travaillé". */
export function agregerParEmploye(ventesReussies: VenteKpi[], shifts: ShiftKpi[]): Map<string, EmployeAgg> {
  const map = new Map<string, EmployeAgg>();
  const joursParEmploye = new Map<string, Set<string>>();
  const entree = (id: string) => {
    let e = map.get(id);
    if (!e) {
      e = { profileId: id, caAttribue: 0, nbVentesEquivalent: 0, heuresTravaillees: 0, nbShifts: 0, joursTravailles: 0 };
      map.set(id, e);
    }
    return e;
  };
  for (const v of ventesReussies) {
    for (const { profileId, part } of attribuerVente(v, shifts)) {
      const e = entree(profileId);
      e.caAttribue += v.montant * part;
      e.nbVentesEquivalent += part;
    }
  }
  for (const s of shifts) {
    const e = entree(s.profile_id);
    e.heuresTravaillees += dureeShiftMinutes(s) / 60;
    e.nbShifts += 1;
    let jours = joursParEmploye.get(s.profile_id);
    if (!jours) {
      jours = new Set();
      joursParEmploye.set(s.profile_id, jours);
    }
    jours.add(s.date);
  }
  for (const [profileId, jours] of joursParEmploye) {
    entree(profileId).joursTravailles = jours.size;
  }
  return map;
}

export interface JourAgg {
  date: string;
  caTotal: number;
  parEmploye: Map<string, number>;
}

/** Agrège le CA par jour (date locale Europe/Paris) et, pour chaque jour, le CA attribué à chaque
 * employé — base du rapport "employé × jour". */
export function agregerParJour(ventesReussies: VenteKpi[], shifts: ShiftKpi[]): Map<string, JourAgg> {
  const map = new Map<string, JourAgg>();
  for (const v of ventesReussies) {
    const jour = dateParisISO(v.horodatage);
    let j = map.get(jour);
    if (!j) {
      j = { date: jour, caTotal: 0, parEmploye: new Map() };
      map.set(jour, j);
    }
    j.caTotal += v.montant;
    for (const { profileId, part } of attribuerVente(v, shifts)) {
      j.parEmploye.set(profileId, (j.parEmploye.get(profileId) ?? 0) + v.montant * part);
    }
  }
  return map;
}

// ---- Produits / pin's ----

export interface LigneVenteKpi {
  nom_produit: string;
  quantite: number;
}

/** Nombre de pin's unitaires contenus dans chaque produit du catalogue SumUp — un pack de 6 compte
 * pour 6 pin's, un "Clogs + 8 pin's" pour 8, etc. Catalogue observé en base (cf. exploration
 * ventes_sumup_lignes) ; un produit absent de cette table (nouveau produit, faute de frappe côté
 * SumUp) ne compte simplement pas dans le total pin's plutôt que de planter. */
const PINS_PAR_PRODUIT: Record<string, number> = {
  "1 pin's simple": 1,
  "1 pin's métalique": 1,
  "Pack 6 pin's": 6,
  "Pack 13 pin's": 13,
  "Clogs + 8 pin's": 8,
  "Clogs + 15 pin's": 15,
  "Coque Iphone + 5 pin's": 5,
};

export function nombrePinsVendus(lignes: LigneVenteKpi[]): number {
  let total = 0;
  for (const l of lignes) {
    const parUnite = PINS_PAR_PRODUIT[l.nom_produit.trim()];
    if (parUnite) total += parUnite * l.quantite;
  }
  return total;
}

export interface ProduitAgg {
  nomProduit: string;
  quantite: number;
}

export function agregerParProduit(lignes: LigneVenteKpi[]): ProduitAgg[] {
  const map = new Map<string, number>();
  for (const l of lignes) {
    const nom = l.nom_produit.trim();
    map.set(nom, (map.get(nom) ?? 0) + l.quantite);
  }
  return Array.from(map.entries())
    .map(([nomProduit, quantite]) => ({ nomProduit, quantite }))
    .sort((a, b) => b.quantite - a.quantite);
}

export function formatDureeHeuresKpi(heures: number): string {
  const totalMinutes = Math.round(heures * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
