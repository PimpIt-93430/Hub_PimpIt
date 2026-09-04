'use client';

import { useEffect, useState } from 'react';

import {
  ajouterDroit,
  ajouterLieuAttribue,
  definirAccesComptableHub,
  obtenirDroits,
  retirerLieuAttribue,
  supprimerDroit,
} from './actions';
import { ChampBool, Section, TexteAlerte } from './ui';
import type { DroitEmploye, Fonctionnalite, PopUp, Profile } from './types';

function nomPopUpOuTous(popUps: PopUp[], popUpId: string | null): string {
  if (popUpId === null) return 'Tous les pop-up';
  return popUps.find((p) => p.id === popUpId)?.nom ?? 'Pop-up supprimé';
}

function SectionDroit({
  droits,
  popUps,
  onAjouter,
  onSupprimer,
}: {
  droits: DroitEmploye[];
  popUps: PopUp[];
  onAjouter: (popUpId: string | null) => void;
  onSupprimer: (id: string) => void;
}) {
  const [choix, setChoix] = useState('');
  const dejaTous = droits.some((d) => d.pop_up_id === null);
  const popUpsDejaAccordes = new Set(droits.map((d) => d.pop_up_id));
  const optionsRestantes = dejaTous ? [] : popUps.filter((p) => !popUpsDejaAccordes.has(p.id));

  const ajouter = () => {
    if (!choix) return;
    onAjouter(choix === '__tous__' ? null : choix);
    setChoix('');
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {droits.map((d) => (
          <span key={d.id} className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
            {nomPopUpOuTous(popUps, d.pop_up_id)}
            <button onClick={() => onSupprimer(d.id)} className="text-indigo-400 hover:text-indigo-700">
              ✕
            </button>
          </span>
        ))}
        {droits.length === 0 && <span className="text-sm text-slate-400">Aucun accès.</span>}
      </div>
      {!dejaTous && (
        <div className="flex items-center gap-2">
          <select value={choix} onChange={(e) => setChoix(e.target.value)} className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <option value="">Ajouter un accès...</option>
            <option value="__tous__">Tous les pop-up</option>
            {optionsRestantes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
          <button onClick={ajouter} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}

export function OngletDroits({ profil, popUps, lieuxAttribues }: { profil: Profile; popUps: PopUp[]; lieuxAttribues: PopUp[] }) {
  const [droits, setDroits] = useState<DroitEmploye[] | null>(null);
  const [popUpAjoutLieu, setPopUpAjoutLieu] = useState('');
  // État local plutôt que profil.hub_role_comptable directement : `profil` vient d'une liste
  // chargée une seule fois côté page (Server Component), pas re-fetchée après ce toggle — même
  // limitation que le reste de cet onglet (droits_employe se recharge lui via chargerDroits, mais
  // ce flag vit sur profiles, pas droits_employe).
  const [accesComptable, setAccesComptable] = useState(profil.hub_role_comptable);
  const [enregistrementComptable, setEnregistrementComptable] = useState(false);

  const toggleAccesComptable = (valeur: boolean) => {
    setAccesComptable(valeur);
    setEnregistrementComptable(true);
    definirAccesComptableHub(profil.id, valeur)
      .catch(() => setAccesComptable(!valeur))
      .finally(() => setEnregistrementComptable(false));
  };

  const chargerDroits = () => {
    obtenirDroits(profil.id).then(setDroits);
  };

  useEffect(() => {
    setDroits(null);
    chargerDroits();
    setAccesComptable(profil.hub_role_comptable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil.id]);

  const lieuxAttribuesIds = new Set(lieuxAttribues.map((p) => p.id));
  const lieuxDisponibles = popUps.filter((p) => !lieuxAttribuesIds.has(p.id));

  const parFonctionnalite = (f: Fonctionnalite) => (droits ?? []).filter((d) => d.fonctionnalite === f);

  const ajouterUnDroit = (fonctionnalite: Fonctionnalite, popUpId: string | null) => {
    ajouterDroit({ profileId: profil.id, fonctionnalite, popUpId }).then(chargerDroits);
  };
  const supprimerUnDroit = (id: string) => {
    supprimerDroit(id).then(chargerDroits);
  };

  return (
    <div className="pb-6">
      <Section titre="Lieux attribués (planning & stock)">
        <div className="w-full">
          <div className="mb-2 flex flex-wrap gap-2">
            {lieuxAttribues.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                {p.nom}
                <button onClick={() => retirerLieuAttribue(profil.id, p.id)} className="text-indigo-400 hover:text-indigo-700">
                  ✕
                </button>
              </span>
            ))}
            {lieuxAttribues.length === 0 && <span className="text-sm text-slate-400">Aucun lieu attribué.</span>}
          </div>
          {lieuxDisponibles.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={popUpAjoutLieu}
                onChange={(e) => setPopUpAjoutLieu(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <option value="">Ajouter un lieu...</option>
                {lieuxDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!popUpAjoutLieu) return;
                  ajouterLieuAttribue(profil.id, popUpAjoutLieu);
                  setPopUpAjoutLieu('');
                }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Ajouter
              </button>
            </div>
          )}
        </div>
      </Section>

      <Section titre="Accès Hub">
        <div className="w-full">
          <p className="mb-2 text-xs text-slate-400">
            Accès au Hub distinct des droits ci-dessous : lecture seule, limité à Planning (tous les pop-up, toute
            l&apos;équipe) — pour un comptable externe qui gère la paie, sans les autres écrans du Hub.
          </p>
          <ChampBool
            label={enregistrementComptable ? 'Comptable (enregistrement...)' : 'Comptable (lecture seule, Planning uniquement)'}
            valeur={accesComptable}
            onChange={toggleAccesComptable}
          />
        </div>
      </Section>

      {droits === null ? (
        <TexteAlerte>Chargement...</TexteAlerte>
      ) : (
        <>
          <Section titre="Calendrier">
            <div className="w-full">
              <p className="mb-2 text-xs text-slate-400">
                Donne la gestion complète du planning (créer/modifier/supprimer des shifts, gérer les absences) pour le(s) pop-up choisi(s) —
                pas juste la consultation.
              </p>
              <SectionDroit
                droits={parFonctionnalite('calendrier')}
                popUps={popUps}
                onAjouter={(popUpId) => ajouterUnDroit('calendrier', popUpId)}
                onSupprimer={supprimerUnDroit}
              />
            </div>
          </Section>

          <Section titre="Équipe">
            <div className="w-full">
              <p className="mb-2 text-xs text-slate-400">
                Donne accès à la fiche des membres du/des pop-up choisi(s) : infos générales (hors bancaire/médical, réservés à l&apos;admin),
                contrat, planification, congés et documents — en lecture et en édition.
              </p>
              <SectionDroit
                droits={parFonctionnalite('equipe')}
                popUps={popUps}
                onAjouter={(popUpId) => ajouterUnDroit('equipe', popUpId)}
                onSupprimer={supprimerUnDroit}
              />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
