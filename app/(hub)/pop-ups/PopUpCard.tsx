'use client';

import { useState, useTransition } from 'react';

import {
  ajouterAffectationPopUp,
  chargerHorairesOuverture,
  enregistrerHoraireOuverture,
  modifierCoordonneesPopUp,
  modifierCreneauxPredefinisPopUp,
  modifierDatesPopUp,
  renommerPopUp,
  retirerAffectationPopUp,
  supprimerPopUp,
} from './actions';

const JOURS_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

interface PopUp {
  id: string;
  nom: string;
  couleur: string | null;
  date_debut: string | null;
  date_fin: string | null;
  lat: number | null;
  lon: number | null;
  matin_debut: string | null;
  matin_fin: string | null;
  matin_pause_debut: string | null;
  matin_pause_fin: string | null;
  apres_midi_debut: string | null;
  apres_midi_fin: string | null;
  apres_midi_pause_debut: string | null;
  apres_midi_pause_fin: string | null;
}
interface Profil {
  id: string;
  nom_complet: string | null;
  email: string;
  role: string;
}
interface RegleHoraire {
  jour_semaine: number;
  heure_ouverture: string;
  heure_fermeture: string;
  actif: boolean;
}

const champ = 'flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none';

// Normalise une saisie horaire libre ("20", "20:0", "20:00") vers "HH:MM:00".
// Retourne null si le champ est vide (efface la valeur), undefined si le texte
// n'est pas une heure valide (saisie en cours, faute de frappe) -- dans ce cas
// l'appelant doit s'abstenir d'envoyer la valeur plutôt que de la tronquer.
function normaliserHeure(v: string): string | null | undefined {
  const t = v.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  if (h > 23 || mi > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00`;
}

function CreneauLigne({
  label,
  debut,
  fin,
  setDebut,
  setFin,
  placeholderDebut,
  placeholderFin,
  pauseActive,
  setPauseActive,
  pauseDebut,
  pauseFin,
  setPauseDebut,
  setPauseFin,
  onBlur,
}: {
  label: string;
  debut: string;
  fin: string;
  setDebut: (v: string) => void;
  setFin: (v: string) => void;
  placeholderDebut: string;
  placeholderFin: string;
  pauseActive: boolean;
  setPauseActive: (v: boolean) => void;
  pauseDebut: string;
  pauseFin: string;
  setPauseDebut: (v: string) => void;
  setPauseFin: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="mb-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="w-20 text-xs text-slate-500">{label}</span>
        <input value={debut} onChange={(e) => setDebut(e.target.value)} onBlur={onBlur} placeholder={placeholderDebut} className={champ} />
        <span className="text-slate-400">à</span>
        <input value={fin} onChange={(e) => setFin(e.target.value)} onBlur={onBlur} placeholder={placeholderFin} className={champ} />
      </div>
      <div className="flex items-center gap-2 pl-20">
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={pauseActive}
            onChange={(e) => {
              setPauseActive(e.target.checked);
              onBlur();
            }}
            className="h-4 w-4 rounded border-slate-300"
          />
          Pause
        </label>
        {pauseActive && (
          <>
            <input value={pauseDebut} onChange={(e) => setPauseDebut(e.target.value)} onBlur={onBlur} placeholder="13:00" className={champ} />
            <span className="text-slate-400">à</span>
            <input value={pauseFin} onChange={(e) => setPauseFin(e.target.value)} onBlur={onBlur} placeholder="14:00" className={champ} />
          </>
        )}
      </div>
    </div>
  );
}

function JourReglageCard({
  popUpId,
  jourSemaine,
  label,
  regle,
}: {
  popUpId: string;
  jourSemaine: number;
  label: string;
  regle: RegleHoraire | undefined;
}) {
  const [actif, setActif] = useState(regle?.actif ?? false);
  const [ouverture, setOuverture] = useState(regle?.heure_ouverture?.slice(0, 5) ?? '10:00');
  const [fermeture, setFermeture] = useState(regle?.heure_fermeture?.slice(0, 5) ?? '20:00');
  const [, demarrer] = useTransition();

  const enregistrer = () =>
    demarrer(() =>
      enregistrerHoraireOuverture({
        pop_up_id: popUpId,
        jour_semaine: jourSemaine,
        heure_ouverture: `${ouverture}:00`,
        heure_fermeture: `${fermeture}:00`,
        actif,
      }),
    );

  return (
    <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4" style={{ flexGrow: 1, flexBasis: 140, maxWidth: 200 }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
      </div>
      {actif && (
        <div className="mb-3 flex items-center gap-2">
          <input value={ouverture} onChange={(e) => setOuverture(e.target.value)} placeholder="10:00" className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm" />
          <span className="text-slate-400">à</span>
          <input value={fermeture} onChange={(e) => setFermeture(e.target.value)} placeholder="20:00" className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm" />
        </div>
      )}
      <button onClick={enregistrer} className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
        Enregistrer
      </button>
    </div>
  );
}

export function PopUpCard({ popUp, profils, popUpsParProfil }: { popUp: PopUp; profils: Profil[]; popUpsParProfil: Map<string, Set<string>> }) {
  const [editionNom, setEditionNom] = useState(false);
  const [nom, setNom] = useState(popUp.nom);
  const [dateDebut, setDateDebut] = useState(popUp.date_debut ?? '');
  const [dateFin, setDateFin] = useState(popUp.date_fin ?? '');
  const [lat, setLat] = useState(popUp.lat != null ? String(popUp.lat) : '');
  const [lon, setLon] = useState(popUp.lon != null ? String(popUp.lon) : '');
  const [matinDebut, setMatinDebut] = useState(popUp.matin_debut?.slice(0, 5) ?? '');
  const [matinFin, setMatinFin] = useState(popUp.matin_fin?.slice(0, 5) ?? '');
  const [matinPauseActive, setMatinPauseActive] = useState(!!(popUp.matin_pause_debut && popUp.matin_pause_fin));
  const [matinPauseDebut, setMatinPauseDebut] = useState(popUp.matin_pause_debut?.slice(0, 5) ?? '13:00');
  const [matinPauseFin, setMatinPauseFin] = useState(popUp.matin_pause_fin?.slice(0, 5) ?? '14:00');
  const [apresMidiDebut, setApresMidiDebut] = useState(popUp.apres_midi_debut?.slice(0, 5) ?? '');
  const [apresMidiFin, setApresMidiFin] = useState(popUp.apres_midi_fin?.slice(0, 5) ?? '');
  const [apresMidiPauseActive, setApresMidiPauseActive] = useState(!!(popUp.apres_midi_pause_debut && popUp.apres_midi_pause_fin));
  const [apresMidiPauseDebut, setApresMidiPauseDebut] = useState(popUp.apres_midi_pause_debut?.slice(0, 5) ?? '13:00');
  const [apresMidiPauseFin, setApresMidiPauseFin] = useState(popUp.apres_midi_pause_fin?.slice(0, 5) ?? '14:00');
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [horairesOuverts, setHorairesOuverts] = useState(false);
  const [horaires, setHoraires] = useState<RegleHoraire[] | null>(null);
  const [, demarrer] = useTransition();

  const profilsNonAdmin = profils.filter((p) => p.role !== 'admin');
  const membres = profilsNonAdmin.filter((p) => popUpsParProfil.get(p.id)?.has(popUp.id));
  const disponibles = profilsNonAdmin.filter((p) => !popUpsParProfil.get(p.id)?.has(popUp.id));

  const validerNom = () => {
    const propre = nom.trim();
    if (propre && propre !== popUp.nom) demarrer(() => renommerPopUp(popUp.id, propre));
    else setNom(popUp.nom);
    setEditionNom(false);
  };
  const validerDates = () => {
    const debut = dateDebut.trim() || null;
    const fin = dateFin.trim() || null;
    if (debut !== popUp.date_debut || fin !== popUp.date_fin) demarrer(() => modifierDatesPopUp(popUp.id, debut, fin));
  };
  const validerCoordonnees = () => {
    const latN = lat.trim() ? Number(lat.trim().replace(',', '.')) : null;
    const lonN = lon.trim() ? Number(lon.trim().replace(',', '.')) : null;
    if (lat.trim() && Number.isNaN(latN)) return;
    if (lon.trim() && Number.isNaN(lonN)) return;
    if (latN !== popUp.lat || lonN !== popUp.lon) demarrer(() => modifierCoordonneesPopUp(popUp.id, latN, lonN));
  };
  const validerCreneaux = () => {
    const champs = {
      matinDebut: normaliserHeure(matinDebut),
      matinFin: normaliserHeure(matinFin),
      matinPauseDebut: matinPauseActive ? normaliserHeure(matinPauseDebut) : null,
      matinPauseFin: matinPauseActive ? normaliserHeure(matinPauseFin) : null,
      apresMidiDebut: normaliserHeure(apresMidiDebut),
      apresMidiFin: normaliserHeure(apresMidiFin),
      apresMidiPauseDebut: apresMidiPauseActive ? normaliserHeure(apresMidiPauseDebut) : null,
      apresMidiPauseFin: apresMidiPauseActive ? normaliserHeure(apresMidiPauseFin) : null,
    };
    // une heure mal formée (ex: saisie en cours, "20" au lieu de "20:00") renvoie
    // undefined -- on n'envoie rien plutôt que de faire planter l'update en base
    if (Object.values(champs).some((v) => v === undefined)) return;
    demarrer(() => modifierCreneauxPredefinisPopUp(popUp.id, champs as Parameters<typeof modifierCreneauxPredefinisPopUp>[1]));
  };

  const toggleHoraires = () => {
    const prochain = !horairesOuverts;
    setHorairesOuverts(prochain);
    if (prochain && horaires === null) {
      demarrer(async () => setHoraires(await chargerHorairesOuverture(popUp.id)));
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: popUp.couleur ?? '#94a3b8' }} />
        {editionNom ? (
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            onBlur={validerNom}
            onKeyDown={(e) => e.key === 'Enter' && validerNom()}
            autoFocus
            className="flex-1 border-b border-indigo-300 pb-0.5 text-lg font-bold text-slate-900 focus:outline-none"
          />
        ) : (
          <button onClick={() => setEditionNom(true)} className="flex flex-1 items-center gap-2 text-left">
            <span className="text-lg font-bold text-slate-900">{popUp.nom}</span>
            <span className="text-sm text-slate-300">✎</span>
          </button>
        )}
        <button
          onClick={() => {
            if (confirm(`Supprimer ${popUp.nom} ? Le planning et les horaires liés seront aussi supprimés.`)) demarrer(() => supprimerPopUp(popUp.id));
          }}
          className="px-2 py-1 text-sm text-red-400 hover:text-red-600"
        >
          Supprimer
        </button>
      </div>

      <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <p className="mb-2 text-sm font-semibold text-slate-700">Dates du pop-up</p>
        <div className="flex items-center gap-2">
          <input value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} onBlur={validerDates} placeholder="Début (AAAA-MM-JJ)" className={champ} />
          <span className="text-slate-400">→</span>
          <input value={dateFin} onChange={(e) => setDateFin(e.target.value)} onBlur={validerDates} placeholder="Fin prévue (AAAA-MM-JJ)" className={champ} />
        </div>
      </div>

      <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <p className="mb-2 text-sm font-semibold text-slate-700">Coordonnées GPS</p>
        <p className="mb-2 text-xs text-slate-400">Sert à rattacher les ventes SumUp à ce pop-up (écran Finance) — copie-les depuis Google Maps.</p>
        <div className="flex items-center gap-2">
          <input value={lat} onChange={(e) => setLat(e.target.value)} onBlur={validerCoordonnees} placeholder="Latitude" className={champ} />
          <input value={lon} onChange={(e) => setLon(e.target.value)} onBlur={validerCoordonnees} placeholder="Longitude" className={champ} />
        </div>
      </div>

      <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2.5">
        <p className="mb-2 text-sm font-semibold text-slate-700">Créneaux Matin / Après-midi prédéfinis</p>
        <p className="mb-2 text-xs text-slate-400">Utilisés par les boutons Matin/Après-midi dans Équipe &gt; Planification.</p>
        <CreneauLigne
          label="Matin"
          debut={matinDebut}
          fin={matinFin}
          setDebut={setMatinDebut}
          setFin={setMatinFin}
          placeholderDebut="10:00"
          placeholderFin="14:00"
          pauseActive={matinPauseActive}
          setPauseActive={setMatinPauseActive}
          pauseDebut={matinPauseDebut}
          pauseFin={matinPauseFin}
          setPauseDebut={setMatinPauseDebut}
          setPauseFin={setMatinPauseFin}
          onBlur={validerCreneaux}
        />
        <CreneauLigne
          label="Après-midi"
          debut={apresMidiDebut}
          fin={apresMidiFin}
          setDebut={setApresMidiDebut}
          setFin={setApresMidiFin}
          placeholderDebut="14:00"
          placeholderFin="20:00"
          pauseActive={apresMidiPauseActive}
          setPauseActive={setApresMidiPauseActive}
          pauseDebut={apresMidiPauseDebut}
          pauseFin={apresMidiPauseFin}
          setPauseDebut={setApresMidiPauseDebut}
          setPauseFin={setApresMidiPauseFin}
          onBlur={validerCreneaux}
        />
      </div>

      <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Effectifs attribués (une personne peut être attribuée à plusieurs lieux)</p>
      <div className="mb-2 flex flex-wrap gap-2">
        {membres.length === 0 && <span className="text-sm text-slate-400">Personne pour l&apos;instant</span>}
        {membres.map((m) => (
          <button
            key={m.id}
            onClick={() => {
              if (confirm(`Retirer ${m.nom_complet || m.email} de ${popUp.nom} ?`)) demarrer(() => retirerAffectationPopUp(m.id, popUp.id));
            }}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
          >
            {m.nom_complet || m.email} ✕
          </button>
        ))}
      </div>

      <button onClick={() => setAjoutOuvert((v) => !v)} className="mb-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
        {ajoutOuvert ? 'Fermer' : "+ Attribuer quelqu'un"}
      </button>
      {ajoutOuvert && (
        <div className="mb-3 flex flex-col gap-1 rounded-xl bg-slate-50 p-2">
          {disponibles.length === 0 ? (
            <p className="p-2 text-sm text-slate-400">Tout le monde est déjà attribué ici.</p>
          ) : (
            disponibles.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  demarrer(() => ajouterAffectationPopUp(p.id, popUp.id));
                  setAjoutOuvert(false);
                }}
                className="rounded-lg bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              >
                {p.nom_complet || p.email}
              </button>
            ))
          )}
        </div>
      )}

      <button onClick={toggleHoraires} className="mb-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
        {horairesOuverts ? 'Masquer les horaires' : 'Voir / modifier les horaires'}
      </button>
      {horairesOuverts && (
        <div className="flex flex-wrap gap-3">
          {horaires === null
            ? JOURS_LABELS.map((label) => (
                <div key={label} className="mb-3 rounded-2xl border border-slate-100 bg-slate-50 p-4" style={{ flexGrow: 1, flexBasis: 140, maxWidth: 200 }}>
                  <p className="text-sm text-slate-300">Chargement…</p>
                </div>
              ))
            : JOURS_LABELS.map((label, jourSemaine) => (
                <JourReglageCard
                  key={jourSemaine}
                  popUpId={popUp.id}
                  jourSemaine={jourSemaine}
                  label={label}
                  regle={horaires.find((h) => h.jour_semaine === jourSemaine)}
                />
              ))}
        </div>
      )}
    </div>
  );
}
