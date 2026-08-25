'use client';

import { useEffect, useState } from 'react';

import { enregistrerHoraireRecurrent, obtenirHorairesRecurrents, supprimerHoraireRecurrent } from './actions';
import type { HoraireAEnregistrer } from './HoraireJourCard';
import { HoraireJourCard } from './HoraireJourCard';
import { formatDureeHeures, JOURS_LABELS, totalHeuresRecurrentesParSemaine } from './lib';
import { ChampDate, TexteAlerte } from './ui';
import type { FormRh, HoraireRecurrentProfil, PopUp, Profile } from './types';

function texte(v: string | null | undefined): string {
  return v ?? '';
}

export function OngletPlanification({
  profil,
  lieuxAttribues,
  form,
  onChange,
}: {
  profil: Profile;
  lieuxAttribues: PopUp[];
  form: FormRh;
  onChange: (patch: FormRh) => void;
}) {
  const [horaires, setHoraires] = useState<HoraireRecurrentProfil[] | null>(null);

  const charger = () => {
    obtenirHorairesRecurrents(profil.id).then(setHoraires);
  };

  useEffect(() => {
    setHoraires(null);
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil.id]);

  if (horaires === null) return <TexteAlerte>Chargement...</TexteAlerte>;

  const totalHeures = totalHeuresRecurrentesParSemaine(horaires);

  const enregistrer = async (horaire: HoraireAEnregistrer) => {
    await enregistrerHoraireRecurrent(horaire);
    charger();
  };
  const supprimer = async (id: string) => {
    await supprimerHoraireRecurrent(id);
    charger();
  };

  return (
    <div className="pb-6">
      <div className="mb-4">
        <ChampDate
          label="Date de début (l'horaire ci-dessous ne génère aucun créneau avant cette date)"
          valeur={texte(form.date_debut_contrat)}
          onChange={(v) => onChange({ date_debut_contrat: v || null })}
        />
      </div>
      {lieuxAttribues.length === 0 && (
        <TexteAlerte>Aucun lieu attribué — attribue d&apos;abord cette personne à un pop-up avant de fixer son horaire.</TexteAlerte>
      )}

      <div className="flex flex-wrap gap-3">
        {JOURS_LABELS.map((label, jourSemaine) => (
          <div key={jourSemaine} style={{ flexGrow: 1, flexBasis: 140, maxWidth: 200 }}>
            <HoraireJourCard
              profileId={profil.id}
              jourSemaine={jourSemaine}
              label={label}
              regles={horaires.filter((h) => h.jour_semaine === jourSemaine)}
              popUpsDisponibles={lieuxAttribues}
              onEnregistrer={enregistrer}
              onSupprimer={supprimer}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <div className="flex flex-1 items-center justify-between rounded-xl bg-slate-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-500">Semaine 1</span>
          <span className="text-base font-bold text-slate-800">{formatDureeHeures(totalHeures.premiere)}</span>
        </div>
        <div className="flex flex-1 items-center justify-between rounded-xl bg-slate-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-500">Semaine 2</span>
          <span className="text-base font-bold text-slate-800">{formatDureeHeures(totalHeures.deuxieme)}</span>
        </div>
      </div>
    </div>
  );
}
