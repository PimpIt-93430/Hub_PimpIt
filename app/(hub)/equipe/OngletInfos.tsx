'use client';

import { AvatarInitiales, BadgeRole, Champ, ChampBool, ChampDate, ChampSelect, Section } from './ui';
import type { FormRh, PopUp, Profile } from './types';

function texte(v: string | null | undefined): string {
  return v ?? '';
}

export function OngletInfos({
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
  return (
    <div className="pb-6">
      <div className="mb-4 flex items-center gap-4 rounded-2xl bg-indigo-50 p-5">
        <AvatarInitiales nom={profil.nom_complet} email={profil.email} couleur={profil.couleur} taille={52} />
        <div>
          <p className="text-lg font-bold text-slate-900">{profil.nom_complet || profil.email}</p>
          <p className="text-sm text-slate-500">{profil.email}</p>
          <div className="mt-1 flex items-center gap-2">
            <BadgeRole role={profil.role} typeContrat={profil.type_contrat} />
            {lieuxAttribues.length > 0 && <span className="text-xs text-slate-500">· {lieuxAttribues[0].nom}</span>}
          </div>
        </div>
      </div>

      <Section titre="État civil">
        <ChampSelect
          label="Genre"
          valeur={texte(form.genre)}
          onChange={(v) => onChange({ genre: v })}
          options={[
            { value: 'femme', label: 'Femme' },
            { value: 'homme', label: 'Homme' },
            { value: 'autre', label: 'Autre' },
          ]}
        />
        <ChampDate label="Date de naissance" valeur={texte(form.date_naissance)} onChange={(v) => onChange({ date_naissance: v || null })} />
        <Champ label="Nationalité" valeur={texte(form.nationalite)} onChangeText={(v) => onChange({ nationalite: v })} />
        <Champ label="Pays de naissance" valeur={texte(form.pays_naissance)} onChangeText={(v) => onChange({ pays_naissance: v })} />
        <Champ
          label="Département de naissance"
          valeur={texte(form.departement_naissance)}
          onChangeText={(v) => onChange({ departement_naissance: v })}
        />
        <Champ label="Commune de naissance" valeur={texte(form.commune_naissance)} onChangeText={(v) => onChange({ commune_naissance: v })} />
        <Champ label="Situation familiale" valeur={texte(form.situation_familiale)} onChangeText={(v) => onChange({ situation_familiale: v })} />
        <Champ
          label="Personnes à charge"
          valeur={form.nombre_personnes_charge != null ? String(form.nombre_personnes_charge) : ''}
          onChangeText={(v) => onChange({ nombre_personnes_charge: v ? Number(v) : null })}
          type="number"
        />
      </Section>

      <Section titre="Coordonnées">
        <Champ label="Tél. mobile" valeur={texte(form.tel_mobile)} onChangeText={(v) => onChange({ tel_mobile: v })} type="tel" />
        <Champ label="Tél. fixe" valeur={texte(form.tel_fixe)} onChangeText={(v) => onChange({ tel_fixe: v })} type="tel" />
        <ChampBool label="Notifications SMS" valeur={form.notifications_sms ?? false} onChange={(v) => onChange({ notifications_sms: v })} />
        <Champ label="Adresse" valeur={texte(form.adresse)} onChangeText={(v) => onChange({ adresse: v })} />
        <Champ label="Complément d'adresse" valeur={texte(form.complement_adresse)} onChangeText={(v) => onChange({ complement_adresse: v })} />
        <Champ label="Code postal" valeur={texte(form.code_postal)} onChangeText={(v) => onChange({ code_postal: v })} />
        <Champ label="Ville" valeur={texte(form.ville)} onChangeText={(v) => onChange({ ville: v })} />
        <Champ label="Pays" valeur={texte(form.pays)} onChangeText={(v) => onChange({ pays: v })} />
      </Section>

      <Section titre="Contact d'urgence">
        <Champ label="Prénom" valeur={texte(form.contact_urgence_prenom)} onChangeText={(v) => onChange({ contact_urgence_prenom: v })} />
        <Champ label="Nom" valeur={texte(form.contact_urgence_nom)} onChangeText={(v) => onChange({ contact_urgence_nom: v })} />
        <Champ label="Lien" valeur={texte(form.contact_urgence_lien)} onChangeText={(v) => onChange({ contact_urgence_lien: v })} />
        <Champ
          label="Tél. mobile"
          valeur={texte(form.contact_urgence_tel_mobile)}
          onChangeText={(v) => onChange({ contact_urgence_tel_mobile: v })}
          type="tel"
        />
        <Champ
          label="Tél. fixe"
          valeur={texte(form.contact_urgence_tel_fixe)}
          onChangeText={(v) => onChange({ contact_urgence_tel_fixe: v })}
          type="tel"
        />
      </Section>

      <Section titre="Informations bancaires">
        <Champ
          label="Nom du titulaire du compte"
          valeur={texte(form.nom_titulaire_compte)}
          onChangeText={(v) => onChange({ nom_titulaire_compte: v })}
        />
        <Champ label="IBAN" valeur={texte(form.iban)} onChangeText={(v) => onChange({ iban: v })} />
        <Champ label="BIC" valeur={texte(form.bic)} onChangeText={(v) => onChange({ bic: v })} />
      </Section>

      <Section titre="Informations médicales">
        <Champ label="Numéro de sécurité sociale" valeur={texte(form.numero_secu)} onChangeText={(v) => onChange({ numero_secu: v })} />
        <ChampBool label="Personne en situation de handicap" valeur={form.handicap ?? false} onChange={(v) => onChange({ handicap: v })} />
        {form.handicap && (
          <Champ label="Type de handicap" valeur={texte(form.type_handicap)} onChangeText={(v) => onChange({ type_handicap: v })} />
        )}
        <ChampDate
          label="Dernière visite médicale"
          valeur={texte(form.date_derniere_visite_medicale)}
          onChange={(v) => onChange({ date_derniere_visite_medicale: v || null })}
        />
        <ChampBool
          label="Visite médicale renforcée"
          valeur={form.visite_medicale_renforcee ?? false}
          onChange={(v) => onChange({ visite_medicale_renforcee: v })}
        />
        <ChampDate
          label="Prochaine visite médicale"
          valeur={texte(form.prochaine_visite_medicale)}
          onChange={(v) => onChange({ prochaine_visite_medicale: v || null })}
        />
      </Section>

      <Section titre="Autorisations de travail">
        <ChampBool
          label="Travailleur étranger avec autorisation de travail"
          valeur={form.travailleur_etranger ?? false}
          onChange={(v) => onChange({ travailleur_etranger: v })}
        />
        {form.travailleur_etranger && (
          <Champ label="Autorisation de travail" valeur={texte(form.autorisation_travail)} onChangeText={(v) => onChange({ autorisation_travail: v })} />
        )}
      </Section>
    </div>
  );
}
