'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { dateEnISO } from '../planning/dateUtils';
import {
  chargerPersonnelJour,
  creerTrouCaisse,
  supprimerTrouCaisse,
  type PersonneJour,
  type PersonnelJour,
  type TrouCaisse,
} from './actions';

interface PopUp {
  id: string;
  nom: string;
}

function formatMontant(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function formatDateCourte(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function TrouClient({ popUps, trousInitiaux }: { popUps: PopUp[]; trousInitiaux: TrouCaisse[] }) {
  const router = useRouter();
  const [trous, setTrous] = useState(trousInitiaux);
  useEffect(() => setTrous(trousInitiaux), [trousInitiaux]);

  const [popUpId, setPopUpId] = useState(popUps[0]?.id ?? '');
  const [date, setDate] = useState(() => dateEnISO(new Date()));
  const [montant, setMontant] = useState('');
  const [note, setNote] = useState('');

  const [personnelJour, setPersonnelJour] = useState<PersonnelJour | null>(null);
  const [chargementPersonnel, setChargementPersonnel] = useState(false);
  const [personneFermetureId, setPersonneFermetureId] = useState<string>('');
  const [personnesCochees, setPersonnesCochees] = useState<Set<string>>(new Set());

  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);

  // Pré-remplissage automatique depuis le planning dès que pop-up + date sont choisis (cf. retour
  // utilisateur : "les personnes qui travaillaient ce jour-là... si tu peux le faire
  // automatiquement grâce au planning c'est top") — reste modifiable ensuite avant d'enregistrer.
  useEffect(() => {
    if (!popUpId || !date) {
      setPersonnelJour(null);
      return;
    }
    let annule = false;
    setChargementPersonnel(true);
    chargerPersonnelJour(popUpId, date)
      .then((r) => {
        if (annule) return;
        setPersonnelJour(r);
        setPersonneFermetureId(r.fermetureSuggereeId ?? '');
        setPersonnesCochees(new Set(r.personnesPresentes.map((p) => p.id)));
      })
      .catch((e) => {
        if (!annule) setErreur(e instanceof Error ? e.message : 'Chargement du personnel échoué.');
      })
      .finally(() => {
        if (!annule) setChargementPersonnel(false);
      });
    return () => {
      annule = true;
    };
  }, [popUpId, date]);

  const basculerPersonne = (id: string) => {
    setPersonnesCochees((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  };

  const soumettre = () => {
    setErreur(null);
    const montantNombre = Number(montant.replace(',', '.'));
    if (!popUpId || !date || !montant || Number.isNaN(montantNombre)) {
      setErreur('Pop-up, date et montant sont obligatoires.');
      return;
    }
    demarrer(async () => {
      try {
        await creerTrouCaisse({
          popUpId,
          date,
          montant: montantNombre,
          personneFermetureId: personneFermetureId || null,
          personnesPresentesIds: Array.from(personnesCochees),
          note,
        });
        setMontant('');
        setNote('');
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Échec de l'enregistrement.");
      }
    });
  };

  const supprimer = (t: TrouCaisse) => {
    const confirme = window.confirm(`Supprimer le trou de ${formatMontant(t.montant)} du ${formatDateCourte(t.date)} (${t.popUpNom}) ?`);
    if (!confirme) return;
    setSuppressionEnCours(t.id);
    setTrous((liste) => liste.filter((l) => l.id !== t.id));
    supprimerTrouCaisse(t.id)
      .catch((e) => {
        setErreur(e instanceof Error ? e.message : 'Échec de la suppression.');
        setTrous(trousInitiaux);
      })
      .finally(() => {
        setSuppressionEnCours(null);
        router.refresh();
      });
  };

  const totalMois = trous
    .filter((t) => t.date.slice(0, 7) === date.slice(0, 7))
    .reduce((s, t) => s + t.montant, 0);

  return (
    <div>
      <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Nouveau trou de caisse</p>

        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pop-up</span>
            <select
              value={popUpId}
              onChange={(e) => setPopUpId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            >
              {popUps.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Montant du trou (€)</span>
            <input
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Ex. 12.50"
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Fermeture {chargementPersonnel && '(chargement…)'}
            </span>
            <select
              value={personneFermetureId}
              onChange={(e) => setPersonneFermetureId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            >
              <option value="">—</option>
              {personnelJour?.personnesPresentes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nomComplet}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-3">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Personnes présentes ce jour-là — pré-rempli depuis le planning, modifiable
          </span>
          {!personnelJour || personnelJour.personnesPresentes.length === 0 ? (
            <p className="text-xs text-slate-400">
              {chargementPersonnel ? 'Chargement…' : 'Aucun créneau trouvé pour ce pop-up à cette date.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {personnelJour.personnesPresentes.map((p: PersonneJour) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                    personnesCochees.has(p.id) ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  <input type="checkbox" checked={personnesCochees.has(p.id)} onChange={() => basculerPersonne(p.id)} className="hidden" />
                  {p.nomComplet}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mb-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Note (optionnel)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Contexte, hypothèse sur la cause…"
              className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
            />
          </label>
        </div>

        {erreur && <p className="mb-2 text-xs font-semibold text-red-600">{erreur}</p>}

        <button
          type="button"
          onClick={soumettre}
          disabled={enCours}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer le trou'}
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Historique</p>
        <p className="text-xs font-semibold text-slate-400">
          Total {new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} : {formatMontant(totalMois)}
        </p>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Pop-up</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Fermeture</th>
              <th className="px-4 py-3">Présents</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">Enregistré par</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {trous.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0 align-top">
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{formatDateCourte(t.date)}</td>
                <td className="px-4 py-2.5 text-slate-700">{t.popUpNom}</td>
                <td className="px-4 py-2.5 font-bold text-red-600">{formatMontant(t.montant)}</td>
                <td className="px-4 py-2.5 text-slate-700">{t.personneFermetureNom ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {t.personnesPresentes.length > 0 ? t.personnesPresentes.map((p) => p.nomComplet).join(', ') : '—'}
                </td>
                <td className="max-w-[200px] px-4 py-2.5 text-slate-500">{t.note ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-400">{t.creeParNom}</td>
                <td className="px-2 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => supprimer(t)}
                    disabled={suppressionEnCours === t.id}
                    title="Supprimer ce trou"
                    className="rounded-lg px-2 py-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {trous.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                  Aucun trou enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
