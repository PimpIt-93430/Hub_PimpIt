'use client';

import { useEffect, useState } from 'react';

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

  useEffect(() => {
    setOnglet('infos');
    obtenirInformationsRh(profil.id).then((data) => setForm(data ?? {}));
  }, [profil.id]);

  const patcher = (patch: FormRh) => setForm((f) => ({ ...f, ...patch }));

  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      await enregistrerInformationsRh({ ...form, profile_id: profil.id });
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
        <div className="mt-3 flex justify-end px-6">
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
