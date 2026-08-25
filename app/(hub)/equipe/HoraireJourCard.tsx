'use client';

// Porté depuis App PIMP IT/src/components/reglages/HoraireRecurrentJourCard.tsx (même logique
// exacte : rythme "un jour sur deux" qui scinde en 2 éditeurs semaine A/B indépendants, préréglages
// Matin/Après-midi/Personnalisé pilotés par les créneaux du pop-up, bouton Enregistrer par éditeur).
import { useEffect, useState } from 'react';

import type { HoraireRecurrentProfil, PopUp, SemaineReference } from './types';

export interface HoraireAEnregistrer {
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

interface Props {
  profileId: string;
  jourSemaine: number;
  label: string;
  regles: HoraireRecurrentProfil[];
  popUpsDisponibles: PopUp[];
  onEnregistrer: (horaire: HoraireAEnregistrer) => void;
  onSupprimer: (id: string) => void;
}

type ModeCreneau = 'matin' | 'apres-midi' | 'personnalise';

const MODES_CRENEAU: { value: ModeCreneau; label: string }[] = [
  { value: 'matin', label: 'Matin' },
  { value: 'apres-midi', label: 'Après-midi' },
  { value: 'personnalise', label: 'Personnalisé' },
];

export function HoraireJourCard({ profileId, jourSemaine, label, regles, popUpsDisponibles, onEnregistrer, onSupprimer }: Props) {
  const reglePremiere = regles.find((r) => r.semaine_reference === 'premiere');
  const regleDeuxieme = regles.find((r) => r.semaine_reference === 'deuxieme');
  const [unJourSurDeux, setUnJourSurDeux] = useState(!!reglePremiere || !!regleDeuxieme);

  useEffect(() => {
    setUnJourSurDeux(!!reglePremiere || !!regleDeuxieme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regles]);

  const basculerUnJourSurDeux = (v: boolean) => {
    setUnJourSurDeux(v);
    if (v) {
      const regleToutes = regles.find((r) => r.semaine_reference === 'toutes');
      if (regleToutes) onSupprimer(regleToutes.id);
    } else {
      if (reglePremiere) onSupprimer(reglePremiere.id);
      if (regleDeuxieme) onSupprimer(regleDeuxieme.id);
    }
  };

  return (
    <div className="mb-2 rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-sm font-semibold text-slate-800">{label}</p>

      {unJourSurDeux ? (
        <div className="flex flex-col gap-2">
          <EditeurHoraireSemaine
            titre="1ère semaine (depuis l'ouverture)"
            profileId={profileId}
            jourSemaine={jourSemaine}
            semaineReference="premiere"
            regle={reglePremiere}
            popUpsDisponibles={popUpsDisponibles}
            onEnregistrer={onEnregistrer}
          />
          <EditeurHoraireSemaine
            titre="2e semaine"
            profileId={profileId}
            jourSemaine={jourSemaine}
            semaineReference="deuxieme"
            regle={regleDeuxieme}
            popUpsDisponibles={popUpsDisponibles}
            onEnregistrer={onEnregistrer}
          />
        </div>
      ) : (
        <EditeurHoraireSemaine
          titre={null}
          profileId={profileId}
          jourSemaine={jourSemaine}
          semaineReference="toutes"
          regle={regles.find((r) => r.semaine_reference === 'toutes')}
          popUpsDisponibles={popUpsDisponibles}
          onEnregistrer={onEnregistrer}
        />
      )}

      <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
        <input
          type="checkbox"
          checked={unJourSurDeux}
          onChange={(e) => basculerUnJourSurDeux(e.target.checked)}
          disabled={popUpsDisponibles.length === 0}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-xs text-slate-500">Un jour sur deux (heures différentes possibles chaque semaine)</span>
      </div>
    </div>
  );
}

function EditeurHoraireSemaine({
  titre,
  profileId,
  jourSemaine,
  semaineReference,
  regle,
  popUpsDisponibles,
  onEnregistrer,
}: {
  titre: string | null;
  profileId: string;
  jourSemaine: number;
  semaineReference: SemaineReference;
  regle: HoraireRecurrentProfil | undefined;
  popUpsDisponibles: PopUp[];
  onEnregistrer: (horaire: HoraireAEnregistrer) => void;
}) {
  const [actif, setActif] = useState(regle?.actif ?? false);
  const [debut, setDebut] = useState(regle?.heure_debut?.slice(0, 5) ?? '10:00');
  const [fin, setFin] = useState(regle?.heure_fin?.slice(0, 5) ?? '19:00');
  const [pauseActive, setPauseActive] = useState(!!(regle?.pause_debut && regle?.pause_fin));
  const [pauseDebut, setPauseDebut] = useState(regle?.pause_debut?.slice(0, 5) ?? '13:00');
  const [pauseFin, setPauseFin] = useState(regle?.pause_fin?.slice(0, 5) ?? '14:00');
  const [popUpId, setPopUpId] = useState(regle?.pop_up_id ?? popUpsDisponibles[0]?.id);
  const [mode, setMode] = useState<ModeCreneau>('personnalise');

  useEffect(() => {
    setActif(regle?.actif ?? false);
    setDebut(regle?.heure_debut?.slice(0, 5) ?? '10:00');
    setFin(regle?.heure_fin?.slice(0, 5) ?? '19:00');
    setPauseActive(!!(regle?.pause_debut && regle?.pause_fin));
    setPauseDebut(regle?.pause_debut?.slice(0, 5) ?? '13:00');
    setPauseFin(regle?.pause_fin?.slice(0, 5) ?? '14:00');
    setPopUpId(regle?.pop_up_id ?? popUpsDisponibles[0]?.id);
    setMode('personnalise');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regle]);

  const presetsPourPopUp = (id: string | undefined) => {
    const p = popUpsDisponibles.find((pu) => pu.id === id);
    return {
      matin:
        p?.matin_debut && p?.matin_fin
          ? {
              debut: p.matin_debut.slice(0, 5),
              fin: p.matin_fin.slice(0, 5),
              pause:
                p.matin_pause_debut && p.matin_pause_fin
                  ? { debut: p.matin_pause_debut.slice(0, 5), fin: p.matin_pause_fin.slice(0, 5) }
                  : undefined,
            }
          : undefined,
      apresMidi:
        p?.apres_midi_debut && p?.apres_midi_fin
          ? {
              debut: p.apres_midi_debut.slice(0, 5),
              fin: p.apres_midi_fin.slice(0, 5),
              pause:
                p.apres_midi_pause_debut && p.apres_midi_pause_fin
                  ? { debut: p.apres_midi_pause_debut.slice(0, 5), fin: p.apres_midi_pause_fin.slice(0, 5) }
                  : undefined,
            }
          : undefined,
    };
  };
  const { matin: presetMatin, apresMidi: presetApresMidi } = presetsPourPopUp(popUpId);

  const appliquerMode = (nouveauMode: ModeCreneau, idPopUp: string | undefined = popUpId) => {
    setMode(nouveauMode);
    if (nouveauMode === 'personnalise') return;
    const preset = presetsPourPopUp(idPopUp)[nouveauMode === 'matin' ? 'matin' : 'apresMidi'];
    if (!preset) return;
    setDebut(preset.debut);
    setFin(preset.fin);
    setPauseActive(!!preset.pause);
    if (preset.pause) {
      setPauseDebut(preset.pause.debut);
      setPauseFin(preset.pause.fin);
    }
  };

  const choisirPopUp = (id: string) => {
    setPopUpId(id);
    if (mode !== 'personnalise') appliquerMode(mode, id);
  };

  const modifierDebut = (v: string) => {
    setDebut(v);
    setMode('personnalise');
  };
  const modifierFin = (v: string) => {
    setFin(v);
    setMode('personnalise');
  };
  const modifierPauseActive = (v: boolean) => {
    setPauseActive(v);
    setMode('personnalise');
  };
  const modifierPauseDebut = (v: string) => {
    setPauseDebut(v);
    setMode('personnalise');
  };
  const modifierPauseFin = (v: string) => {
    setPauseFin(v);
    setMode('personnalise');
  };

  const enregistrer = () => {
    if (!popUpId) return;
    onEnregistrer({
      profile_id: profileId,
      pop_up_id: popUpId,
      jour_semaine: jourSemaine,
      heure_debut: `${debut}:00`,
      heure_fin: `${fin}:00`,
      actif,
      pause_debut: pauseActive ? `${pauseDebut}:00` : null,
      pause_fin: pauseActive ? `${pauseFin}:00` : null,
      semaine_reference: semaineReference,
    });
  };

  const popUpChoisi = popUpsDisponibles.find((p) => p.id === popUpId);
  const champHeure = 'w-20 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm';

  return (
    <div className={titre ? 'rounded-lg bg-slate-50 p-2' : undefined}>
      <div className="mb-2 flex items-center justify-between">
        {titre ? <span className="text-xs font-semibold text-slate-600">{titre}</span> : <span />}
        <input
          type="checkbox"
          checked={actif}
          onChange={(e) => setActif(e.target.checked)}
          disabled={popUpsDisponibles.length === 0}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
      </div>

      {actif && popUpsDisponibles.length === 0 && (
        <p className="mb-2 text-xs text-red-500">Aucun lieu attribué — attribue d&apos;abord cette personne à un lieu dans Pop-up.</p>
      )}

      {actif && popUpsDisponibles.length > 0 && (
        <>
          {popUpsDisponibles.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {popUpsDisponibles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => choisirPopUp(p.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    popUpId === p.id ? 'text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                  style={popUpId === p.id ? { backgroundColor: p.couleur } : undefined}
                >
                  {p.nom}
                </button>
              ))}
            </div>
          )}
          {popUpsDisponibles.length === 1 && <p className="mb-2 text-xs text-slate-400">Lieu : {popUpChoisi?.nom}</p>}

          <div className="mb-2 flex flex-wrap gap-1.5">
            {MODES_CRENEAU.map((m) => {
              const indisponible = m.value === 'matin' ? !presetMatin : m.value === 'apres-midi' ? !presetApresMidi : false;
              return (
                <button
                  key={m.value}
                  onClick={() => appliquerMode(m.value)}
                  disabled={indisponible}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    mode === m.value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                  style={indisponible ? { opacity: 0.4 } : undefined}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          {!presetMatin && !presetApresMidi && (
            <p className="mb-2 text-xs text-slate-400">Aucun créneau prédéfini pour {popUpChoisi?.nom ?? 'ce lieu'} — réglable dans Pop-up.</p>
          )}

          <div className="mb-2 flex items-center gap-2">
            <input value={debut} onChange={(e) => modifierDebut(e.target.value)} placeholder="10:00" className={champHeure} />
            <span className="text-slate-400">à</span>
            <input value={fin} onChange={(e) => modifierFin(e.target.value)} placeholder="19:00" className={champHeure} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pauseActive}
                onChange={(e) => modifierPauseActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-500">Pause</span>
            </div>
            {pauseActive && (
              <div className="flex items-center gap-2">
                <input value={pauseDebut} onChange={(e) => modifierPauseDebut(e.target.value)} placeholder="13:00" className={champHeure} />
                <span className="text-slate-400">à</span>
                <input value={pauseFin} onChange={(e) => modifierPauseFin(e.target.value)} placeholder="14:00" className={champHeure} />
              </div>
            )}
          </div>
        </>
      )}

      <button
        onClick={enregistrer}
        disabled={actif && !popUpId}
        style={actif && !popUpId ? { opacity: 0.5 } : undefined}
        className="mt-2 w-full rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
      >
        Enregistrer
      </button>
    </div>
  );
}
