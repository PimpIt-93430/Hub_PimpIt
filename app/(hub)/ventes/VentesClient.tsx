'use client';

import { useMemo, useState } from 'react';

type StatutVenteSumup = 'SUCCESSFUL' | 'CANCELLED' | 'FAILED' | 'REFUNDED' | 'CHARGE_BACK';

export interface VenteSumupLite {
  id: string;
  pop_up_id: string | null;
  profile_id: string | null;
  montant: number;
  frais_montant: number | null;
  pourboire_montant: number | null;
  statut: StatutVenteSumup;
  horodatage: string;
}

export interface VenteSumupLigneLite {
  id: string;
  vente_id: string;
  nom_produit: string;
  quantite: number;
}

export interface PopUpLite {
  id: string;
  nom: string;
  couleur: string;
}

export interface ProfilLite {
  id: string;
  nom_complet: string;
  email: string;
  couleur: string;
}

const COULEUR_PRIMAIRE = '#4F46E5';
const COULEUR_NEUTRE = '#94A3B8';

const LIBELLE_STATUT: Record<string, string> = {
  SUCCESSFUL: 'Réussie',
  REFUNDED: 'Remboursée',
  FAILED: 'Échouée',
  CANCELLED: 'Annulée',
  CHARGE_BACK: 'Contestée',
};

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function formatDateHeure(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} à ${heure}`;
}

function formatDateCourte(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${heure}`;
}

function nomAffiche(p: ProfilLite | undefined): string {
  return p ? p.nom_complet || p.email : 'Inconnu';
}

function TuileKpi({ label, valeur, sousTexte }: { label: string; valeur: string; sousTexte?: string }) {
  return (
    <div className="min-w-[160px] flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{valeur}</p>
      {sousTexte && <p className="mt-0.5 text-xs text-slate-400">{sousTexte}</p>}
    </div>
  );
}

function ChipFiltre({
  actif,
  onClick,
  couleur,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  couleur?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
        actif ? 'border-indigo-200 bg-indigo-50 font-semibold text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      {couleur && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: couleur }} />}
      {children}
    </button>
  );
}

/** Graphique en barres CSS pur — pas de recharts ni d'autre lib de charting installée dans le Hub
 * (cf. AGENTS.md de cette tâche) : une simple rangée de divs dont la hauteur en pixels est
 * proportionnelle au CA du jour, substitution volontaire du <BarChart> recharts de
 * App PIMP IT/src/components/finance/FinanceEcran.tsx. */
function GraphiqueTendance({ donnees }: { donnees: { jour: string; montant: number }[] }) {
  if (donnees.length === 0) {
    return <p className="text-sm text-slate-400">Aucune vente sur cette période.</p>;
  }
  const HAUTEUR = 180;
  const max = Math.max(...donnees.map((d) => d.montant), 1);
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: HAUTEUR + 28 }}>
      {donnees.map((d) => (
        <div
          key={d.jour}
          className="flex h-full min-w-[26px] flex-1 flex-col items-center justify-end gap-1.5"
          title={`${d.jour} — ${formatMontant(d.montant)}`}
        >
          <div
            className="w-full rounded-t-md bg-indigo-600"
            style={{ height: Math.max(Math.round((d.montant / max) * HAUTEUR), d.montant > 0 ? 3 : 0), backgroundColor: COULEUR_PRIMAIRE }}
          />
          <span className="whitespace-nowrap text-[10px] text-slate-400">{d.jour}</span>
        </div>
      ))}
    </div>
  );
}

function BarreRepartition({ label, couleur, montant, total }: { label: string; couleur: string; montant: number; total: number }) {
  const pourcentage = total > 0 ? Math.round((montant / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: couleur }} />
          <span className="text-sm font-medium text-slate-700">{label}</span>
        </div>
        <span className="text-sm font-semibold text-slate-900">{formatMontant(montant)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-2 rounded-full" style={{ width: `${pourcentage}%`, backgroundColor: couleur }} />
      </div>
    </div>
  );
}

function LigneHistoriqueVente({
  vente,
  lignes,
  nomPopUp,
  nomSalarie,
}: {
  vente: VenteSumupLite;
  lignes: VenteSumupLigneLite[];
  nomPopUp: string;
  nomSalarie: string;
}) {
  const [deplie, setDeplie] = useState(false);
  return (
    <button
      type="button"
      onClick={() => lignes.length > 0 && setDeplie((v) => !v)}
      className="block w-full border-t border-slate-100 px-4 py-3 text-left first:border-t-0"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">{formatDateHeure(vente.horodatage)}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {nomPopUp} · {nomSalarie}
            {vente.statut !== 'SUCCESSFUL' ? ` · ${LIBELLE_STATUT[vente.statut] ?? vente.statut}` : ''}
          </p>
        </div>
        <span className="text-sm font-bold text-slate-900">{formatMontant(vente.montant)}</span>
        {lignes.length > 0 && <span className="w-3 text-center text-xs text-slate-400">{deplie ? '︿' : '⌄'}</span>}
      </div>
      {deplie && lignes.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {lignes.map((l) => (
            <div key={l.id} className="flex justify-between text-xs">
              <span className="text-slate-600">{l.nom_produit}</span>
              <span className="font-semibold text-slate-700">× {l.quantite}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

/** Réplique fidèle de App PIMP IT/src/components/finance/FinanceEcran.tsx — mêmes champs, mêmes
 * filtres, mêmes calculs (CA/frais/pourboires uniquement sur les ventes SUCCESSFUL, taux de
 * remboursement sur l'ensemble des ventes filtrées). La période (jour/semaine/mois/personnalisé)
 * est gérée en amont par ventes/page.tsx via les search params ; ici on ne filtre que par
 * pop-up/salarié, en mémoire, comme dans l'écran d'origine. */
export function VentesClient({
  ventes,
  lignes,
  popUps,
  profils,
}: {
  ventes: VenteSumupLite[];
  lignes: VenteSumupLigneLite[];
  popUps: PopUpLite[];
  profils: ProfilLite[];
}) {
  const [popUpFiltreId, setPopUpFiltreId] = useState('tous');
  const [profileFiltreId, setProfileFiltreId] = useState('tous');

  const popUpParId = useMemo(() => new Map(popUps.map((p) => [p.id, p])), [popUps]);
  const profilParId = useMemo(() => new Map(profils.map((p) => [p.id, p])), [profils]);

  const ventesFiltrees = ventes.filter((v) => {
    if (popUpFiltreId !== 'tous' && v.pop_up_id !== popUpFiltreId) return false;
    if (profileFiltreId !== 'tous' && v.profile_id !== profileFiltreId) return false;
    return true;
  });

  const ventesReussies = ventesFiltrees.filter((v) => v.statut === 'SUCCESSFUL');
  const caTotal = ventesReussies.reduce((s, v) => s + v.montant, 0);
  const fraisTotal = ventesReussies.reduce((s, v) => s + (v.frais_montant ?? 0), 0);
  const pourboireTotal = ventesReussies.reduce((s, v) => s + (v.pourboire_montant ?? 0), 0);
  const nbVentes = ventesReussies.length;
  const panierMoyen = nbVentes > 0 ? caTotal / nbVentes : 0;
  const nbRembourse = ventesFiltrees.filter((v) => v.statut === 'REFUNDED').length;
  const tauxRemboursement = ventesFiltrees.length > 0 ? Math.round((nbRembourse / ventesFiltrees.length) * 100) : 0;

  const parJour = new Map<string, number>();
  for (const v of ventesReussies) {
    const jour = v.horodatage.slice(0, 10);
    parJour.set(jour, (parJour.get(jour) ?? 0) + v.montant);
  }
  const donneesTendance = Array.from(parJour.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([jour, montant]) => ({
      jour: new Date(`${jour}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      montant,
    }));

  const parPopUp = new Map<string, number>();
  for (const v of ventesReussies) {
    const cle = v.pop_up_id ?? '__non_attribue__';
    parPopUp.set(cle, (parPopUp.get(cle) ?? 0) + v.montant);
  }
  const repartitionPopUp = Array.from(parPopUp.entries())
    .map(([id, montant]) => ({
      id,
      label: id === '__non_attribue__' ? 'Non attribué' : (popUpParId.get(id)?.nom ?? 'Pop-up supprimé'),
      couleur: id === '__non_attribue__' ? COULEUR_NEUTRE : (popUpParId.get(id)?.couleur ?? COULEUR_NEUTRE),
      montant,
    }))
    .sort((a, b) => b.montant - a.montant);

  const parSalarie = new Map<string, number>();
  for (const v of ventesReussies) {
    const cle = v.profile_id ?? '__non_attribue__';
    parSalarie.set(cle, (parSalarie.get(cle) ?? 0) + v.montant);
  }
  const repartitionSalarie = Array.from(parSalarie.entries())
    .map(([id, montant]) => ({
      id,
      label: id === '__non_attribue__' ? 'Non attribué' : nomAffiche(profilParId.get(id)),
      couleur: id === '__non_attribue__' ? COULEUR_NEUTRE : (profilParId.get(id)?.couleur ?? COULEUR_NEUTRE),
      montant,
    }))
    .sort((a, b) => b.montant - a.montant);

  const ventesNonAttribuees = ventesFiltrees.filter((v) => !v.pop_up_id || !v.profile_id);

  const lignesParVente = useMemo(() => {
    const map = new Map<string, VenteSumupLigneLite[]>();
    for (const l of lignes) {
      const liste = map.get(l.vente_id) ?? [];
      liste.push(l);
      map.set(l.vente_id, liste);
    }
    return map;
  }, [lignes]);

  return (
    <>
      <div className="mb-3 overflow-x-auto">
        <div className="flex gap-2 pb-1">
          <ChipFiltre actif={popUpFiltreId === 'tous'} onClick={() => setPopUpFiltreId('tous')}>
            Tous les pop-up
          </ChipFiltre>
          {popUps.map((p) => (
            <ChipFiltre key={p.id} actif={popUpFiltreId === p.id} onClick={() => setPopUpFiltreId(p.id)} couleur={p.couleur}>
              {p.nom}
            </ChipFiltre>
          ))}
        </div>
      </div>

      <div className="mb-6 overflow-x-auto">
        <div className="flex gap-2 pb-1">
          <ChipFiltre actif={profileFiltreId === 'tous'} onClick={() => setProfileFiltreId('tous')}>
            Tous les salariés
          </ChipFiltre>
          {profils.map((p) => (
            <ChipFiltre key={p.id} actif={profileFiltreId === p.id} onClick={() => setProfileFiltreId(p.id)} couleur={p.couleur}>
              {nomAffiche(p)}
            </ChipFiltre>
          ))}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <TuileKpi label="CA total" valeur={formatMontant(caTotal)} sousTexte={`${nbVentes} vente(s)`} />
        <TuileKpi label="CA net" valeur={formatMontant(caTotal - fraisTotal)} sousTexte="Après frais SumUp" />
        <TuileKpi label="Panier moyen" valeur={formatMontant(panierMoyen)} />
        <TuileKpi label="Frais SumUp" valeur={formatMontant(fraisTotal)} />
        <TuileKpi label="Pourboires" valeur={formatMontant(pourboireTotal)} />
        <TuileKpi label="Taux de remboursement" valeur={`${tauxRemboursement}%`} sousTexte={`${nbRembourse} vente(s)`} />
      </div>

      <h2 className="mb-3 text-sm font-bold text-slate-900">Évolution du CA</h2>
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <GraphiqueTendance donnees={donneesTendance} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-bold text-slate-900">Par pop-up</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {repartitionPopUp.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune vente sur cette période.</p>
            ) : (
              repartitionPopUp.map((r) => (
                <BarreRepartition key={r.id} label={r.label} couleur={r.couleur} montant={r.montant} total={caTotal} />
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-bold text-slate-900">Par salarié</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {repartitionSalarie.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune vente sur cette période.</p>
            ) : (
              repartitionSalarie.map((r) => (
                <BarreRepartition key={r.id} label={r.label} couleur={r.couleur} montant={r.montant} total={caTotal} />
              ))
            )}
          </div>
        </div>
      </div>

      {ventesNonAttribuees.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-bold text-slate-900">Ventes non attribuées ({ventesNonAttribuees.length})</h2>
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs text-slate-400">
              Manque le pop-up (coordonnées GPS non renseignées ou vente hors de tout pop-up connu) et/ou le salarié
              (email SumUp non mappé dans sa fiche) pour ces ventes.
            </p>
            {ventesNonAttribuees.slice(0, 20).map((v) => (
              <div key={v.id} className="border-t border-slate-100 py-1.5 text-xs text-slate-600 first:border-t-0">
                {formatDateCourte(v.horodatage)} — {formatMontant(v.montant)}
                {!v.pop_up_id ? ' · pop-up ?' : ''}
                {!v.profile_id ? ' · salarié ?' : ''}
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-3 text-sm font-bold text-slate-900">Historique ({ventesFiltrees.length})</h2>
      <div className="mb-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {ventesFiltrees.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucune vente sur cette période.</p>
        ) : (
          ventesFiltrees.map((v) => (
            <LigneHistoriqueVente
              key={v.id}
              vente={v}
              lignes={lignesParVente.get(v.id) ?? []}
              nomPopUp={v.pop_up_id ? (popUpParId.get(v.pop_up_id)?.nom ?? 'Pop-up supprimé') : 'Non attribué'}
              nomSalarie={v.profile_id ? nomAffiche(profilParId.get(v.profile_id)) : 'Non attribué'}
            />
          ))
        )}
      </div>
    </>
  );
}
