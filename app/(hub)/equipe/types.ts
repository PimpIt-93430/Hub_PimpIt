// Types locaux reflétant les tables réelles utilisées par l'écran Équipe admin de l'app Pimp It
// (cf. App PIMP IT/src/types/database.types.ts) — pas de fichier de types partagé côté Hub, donc
// on les redéclare ici (mêmes noms de colonnes exacts, vérifiés dans src/api/*.ts).

export type Role = 'admin' | 'employe';
export type TypeContrat = 'manager' | 'employe' | 'alternant';
export type TypeConge = 'conge' | 'indisponibilite' | 'absence' | 'repos';
export type Fonctionnalite = 'calendrier' | 'equipe';
export type SemaineReference = 'toutes' | 'premiere' | 'deuxieme';

export interface Profile {
  id: string;
  nom_complet: string;
  email: string;
  role: Role;
  type_contrat: TypeContrat;
  couleur: string;
  heures_max_semaine: number | null;
  actif: boolean;
  /** Accès Hub restreint en lecture seule au Planning uniquement (cf. migration 0092, lib/roles.ts
   * côté Hub) — indépendant de role/type_contrat, réservé à un comptable externe (paie). */
  hub_role_comptable: boolean;
}

export interface PopUp {
  id: string;
  nom: string;
  couleur: string;
  matin_debut: string | null;
  matin_fin: string | null;
  matin_pause_debut: string | null;
  matin_pause_fin: string | null;
  apres_midi_debut: string | null;
  apres_midi_fin: string | null;
  apres_midi_pause_debut: string | null;
  apres_midi_pause_fin: string | null;
}

export interface ProfilPopUp {
  profile_id: string;
  pop_up_id: string;
}

export interface InformationsRh {
  profile_id: string;

  genre: string | null;
  nationalite: string | null;
  date_naissance: string | null;
  pays_naissance: string | null;
  departement_naissance: string | null;
  commune_naissance: string | null;
  situation_familiale: string | null;
  nombre_personnes_charge: number | null;

  tel_mobile: string | null;
  tel_fixe: string | null;
  notifications_sms: boolean | null;
  adresse: string | null;
  complement_adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;

  contact_urgence_prenom: string | null;
  contact_urgence_nom: string | null;
  contact_urgence_lien: string | null;
  contact_urgence_tel_mobile: string | null;
  contact_urgence_tel_fixe: string | null;

  nom_titulaire_compte: string | null;
  iban: string | null;
  bic: string | null;

  numero_secu: string | null;
  handicap: boolean | null;
  type_handicap: string | null;
  date_derniere_visite_medicale: string | null;
  visite_medicale_renforcee: boolean | null;
  prochaine_visite_medicale: string | null;

  matricule: string | null;
  date_debut_contrat: string | null;
  heure_debut_contrat: string | null;
  responsable_hierarchique_id: string | null;
  etablissement_par_defaut_id: string | null;

  travailleur_etranger: boolean | null;
  autorisation_travail: string | null;

  exclure_heures_dimanche: boolean | null;
  sumup_email: string | null;
}

export type FormRh = Partial<InformationsRh>;

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

export interface Conge {
  id: string;
  profile_id: string;
  date_debut: string;
  date_fin: string;
  heure_debut: string | null;
  heure_fin: string | null;
  type: TypeConge;
  note: string | null;
}

export interface DocumentEmploye {
  id: string;
  profile_id: string;
  nom_fichier: string;
  chemin_stockage: string;
  uploaded_by: string;
  created_at: string;
}

export interface DroitEmploye {
  id: string;
  profile_id: string;
  fonctionnalite: Fonctionnalite;
  pop_up_id: string | null;
}
