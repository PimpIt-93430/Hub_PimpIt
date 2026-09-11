'use server';

import { revalidatePath } from 'next/cache';

import { exigerAdmin } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

export type TypeDepense = 'ponctuelle' | 'recurrente';
export type FrequenceDepense = 'mensuelle' | 'trimestrielle' | 'annuelle';

export interface DepenseFlux {
  id: string;
  libelle: string;
  montant: number;
  type: TypeDepense;
  date: string;
  frequence: FrequenceDepense | null;
  dateFin: string | null;
  note: string | null;
  creeParNom: string;
  /** Cette dépense représente un pop-up (ex. son loyer) — cf. retour utilisateur : "il faut juste
   * cocher si c'est un pop-up, ya des pop-up qui sont pas rentrés dans l'appli car on les a pas
   * encore fait" : simple case à cocher, indépendante de la table pop_ups réelle (pour pouvoir
   * repérer un pop-up pas encore ouvert). Aucun calcul dessus pour l'instant. */
  estPopUp: boolean;
}

export interface ParamsDepenseFlux {
  libelle: string;
  montant: number;
  type: TypeDepense;
  date: string;
  frequence: FrequenceDepense | null;
  dateFin: string | null;
  note: string;
  estPopUp: boolean;
}

export async function chargerDepensesFlux(): Promise<DepenseFlux[]> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('flux_tresorerie_depenses')
    .select('id, libelle, montant, type, date, frequence, date_fin, note, est_pop_up, createur:created_by(nom_complet, email)')
    .order('date', { ascending: true });
  if (error) throw new Error(error.message);

  type Ligne = {
    id: string;
    libelle: string;
    montant: number;
    type: TypeDepense;
    date: string;
    frequence: FrequenceDepense | null;
    date_fin: string | null;
    note: string | null;
    est_pop_up: boolean;
    createur: { nom_complet: string | null; email: string } | null;
  };

  return ((data ?? []) as unknown as Ligne[]).map((l) => ({
    id: l.id,
    libelle: l.libelle,
    montant: l.montant,
    type: l.type,
    date: l.date,
    frequence: l.frequence,
    dateFin: l.date_fin,
    note: l.note,
    estPopUp: l.est_pop_up,
    creeParNom: l.createur ? l.createur.nom_complet || l.createur.email : '—',
  }));
}

function versLigne(params: ParamsDepenseFlux) {
  const estRecurrente = params.type === 'recurrente';
  return {
    libelle: params.libelle.trim(),
    montant: params.montant,
    type: params.type,
    date: params.date,
    frequence: estRecurrente ? params.frequence : null,
    date_fin: estRecurrente ? params.dateFin || null : null,
    note: params.note.trim() || null,
    est_pop_up: params.estPopUp,
  };
}

export async function creerDepenseFlux(params: ParamsDepenseFlux): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');

  const { error } = await supabase.from('flux_tresorerie_depenses').insert({ ...versLigne(params), created_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath('/tresorerie');
}

/** Modifie une dépense déjà enregistrée — cf. retour utilisateur : "il faut pouvoir aussi
 * modifier les dépenses déjà mises" (seule la création/suppression existait jusqu'ici). */
export async function modifierDepenseFlux(id: string, params: ParamsDepenseFlux): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('flux_tresorerie_depenses').update(versLigne(params)).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}

export async function supprimerDepenseFlux(id: string): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('flux_tresorerie_depenses').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}

// ---- Recettes (cf. retour utilisateur du 2026-09-11 : "pour chaque pop up un pourcentage par mois
// des ventes... et on met à combien correspond 100% par jour... comme ça on a un visuel sur ce
// qu'on doit faire tous les mois" — ca_jour_ht est la référence "100%"/jour, et le CA prévu de
// chaque mois se déduit d'un pourcentage saisi mois par mois dans flux_tresorerie_recettes_mois.
// Les pop-up déjà ouverts démarrent à 100% dès le mois en cours, cf. POURCENTAGE_PAR_DEFAUT
// ci-dessous.) ----

// Pas exportées : un fichier "use server" ne peut exporter que des fonctions async (cf. build
// Next.js cassé par ces deux constantes) — dupliquées côté client (FluxTresorerieClient.tsx).
const NOMBRE_MOIS_PREREMPLIS = 12;
const POURCENTAGE_PAR_DEFAUT = 100;

export interface MensualiteRecette {
  id: string;
  mois: string;
  pourcentage: number;
}

export interface RecetteFlux {
  id: string;
  popUpNom: string;
  caJourHt: number;
  tauxChargesVariables: number;
  creeParNom: string;
  mensualites: MensualiteRecette[];
}

export interface ParamsRecetteFlux {
  popUpNom: string;
  caJourHt: number;
  tauxChargesVariables: number;
}

function premierJourDuMois(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

/** Les `NOMBRE_MOIS_PREREMPLIS` mois (au format "AAAA-MM-01") à partir du mois en cours — sert à
 * pré-remplir la grille de pourcentages d'une nouvelle recette. */
function moisAPreremplir(): string[] {
  const maintenant = new Date();
  const mois: string[] = [];
  for (let i = 0; i < NOMBRE_MOIS_PREREMPLIS; i++) {
    mois.push(premierJourDuMois(new Date(maintenant.getFullYear(), maintenant.getMonth() + i, 1)));
  }
  return mois;
}

export async function chargerRecettesFlux(): Promise<RecetteFlux[]> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('flux_tresorerie_recettes')
    .select(
      'id, pop_up_nom, ca_jour_ht, taux_charges_variables, createur:created_by(nom_complet, email), mensualites:flux_tresorerie_recettes_mois(id, mois, pourcentage)',
    )
    .order('pop_up_nom', { ascending: true });
  if (error) throw new Error(error.message);

  type Ligne = {
    id: string;
    pop_up_nom: string;
    ca_jour_ht: number;
    taux_charges_variables: number;
    createur: { nom_complet: string | null; email: string } | null;
    mensualites: { id: string; mois: string; pourcentage: number }[];
  };

  return ((data ?? []) as unknown as Ligne[]).map((l) => ({
    id: l.id,
    popUpNom: l.pop_up_nom,
    caJourHt: l.ca_jour_ht,
    tauxChargesVariables: l.taux_charges_variables,
    creeParNom: l.createur ? l.createur.nom_complet || l.createur.email : '—',
    mensualites: l.mensualites
      .map((m) => ({ id: m.id, mois: m.mois, pourcentage: m.pourcentage }))
      .sort((a, b) => a.mois.localeCompare(b.mois)),
  }));
}

function versLigneRecette(params: ParamsRecetteFlux) {
  return {
    pop_up_nom: params.popUpNom.trim(),
    ca_jour_ht: params.caJourHt,
    taux_charges_variables: params.tauxChargesVariables,
  };
}

/** Crée la recette et pré-remplit sa grille de pourcentages sur `NOMBRE_MOIS_PREREMPLIS` mois à
 * partir du mois en cours, à `POURCENTAGE_PAR_DEFAUT` (100%) — cf. retour utilisateur : "il faut
 * que les pop-up déjà ouverts... commencent dès maintenant le chiffre 100%". Ceux pas encore
 * ouverts n'ont qu'à baisser le pourcentage des mois avant leur ouverture à 0. */
export async function creerRecetteFlux(params: ParamsRecetteFlux): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');

  const { data: recette, error } = await supabase
    .from('flux_tresorerie_recettes')
    .insert({ ...versLigneRecette(params), created_by: user.id })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const { error: erreurMensualites } = await supabase.from('flux_tresorerie_recettes_mois').insert(
    moisAPreremplir().map((mois) => ({
      recette_id: recette.id,
      mois,
      pourcentage: POURCENTAGE_PAR_DEFAUT,
      created_by: user.id,
    })),
  );
  if (erreurMensualites) throw new Error(erreurMensualites.message);
  revalidatePath('/tresorerie');
}

export async function modifierRecetteFlux(id: string, params: ParamsRecetteFlux): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('flux_tresorerie_recettes').update(versLigneRecette(params)).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}

export async function supprimerRecetteFlux(id: string): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('flux_tresorerie_recettes').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}

/** Change le taux de charges variables de tous les pop-up d'un coup — cf. retour utilisateur :
 * "donne-moi la possibilité de changer toutes les charges variables des pop-up", plutôt que
 * d'éditer chaque pop-up un par un. */
export async function definirTauxChargesVariablesPourTous(taux: number): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { error } = await supabase.from('flux_tresorerie_recettes').update({ taux_charges_variables: taux }).not('id', 'is', null);
  if (error) throw new Error(error.message);
  revalidatePath('/tresorerie');
}

/** Ajoute un mois de plus (à `POURCENTAGE_PAR_DEFAUT`) au bout de la grille d'une recette — cf.
 * retour utilisateur : la grille glisse dans le temps, un admin doit pouvoir l'étendre. */
export async function ajouterMoisRecetteFlux(recetteId: string, mois: string): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');

  const { error } = await supabase
    .from('flux_tresorerie_recettes_mois')
    .insert({ recette_id: recetteId, mois, pourcentage: POURCENTAGE_PAR_DEFAUT, created_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath('/tresorerie');
}

/** Modifie le pourcentage d'un mois déjà présent dans la grille (ex. objectif "80%" pour ce
 * mois-ci) — cf. retour utilisateur : "un pourcentage par mois des ventes exemple 80%". */
export async function definirPourcentageMoisRecette(mensualiteId: string, pourcentage: number): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('flux_tresorerie_recettes_mois')
    .update({ pourcentage })
    .eq('id', mensualiteId)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}

/** Noms des pop-up réellement créés dans l'appli (table pop_ups, pas flux_tresorerie_*) — sert à
 * distinguer, côté Hub, un pop-up déjà ouvert (dont les revenus comptent dès la grille, cf. retour
 * utilisateur du 2026-09-11) d'un pop-up seulement prévu (dont les revenus n'ont pas encore à
 * compter avant son 1er loyer, ex. "Bordeaux" pas encore ouvert). */
export async function chargerPopUpsReels(): Promise<string[]> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('pop_ups').select('nom');
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => p.nom as string);
}

// ---- Recettes exceptionnelles (cf. retour utilisateur du 2026-09-11 : "rajouter les recettes
// exceptionnelles qui peuvent être récurrentes ou une ponctuelle") — même structure que les
// dépenses (DepenseFlux), sans la case "pop-up" qui n'a pas de sens ici. ----

export interface RecetteExceptionnelleFlux {
  id: string;
  libelle: string;
  montant: number;
  type: TypeDepense;
  date: string;
  frequence: FrequenceDepense | null;
  dateFin: string | null;
  note: string | null;
  creeParNom: string;
}

export interface ParamsRecetteExceptionnelleFlux {
  libelle: string;
  montant: number;
  type: TypeDepense;
  date: string;
  frequence: FrequenceDepense | null;
  dateFin: string | null;
  note: string;
}

export async function chargerRecettesExceptionnellesFlux(): Promise<RecetteExceptionnelleFlux[]> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('flux_tresorerie_recettes_exceptionnelles')
    .select('id, libelle, montant, type, date, frequence, date_fin, note, createur:created_by(nom_complet, email)')
    .order('date', { ascending: true });
  if (error) throw new Error(error.message);

  type Ligne = {
    id: string;
    libelle: string;
    montant: number;
    type: TypeDepense;
    date: string;
    frequence: FrequenceDepense | null;
    date_fin: string | null;
    note: string | null;
    createur: { nom_complet: string | null; email: string } | null;
  };

  return ((data ?? []) as unknown as Ligne[]).map((l) => ({
    id: l.id,
    libelle: l.libelle,
    montant: l.montant,
    type: l.type,
    date: l.date,
    frequence: l.frequence,
    dateFin: l.date_fin,
    note: l.note,
    creeParNom: l.createur ? l.createur.nom_complet || l.createur.email : '—',
  }));
}

function versLigneRecetteExceptionnelle(params: ParamsRecetteExceptionnelleFlux) {
  const estRecurrente = params.type === 'recurrente';
  return {
    libelle: params.libelle.trim(),
    montant: params.montant,
    type: params.type,
    date: params.date,
    frequence: estRecurrente ? params.frequence : null,
    date_fin: estRecurrente ? params.dateFin || null : null,
    note: params.note.trim() || null,
  };
}

export async function creerRecetteExceptionnelleFlux(params: ParamsRecetteExceptionnelleFlux): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');

  const { error } = await supabase
    .from('flux_tresorerie_recettes_exceptionnelles')
    .insert({ ...versLigneRecetteExceptionnelle(params), created_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath('/tresorerie');
}

export async function modifierRecetteExceptionnelleFlux(id: string, params: ParamsRecetteExceptionnelleFlux): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('flux_tresorerie_recettes_exceptionnelles')
    .update(versLigneRecetteExceptionnelle(params))
    .eq('id', id)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}

export async function supprimerRecetteExceptionnelleFlux(id: string): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('flux_tresorerie_recettes_exceptionnelles').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/tresorerie');
}
