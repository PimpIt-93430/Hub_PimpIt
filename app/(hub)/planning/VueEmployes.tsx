'use client';

// Port de App PIMP IT/src/components/calendrier/VueParEmployes.tsx (branche web) — une ligne par
// salarié (nom en entier), une case par jour de la semaine (couleur = pop-up du 1er créneau du
// jour, rouge = congé/indispo/absence, gris = repos), résumé École/Travail/Congé sur la semaine.
// Cases volontairement sans texte (juste une couleur), cf. commentaire d'origine : reste lisible
// même avec beaucoup de monde sur la même semaine.

import { dateEnISO, estAujourdhui, formatDureeHeures, nomJourCourt, numeroJour, totalHeuresSemaineAvecEcole } from './dateUtils';
import type { Conge, JourEcoleAlternant, PlanningShift, PopUp, Profile } from './types';

const COULEUR_ECOLE = '#06B6D4';
const COULEUR_TRAVAIL_DEFAUT = '#6366F1';
const COULEUR_CONGE: Record<Conge['type'], string> = {
  conge: '#DC2626',
  indisponibilite: '#DC2626',
  absence: '#DC2626',
  repos: '#64748B',
};

function prenom(p: Profile): string {
  return (p.nom_complet || p.email).trim().split(/\s+/)[0];
}

function couleurCaseNomSalarie(profile: Profile, mapAffectations: Map<string, Set<string>>, popUps: PopUp[]): string | undefined {
  if (profile.role === 'admin') return undefined;
  const ids = mapAffectations.get(profile.id);
  if (!ids) return undefined;
  return popUps.find((p) => ids.has(p.id))?.couleur;
}

export function VueEmployes({
  jours,
  profils,
  shifts,
  popUpParId,
  onPressCellule,
  onPressCelluleConge,
  joursEcole,
  conges,
  mapAffectations,
  popUps,
}: {
  jours: Date[];
  profils: Profile[];
  shifts: PlanningShift[];
  popUpParId: Map<string, PopUp>;
  onPressCellule: (profil: Profile, dateIso: string, shiftsCellule: PlanningShift[]) => void;
  onPressCelluleConge: (conge: Conge, profil: Profile) => void;
  joursEcole: JourEcoleAlternant[];
  conges: Conge[];
  mapAffectations: Map<string, Set<string>>;
  popUps: PopUp[];
}) {
  function joursCongeSemaine(profileId: string): number {
    return jours.filter((j) => {
      const dateIso = dateEnISO(j);
      return conges.some(
        (c) => c.profile_id === profileId && c.type !== 'repos' && dateIso >= c.date_debut && dateIso <= c.date_fin,
      );
    }).length;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
      <div className="flex shrink-0 border-b border-slate-100">
        {jours.map((j) => (
          <div
            key={dateEnISO(j)}
            className={`flex flex-1 flex-col items-center justify-center border-l border-slate-100 py-2 first:border-l-0 ${estAujourdhui(j) ? 'bg-indigo-50' : ''}`}
          >
            <span className="text-[10px] font-semibold text-slate-400">{nomJourCourt(j)}</span>
            <span className="text-sm font-bold text-slate-900">{numeroJour(j)}</span>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {profils.map((p) => {
          const couleurPopUp = couleurCaseNomSalarie(p, mapAffectations, popUps);
          const { heuresEcole, heuresTravaillees } = totalHeuresSemaineAvecEcole(jours, shifts, joursEcole, p.id);
          const joursConge = joursCongeSemaine(p.id);
          return (
            <div key={p.id} className="border-b border-slate-100 px-3.5 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={couleurPopUp ? { backgroundColor: couleurPopUp } : { backgroundColor: 'white', border: '1px solid #CBD5E1' }}
                />
                <span className="text-[15px] font-bold text-slate-800">{prenom(p)}</span>
              </div>

              <div className="flex gap-1">
                {jours.map((j) => {
                  const dateIso = dateEnISO(j);
                  const shiftsCellule = shifts.filter((s) => s.profile_id === p.id && s.date === dateIso);
                  const aEcole = joursEcole.some((je) => je.profile_id === p.id && je.date === dateIso);
                  const congeCellule = conges.find((c) => c.profile_id === p.id && dateIso >= c.date_debut && dateIso <= c.date_fin);
                  const estRepos = !congeCellule && !aEcole && shiftsCellule.length === 0;
                  const couleurTravail = shiftsCellule[0]
                    ? (popUpParId.get(shiftsCellule[0].pop_up_id)?.couleur ?? COULEUR_TRAVAIL_DEFAUT)
                    : null;
                  const couleurCase = congeCellule
                    ? COULEUR_CONGE[congeCellule.type]
                    : aEcole
                      ? COULEUR_ECOLE
                      : estRepos
                        ? COULEUR_CONGE.repos
                        : couleurTravail;
                  return (
                    <button
                      key={dateIso}
                      type="button"
                      title={
                        congeCellule
                          ? 'Congé/indisponibilité — cliquer pour supprimer'
                          : shiftsCellule.length > 0
                            ? shiftsCellule.map((s) => `${s.heure_debut.slice(0, 5)}-${s.heure_fin.slice(0, 5)}`).join(', ')
                            : 'Créer un shift'
                      }
                      onClick={() => (congeCellule ? onPressCelluleConge(congeCellule, p) : onPressCellule(p, dateIso, shiftsCellule))}
                      className="h-10 flex-1 rounded-lg transition-opacity hover:opacity-80"
                      style={{ backgroundColor: couleurCase ?? '#F1F5F9', opacity: couleurCase ? 0.55 : 1 }}
                    />
                  );
                })}
              </div>

              <p className="mt-2 text-xs font-semibold text-slate-500">
                École : {formatDureeHeures(heuresEcole)} · Travail : {formatDureeHeures(heuresTravaillees)} · Congé : {joursConge} jour
                {joursConge > 1 ? 's' : ''}
              </p>
            </div>
          );
        })}
        {profils.length === 0 && <p className="px-3.5 py-5 text-sm text-slate-400">Aucun membre.</p>}
      </div>

      <div className="flex shrink-0 flex-wrap gap-3 border-t border-slate-100 px-3.5 py-2.5">
        <Legende couleur={COULEUR_TRAVAIL_DEFAUT} label="Pop-up" />
        <Legende couleur={COULEUR_ECOLE} label="École" />
        <Legende couleur={COULEUR_CONGE.conge} label="Congé" />
        <Legende couleur={COULEUR_CONGE.repos} label="Repos" />
      </div>
    </div>
  );
}

function Legende({ couleur, label }: { couleur: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-[9px] w-[9px] rounded-full" style={{ backgroundColor: couleur }} />
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
    </div>
  );
}
