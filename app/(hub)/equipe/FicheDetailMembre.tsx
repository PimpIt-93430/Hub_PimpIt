'use client';

import { useEffect, useState } from 'react';

import { genererPlanningPourProfil } from '@/app/(hub)/planning/actions';

import { enregistrerInformationsRh, obtenirInformationsRh } from './actions';
import { OngletConges } from './OngletConges';
import { OngletContrat } from './OngletContrat';
import { OngletDocuments } from './OngletDocuments';
import { OngletDroits } from './OngletDroits';
import { OngletInfos } from './OngletInfos';
import { OngletPlanification } from './OngletPlanification';
import { BoutonEnregistrer } from './ui';
import type { FormRh, PopUp, Profile } from './types';

type Onglet = 'infos' | 'contrat' | 'planification' | 'conges' | 'documents' | 'droits';

const ONGLETS: { value: Onglet; label: string }[] = [
  { value: 'infos', label: 'Informations personnelles' },
  { value: 'contrat', label: 'Contrat' },
  { value: 'planification', label: 'Planification' },
  { value: 'conges', label: 'Congés' },
  { value: 'documents', label: 'Documents' },
  { value: 'droits', label: 'Droits' },
];

export function FicheDetailMembre({
  profil,
  popUps,
  membres,
  lieuxAttribues,
}: {
  profil: Profile;
  popUps: PopUp[];
  membres: Profile[];
  lieuxAttribues: PopUp[];
}) {
  const [onglet, setOnglet] = useState<Onglet>('infos');
  const [form, setForm] = useState<FormRh>({});
  const [enregistrement, setEnregistrement] = useState(false);
  const [messageGeneration, setMessageGeneration] = useState<string | null>(null);

  useEffect(() => {
    setOnglet('infos');
    setMessageGeneration(null);
    obtenirInformationsRh(profil.id).then((data) => setForm(data ?? {}));
  }, [profil.id]);

  const patcher = (patch: FormRh) => setForm((f) => ({ ...f, ...patch }));

  const enregistrer = async () => {
    setEnregistrement(true);
    setMessageGeneration(null);
    try {
      await enregistrerInformationsRh({ ...form, profile_id: profil.id });
      // Cf. retour utilisateur : "il faut vraiment que quand je fasse la planification pour
      // quelqu'un j'appuie sur enregistrer en haut à droite ça rentre toutes les heures à partir
      // d'aujourd'hui ou du début du pop-up, juste l'école prend le dessus si y'a école" — fixer
      // l'horaire récurrent seul (onglet Planification) ne générait jamais aucun créneau réel :
      // il fallait ensuite aller sur /planning et cliquer "Générer", semaine par semaine. Ce bouton
      // déclenche maintenant la génération (an complet, additive, jamais destructrice) rien que
      // pour cette personne dès que sa planification est enregistrée.
      if (onglet === 'planification') {
        const resultat = await genererPlanningPourProfil(profil.id);
        setMessageGeneration(
          resultat.nombreCrees > 0
            ? `${resultat.nombreCrees} créneau${resultat.nombreCrees > 1 ? 'x' : ''} ajouté${resultat.nombreCrees > 1 ? 's' : ''} au planning.`
            : 'Planification enregistrée (aucun nouveau créneau à ajouter).',
        );
      }
    } catch (e) {
      setMessageGeneration(e instanceof Error ? e.message : 'Échec de la génération du planning.');
    } finally {
      setEnregistrement(false);
    }
  };

  const montrerBoutonEnregistrer = onglet === 'infos' || onglet === 'contrat' || onglet === 'planification';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="mx-6 mt-5 flex gap-1 rounded-full bg-slate-100 p-1">
        {ONGLETS.map((o) => (
          <button
            key={o.value}
            onClick={() => setOnglet(o.value)}
            className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
              onglet === o.value ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {montrerBoutonEnregistrer && (
        <div className="mt-3 flex items-center justify-end gap-3 px-6">
          {messageGeneration && <span className="text-xs font-semibold text-slate-500">{messageGeneration}</span>}
          <BoutonEnregistrer onClick={enregistrer} enCours={enregistrement} />
        </div>
      )}

      <div className="mt-5 flex-1 overflow-y-auto px-6">
        {onglet === 'infos' && <OngletInfos profil={profil} lieuxAttribues={lieuxAttribues} form={form} onChange={patcher} />}
        {onglet === 'contrat' && <OngletContrat profil={profil} form={form} onChange={patcher} popUps={popUps} membres={membres} />}
        {onglet === 'planification' && (
          <OngletPlanification profil={profil} lieuxAttribues={lieuxAttribues} form={form} onChange={patcher} />
        )}
        {onglet === 'conges' && <OngletConges profil={profil} />}
        {onglet === 'documents' && <OngletDocuments profil={profil} />}
        {onglet === 'droits' && <OngletDroits profil={profil} popUps={popUps} lieuxAttribues={lieuxAttribues} />}
      </div>
    </div>
  );
}
