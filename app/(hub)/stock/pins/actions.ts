'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { comparerParEmplacement, normaliserStockPin } from './stockLib';
import type {
  CommandeAvecLignes,
  CommandeHistoriqueResume,
  CommandeLigneAvecPin,
  CommandePopUp,
  DernierRemplissage,
  PopUpPinBoite,
  StockMouvement,
  StockPin,
} from './stockLib';

/** Réplique src/api/stock.ts de l'app Pimp It (écran Stock > Pin's) — mêmes tables réelles
 * (stock_pins, pop_up_pin_boites, commandes_pop_up, commande_lignes, pop_up_boite_remplissages,
 * commandes_historique, stock_mouvements), pas un miroir hub_*. Le profil de l'utilisateur courant
 * (pour maj_par/profile_id) est résolu ici via auth.getUser() plutôt que passé depuis le client. */

async function idUtilisateurCourant(supabase: Awaited<ReturnType<typeof creerClientSupabaseServeur>>): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non connecté.');
  return user.id;
}

// ---- Chargement (appelés à la demande depuis le client, cf. chargerHorairesOuverture dans
// app/(hub)/pop-ups/actions.ts pour le même principe) ----

export async function chargerStockPins(): Promise<StockPin[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('stock_pins').select('*').eq('actif', true).order('nom');
  if (error) throw new Error(error.message);
  return (data as StockPin[]).map(normaliserStockPin);
}

export async function chargerPopUpPinBoites(): Promise<PopUpPinBoite[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('pop_up_pin_boites')
    .select('id, pop_up_id, pin_id, case_position, a_commander, updated_at');
  if (error) throw new Error(error.message);
  return data;
}

/** Toutes les commandes pas encore reçues (tous pop-ups confondus) avec leurs lignes+pin — sert à
 * la fois à l'onglet "Rapport" (statut de la commande active d'un pop-up), à l'onglet "Commandes"
 * du Local et à l'écran de préparation. Une seule commande en vol à la fois par pop-up (contrainte
 * en base), donc ce jeu reste petit. */
export async function chargerCommandesActives(): Promise<CommandeAvecLignes[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('commandes_pop_up')
    .select('*, lignes:commande_lignes(*, pin:stock_pins(*))')
    .neq('statut', 'recue')
    .order('envoyee_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as unknown as (CommandePopUp & { lignes: CommandeLigneAvecPin[] })[]).map((c) => {
    const { lignes, ...commande } = c;
    lignes.sort((a, b) => comparerParEmplacement(a.pin, b.pin));
    return { commande, lignes };
  });
}

export async function chargerCommandesTerminees(popUpId: string): Promise<CommandeHistoriqueResume[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('commandes_pop_up')
    .select('*, lignes:commande_lignes(id)')
    .eq('pop_up_id', popUpId)
    .order('envoyee_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as (CommandePopUp & { lignes: { id: string }[] })[]).map((c) => {
    const { lignes, ...commande } = c;
    return { commande, nbPins: lignes.length };
  });
}

export async function chargerDetailCommande(commandeId: string): Promise<CommandeAvecLignes & { popUpNom: string }> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('commandes_pop_up')
    .select('*, pop_up:pop_ups(nom), lignes:commande_lignes(*, pin:stock_pins(*))')
    .eq('id', commandeId)
    .single();
  if (error) throw new Error(error.message);
  const { pop_up, lignes, ...commande } = data as unknown as CommandePopUp & {
    pop_up: { nom: string } | null;
    lignes: CommandeLigneAvecPin[];
  };
  lignes.sort((a, b) => comparerParEmplacement(a.pin, b.pin));
  return { commande, popUpNom: pop_up?.nom ?? '?', lignes };
}

/** Remplissages depuis la dernière commande envoyée pour ce pop-up (tous statuts confondus) — pour
 * repartir de zéro à chaque nouvel envoi sans rien supprimer en base. S'il n'y a jamais eu de
 * commande, retourne tout l'historique. Cf. fetchRemplissagesDepuisDerniereCommande. */
export async function chargerRemplissages(popUpId: string): Promise<DernierRemplissage[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data: derniereCommande, error: errDerniere } = await supabase
    .from('commandes_pop_up')
    .select('envoyee_at')
    .eq('pop_up_id', popUpId)
    .order('envoyee_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errDerniere) throw new Error(errDerniere.message);

  let requete = supabase
    .from('pop_up_boite_remplissages')
    .select('id, case_position, created_at, profile:profiles(nom_complet)')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (derniereCommande?.envoyee_at) requete = requete.gt('created_at', derniereCommande.envoyee_at);

  const { data, error } = await requete;
  if (error) throw new Error(error.message);
  return (
    data as unknown as { id: string; case_position: string; created_at: string; profile: { nom_complet: string } | null }[]
  ).map((r) => ({
    id: r.id,
    casePosition: r.case_position,
    profileNom: r.profile?.nom_complet ?? '?',
    createdAt: r.created_at,
  }));
}

/** Dernier remplissage connu par case (toutes les cases, pas seulement depuis la dernière
 * commande) — affiché sous "Valider le remplissage" dans le panneau d'une case. */
export async function chargerDerniersRemplissages(popUpId: string): Promise<DernierRemplissage[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('pop_up_boite_remplissages')
    .select('id, case_position, created_at, profile:profiles(nom_complet)')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const lignes = (
    data as unknown as { id: string; case_position: string; created_at: string; profile: { nom_complet: string } | null }[]
  ).map((r) => ({
    id: r.id,
    casePosition: r.case_position,
    profileNom: r.profile?.nom_complet ?? '?',
    createdAt: r.created_at,
  }));
  const parCase = new Map<string, DernierRemplissage>();
  for (const ligne of lignes) if (!parCase.has(ligne.casePosition)) parCase.set(ligne.casePosition, ligne);
  return [...parCase.values()];
}

export async function chargerMouvements(pinId: string): Promise<StockMouvement[]> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('stock_mouvements')
    .select('*')
    .eq('pin_id', pinId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data;
}

// ---- Mutations ----

export async function creerPin(nom: string): Promise<StockPin> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('stock_pins').insert({ nom }).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/stock');
  return normaliserStockPin(data as StockPin);
}

export async function modifierPin(id: string, params: { seuil_cible?: number | null; poids_unitaire?: number | null }) {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('stock_pins')
    .update({ ...params, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/stock');
}

/** Signale un pin trouvé physiquement mais absent du catalogue — cf. signalerPinInconnu. */
export async function signalerPinInconnu(photoUrl: string, note: string | undefined): Promise<StockPin> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('stock_pins')
    .insert({ nom: 'Pin à identifier', photo_url: photoUrl, description: note?.trim() || null, a_completer: true })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/stock');
  return normaliserStockPin(data as StockPin);
}

/** Remplace l'ensemble des pins attribués à une case par `pinIdsVoulus` — cf. attribuerPinsACase. */
export async function attribuerPinsACase(params: {
  popUpId: string;
  casePosition: string;
  pinIdsActuels: string[];
  pinIdsVoulus: string[];
}) {
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);
  const { popUpId, casePosition, pinIdsActuels, pinIdsVoulus } = params;
  const actuels = new Set(pinIdsActuels);
  const voulus = new Set(pinIdsVoulus);
  const aRetirer = pinIdsActuels.filter((id) => !voulus.has(id));
  const aAjouter = pinIdsVoulus.filter((id) => !actuels.has(id));

  if (aRetirer.length > 0) {
    const { data, error } = await supabase
      .from('pop_up_pin_boites')
      .delete()
      .eq('pop_up_id', popUpId)
      .eq('case_position', casePosition)
      .in('pin_id', aRetirer)
      .select();
    if (error) throw new Error(error.message);
    if (!data || data.length < aRetirer.length) throw new Error('Retrait bloqué (droits insuffisants ?)');
  }
  if (aAjouter.length > 0) {
    const { error } = await supabase.from('pop_up_pin_boites').insert(
      aAjouter.map((pinId) => ({ pop_up_id: popUpId, pin_id: pinId, case_position: casePosition, maj_par: profileId })),
    );
    if (error) throw new Error(error.message);
  }
  revalidatePath('/stock');
}

export async function basculerCommandePin(params: { boiteId: string; aCommander: boolean }) {
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);
  const { data, error } = await supabase
    .from('pop_up_pin_boites')
    .update({ a_commander: params.aCommander, maj_par: profileId, updated_at: new Date().toISOString() })
    .eq('id', params.boiteId)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/stock');
}

export async function validerRemplissageBoite(params: { popUpId: string; casePosition: string }) {
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);
  const { error } = await supabase
    .from('pop_up_boite_remplissages')
    .insert({ pop_up_id: params.popUpId, case_position: params.casePosition, profile_id: profileId });
  if (error) throw new Error(error.message);
  revalidatePath('/stock');
}

export async function supprimerRemplissage(id: string) {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.from('pop_up_boite_remplissages').delete().eq('id', id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
  revalidatePath('/stock');
}

/** Applique un delta (positif = incrément, négatif = décrément, jamais sous 0) au stock local
 * d'un pin — cf. retour utilisateur du 2026-09-05 : "il faut que le pin's soit décrémenté [...]
 * comme ca on suit la quantité de pin's dans le local aussi". Utilisé à l'envoi d'une commande à
 * un pop-up (décrément) et à son retrait avant prise en charge (increment, rollback). */
async function appliquerDeltaStockPin(
  supabase: Awaited<ReturnType<typeof creerClientSupabaseServeur>>,
  pinId: string,
  delta: number,
): Promise<void> {
  const { data: pin, error: errLecture } = await supabase.from('stock_pins').select('stock_general').eq('id', pinId).single();
  if (errLecture) throw new Error(errLecture.message);
  const nouveauStock = Math.max(0, Number(pin.stock_general) + delta);
  const { error: errMaj } = await supabase.from('stock_pins').update({ stock_general: nouveauStock }).eq('id', pinId);
  if (errMaj) throw new Error(errMaj.message);
}

export async function envoyerCommande(params: { popUpId: string; lignes: { pinId: string; quantite: number }[] }): Promise<string> {
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);
  const { data: commande, error: errorCommande } = await supabase
    .from('commandes_pop_up')
    .insert({ pop_up_id: params.popUpId, envoyee_par: profileId })
    .select('id')
    .single();
  if (errorCommande) throw new Error(errorCommande.message);

  const { error: errorLignes } = await supabase
    .from('commande_lignes')
    .insert(params.lignes.map((l) => ({ commande_id: commande.id, pin_id: l.pinId, quantite: l.quantite })));
  if (errorLignes) throw new Error(errorLignes.message);

  // Décrémente le stock local pour chaque pin envoyé — best-effort par ligne : un souci sur un
  // pin ne doit pas remettre en cause l'envoi déjà enregistré ci-dessus.
  for (const l of params.lignes) {
    try {
      await appliquerDeltaStockPin(supabase, l.pinId, -l.quantite);
    } catch (e) {
      console.warn(`Décrément stock local échoué pour le pin ${l.pinId}:`, e instanceof Error ? e.message : e);
    }
  }

  revalidatePath('/stock');
  return commande.id;
}

export async function basculerLigneCommande(params: { commandeId: string; pinId: string; inclus: boolean; quantite?: number }) {
  const supabase = await creerClientSupabaseServeur();
  if (params.inclus) {
    const quantite = params.quantite ?? 100;
    const { error } = await supabase
      .from('commande_lignes')
      .insert({ commande_id: params.commandeId, pin_id: params.pinId, quantite });
    if (error) throw new Error(error.message);
    try {
      await appliquerDeltaStockPin(supabase, params.pinId, -quantite);
    } catch (e) {
      console.warn(`Décrément stock local échoué pour le pin ${params.pinId}:`, e instanceof Error ? e.message : e);
    }
  } else {
    const { data: ligneExistante } = await supabase
      .from('commande_lignes')
      .select('quantite')
      .eq('commande_id', params.commandeId)
      .eq('pin_id', params.pinId)
      .maybeSingle();

    const { data, error } = await supabase
      .from('commande_lignes')
      .delete()
      .eq('commande_id', params.commandeId)
      .eq('pin_id', params.pinId)
      .select();
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('Retrait bloqué (droits insuffisants ?)');

    // Rollback du décrément fait à l'ajout de cette ligne — cf. envoyerCommande/appliquerDeltaStockPin.
    if (ligneExistante) {
      try {
        await appliquerDeltaStockPin(supabase, params.pinId, Number(ligneExistante.quantite));
      } catch (e) {
        console.warn(`Ré-incrément stock local échoué pour le pin ${params.pinId}:`, e instanceof Error ? e.message : e);
      }
    }
  }
  revalidatePath('/stock');
}

export async function marquerCommandeRecue(params: { commandeId: string; popUpId: string }) {
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);

  const { data: commandeMaj, error: errorCommande } = await supabase
    .from('commandes_pop_up')
    .update({ statut: 'recue', recue_par: profileId, recue_at: new Date().toISOString() })
    .eq('id', params.commandeId)
    .select();
  if (errorCommande) throw new Error(errorCommande.message);
  if (!commandeMaj || commandeMaj.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');

  const { data: lignesFaites, error: errorLignes } = await supabase
    .from('commande_lignes')
    .select('pin_id')
    .eq('commande_id', params.commandeId)
    .eq('fait', true);
  if (errorLignes) throw new Error(errorLignes.message);

  const pinIdsTrouves = (lignesFaites ?? []).map((l) => l.pin_id);
  if (pinIdsTrouves.length > 0) {
    const { data: boitesMaj, error: errorBoites } = await supabase
      .from('pop_up_pin_boites')
      .update({ a_commander: false })
      .eq('pop_up_id', params.popUpId)
      .in('pin_id', pinIdsTrouves)
      .select();
    if (errorBoites) throw new Error(errorBoites.message);
    if (!boitesMaj || boitesMaj.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  }
  revalidatePath('/stock');
}

export async function basculerLigneCommandeFaite(ligneId: string, fait: boolean) {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('commande_lignes')
    .update({ fait, updated_at: new Date().toISOString() })
    .eq('id', ligneId)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/stock');
}

export async function basculerToutesLignesCommande(commandeId: string, fait: boolean) {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase
    .from('commande_lignes')
    .update({ fait, updated_at: new Date().toISOString() })
    .eq('commande_id', commandeId)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/stock');
}

export async function validerCommandePrete(params: {
  commandeId: string;
  popUpId: string;
  lignes: { pinId: string; fait: boolean }[];
}) {
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);

  if (params.lignes.length > 0) {
    const { error: errorHistorique } = await supabase.from('commandes_historique').insert(
      params.lignes.map((l) => ({ pop_up_id: params.popUpId, pin_id: l.pinId, trouve: l.fait, profile_id: profileId })),
    );
    if (errorHistorique) throw new Error(errorHistorique.message);
  }

  const { data, error } = await supabase
    .from('commandes_pop_up')
    .update({ statut: 'prete', preparee_par: profileId, preparee_at: new Date().toISOString() })
    .eq('id', params.commandeId)
    .select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
  revalidatePath('/stock');
}

/** Comptage du stock local — quantité saisie directement (paquets de 100 faciles à compter),
 * remplace l'ancienne pesée/poids_unitaire (retour utilisateur du 2026-09-02 : plus pratique une
 * fois les pins reçus en paquets de quantité connue). `popUpLocalId` (pas null) pour rester
 * cohérent avec le mouvement de stock déjà en base, même principe que l'ancien peserStockGeneral. */
export async function definirStockGeneral(params: { pinId: string; popUpLocalId: string; quantite: number }): Promise<void> {
  const supabase = await creerClientSupabaseServeur();
  const profileId = await idUtilisateurCourant(supabase);

  const quantite = Math.max(0, Math.round(params.quantite));

  const { data: dataMaj, error: errorMaj } = await supabase
    .from('stock_pins')
    .update({ stock_general: quantite, updated_at: new Date().toISOString() })
    .eq('id', params.pinId)
    .select();
  if (errorMaj) throw new Error(errorMaj.message);
  if (!dataMaj || dataMaj.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');

  const { error: errorMouvement } = await supabase.from('stock_mouvements').insert({
    pin_id: params.pinId,
    pop_up_id: params.popUpLocalId,
    type: 'ajustement',
    quantite_calculee: quantite,
    profile_id: profileId,
  });
  if (errorMouvement) throw new Error(errorMouvement.message);

  revalidatePath('/stock');
}
