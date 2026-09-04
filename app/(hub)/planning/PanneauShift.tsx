'use client';

// Port de App PIMP IT/src/components/calendrier/PanneauCreationShift.tsx (panneau latéral droit
// web-only) — bascule Nouveau shift / Nouvelle absence pour une cellule vide, formulaire d'édition
// directe (horaires/lieu/étiquette/pause + Supprimer) quand la cellule cliquée n'a qu'un seul
// créneau existant. Avertissements (chevauchement, indisponibilité, personne non attribuée à ce
// lieu) via window.confirm, comme la référence (page web-only, pas de mobile ici).
//
// Différences assumées avec la référence (scope pragmatique, cf. consigne de la tâche) : pas de
// répétition sur plusieurs jours / plage "un jour sur deux" à la création (le jour est fixé par la
// cellule cliquée) — pour un nouveau shift sur plusieurs jours, rouvrir le panneau sur chaque jour.

import { useEffect, useState } from 'react';

import { creerConge, creerShifts, modifierShift, supprimerShifts, type NouveauShift } from './actions';
import { formatDateCourte, seChevauchent } from './dateUtils';
import { ETIQUETTES_SHIFT, LIBELLE_TYPE_CONGE } from './types';
import type { Conge, PlanningShift, PopUp, Profile, TypeConge } from './types';

type ModePanneau = 'shift' | 'absence';
type ModeDureeAbsence = 'journee' | 'creneau';
type Preset = 'matin' | 'apres_midi';

type DefinitionPreset = { label: string; debut: string; pauseDebut: string; pauseFin: string; fin: string };

// Port de App PIMP IT/src/components/calendrier/PanneauEditionShiftEquipe.tsx (PRESETS_GENERIQUES/
// presetsPourPopUp) — cf. retour utilisateur du 2026-09-05 : "dans le hub dans le planing il faut
// pouvoir mettre matin et après midi les horaires configurées". Génériques, utilisés seulement
// quand le pop-up n'a pas ses propres créneaux réglés (écran Pop-up, colonnes matin_debut/
// matin_fin/apres_midi_debut/apres_midi_fin).
const PRESETS_GENERIQUES: Record<Preset, DefinitionPreset> = {
  matin: { label: 'Matin (10h-18h)', debut: '10:00', pauseDebut: '13:00', pauseFin: '14:00', fin: '18:00' },
  apres_midi: { label: 'Après-midi (13h-20h30)', debut: '13:00', pauseDebut: '16:00', pauseFin: '16:30', fin: '20:30' },
};

function presetsPourPopUp(popUp: PopUp | undefined): Record<Preset, DefinitionPreset> {
  const matin =
    popUp?.matin_debut && popUp?.matin_fin
      ? {
          label: `Matin (${popUp.matin_debut.slice(0, 5)}-${popUp.matin_fin.slice(0, 5)})`,
          debut: popUp.matin_debut.slice(0, 5),
          fin: popUp.matin_fin.slice(0, 5),
          pauseDebut: (popUp.matin_pause_debut ?? PRESETS_GENERIQUES.matin.pauseDebut).slice(0, 5),
          pauseFin: (popUp.matin_pause_fin ?? PRESETS_GENERIQUES.matin.pauseFin).slice(0, 5),
        }
      : PRESETS_GENERIQUES.matin;
  const apresMidi =
    popUp?.apres_midi_debut && popUp?.apres_midi_fin
      ? {
          label: `Après-midi (${popUp.apres_midi_debut.slice(0, 5)}-${popUp.apres_midi_fin.slice(0, 5)})`,
          debut: popUp.apres_midi_debut.slice(0, 5),
          fin: popUp.apres_midi_fin.slice(0, 5),
          pauseDebut: (popUp.apres_midi_pause_debut ?? PRESETS_GENERIQUES.apres_midi.pauseDebut).slice(0, 5),
          pauseFin: (popUp.apres_midi_pause_fin ?? PRESETS_GENERIQUES.apres_midi.pauseFin).slice(0, 5),
        }
      : PRESETS_GENERIQUES.apres_midi;
  return { matin, apres_midi: apresMidi };
}

function nomAffiche(p: Profile): string {
  return p.nom_complet || p.email;
}

function estAttribueA(profile: Profile, popUpId: string, mapAffectations: Map<string, Set<string>>): boolean {
  if (profile.role === 'admin') return true;
  return mapAffectations.get(profile.id)?.has(popUpId) ?? false;
}

export function PanneauShift({
  onClose,
  popUps,
  popUpIdInitial,
  profils,
  mapAffectations,
  tousLesShifts,
  tousLesConges,
  dateInitiale,
  profilInitial,
  heureDebutInitiale,
  heureFinInitiale,
  shiftsExistants,
}: {
  onClose: () => void;
  popUps: PopUp[];
  popUpIdInitial?: string;
  profils: Profile[];
  mapAffectations: Map<string, Set<string>>;
  tousLesShifts: PlanningShift[];
  tousLesConges: Conge[];
  dateInitiale: string;
  profilInitial: Profile | null;
  heureDebutInitiale?: string;
  heureFinInitiale?: string;
  shiftsExistants: PlanningShift[];
}) {
  const shiftAModifier = shiftsExistants.length === 1 ? shiftsExistants[0] : null;

  const [mode, setMode] = useState<ModePanneau>('shift');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const [profilsChoisis, setProfilsChoisis] = useState<Profile[]>(profilInitial ? [profilInitial] : []);
  const [rechercheProfil, setRechercheProfil] = useState('');
  const [popUpChoisiId, setPopUpChoisiId] = useState(popUpIdInitial ?? popUps[0]?.id ?? '');
  const [etiquette, setEtiquette] = useState(shiftAModifier?.etiquette ?? '');
  const [heureDebut, setHeureDebut] = useState(heureDebutInitiale ?? '10:00');
  const [heureFin, setHeureFin] = useState(heureFinInitiale ?? '19:00');
  const [pauseActive, setPauseActive] = useState(!!(shiftAModifier?.pause_debut && shiftAModifier?.pause_fin));
  const [heureDebutPause, setHeureDebutPause] = useState(shiftAModifier?.pause_debut?.slice(0, 5) ?? '13:00');
  const [heureFinPause, setHeureFinPause] = useState(shiftAModifier?.pause_fin?.slice(0, 5) ?? '14:00');

  const [salarieAbsence, setSalarieAbsence] = useState<Profile | null>(profilInitial);
  const [rechercheAbsence, setRechercheAbsence] = useState('');
  const [typeAbsence, setTypeAbsence] = useState<TypeConge>('conge');
  const [modeDureeAbsence, setModeDureeAbsence] = useState<ModeDureeAbsence>('journee');
  const [dateDebutAbsence, setDateDebutAbsence] = useState(dateInitiale);
  const [dateFinAbsence, setDateFinAbsence] = useState(dateInitiale);
  const [heureDebutAbsence, setHeureDebutAbsence] = useState('09:00');
  const [heureFinAbsence, setHeureFinAbsence] = useState('18:00');
  const [noteAbsence, setNoteAbsence] = useState('');

  // Ferme au clavier (Échap), comme un panneau modal classique.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pauseValide = heureFinPause > heureDebutPause && heureDebutPause >= heureDebut && heureFinPause <= heureFin;

  // Un clic sur "Matin"/"Après-midi" remplit les 4 horaires d'un coup avec les créneaux propres au
  // pop-up sélectionné (repli générique sinon) — recalculé à chaque clic pour suivre le lieu choisi
  // à ce moment-là, pas figé au pop-up initial.
  const appliquerPreset = (preset: Preset) => {
    const popUpChoisi = popUps.find((p) => p.id === popUpChoisiId);
    const p = presetsPourPopUp(popUpChoisi)[preset];
    setHeureDebut(p.debut);
    setHeureDebutPause(p.pauseDebut);
    setHeureFinPause(p.pauseFin);
    setHeureFin(p.fin);
    setPauseActive(true);
  };

  const candidatsShift = profils.filter((p) => {
    if (profilsChoisis.some((s) => s.id === p.id)) return false;
    const recherche = rechercheProfil.trim().toLowerCase();
    if (!recherche) return true;
    return `${p.nom_complet} ${p.email}`.toLowerCase().includes(recherche);
  });
  const candidatsAbsence = profils.filter((p) => {
    const recherche = rechercheAbsence.trim().toLowerCase();
    if (!recherche) return true;
    return `${p.nom_complet} ${p.email}`.toLowerCase().includes(recherche);
  });

  async function handleCreerShift() {
    setErreur(null);
    if (profilsChoisis.length === 0) return setErreur('Choisissez au moins un salarié.');
    if (heureFin <= heureDebut) return setErreur("L'heure de fin doit être après l'heure de début.");
    if (pauseActive && !pauseValide) return setErreur('La pause doit être comprise dans le créneau.');
    if (!popUpChoisiId) return setErreur('Choisissez un pop-up.');

    const nonAttribues = profilsChoisis.filter((s) => !estAttribueA(s, popUpChoisiId, mapAffectations));
    if (nonAttribues.length > 0) {
      const noms = nonAttribues.map(nomAffiche).join(', ');
      if (!window.confirm(`${noms} n'est/ne sont pas attribué(e)(s) à ce pop-up. Ajouter quand même ce shift ?`)) return;
    }

    const heureDebutS = `${heureDebut}:00`;
    const heureFinS = `${heureFin}:00`;
    const alertes: string[] = [];
    for (const salarie of profilsChoisis) {
      const libelle = `${nomAffiche(salarie)} – ${formatDateCourte(dateInitiale)}`;
      const chevauche = tousLesShifts.some(
        (s) => s.profile_id === salarie.id && s.date === dateInitiale && seChevauchent(s.heure_debut, s.heure_fin, heureDebutS, heureFinS),
      );
      if (chevauche) alertes.push(`${libelle} : chevauche un shift déjà existant`);
      const enConge = tousLesConges.some((c) => {
        if (c.profile_id !== salarie.id || dateInitiale < c.date_debut || dateInitiale > c.date_fin) return false;
        if (!c.heure_debut || !c.heure_fin) return true;
        return seChevauchent(c.heure_debut, c.heure_fin, heureDebutS, heureFinS);
      });
      if (enConge) alertes.push(`${libelle} : en congé/indisponibilité ce jour-là`);
    }
    if (alertes.length > 0 && !window.confirm(`Attention :\n${alertes.join('\n')}\n\nCréer quand même ce(s) shift(s) ?`)) return;

    const lignes: NouveauShift[] = profilsChoisis.map((salarie) => ({
      pop_up_id: popUpChoisiId,
      profile_id: salarie.id,
      date: dateInitiale,
      heure_debut: heureDebutS,
      heure_fin: heureFinS,
      pause_debut: pauseActive ? `${heureDebutPause}:00` : null,
      pause_fin: pauseActive ? `${heureFinPause}:00` : null,
      etiquette: etiquette || null,
    }));

    setEnvoiEnCours(true);
    try {
      await creerShifts(lignes);
      onClose();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de créer le shift.');
    } finally {
      setEnvoiEnCours(false);
    }
  }

  async function handleModifierShift() {
    if (!shiftAModifier || !profilInitial) return;
    setErreur(null);
    if (heureFin <= heureDebut) return setErreur("L'heure de fin doit être après l'heure de début.");
    if (pauseActive && !pauseValide) return setErreur('La pause doit être comprise dans le créneau.');
    if (!popUpChoisiId) return setErreur('Choisissez un pop-up.');

    if (!estAttribueA(profilInitial, popUpChoisiId, mapAffectations)) {
      if (!window.confirm(`${nomAffiche(profilInitial)} n'est pas attribué(e) à ce pop-up. Enregistrer quand même ?`)) return;
    }

    const heureDebutS = `${heureDebut}:00`;
    const heureFinS = `${heureFin}:00`;
    const chevauche = tousLesShifts.some(
      (s) =>
        s.id !== shiftAModifier.id &&
        s.profile_id === profilInitial.id &&
        s.date === dateInitiale &&
        seChevauchent(s.heure_debut, s.heure_fin, heureDebutS, heureFinS),
    );
    const enConge = tousLesConges.some((c) => {
      if (c.profile_id !== profilInitial.id || dateInitiale < c.date_debut || dateInitiale > c.date_fin) return false;
      if (!c.heure_debut || !c.heure_fin) return true;
      return seChevauchent(c.heure_debut, c.heure_fin, heureDebutS, heureFinS);
    });
    if (chevauche || enConge) {
      const alertes = [chevauche && 'Chevauche un autre shift déjà existant', enConge && 'En congé/indisponibilité ce jour-là'].filter(
        Boolean,
      );
      if (!window.confirm(`Attention :\n${alertes.join('\n')}\n\nEnregistrer quand même ?`)) return;
    }

    setEnvoiEnCours(true);
    try {
      await modifierShift(shiftAModifier.id, {
        pop_up_id: popUpChoisiId,
        heure_debut: heureDebutS,
        heure_fin: heureFinS,
        pause_debut: pauseActive ? `${heureDebutPause}:00` : null,
        pause_fin: pauseActive ? `${heureFinPause}:00` : null,
        etiquette: etiquette || null,
      });
      onClose();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de modifier le shift.');
    } finally {
      setEnvoiEnCours(false);
    }
  }

  async function handleSupprimer() {
    if (shiftsExistants.length === 0) return;
    const confirme = window.confirm(
      shiftsExistants.length === 1 ? 'Supprimer ce shift ?' : `Supprimer ces ${shiftsExistants.length} shifts ?`,
    );
    if (!confirme) return;
    setSuppressionEnCours(true);
    try {
      await supprimerShifts(shiftsExistants.map((s) => s.id));
      onClose();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de supprimer.');
    } finally {
      setSuppressionEnCours(false);
    }
  }

  async function handleCreerAbsence() {
    setErreur(null);
    if (!salarieAbsence) return setErreur('Choisissez un salarié.');
    if (modeDureeAbsence === 'journee' && dateFinAbsence < dateDebutAbsence) return setErreur('La date de fin doit être après la date de début.');
    if (modeDureeAbsence === 'creneau' && heureFinAbsence <= heureDebutAbsence) return setErreur("L'heure de fin doit être après l'heure de début.");

    setEnvoiEnCours(true);
    try {
      await creerConge({
        profileId: salarieAbsence.id,
        dateDebut: dateDebutAbsence,
        dateFin: modeDureeAbsence === 'journee' ? dateFinAbsence : dateDebutAbsence,
        heureDebut: modeDureeAbsence === 'creneau' ? `${heureDebutAbsence}:00` : null,
        heureFin: modeDureeAbsence === 'creneau' ? `${heureFinAbsence}:00` : null,
        type: typeAbsence,
        note: noteAbsence,
      });
      onClose();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible de créer l'absence.");
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-slate-900/35" onClick={onClose}>
      <div className="h-full w-[420px] max-w-full overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {shiftAModifier ? 'Modifier le shift' : mode === 'shift' ? 'Créer un shift' : 'Créer une absence'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200">
            ✕
          </button>
        </div>

        {erreur && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{erreur}</p>}

        {shiftAModifier ? (
          <>
            <Label>Salarié</Label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              <Chip>{profilInitial ? nomAffiche(profilInitial) : '—'}</Chip>
              <Chip>{formatDateCourte(dateInitiale)}</Chip>
            </div>

            <Champ label="Lieu">
              <select value={popUpChoisiId} onChange={(e) => setPopUpChoisiId(e.target.value)} className="champ-select">
                {popUps.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </Champ>

            <Champ label="Étiquette">
              <select value={etiquette} onChange={(e) => setEtiquette(e.target.value)} className="champ-select">
                <option value="">Aucune étiquette</option>
                {ETIQUETTES_SHIFT.map((et) => (
                  <option key={et} value={et}>
                    {et}
                  </option>
                ))}
              </select>
            </Champ>

            <HorairesEtPause
              heureDebut={heureDebut}
              heureFin={heureFin}
              setHeureDebut={setHeureDebut}
              setHeureFin={setHeureFin}
              pauseActive={pauseActive}
              setPauseActive={setPauseActive}
              heureDebutPause={heureDebutPause}
              setHeureDebutPause={setHeureDebutPause}
              heureFinPause={heureFinPause}
              setHeureFinPause={setHeureFinPause}
              presets={presetsPourPopUp(popUps.find((p) => p.id === popUpChoisiId))}
              onAppliquerPreset={appliquerPreset}
            />

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={onClose} className="btn-annuler flex-1">
                Annuler
              </button>
              <button type="button" onClick={handleModifierShift} disabled={envoiEnCours} className="btn-valider flex-1">
                {envoiEnCours ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
            <button type="button" onClick={handleSupprimer} disabled={suppressionEnCours} className="btn-supprimer mt-3">
              {suppressionEnCours ? 'Suppression...' : 'Supprimer ce shift'}
            </button>
          </>
        ) : (
          <>
            <div className="mb-4 flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMode('shift')}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === 'shift' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
              >
                Nouveau shift
              </button>
              <button
                type="button"
                onClick={() => setMode('absence')}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === 'absence' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
              >
                Nouvelle absence
              </button>
            </div>

            {mode === 'shift' ? (
              <>
                <Label>Salarié(s)</Label>
                {profilsChoisis.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {profilsChoisis.map((s) => (
                      <Chip key={s.id} onRemove={() => setProfilsChoisis((prev) => prev.filter((p) => p.id !== s.id))}>
                        {nomAffiche(s)}
                      </Chip>
                    ))}
                  </div>
                )}
                <input
                  placeholder="Rechercher un salarié"
                  value={rechercheProfil}
                  onChange={(e) => setRechercheProfil(e.target.value)}
                  className="champ-input"
                />
                {rechercheProfil.length > 0 && (
                  <div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {candidatsShift.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setProfilsChoisis((prev) => [...prev, p]);
                          setRechercheProfil('');
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.couleur }} />
                        {nomAffiche(p)}
                      </button>
                    ))}
                    {candidatsShift.length === 0 && <p className="px-3 py-2.5 text-xs text-slate-400">Aucun résultat</p>}
                  </div>
                )}

                <div className="mt-4">
                  <Champ label="Lieu">
                    <select value={popUpChoisiId} onChange={(e) => setPopUpChoisiId(e.target.value)} className="champ-select">
                      {popUps.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </Champ>
                </div>

                <Champ label="Étiquette">
                  <select value={etiquette} onChange={(e) => setEtiquette(e.target.value)} className="champ-select">
                    <option value="">Aucune étiquette</option>
                    {ETIQUETTES_SHIFT.map((et) => (
                      <option key={et} value={et}>
                        {et}
                      </option>
                    ))}
                  </select>
                </Champ>

                <HorairesEtPause
                  heureDebut={heureDebut}
                  heureFin={heureFin}
                  setHeureDebut={setHeureDebut}
                  setHeureFin={setHeureFin}
                  pauseActive={pauseActive}
                  setPauseActive={setPauseActive}
                  heureDebutPause={heureDebutPause}
                  setHeureDebutPause={setHeureDebutPause}
                  heureFinPause={heureFinPause}
                  setHeureFinPause={setHeureFinPause}
                  presets={presetsPourPopUp(popUps.find((p) => p.id === popUpChoisiId))}
                  onAppliquerPreset={appliquerPreset}
                />

                <div className="mt-5 flex gap-3">
                  <button type="button" onClick={onClose} className="btn-annuler flex-1">
                    Annuler
                  </button>
                  <button type="button" onClick={handleCreerShift} disabled={envoiEnCours} className="btn-valider flex-1">
                    {envoiEnCours ? 'Ajout...' : 'Ajouter'}
                  </button>
                </div>
                {shiftsExistants.length > 0 && (
                  <button type="button" onClick={handleSupprimer} disabled={suppressionEnCours} className="btn-supprimer mt-3">
                    {suppressionEnCours
                      ? 'Suppression...'
                      : shiftsExistants.length === 1
                        ? 'Supprimer ce shift'
                        : `Supprimer ces ${shiftsExistants.length} shifts`}
                  </button>
                )}
              </>
            ) : (
              <>
                <Label>Salarié</Label>
                {salarieAbsence ? (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <Chip onRemove={() => setSalarieAbsence(null)}>{nomAffiche(salarieAbsence)}</Chip>
                  </div>
                ) : (
                  <>
                    <input
                      placeholder="Rechercher un salarié"
                      value={rechercheAbsence}
                      onChange={(e) => setRechercheAbsence(e.target.value)}
                      className="champ-input"
                    />
                    <div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      {candidatsAbsence.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSalarieAbsence(p)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.couleur }} />
                          {nomAffiche(p)}
                        </button>
                      ))}
                      {candidatsAbsence.length === 0 && <p className="px-3 py-2.5 text-xs text-slate-400">Aucun résultat</p>}
                    </div>
                  </>
                )}

                <p className="mb-1.5 mt-4 text-[13px] font-semibold text-slate-700">Type d&apos;absence</p>
                <div className="mb-4 flex rounded-xl bg-slate-100 p-1">
                  {(['conge', 'indisponibilite', 'repos'] as TypeConge[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTypeAbsence(t)}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold ${typeAbsence === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                    >
                      {LIBELLE_TYPE_CONGE[t]}
                    </button>
                  ))}
                </div>

                <div className="mb-4 flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setModeDureeAbsence('journee')}
                    className={`flex-1 rounded-lg py-2 text-xs font-semibold ${modeDureeAbsence === 'journee' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    Journée(s) complète(s)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModeDureeAbsence('creneau')}
                    className={`flex-1 rounded-lg py-2 text-xs font-semibold ${modeDureeAbsence === 'creneau' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    Un créneau
                  </button>
                </div>

                {modeDureeAbsence === 'journee' ? (
                  <div className="flex gap-3">
                    <Champ label="Du">
                      <input type="date" value={dateDebutAbsence} onChange={(e) => setDateDebutAbsence(e.target.value)} className="champ-input" />
                    </Champ>
                    <Champ label="Au">
                      <input type="date" value={dateFinAbsence} onChange={(e) => setDateFinAbsence(e.target.value)} className="champ-input" />
                    </Champ>
                  </div>
                ) : (
                  <>
                    <Champ label="Jour">
                      <input type="date" value={dateDebutAbsence} onChange={(e) => setDateDebutAbsence(e.target.value)} className="champ-input mb-3" />
                    </Champ>
                    <div className="flex gap-3">
                      <Champ label="De">
                        <input type="time" value={heureDebutAbsence} onChange={(e) => setHeureDebutAbsence(e.target.value)} className="champ-input" />
                      </Champ>
                      <Champ label="À">
                        <input type="time" value={heureFinAbsence} onChange={(e) => setHeureFinAbsence(e.target.value)} className="champ-input" />
                      </Champ>
                    </div>
                  </>
                )}

                <Champ label="Notes">
                  <textarea value={noteAbsence} onChange={(e) => setNoteAbsence(e.target.value)} rows={3} className="champ-input" />
                </Champ>

                <div className="mt-5 flex gap-3">
                  <button type="button" onClick={onClose} className="btn-annuler flex-1">
                    Annuler
                  </button>
                  <button type="button" onClick={handleCreerAbsence} disabled={envoiEnCours} className="btn-valider flex-1">
                    {envoiEnCours ? 'Ajout...' : 'Ajouter'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Classes utilitaires locales au panneau — évite de répéter les mêmes classes Tailwind sur
          chaque champ/bouton (formulaire volumineux, cf. référence). */}
      <style jsx global>{`
        .champ-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          padding: 0.65rem 0.75rem;
          font-size: 0.8125rem;
          color: #1e293b;
        }
        .champ-select {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          padding: 0.65rem 0.75rem;
          font-size: 0.8125rem;
          color: #1e293b;
          background: white;
        }
        .btn-annuler {
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
          padding: 0.7rem;
          text-align: center;
          font-weight: 600;
          color: #475569;
        }
        .btn-valider {
          border-radius: 0.75rem;
          background: #4f46e5;
          padding: 0.7rem;
          text-align: center;
          font-weight: 600;
          color: white;
        }
        .btn-valider:disabled {
          opacity: 0.6;
        }
        .btn-supprimer {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #fca5a5;
          padding: 0.7rem;
          text-align: center;
          font-weight: 600;
          color: #dc2626;
        }
      `}</style>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[13px] font-semibold text-slate-700">{children}</p>;
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex-1">
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      {children}
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700">
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-indigo-400 hover:text-indigo-700">
          ✕
        </button>
      )}
    </span>
  );
}

function HorairesEtPause({
  heureDebut,
  heureFin,
  setHeureDebut,
  setHeureFin,
  pauseActive,
  setPauseActive,
  heureDebutPause,
  setHeureDebutPause,
  heureFinPause,
  setHeureFinPause,
  presets,
  onAppliquerPreset,
}: {
  heureDebut: string;
  heureFin: string;
  setHeureDebut: (v: string) => void;
  setHeureFin: (v: string) => void;
  pauseActive: boolean;
  setPauseActive: (v: boolean) => void;
  heureDebutPause: string;
  setHeureDebutPause: (v: string) => void;
  heureFinPause: string;
  setHeureFinPause: (v: string) => void;
  /** Créneaux Matin/Après-midi du pop-up actuellement sélectionné (cf. presetsPourPopUp) — un clic
   * remplit les 4 horaires d'un coup, cf. retour utilisateur du 2026-09-05. */
  presets: Record<Preset, DefinitionPreset>;
  onAppliquerPreset: (preset: Preset) => void;
}) {
  return (
    <>
      <p className="mb-1.5 mt-4 text-[13px] font-semibold text-slate-700">Horaires</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(presets) as Preset[]).map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onAppliquerPreset(preset)}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
          >
            {presets[preset].label}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <Champ label="De">
          <input type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} className="champ-input" />
        </Champ>
        <Champ label="À">
          <input type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} className="champ-input" />
        </Champ>
      </div>

      <label className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
        <input type="checkbox" checked={pauseActive} onChange={(e) => setPauseActive(e.target.checked)} className="h-4 w-4 rounded" />
        Pause déjeuner
      </label>
      {pauseActive && (
        <div className="mt-2 flex gap-3">
          <Champ label="De">
            <input type="time" value={heureDebutPause} onChange={(e) => setHeureDebutPause(e.target.value)} className="champ-input" />
          </Champ>
          <Champ label="À">
            <input type="time" value={heureFinPause} onChange={(e) => setHeureFinPause(e.target.value)} className="champ-input" />
          </Champ>
        </div>
      )}
    </>
  );
}
