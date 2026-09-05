'use client';

import { useEffect, useMemo, useState } from 'react';

import { chargerEtiquettesRecentes, type EtiquetteHistorique } from './actions';
import { fusionnerPdfs } from './expedition-commun';

type Fenetre = '1h' | '3h' | 'jour' | '7j';

const FENETRES: { valeur: Fenetre; label: string; heures: number }[] = [
  { valeur: '1h', label: 'Dernière heure', heures: 1 },
  { valeur: '3h', label: 'Dernières 3 h', heures: 3 },
  { valeur: 'jour', label: "Aujourd'hui", heures: 24 },
  { valeur: '7j', label: '7 derniers jours', heures: 24 * 7 },
];

function libelleMethode(m: EtiquetteHistorique['methode']): string {
  return m === 'laposte' ? 'La Poste' : 'Sendcloud';
}

/** Réimpression a posteriori — cf. retour utilisateur du 2026-09-05 : "j'ai fait un tout imprimer
 * sur le hub et puis j'ai quitté du coup j'ai plus accès... il faudrait un moyen de les récupérer".
 * Le PDF fusionné de "Créer et imprimer toutes les étiquettes" (PanneauImpressionMasse) n'est
 * jamais stocké — généré à la volée côté navigateur, perdu dès l'onglet fermé — mais chaque
 * étiquette d'origine reste en base (Sendcloud : shipment id, ré-interrogé en direct ; La Poste :
 * le PDF lui-même, cf. lib/expeditions-laposte.ts) : ce panneau les retrouve et permet de
 * refusionner le lot. */
export function PanneauHistoriqueEtiquettes({ onFermer }: { onFermer: () => void }) {
  const [fenetre, setFenetre] = useState<Fenetre>('jour');
  const [etiquettes, setEtiquettes] = useState<EtiquetteHistorique[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [decochees, setDecochees] = useState<Set<string>>(new Set());
  const [pdfFusionUrl, setPdfFusionUrl] = useState<string | null>(null);
  const [pdfFusionPages, setPdfFusionPages] = useState(0);
  const [pdfFusionEchecs, setPdfFusionEchecs] = useState(0);
  const [fusionEnCours, setFusionEnCours] = useState(false);
  const [fusionErreur, setFusionErreur] = useState<string | null>(null);

  useEffect(() => {
    setEtiquettes(null);
    setErreur(null);
    setPdfFusionUrl(null);
    setDecochees(new Set());
    const heures = FENETRES.find((f) => f.valeur === fenetre)!.heures;
    const depuisIso = new Date(Date.now() - heures * 3600_000).toISOString();
    chargerEtiquettesRecentes(depuisIso)
      .then(setEtiquettes)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur de chargement'));
  }, [fenetre]);

  const selectionnees = useMemo(
    () => (etiquettes ?? []).filter((e) => e.url && !decochees.has(e.cle)),
    [etiquettes, decochees],
  );

  function basculer(cle: string) {
    setDecochees((s) => {
      const copie = new Set(s);
      if (copie.has(cle)) copie.delete(cle);
      else copie.add(cle);
      return copie;
    });
    setPdfFusionUrl(null);
    setPdfFusionPages(0);
    setPdfFusionEchecs(0);
  }

  async function fusionner() {
    setFusionEnCours(true);
    setFusionErreur(null);
    setPdfFusionUrl(null);
    setPdfFusionPages(0);
    setPdfFusionEchecs(0);
    try {
      const resultat = await fusionnerPdfs(selectionnees.map((e) => e.url!));
      if (!resultat.url) {
        setFusionErreur('Aucune étiquette récupérable pour cette sélection.');
        return;
      }
      setPdfFusionUrl(resultat.url);
      setPdfFusionPages(resultat.pagesFusionnees);
      setPdfFusionEchecs(resultat.echecs);
    } catch (e) {
      setFusionErreur(e instanceof Error ? e.message : 'Échec de la fusion des étiquettes.');
    } finally {
      setFusionEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={onFermer}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Étiquettes récentes</h2>
          <button type="button" onClick={onFermer} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-3 text-xs text-slate-400">
            Retrouve les étiquettes déjà créées (La Poste + Sendcloud) pour les rouvrir ou refusionner un lot dont le
            PDF a été perdu (onglet fermé avant enregistrement).
          </p>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {FENETRES.map((f) => (
              <button
                key={f.valeur}
                type="button"
                onClick={() => setFenetre(f.valeur)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  fenetre === f.valeur ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {erreur ? (
            <p className="text-sm text-red-600">{erreur}</p>
          ) : etiquettes === null ? (
            <p className="text-sm text-slate-400">Chargement…</p>
          ) : etiquettes.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Aucune étiquette sur cette période.</p>
          ) : (
            <div className="mb-3 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              {etiquettes.map((e) => (
                <label
                  key={e.cle}
                  className={`flex items-center gap-2.5 border-b border-slate-100 px-3 py-2 text-sm last:border-0 ${
                    !e.url ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!e.url && !decochees.has(e.cle)}
                    disabled={!e.url}
                    onChange={() => basculer(e.cle)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="flex-1 text-slate-700">
                    {e.commandeNom}
                    <span className="ml-1.5 text-xs text-slate-400">
                      ({libelleMethode(e.methode)}, {new Date(e.creeLe).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})
                    </span>
                  </span>
                  {e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Ouvrir
                    </a>
                  ) : (
                    <span className="text-xs font-semibold text-red-500">introuvable</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {etiquettes && etiquettes.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
            <p className="text-xs font-semibold text-slate-500">
              {selectionnees.length} étiquette{selectionnees.length > 1 ? 's' : ''} sélectionnée{selectionnees.length > 1 ? 's' : ''}
            </p>
            {fusionErreur ? (
              <span className="text-xs font-semibold text-red-600">{fusionErreur}</span>
            ) : pdfFusionUrl ? (
              <span className="flex items-center gap-2">
                {pdfFusionEchecs > 0 && (
                  <span className="text-xs font-semibold text-amber-600" title="Étiquette(s) introuvable(s) au moment de la fusion — décoche-la/les et relance, ou ouvre-la individuellement">
                    {pdfFusionEchecs} non incluse{pdfFusionEchecs > 1 ? 's' : ''}
                  </span>
                )}
                <a
                  href={pdfFusionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Ouvrir le PDF ({pdfFusionPages} étiquette{pdfFusionPages > 1 ? 's' : ''})
                </a>
              </span>
            ) : (
              <button
                type="button"
                onClick={fusionner}
                disabled={selectionnees.length === 0 || fusionEnCours}
                className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {fusionEnCours ? 'Fusion…' : 'Fusionner et télécharger'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
