// Types locaux reflétant les tables réelles utilisées par l'écran Calendrier admin (desktop web)
// de l'app Pimp It (cf. App PIMP IT/app/(app)/admin/calendrier.tsx + src/components/calendrier/*)
// — pas de fichier de types partagé côté Hub (même approche que app/(hub)/equipe/types.ts), donc on
// les redéclare ici avec les noms de colonnes exacts (vérifiés via information_schema en base).

export type Role = 'admin' | 'employe';
export type TypeContrat = 'manager' | 'employe' | 'alternant';
export type StatutShift = 'brouillon' | 'valide' | 'publie';
export type TypeConge = 'conge' | 'indisponibilite' | 'absence' | 'repos';
export type StatutConge = 'en_attente' | 'validee' | 'refusee';
export type SemaineReference = 'toutes' | 'premiere' | 'deuxieme';

/** Liste fixe côté client (pas d'écran de gestion des étiquettes) — correspond à
 * PanneauCreationShift.tsx (ETIQUETTES_SHIFT) côté app Pimp It. */
export const ETIQUETTES_SHIFT = ['Ouverture', 'Fermeture', 'Caisse', 'Réserve', 'Vente'] as const;

export const LIBELLE_TYPE_CONGE: Record<TypeConge, string> = {
  conge: 'Congé',
  indisponibilite: 'Indisponibilité',
  absence: 'Absence',
  repos: 'Repos',
};

export interface Profile {
  id: string;
  nom_complet: string;
  email: string;
  role: Role;
  type_contrat: TypeContrat;
  couleur: string;
  heures_max_semaine: number | null;
  actif: boolean;
}

export interface PopUp {
  id: string;
  nom: string;
  couleur: string;
  actif: boolean;
  date_debut: string | null;
  /** Créneaux Matin/Après-midi propres à ce lieu (écran Pop-up), cf. retour utilisateur du
   * 2026-09-05 : "dans le hub dans le planing il faut pouvoir mettre matin et après midi les
   * horaires configurées" — même champs que App PIMP IT (PanneauEditionShiftEquipe.tsx), absent =
   * repli sur des horaires génériques (cf. PRESETS_GENERIQUES dans PanneauShift.tsx). */
  matin_debut: string | null;
  matin_fin: string | null;
  matin_pause_debut: string | null;
  matin_pause_fin: string | null;
  apres_midi_debut: string | null;
  apres_midi_fin: string | null;
  apres_midi_pause_debut: string | null;
  apres_midi_pause_fin: string | null;
}

export interface PlanningShift {
  id: string;
  pop_up_id: string;
  profile_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  statut: StatutShift;
  genere_automatiquement: boolean;
  created_by: string | null;
  etiquette: string | null;
  pause_debut: string | null;
  pause_fin: string | null;
}

export interface Conge {
  id: string;
  profile_id: string;
  date_debut: string;
  date_fin: string;
  heure_debut: string | null;
  heure_fin: string | null;
  type: TypeConge;
  note: string | null;
  statut: StatutConge;
}

export interface HoraireRecurrentProfil {
  id: string;
  profile_id: string;
  pop_up_id: string;
  jour_semaine: number;
  heure_debut: string;
  heure_fin: string;
  actif: boolean;
  pause_debut: string | null;
  pause_fin: string | null;
  semaine_reference: SemaineReference;
}

export interface RegleHoraireOuverture {
  id: string;
  pop_up_id: string;
  jour_semaine: number;
  heure_ouverture: string;
  heure_fermeture: string;
  actif: boolean;
}

export interface JourEcoleAlternant {
  id: string;
  profile_id: string;
  date: string;
}

export interface ProfilPopUp {
  profile_id: string;
  pop_up_id: string;
}
