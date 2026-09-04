'use client';

// Port de la vue desktop web de App PIMP IT/app/(app)/admin/calendrier.tsx (branche
// Platform.OS === 'web') — sélecteur de vue (pop-up/employés), navigation semaine, grille +
// panneau latéral de création/édition. Semaine pilotée par la query string (?semaine=lundi ISO) :
// page.tsx (Server Component) refait le fetch à chaque changement, ce composant se contente de
// naviguer et de gérer l'état d'interaction (recherche, filtres, panneau ouvert).

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { genererEtInsererPlanning, supprimerConge } from './actions';
import { ajouterJours, dateDepuisISO, dateEnISO, joursDeLaSemaine, libellePeriodeCourte } from './dateUtils';
import { PanneauShift } from './PanneauShift';
import type { Conge, JourEcoleAlternant, PlanningShift, PopUp, Profile, TypeContrat } from './types';
import { VueEmployes } from './VueEmployes';
import { VuePopUps } from './VuePopUps';

type Vue = 'employes' | 'popups';
type FiltreContrat = 'tous' | TypeContrat;

const LIBELLE_TYPE_CONTRAT: Record<TypeContrat, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

interface PanneauContexte {
  date: string;
  profil: Profile | null;
  popUpId?: string;
  heureDebut?: string;
  heureFin?: string;
  shifts: PlanningShift[];
}

export function PlanningClient({
  lectureSeule = false,
  semaineIso,
  popUps,
  profils,
  affectations,
  shifts,
  conges,
  joursEcole,
}: {
  /** Rôle Hub "comptable" (cf. lib/roles.ts) : consultation uniquement — pas de panneau d'édition
   * au clic sur une cellule, pas de suppression de congé, pas de bouton "Générer". L'écriture reste
   * de toute façon bloquée côté serveur (exigerAccesEcriture) si jamais l'UI était contournée. */
  lectureSeule?: boolean;
  semaineIso: string;
  popUps: PopUp[];
  profils: Profile[];
  affectations: { profile_id: string; pop_up_id: string }[];
  shifts: PlanningShift[];
  conges: Conge[];
  joursEcole: JourEcoleAlternant[];
}) {
  const router = useRouter();
  const [vue, setVue] = useState<Vue>('employes');
  const [recherche, setRecherche] = useState('');
  const [filtreContrat, setFiltreContrat] = useState<FiltreContrat>('tous');
  const [panneau, setPanneau] = useState<PanneauContexte | null>(null);
  const [generationEnCours, demarrerGeneration] = useTransition();
  const [messageGeneration, setMessageGeneration] = useState<string | null>(null);

  const jours = useMemo(() => joursDeLaSemaine(dateDepuisISO(semaineIso)), [semaineIso]);
  const dateDebut = dateEnISO(jours[0]);
  const dateFin = dateEnISO(jours[6]);

  const profilParId = useMemo(() => new Map(profils.map((p) => [p.id, p])), [profils]);
  const popUpParId = useMemo(() => new Map(popUps.map((p) => [p.id, p])), [popUps]);
  const mapAffectations = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of affectations) {
      const ensemble = map.get(a.profile_id) ?? new Set<string>();
      ensemble.add(a.pop_up_id);
      map.set(a.profile_id, ensemble);
    }
    return map;
  }, [affectations]);

  function profilCorrespondFiltres(profil: Profile | undefined): boolean {
    if (!profil) return false;
    if (filtreContrat !== 'tous' && profil.type_contrat !== filtreContrat) return false;
    const r = recherche.trim().toLowerCase();
    if (r && !`${profil.nom_complet} ${profil.email}`.toLowerCase().includes(r)) return false;
    return true;
  }

  const profilsFiltres = profils.filter(profilCorrespondFiltres);
  const shiftsFiltres = shifts.filter((s) => profilCorrespondFiltres(profilParId.get(s.profile_id)));

  function allerA(dateIso: string) {
    router.push(`/planning?semaine=${dateIso}`);
  }
  const semainePrecedente = () => allerA(dateEnISO(ajouterJours(jours[0], -7)));
  const semaineSuivante = () => allerA(dateEnISO(ajouterJours(jours[0], 7)));
  const revenirAujourdhui = () => allerA(dateEnISO(joursDeLaSemaine(new Date())[0]));

  function ouvrirPourEmploye(profil: Profile, dateIso: string, shiftsCellule: PlanningShift[]) {
    if (lectureSeule) return;
    setPanneau({
      date: dateIso,
      profil,
      popUpId: shiftsCellule[0]?.pop_up_id,
      heureDebut: shiftsCellule[0]?.heure_debut.slice(0, 5),
      heureFin: shiftsCellule[0]?.heure_fin.slice(0, 5),
      shifts: shiftsCellule,
    });
  }

  function ouvrirPourPopUp(popUp: PopUp, dateIso: string, shiftsCellule: PlanningShift[]) {
    if (lectureSeule) return;
    setPanneau({
      date: dateIso,
      profil: shiftsCellule[0] ? (profilParId.get(shiftsCellule[0].profile_id) ?? null) : null,
      popUpId: popUp.id,
      heureDebut: shiftsCellule[0]?.heure_debut.slice(0, 5),
      heureFin: shiftsCellule[0]?.heure_fin.slice(0, 5),
      shifts: shiftsCellule,
    });
  }

  const LIBELLE_SUPPRESSION_CONGE: Record<Conge['type'], string> = {
    conge: 'le congé',
    indisponibilite: "l'indisponibilité",
    absence: "l'absence",
    repos: 'le repos',
  };

  async function handlePressCelluleConge(conge: Conge, profilCible: Profile) {
    if (lectureSeule) return;
    const confirme = window.confirm(
      `Supprimer ${LIBELLE_SUPPRESSION_CONGE[conge.type]} de ${profilCible.nom_complet || profilCible.email} ? Cette action est irréversible.`,
    );
    if (!confirme) return;
    try {
      await supprimerConge(conge.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Suppression impossible.');
    }
  }

  function handleGenerer() {
    setMessageGeneration(null);
    demarrerGeneration(async () => {
      try {
        const resultat = await genererEtInsererPlanning(dateDebut, dateFin);
        setMessageGeneration(
          resultat.nombreCrees === 0
            ? 'Aucun nouveau créneau à générer (semaine déjà couverte par les horaires récurrents).'
            : `${resultat.nombreCrees} créneau${resultat.nombreCrees > 1 ? 'x' : ''} généré${resultat.nombreCrees > 1 ? 's' : ''}.`,
        );
      } catch (e) {
        setMessageGeneration(e instanceof Error ? e.message : 'Échec de la génération.');
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="min-w-[240px] flex-1">
          <input
            placeholder="Rechercher un membre de l'équipe"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="w-full max-w-xs rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-indigo-300 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-[10px] border border-slate-200 bg-white px-1.5 py-1.5 shadow-sm">
            <button type="button" onClick={semainePrecedente} className="rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-slate-100">
              ‹
            </button>
            <button type="button" onClick={revenirAujourdhui} className="whitespace-nowrap px-1 text-[13px] font-semibold text-slate-800">
              {libellePeriodeCourte(jours[0], jours[6])}
            </button>
            <button type="button" onClick={semaineSuivante} className="rounded-md px-1.5 py-0.5 text-slate-400 hover:bg-slate-100">
              ›
            </button>
          </div>

          <select
            value={vue}
            onChange={(e) => setVue(e.target.value as Vue)}
            className="rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-sm focus:outline-none"
          >
            <option value="employes">Vue par employés</option>
            <option value="popups">Vue par pop-up</option>
          </select>
        </div>

        {!lectureSeule && (
          <div className="flex flex-1 justify-end">
            <button
              type="button"
              onClick={handleGenerer}
              disabled={generationEnCours}
              className="rounded-[10px] bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
            >
              {generationEnCours ? 'Génération...' : 'Générer depuis les horaires récurrents'}
            </button>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
        {(['tous', 'manager', 'employe', 'alternant'] as FiltreContrat[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltreContrat(f)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filtreContrat === f ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            {f === 'tous' ? 'Tous' : LIBELLE_TYPE_CONTRAT[f]}
          </button>
        ))}
        {messageGeneration && <span className="ml-2 text-xs font-semibold text-slate-500">{messageGeneration}</span>}
      </div>

      <div className="min-h-0 flex-1 px-1 pb-4">
        {vue === 'employes' ? (
          <VueEmployes
            jours={jours}
            profils={profilsFiltres}
            shifts={shiftsFiltres}
            popUpParId={popUpParId}
            onPressCellule={ouvrirPourEmploye}
            onPressCelluleConge={handlePressCelluleConge}
            joursEcole={joursEcole}
            conges={conges}
            mapAffectations={mapAffectations}
            popUps={popUps}
          />
        ) : (
          <VuePopUps jours={jours} popUps={popUps} shifts={shiftsFiltres} profilParId={profilParId} onPressCellule={ouvrirPourPopUp} />
        )}
      </div>

      {panneau && (
        <PanneauShift
          onClose={() => setPanneau(null)}
          popUps={popUps}
          popUpIdInitial={panneau.popUpId}
          profils={profilsFiltres}
          mapAffectations={mapAffectations}
          tousLesShifts={shifts}
          tousLesConges={conges}
          dateInitiale={panneau.date}
          profilInitial={panneau.profil}
          heureDebutInitiale={panneau.heureDebut}
          heureFinInitiale={panneau.heureFin}
          shiftsExistants={panneau.shifts}
        />
      )}
    </div>
  );
}
