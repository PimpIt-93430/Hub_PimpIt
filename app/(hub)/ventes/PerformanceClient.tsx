'use client';

import { useMemo, useState } from 'react';

import {
  agregerParEmploye,
  agregerParJour,
  agregerParProduit,
  formatDureeHeuresKpi,
  nombrePinsVendus,
  type EmployeAgg,
  type JourAgg,
  type LigneVenteKpi,
  type ShiftKpi,
  type VenteKpi,
} from './kpiLib';
import type { PopUpLite, ProfilLite, VenteSumupLigneLite, VenteSumupLite } from './VentesClient';

export type ShiftLite = ShiftKpi;

export interface ProfilAvecContrat extends ProfilLite {
  type_contrat: string | null;
}

const COULEUR_NEUTRE = '#94A3B8';

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function formatMontantPrecis(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
}
function formatDateCourte(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
function nomAffiche(p: ProfilLite | undefined): string {
  return p ? p.nom_complet || p.email : 'Inconnu';
}

function Pastille({ couleur, children }: { couleur: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: couleur }} />
      {children}
    </span>
  );
}

function TuileKpi({ label, valeur, sousTexte, accent }: { label: string; valeur: string; sousTexte?: string; accent?: string }) {
  return (
    <div className="min-w-[160px] flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: accent ?? '#0f172a' }}>
        {valeur}
      </p>
      {sousTexte && <p className="mt-0.5 text-xs text-slate-400">{sousTexte}</p>}
    </div>
  );
}

type TriEmploye = 'ca' | 'ca_heure' | 'ca_jour' | 'heures' | 'ventes';

function CoefficientPastille({ coefficient }: { coefficient: number | null }) {
  if (coefficient === null) return <span className="text-slate-300">—</span>;
  const couleur = coefficient >= 1.05 ? 'text-emerald-600 bg-emerald-50' : coefficient <= 0.95 ? 'text-red-600 bg-red-50' : 'text-slate-500 bg-slate-100';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${couleur}`}>×{coefficient.toFixed(2)}</span>;
}

/** Cœur du reporting "performance équipe" : croise ventes SumUp et planning (cf. kpiLib.ts) pour
 * savoir qui a généré quoi, avec un partage à parts égales quand plusieurs personnes étaient en
 * poste ensemble. Composant séparé de VentesClient (qui reste la réplique fidèle de l'écran RN) —
 * cette vue est propre au Hub, pensée pour du monitoring approfondi (tableaux jour/employé,
 * produits, pin's) plutôt qu'un simple miroir de l'app mobile. */
export function PerformanceClient({
  ventes,
  lignes,
  shifts,
  popUps,
  profils,
  periode,
}: {
  ventes: VenteSumupLite[];
  lignes: VenteSumupLigneLite[];
  shifts: ShiftLite[];
  popUps: PopUpLite[];
  profils: ProfilAvecContrat[];
  periode: string;
}) {
  const [alternantsSeuls, setAlternantsSeuls] = useState(true);
  const [popUpFiltreId, setPopUpFiltreId] = useState('tous');
  const [triEmploye, setTriEmploye] = useState<TriEmploye>('ca');
  const [jourDeplie, setJourDeplie] = useState<string | null>(null);

  const profilParId = useMemo(() => new Map(profils.map((p) => [p.id, p])), [profils]);

  const ventesFiltrees: VenteKpi[] = useMemo(
    () =>
      ventes.filter((v) => v.statut === 'SUCCESSFUL' && (popUpFiltreId === 'tous' || v.pop_up_id === popUpFiltreId)),
    [ventes, popUpFiltreId],
  );
  const shiftsFiltres: ShiftKpi[] = useMemo(
    () => shifts.filter((s) => popUpFiltreId === 'tous' || s.pop_up_id === popUpFiltreId),
    [shifts, popUpFiltreId],
  );
  const idsVentesFiltrees = useMemo(() => new Set(ventesFiltrees.map((v) => v.id)), [ventesFiltrees]);
  const lignesFiltrees: (VenteSumupLigneLite & LigneVenteKpi)[] = useMemo(
    () => lignes.filter((l) => idsVentesFiltrees.has(l.vente_id)),
    [lignes, idsVentesFiltrees],
  );

  const aggParEmploye = useMemo(() => agregerParEmploye(ventesFiltrees, shiftsFiltres), [ventesFiltrees, shiftsFiltres]);
  const aggParJour = useMemo(() => agregerParJour(ventesFiltrees, shiftsFiltres), [ventesFiltrees, shiftsFiltres]);
  const produits = useMemo(() => agregerParProduit(lignesFiltrees), [lignesFiltrees]);
  const totalPins = useMemo(() => nombrePinsVendus(lignesFiltrees), [lignesFiltrees]);

  const lignesEmployeBase: (EmployeAgg & { profil: ProfilAvecContrat | undefined; caParHeure: number; caParJour: number; panierMoyen: number })[] =
    useMemo(() => {
      return Array.from(aggParEmploye.values())
        .map((e) => ({
          ...e,
          profil: profilParId.get(e.profileId),
          caParHeure: e.heuresTravaillees > 0 ? e.caAttribue / e.heuresTravaillees : 0,
          caParJour: e.joursTravailles > 0 ? e.caAttribue / e.joursTravailles : 0,
          panierMoyen: e.nbVentesEquivalent > 0 ? e.caAttribue / e.nbVentesEquivalent : 0,
        }))
        .filter((e) => !alternantsSeuls || e.profil?.type_contrat === 'alternant');
    }, [aggParEmploye, profilParId, alternantsSeuls]);

  // CA/jour moyen de l'équipe affichée (pondéré par le CA et les jours réels, pas une moyenne des
  // ratios individuels) — sert de référence 1,0× au coefficient de chaque employé ci-dessous. Cf.
  // retour utilisateur : "mettre en rapport le CA de la personne avec le jour travaillé... un
  // coefficient" — cette référence ne change que si le filtre alternants/pop-up change l'équipe
  // comparée, jamais selon le tri du tableau.
  const caParJourMoyenEquipe = useMemo(() => {
    const totalCa = lignesEmployeBase.reduce((s, e) => s + e.caAttribue, 0);
    const totalJours = lignesEmployeBase.reduce((s, e) => s + e.joursTravailles, 0);
    return totalJours > 0 ? totalCa / totalJours : 0;
  }, [lignesEmployeBase]);

  const lignesEmploye: (EmployeAgg & {
    profil: ProfilAvecContrat | undefined;
    caParHeure: number;
    caParJour: number;
    panierMoyen: number;
    coefficient: number | null;
  })[] = useMemo(() => {
    return lignesEmployeBase
      .map((e) => ({
        ...e,
        coefficient: e.joursTravailles > 0 && caParJourMoyenEquipe > 0 ? e.caParJour / caParJourMoyenEquipe : null,
      }))
      .sort((a, b) => {
        if (triEmploye === 'ca') return b.caAttribue - a.caAttribue;
        if (triEmploye === 'ca_heure') return b.caParHeure - a.caParHeure;
        if (triEmploye === 'ca_jour') return b.caParJour - a.caParJour;
        if (triEmploye === 'heures') return b.heuresTravaillees - a.heuresTravaillees;
        return b.nbVentesEquivalent - a.nbVentesEquivalent;
      });
  }, [lignesEmployeBase, caParJourMoyenEquipe, triEmploye]);

  const joursAffiches: JourAgg[] = useMemo(() => Array.from(aggParJour.values()).sort((a, b) => b.date.localeCompare(a.date)), [aggParJour]);

  const caEquipeTotal = lignesEmploye.reduce((s, e) => s + e.caAttribue, 0);
  const heuresEquipeTotal = lignesEmploye.reduce((s, e) => s + e.heuresTravaillees, 0);
  const caHeureMoyenEquipe = heuresEquipeTotal > 0 ? caEquipeTotal / heuresEquipeTotal : 0;
  const meilleurCaHeure = lignesEmploye.reduce<(typeof lignesEmploye)[number] | null>(
    (meilleur, e) => (e.heuresTravaillees >= 1 && (!meilleur || e.caParHeure > meilleur.caParHeure) ? e : meilleur),
    null,
  );

  // CA non attribué à quiconque (ni planning, ni email SumUp mappé) sur TOUTE l'équipe, pas
  // seulement le filtre "alternants uniquement" — sinon ce chiffre semblerait varier selon un
  // filtre d'affichage qui n'a rien à voir avec la qualité de l'attribution elle-même.
  const caTotalFiltre = ventesFiltrees.reduce((s, v) => s + v.montant, 0);
  const caAttribueTousEmployes = Array.from(aggParEmploye.values()).reduce((s, e) => s + e.caAttribue, 0);
  const caNonAttribue = Math.max(0, caTotalFiltre - caAttribueTousEmployes);

  return (
    <div className="mb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Performance équipe</h2>
          <p className="text-xs text-slate-400">
            Chaque vente est rattachée à qui était en poste au planning au même pop-up, au même moment — répartie à
            parts égales quand plusieurs personnes travaillaient ensemble. À défaut de créneau planifié, l&apos;email
            SumUp utilisé fait foi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={alternantsSeuls} onChange={(e) => setAlternantsSeuls(e.target.checked)} className="h-3.5 w-3.5 rounded" />
            Alternants uniquement
          </label>
          <select
            value={popUpFiltreId}
            onChange={(e) => setPopUpFiltreId(e.target.value)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 focus:border-slate-400 focus:outline-none"
          >
            <option value="tous">Tous les pop-up</option>
            {popUps.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <TuileKpi label="CA attribué à l'équipe" valeur={formatMontant(caEquipeTotal)} sousTexte={`${lignesEmploye.length} personne(s)`} />
        <TuileKpi label="Heures travaillées" valeur={formatDureeHeuresKpi(heuresEquipeTotal)} />
        <TuileKpi label="CA/heure moyen" valeur={formatMontantPrecis(caHeureMoyenEquipe)} sousTexte="Équipe filtrée" accent="#4F46E5" />
        <TuileKpi
          label="Meilleur CA/heure"
          valeur={meilleurCaHeure ? formatMontantPrecis(meilleurCaHeure.caParHeure) : '—'}
          sousTexte={meilleurCaHeure ? nomAffiche(meilleurCaHeure.profil) : 'Pas assez de données'}
          accent="#059669"
        />
        <TuileKpi label="Pin's vendus" valeur={totalPins.toLocaleString('fr-FR')} sousTexte={periode === 'debut_mois' ? 'Depuis le 1er du mois' : 'Sur la période'} accent="#D97706" />
        {caNonAttribue > 0 && (
          <TuileKpi
            label="CA non attribué"
            valeur={formatMontant(caNonAttribue)}
            sousTexte="Ni planning, ni email SumUp mappé"
            accent="#DC2626"
          />
        )}
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Par employé</h3>
            <p className="text-xs text-slate-400">
              Coefficient = CA/jour de la personne ÷ CA/jour moyen de l&apos;équipe affichée (×1,00 = dans la moyenne).
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            {(
              [
                ['ca', 'CA'],
                ['ca_heure', 'CA/h'],
                ['ca_jour', 'CA/jour'],
                ['heures', 'Heures'],
                ['ventes', 'Ventes'],
              ] as [TriEmploye, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTriEmploye(v)}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${
                  triEmploye === v ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {lignesEmploye.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucun créneau/vente sur cette période pour ce filtre.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2">Employé</th>
                  <th className="px-4 py-2 text-right">CA attribué</th>
                  <th className="px-4 py-2 text-right">% équipe</th>
                  <th className="px-4 py-2 text-right">Heures</th>
                  <th className="px-4 py-2 text-right">CA/heure</th>
                  <th className="px-4 py-2 text-right">Jours</th>
                  <th className="px-4 py-2 text-right">CA/jour</th>
                  <th className="px-4 py-2 text-right">Coefficient</th>
                  <th className="px-4 py-2 text-right">Ventes</th>
                  <th className="px-4 py-2 text-right">Panier moyen</th>
                </tr>
              </thead>
              <tbody>
                {lignesEmploye.map((e) => (
                  <tr key={e.profileId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Pastille couleur={e.profil?.couleur ?? COULEUR_NEUTRE}>
                          <span className="font-semibold text-slate-800">{nomAffiche(e.profil)}</span>
                        </Pastille>
                        {e.profil?.type_contrat === 'alternant' && (
                          <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-600">Alt.</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatMontant(e.caAttribue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {caEquipeTotal > 0 ? `${Math.round((e.caAttribue / caEquipeTotal) * 100)}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{formatDureeHeuresKpi(e.heuresTravaillees)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-indigo-600">
                      {e.heuresTravaillees > 0 ? formatMontantPrecis(e.caParHeure) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{e.joursTravailles}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-800">
                      {e.joursTravailles > 0 ? formatMontant(e.caParJour) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CoefficientPastille coefficient={e.coefficient} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{e.nbVentesEquivalent.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{formatMontant(e.panierMoyen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Par jour</h3>
          <p className="text-xs text-slate-400">Clique un jour pour voir la répartition par employé.</p>
        </div>
        {joursAffiches.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucune vente sur cette période.</p>
        ) : (
          <div>
            {joursAffiches.map((j) => {
              const deplie = jourDeplie === j.date;
              const repartitionTriee = Array.from(j.parEmploye.entries())
                .filter(([id]) => !alternantsSeuls || profilParId.get(id)?.type_contrat === 'alternant')
                .sort(([, a], [, b]) => b - a);
              return (
                <div key={j.date} className="border-b border-slate-50 last:border-0">
                  <button
                    type="button"
                    onClick={() => setJourDeplie(deplie ? null : j.date)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium capitalize text-slate-700">{formatDateCourte(j.date)}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-slate-900">{formatMontant(j.caTotal)}</span>
                      <span className="w-3 text-center text-xs text-slate-400">{deplie ? '︿' : '⌄'}</span>
                    </span>
                  </button>
                  {deplie && (
                    <div className="space-y-1.5 bg-slate-50 px-4 py-3">
                      {repartitionTriee.length === 0 ? (
                        <p className="text-xs text-slate-400">Aucune vente attribuée à un employé ce jour-là.</p>
                      ) : (
                        repartitionTriee.map(([id, montant]) => {
                          const p = profilParId.get(id);
                          return (
                            <div key={id} className="flex items-center justify-between text-xs">
                              <Pastille couleur={p?.couleur ?? COULEUR_NEUTRE}>
                                <span className="text-slate-600">{nomAffiche(p)}</span>
                              </Pastille>
                              <span className="font-semibold tabular-nums text-slate-700">{formatMontant(montant)}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Produits vendus</h3>
          </div>
          {produits.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Aucune vente sur cette période.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {produits.map((p) => (
                    <tr key={p.nomProduit} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2 text-slate-600">{p.nomProduit}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">× {p.quantite.toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Pin&apos;s vendus (unités)</p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-amber-900">{totalPins.toLocaleString('fr-FR')}</p>
          <p className="mt-2 text-xs text-amber-700">
            Compte chaque pin&apos;s individuel, y compris ceux inclus dans les packs (6, 13...) et les produits composés
            (Clogs + N pin&apos;s, Coque + N pin&apos;s).
          </p>
        </div>
      </div>
    </div>
  );
}
