'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  creerDepenseFlux,
  supprimerDepenseFlux,
  type DepenseFlux,
  type FrequenceDepense,
  type TypeDepense,
} from './actions';

function formatMontant(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function formatDateCourte(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function dateEnISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function ajouterMois(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

const LIBELLE_FREQUENCE: Record<FrequenceDepense, string> = {
  mensuelle: 'Tous les mois',
  trimestrielle: 'Tous les trimestres',
  annuelle: 'Tous les ans',
};

interface Occurrence {
  date: Date;
  montant: number;
  libelle: string;
}

/** Toutes les échéances d'une dépense qui tombent entre `debut` et `fin` inclus — une seule pour
 * une ponctuelle, une par échéance de la fréquence choisie pour une récurrente (cf. retour
 * utilisateur : "ponctuelles + récurrentes"). */
function occurrencesDansLaPeriode(d: DepenseFlux, debut: Date, fin: Date): Occurrence[] {
  const premiere = new Date(`${d.date}T00:00:00`);
  if (d.type === 'ponctuelle') {
    return premiere >= debut && premiere <= fin ? [{ date: premiere, montant: d.montant, libelle: d.libelle }] : [];
  }
  const limite = d.dateFin ? new Date(`${d.dateFin}T00:00:00`) : fin;
  const finEffective = limite < fin ? limite : fin;
  const pas = d.frequence === 'mensuelle' ? 1 : d.frequence === 'trimestrielle' ? 3 : 12;
  const occurrences: Occurrence[] = [];
  let courante = premiere;
  let garde = 0;
  while (courante <= finEffective && garde < 500) {
    if (courante >= debut) occurrences.push({ date: courante, montant: d.montant, libelle: d.libelle });
    courante = ajouterMois(courante, pas);
    garde += 1;
  }
  return occurrences;
}

const LARGEUR = 760;
const HAUTEUR = 260;
const MARGE = { haut: 16, bas: 28, gauche: 8, droite: 8 };

function GraphiqueSolde({ soldeDepart, occurrences, debut, fin }: { soldeDepart: number; occurrences: Occurrence[]; debut: Date; fin: Date }) {
  const points = useMemo(() => {
    let solde = soldeDepart;
    const pts: { x: number; y: number; date: Date; solde: number }[] = [{ x: 0, y: 0, date: debut, solde }];
    const dureeMs = fin.getTime() - debut.getTime();
    for (const occ of occurrences) {
      solde -= occ.montant;
      const x = (occ.date.getTime() - debut.getTime()) / dureeMs;
      pts.push({ x, y: 0, date: occ.date, solde });
    }
    pts.push({ x: 1, y: 0, date: fin, solde });
    return pts;
  }, [soldeDepart, occurrences, debut, fin]);

  const min = Math.min(0, ...points.map((p) => p.solde));
  const max = Math.max(soldeDepart, ...points.map((p) => p.solde));
  const etendue = max - min || 1;
  const zoneH = HAUTEUR - MARGE.haut - MARGE.bas;
  const zoneW = LARGEUR - MARGE.gauche - MARGE.droite;

  const xPix = (x: number) => MARGE.gauche + x * zoneW;
  const yPix = (solde: number) => MARGE.haut + zoneH - ((solde - min) / etendue) * zoneH;

  // Ligne en escalier (le solde ne change qu'aux dates d'échéance, pas de façon linéaire entre
  // deux échéances) : pour chaque point, un segment horizontal jusqu'à sa date puis vertical vers
  // le nouveau solde.
  let chemin = `M ${xPix(points[0].x)} ${yPix(points[0].solde)}`;
  for (let i = 1; i < points.length; i++) {
    chemin += ` L ${xPix(points[i].x)} ${yPix(points[i - 1].solde)} L ${xPix(points[i].x)} ${yPix(points[i].solde)}`;
  }

  const yZero = yPix(0);
  const premierNegatif = points.find((p) => p.solde < 0 && p.date > debut);

  const moisRepere = useMemo(() => {
    const reperes: { x: number; label: string }[] = [];
    let d = new Date(debut.getFullYear(), debut.getMonth(), 1);
    d = ajouterMois(d, 1);
    const dureeMs = fin.getTime() - debut.getTime();
    while (d <= fin) {
      reperes.push({ x: (d.getTime() - debut.getTime()) / dureeMs, label: d.toLocaleDateString('fr-FR', { month: 'short' }) });
      d = ajouterMois(d, 1);
    }
    return reperes;
  }, [debut, fin]);

  return (
    <div>
      <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} className="w-full" role="img" aria-label="Évolution du solde sur 12 mois">
        {min < 0 && (
          <rect x={0} y={yZero} width={LARGEUR} height={MARGE.haut + zoneH - yZero} fill="#FEF2F2" />
        )}
        <line x1={0} y1={yZero} x2={LARGEUR} y2={yZero} stroke="#CBD5E1" strokeWidth={1} strokeDasharray={min < 0 ? '4 3' : undefined} />
        {moisRepere.map((r) => (
          <g key={r.label + r.x}>
            <line x1={xPix(r.x)} y1={MARGE.haut} x2={xPix(r.x)} y2={MARGE.haut + zoneH} stroke="#F1F5F9" strokeWidth={1} />
            <text x={xPix(r.x)} y={HAUTEUR - 8} fontSize={10} fill="#94A3B8" textAnchor="middle">
              {r.label}
            </text>
          </g>
        ))}
        <path d={chemin} fill="none" stroke="#4F46E5" strokeWidth={2} />
        {points.slice(1, -1).map((p, i) => (
          <circle key={i} cx={xPix(p.x)} cy={yPix(p.solde)} r={3} fill={p.solde < 0 ? '#DC2626' : '#4F46E5'} />
        ))}
      </svg>
      {premierNegatif && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          ⚠ Sans nouvelles recettes, le solde passerait sous 0 € le {formatDateCourte(dateEnISO(premierNegatif.date))} (
          {formatMontant(premierNegatif.solde)}).
        </p>
      )}
    </div>
  );
}

export function FluxTresorerieClient({ soldeActuel, depensesInitiales }: { soldeActuel: number; depensesInitiales: DepenseFlux[] }) {
  const router = useRouter();
  const [depenses, setDepenses] = useState(depensesInitiales);
  // router.refresh() (après ajout/suppression) refait le rendu serveur et passe de nouvelles
  // props, mais un useState initialisé une fois ne les reprend jamais tout seul — sans cet effet,
  // la ligne fraîchement créée reste invisible malgré son insertion réussie en base (cf. bug trouvé
  // en testant : "TEST TVA T4" enregistrée en base mais jamais affichée).
  useEffect(() => setDepenses(depensesInitiales), [depensesInitiales]);

  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [type, setType] = useState<TypeDepense>('ponctuelle');
  const [date, setDate] = useState('');
  const [frequence, setFrequence] = useState<FrequenceDepense>('mensuelle');
  const [dateFin, setDateFin] = useState('');
  const [note, setNote] = useState('');

  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);

  const debut = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const fin = useMemo(() => ajouterMois(debut, 12), [debut]);

  const occurrences = useMemo(() => {
    const tout = depenses.flatMap((d) => occurrencesDansLaPeriode(d, debut, fin));
    return tout.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [depenses, debut, fin]);

  const totalSurUnAn = occurrences.reduce((s, o) => s + o.montant, 0);

  const soumettre = () => {
    setErreur(null);
    const montantNombre = Number(montant.replace(',', '.'));
    if (!libelle.trim() || !date || !montant || Number.isNaN(montantNombre) || montantNombre <= 0) {
      setErreur('Libellé, date et montant sont obligatoires.');
      return;
    }
    demarrer(async () => {
      try {
        await creerDepenseFlux({
          libelle,
          montant: montantNombre,
          type,
          date,
          frequence: type === 'recurrente' ? frequence : null,
          dateFin: type === 'recurrente' ? dateFin : null,
          note,
        });
        setLibelle('');
        setMontant('');
        setDate('');
        setDateFin('');
        setNote('');
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec de l'enregistrement.");
      }
    });
  };

  const supprimer = (d: DepenseFlux) => {
    const confirme = window.confirm(`Supprimer "${d.libelle}" (${formatMontant(d.montant)}) ?`);
    if (!confirme) return;
    setSuppressionEnCours(d.id);
    setDepenses((liste) => liste.filter((l) => l.id !== d.id));
    supprimerDepenseFlux(d.id)
      .catch((e) => {
        setErreur(e instanceof Error ? e.message : 'Échec de la suppression.');
        setDepenses(depensesInitiales);
      })
      .finally(() => {
        setSuppressionEnCours(null);
        router.refresh();
      });
  };

  return (
    <div className="mt-8">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Flux de trésorerie — 12 mois</p>
      <h2 className="mb-4 text-lg font-bold text-slate-900">Dépenses à venir</h2>

      <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-slate-500">
            Solde de départ : <span className="font-bold text-slate-800">{formatMontant(soldeActuel)}</span>
          </p>
          <p className="text-sm text-slate-500">
            Total des dépenses prévues sur 12 mois : <span className="font-bold text-red-600">{formatMontant(totalSurUnAn)}</span>
          </p>
        </div>
        <GraphiqueSolde soldeDepart={soldeActuel} occurrences={occurrences} debut={debut} fin={fin} />
        <p className="mt-2 text-[11px] text-slate-400">
          Sans les recettes (pas encore intégrées) — ce graphique montre uniquement l&apos;effet des dépenses saisies ci-dessous sur le
          solde actuel.
        </p>
      </div>

      <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Ajouter une dépense</p>

        <div className="mb-3 flex gap-2">
          {(['ponctuelle', 'recurrente'] as TypeDepense[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                type === t ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {t === 'ponctuelle' ? 'Ponctuelle' : 'Récurrente'}
            </button>
          ))}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="col-span-2 block sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Libellé</span>
            <input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex. TVA T1, Loyer, Assurance…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Montant (€)</span>
            <input
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Ex. 3500"
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {type === 'ponctuelle' ? "Date d'échéance" : '1ère échéance'}
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>

          {type === 'recurrente' && (
            <>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fréquence</span>
                <select
                  value={frequence}
                  onChange={(e) => setFrequence(e.target.value as FrequenceDepense)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                >
                  {(Object.keys(LIBELLE_FREQUENCE) as FrequenceDepense[]).map((f) => (
                    <option key={f} value={f}>
                      {LIBELLE_FREQUENCE[f]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fin (optionnel)</span>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                />
              </label>
            </>
          )}
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Note (optionnel)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
          />
        </label>

        {erreur && <p className="mb-2 text-xs font-semibold text-red-600">{erreur}</p>}

        <button
          type="button"
          onClick={soumettre}
          disabled={enCours}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {enCours ? 'Enregistrement…' : 'Ajouter la dépense'}
        </button>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Libellé</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Échéance</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">Ajouté par</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {depenses.map((d) => (
              <tr key={d.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-slate-800">{d.libelle}</td>
                <td className="px-4 py-2.5 font-bold text-red-600">{formatMontant(d.montant)}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {d.type === 'ponctuelle' ? 'Ponctuelle' : d.frequence ? LIBELLE_FREQUENCE[d.frequence] : 'Récurrente'}
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {formatDateCourte(d.date)}
                  {d.dateFin ? ` → ${formatDateCourte(d.dateFin)}` : ''}
                </td>
                <td className="max-w-[160px] px-4 py-2.5 text-slate-500">{d.note ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-400">{d.creeParNom}</td>
                <td className="px-2 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => supprimer(d)}
                    disabled={suppressionEnCours === d.id}
                    className="rounded-lg px-2 py-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {depenses.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  Aucune dépense enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
