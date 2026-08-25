'use client';

import { useTransition } from 'react';

import { modifierProfil } from './actions';
import { LIBELLE_TYPE_CONTRAT } from './lib';
import { Champ, ChampBool, ChampDate, ChampSelect, Section } from './ui';
import type { FormRh, PopUp, Profile, TypeContrat } from './types';

function texte(v: string | null | undefined): string {
  return v ?? '';
}

export function OngletContrat({
  profil,
  form,
  onChange,
  popUps,
  membres,
}: {
  profil: Profile;
  form: FormRh;
  onChange: (patch: FormRh) => void;
  popUps: PopUp[];
  membres: Profile[];
}) {
  const [, demarrer] = useTransition();

  return (
    <div className="pb-6">
      <Section titre="Contrat">
        <Champ label="Matricule" valeur={texte(form.matricule)} onChangeText={(v) => onChange({ matricule: v })} />
        <ChampDate
          label="Date de début de contrat"
          valeur={texte(form.date_debut_contrat)}
          onChange={(v) => onChange({ date_debut_contrat: v || null })}
        />
        <Champ
          label="Heure de début de contrat"
          valeur={texte(form.heure_debut_contrat).slice(0, 5)}
          onChangeText={(v) => onChange({ heure_debut_contrat: v ? `${v}:00` : null })}
        />
        <ChampSelect
          label="Type de contrat"
          valeur={profil.type_contrat}
          onChange={(v) => demarrer(() => modifierProfil(profil.id, { type_contrat: v as TypeContrat }))}
          options={Object.entries(LIBELLE_TYPE_CONTRAT).map(([value, label]) => ({ value, label }))}
        />
        <Champ
          label="Temps de travail hebdomadaire (heures)"
          valeur={profil.heures_max_semaine != null ? String(profil.heures_max_semaine) : ''}
          onChangeText={(v) => demarrer(() => modifierProfil(profil.id, { heures_max_semaine: v ? Number(v) : null }))}
          type="number"
        />
        <ChampSelect
          label="Établissement par défaut"
          valeur={texte(form.etablissement_par_defaut_id)}
          onChange={(v) => onChange({ etablissement_par_defaut_id: v || null })}
          options={popUps.map((p) => ({ value: p.id, label: p.nom }))}
        />
        <ChampSelect
          label="Responsable hiérarchique"
          valeur={texte(form.responsable_hierarchique_id)}
          onChange={(v) => onChange({ responsable_hierarchique_id: v || null })}
          options={membres.filter((m) => m.id !== profil.id).map((m) => ({ value: m.id, label: m.nom_complet || m.email }))}
        />
        <Champ label="Email SumUp" valeur={texte(form.sumup_email)} onChangeText={(v) => onChange({ sumup_email: v })} type="email" />
        <ChampBool
          label="Ne pas compter les heures du dimanche (Demande & RH)"
          valeur={form.exclure_heures_dimanche ?? false}
          onChange={(v) => onChange({ exclure_heures_dimanche: v })}
        />
      </Section>
    </div>
  );
}
