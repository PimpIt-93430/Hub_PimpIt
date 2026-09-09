'use server';

import { revalidatePath } from 'next/cache';

import { exigerAdmin } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

export interface PersonneJour {
  id: string;
  nomComplet: string;
}

export interface PersonnelJour {
  personnesPresentes: PersonneJour[];
  fermetureSuggereeId: string | null;
}

/** Personnel d'un pop-up à une date donnée, déduit de planning_shifts (cf. retour utilisateur :
 * "les personnes qui travaillaient ce jour-là... si tu peux le faire automatiquement grâce au
 * planning c'est top") — la personne suggérée pour la fermeture est celle dont le créneau finit le
 * plus tard ce jour-là. Purement une SUGGESTION pré-remplie côté client : l'admin peut corriger
 * avant d'enregistrer (cf. TrouClient.tsx), rien n'est jamais recalculé après coup. */
export async function chargerPersonnelJour(popUpId: string, date: string): Promise<PersonnelJour> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data: shifts, error } = await supabase
    .from('planning_shifts')
    .select('profile_id, heure_fin, profiles!planning_shifts_profile_id_fkey(nom_complet, email)')
    .eq('pop_up_id', popUpId)
    .eq('date', date);
  if (error) throw new Error(error.message);

  type Ligne = { profile_id: string; heure_fin: string; profiles: { nom_complet: string | null; email: string } | null };
  const lignes = (shifts ?? []) as unknown as Ligne[];

  const parProfil = new Map<string, { nom: string; heureFinMax: string }>();
  for (const l of lignes) {
    const nom = l.profiles?.nom_complet || l.profiles?.email || 'Sans nom';
    const existant = parProfil.get(l.profile_id);
    if (!existant || l.heure_fin > existant.heureFinMax) {
      parProfil.set(l.profile_id, { nom, heureFinMax: l.heure_fin });
    }
  }

  const personnesPresentes = Array.from(parProfil.entries())
    .map(([id, v]) => ({ id, nomComplet: v.nom }))
    .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet));

  let fermetureSuggereeId: string | null = null;
  let heureFinMax = '';
  for (const [id, v] of parProfil) {
    if (v.heureFinMax > heureFinMax) {
      heureFinMax = v.heureFinMax;
      fermetureSuggereeId = id;
    }
  }

  return { personnesPresentes, fermetureSuggereeId };
}

export interface TrouCaisse {
  id: string;
  popUpId: string;
  popUpNom: string;
  date: string;
  montant: number;
  personneFermetureId: string | null;
  personneFermetureNom: string | null;
  personnesPresentes: PersonneJour[];
  note: string | null;
  creeParNom: string;
  creeLe: string;
}

export async function chargerTrousCaisse(): Promise<TrouCaisse[]> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('trous_caisse')
    .select(
      'id, pop_up_id, date, montant, personne_fermeture_id, personnes_presentes_ids, note, created_at, pop_ups(nom), fermeture:personne_fermeture_id(nom_complet, email), createur:created_by(nom_complet, email)',
    )
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const { data: profils } = await supabase.from('profiles').select('id, nom_complet, email');
  const nomParProfil = new Map((profils ?? []).map((p) => [p.id, p.nom_complet || p.email]));

  type Ligne = {
    id: string;
    pop_up_id: string;
    date: string;
    montant: number;
    personne_fermeture_id: string | null;
    personnes_presentes_ids: string[];
    note: string | null;
    created_at: string;
    pop_ups: { nom: string } | null;
    fermeture: { nom_complet: string | null; email: string } | null;
    createur: { nom_complet: string | null; email: string } | null;
  };

  return ((data ?? []) as unknown as Ligne[]).map((l) => ({
    id: l.id,
    popUpId: l.pop_up_id,
    popUpNom: l.pop_ups?.nom ?? '—',
    date: l.date,
    montant: l.montant,
    personneFermetureId: l.personne_fermeture_id,
    personneFermetureNom: l.fermeture ? l.fermeture.nom_complet || l.fermeture.email : null,
    personnesPresentes: l.personnes_presentes_ids.map((id) => ({ id, nomComplet: nomParProfil.get(id) ?? 'Inconnu' })),
    note: l.note,
    creeParNom: l.createur ? l.createur.nom_complet || l.createur.email : '—',
    creeLe: l.created_at,
  }));
}

export async function creerTrouCaisse(params: {
  popUpId: string;
  date: string;
  montant: number;
  personneFermetureId: string | null;
  personnesPresentesIds: string[];
  note: string;
}): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');

  const { error } = await supabase.from('trous_caisse').insert({
    pop_up_id: params.popUpId,
    date: params.date,
    montant: params.montant,
    personne_fermeture_id: params.personneFermetureId,
    personnes_presentes_ids: params.personnesPresentesIds,
    note: params.note.trim() || null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/trou');
}

export async function supprimerTrouCaisse(id: string): Promise<void> {
  await exigerAdmin();
  const supabase = await creerClientSupabaseServeur();
  // Une suppression bloquée par une policy RLS ne renvoie jamais d'erreur côté Supabase (0 ligne
  // affectée, réponse "succès" quand même) — .select() vérifie ce qui a vraiment été supprimé.
  const { data, error } = await supabase.from('trous_caisse').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/trou');
}
