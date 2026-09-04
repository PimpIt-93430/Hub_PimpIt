'use client';

import { useEffect, useMemo, useState } from 'react';

import { PRIX_LETTRE_VERTE_SUIVIE_HT } from '@/lib/laposte';
import { sauvegarderReglesLivraison, type ClassePoids, type ClasseDestination, type RegleLivraison } from '@/lib/regles-livraison';
import type { OptionExpedition } from '@/lib/sendcloud';
import type { PossibiliteExpedition } from '@/lib/shopify';
import { chargerOptionsExpeditionCompte, chargerPossibilitesExpedition } from './actions';
import { chargerExpediteur, versSendcloudAddress } from './expedition-commun';

const LABEL_POIDS: Record<ClassePoids, string> = { leger: 'Léger', lourd: 'Lourd', tous: 'Tous poids' };
const LABEL_DESTINATION: Record<ClasseDestination, string> = { france: 'France', international: 'International', tous: 'Toutes destinations' };

const VALEUR_LAPOSTE = '__laposte__';
const VALEUR_VIDE = '';

/** Une ligne = une possibilité réelle de la boutique Shopify (mode de livraison × poids ×
 * destination, cf. actions.ts chargerPossibilitesExpedition) ou une possibilité ajoutée à la main
 * pour un cas non couvert par la config Shopify actuelle (ex. commande créée manuellement). */
interface Ligne {
  cle: string;
  moyenExpedition: string;
  poids: ClassePoids;
  destination: ClasseDestination;
  manuelle: boolean;
}

/** Éditeur des règles de livraison (cf. retour utilisateur du 2026-09-05 : "il faudrait que tu
 * mettes toutes les possibilités shopify avec poids et destination et moi je match avec mes règles
 * comme ça c'est simple et tout le reste de la logique tu enlèves") — toutes les combinaisons
 * réelles (mode de livraison Shopify × poids × destination) sont listées automatiquement (interrogé
 * en direct, cf. lib/shopify.ts listerPossibilitesExpedition), l'utilisateur choisit juste le
 * transporteur pour chacune. Plus de mot-clé à taper, plus de zone/legerUniquement séparés — le
 * poids et la destination sont déjà ceux de la vraie commande. */
export function ReglesLivraisonPanel({
  regles,
  onChange,
  onFermer,
}: {
  regles: RegleLivraison[];
  onChange: (regles: RegleLivraison[]) => void;
  onFermer: () => void;
}) {
  const [brouillon, setBrouillon] = useState(regles);
  const [possibilites, setPossibilites] = useState<PossibiliteExpedition[]>([]);
  const [optionsFrance, setOptionsFrance] = useState<OptionExpedition[]>([]);
  const [optionsInternational, setOptionsInternational] = useState<OptionExpedition[]>([]);
  const [chargement, setChargement] = useState(true);
  const [ajoutManuel, setAjoutManuel] = useState(false);
  const [nouveauMoyen, setNouveauMoyen] = useState('');
  const [nouveauPoids, setNouveauPoids] = useState<ClassePoids>('tous');
  const [nouvelleDestination, setNouvelleDestination] = useState<ClasseDestination>('tous');

  useEffect(() => {
    const expediteur = chargerExpediteur();
    const chargements: Promise<void>[] = [
      chargerPossibilitesExpedition()
        .then(setPossibilites)
        .catch(() => setPossibilites([])),
    ];
    if (expediteur.adresse1) {
      const adresse = versSendcloudAddress(expediteur);
      chargements.push(
        Promise.all([
          chargerOptionsExpeditionCompte(adresse, 'france').catch(() => []),
          chargerOptionsExpeditionCompte(adresse, 'international').catch(() => []),
        ]).then(([france, international]) => {
          setOptionsFrance(france);
          setOptionsInternational(international);
        }),
      );
    }
    Promise.all(chargements).finally(() => setChargement(false));
  }, []);

  const grouperParTransporteur = (liste: OptionExpedition[]) => {
    const groupes = new Map<string, OptionExpedition[]>();
    for (const o of liste) {
      const offres = groupes.get(o.transporteurNom) ?? [];
      offres.push(o);
      groupes.set(o.transporteurNom, offres);
    }
    return [...groupes.entries()];
  };
  const parTransporteurFrance = useMemo(() => grouperParTransporteur(optionsFrance), [optionsFrance]);
  const parTransporteurInternational = useMemo(() => grouperParTransporteur(optionsInternational), [optionsInternational]);

  // Fusionne les possibilités réelles (Shopify) avec les règles manuelles existantes qui ne
  // correspondent à aucune possibilité live (ex. "Expédition" — texte vu sur de vraies commandes
  // mais absent de la config actuelle des profils d'expédition, cf. commande créée à la main) —
  // jamais perdues silencieusement, affichées à part avec un badge "ajoutée à la main".
  const lignes = useMemo<Ligne[]>(() => {
    // Filtre défensif : jamais une ligne sans texte de mode de livraison (donnée malformée en amont,
    // ex. ancien format localStorage pas complètement nettoyé) — mieux vaut l'ignorer que produire
    // une ligne vide ou une clé React dupliquée.
    const clesVues = new Set<string>();
    const deLaBoutique: Ligne[] = [];
    for (const p of possibilites) {
      if (!p.moyenExpedition) continue;
      const cle = `${p.moyenExpedition}|${p.poids}|${p.destination}`;
      if (clesVues.has(cle)) continue;
      clesVues.add(cle);
      deLaBoutique.push({ cle, moyenExpedition: p.moyenExpedition, poids: p.poids, destination: p.destination, manuelle: false });
    }
    const manuelles: Ligne[] = [];
    for (const r of brouillon) {
      if (!r.moyenExpedition) continue;
      const cle = `${r.moyenExpedition}|${r.poids}|${r.destination}`;
      if (clesVues.has(cle)) continue;
      clesVues.add(cle);
      manuelles.push({ cle, moyenExpedition: r.moyenExpedition, poids: r.poids, destination: r.destination, manuelle: true });
    }
    return [...deLaBoutique, ...manuelles];
  }, [possibilites, brouillon]);

  const sauvegarder = (suivant: RegleLivraison[]) => {
    setBrouillon(suivant);
    onChange(suivant);
    sauvegarderReglesLivraison(suivant);
  };

  const regleDe = (l: Ligne) => brouillon.find((r) => r.moyenExpedition === l.moyenExpedition && r.poids === l.poids && r.destination === l.destination);

  const definirTransporteur = (l: Ligne, valeur: string) => {
    const existante = regleDe(l);
    if (valeur === VALEUR_VIDE) {
      if (existante) sauvegarder(brouillon.filter((r) => r.id !== existante.id));
      return;
    }
    const transporteur = valeur === VALEUR_LAPOSTE ? 'laposte' : 'sendcloud';
    const code = valeur === VALEUR_LAPOSTE ? '' : valeur;
    if (existante) {
      sauvegarder(brouillon.map((r) => (r.id === existante.id ? { ...r, transporteur, code } : r)));
    } else {
      sauvegarder([
        ...brouillon,
        { id: `regle-${Date.now()}-${Math.random()}`, moyenExpedition: l.moyenExpedition, poids: l.poids, destination: l.destination, transporteur, code },
      ]);
    }
  };

  const supprimerLigneManuelle = (l: Ligne) => {
    sauvegarder(brouillon.filter((r) => !(r.moyenExpedition === l.moyenExpedition && r.poids === l.poids && r.destination === l.destination)));
  };

  const ajouterManuelle = () => {
    if (!nouveauMoyen.trim()) return;
    sauvegarder([
      ...brouillon,
      {
        id: `regle-${Date.now()}`,
        moyenExpedition: nouveauMoyen.trim(),
        poids: nouveauPoids,
        destination: nouvelleDestination,
        transporteur: 'sendcloud',
        code: '',
      },
    ]);
    setNouveauMoyen('');
    setNouveauPoids('tous');
    setNouvelleDestination('tous');
    setAjoutManuel(false);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/20" onClick={onFermer}>
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Règles de livraison</h2>
          <button type="button" onClick={onFermer} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Chaque ligne est une combinaison réelle de ta boutique (mode de livraison Shopify, poids, destination) —
          choisis le transporteur pour chacune. Une commande dont la combinaison exacte n&apos;a pas de transporteur
          choisi n&apos;est jamais proposée en création automatique.
        </p>

        {chargement && <p className="mb-3 text-xs text-slate-400">Chargement…</p>}
        {!chargement && possibilites.length === 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            Aucune possibilité trouvée côté Shopify — vérifie la configuration des profils d&apos;expédition.
          </p>
        )}
        {!chargement && optionsFrance.length === 0 && optionsInternational.length === 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            Aucune offre Sendcloud trouvée — renseigne d&apos;abord ton adresse expéditeur (ouvre une commande,
            section &quot;Expéditeur&quot;), puis reviens ici.
          </p>
        )}

        <div className="mb-4 flex flex-col gap-2">
          {lignes.map((l) => {
            const existante = regleDe(l);
            const valeurActuelle = existante ? (existante.transporteur === 'laposte' ? VALEUR_LAPOSTE : existante.code) : VALEUR_VIDE;
            const parTransporteur = l.destination === 'international' ? parTransporteurInternational : parTransporteurFrance;
            return (
              <div key={l.cle} className="rounded-xl border border-slate-100 p-2.5">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-semibold text-slate-700">{l.moyenExpedition}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{LABEL_POIDS[l.poids]}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{LABEL_DESTINATION[l.destination]}</span>
                  {l.manuelle && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700" title="Vu sur une commande mais absent de la config Shopify actuelle">
                      ajoutée à la main
                    </span>
                  )}
                  {l.manuelle && (
                    <button type="button" onClick={() => supprimerLigneManuelle(l)} className="ml-auto text-slate-300 hover:text-red-500">
                      ✕
                    </button>
                  )}
                </div>
                <select
                  value={valeurActuelle}
                  onChange={(e) => definirTransporteur(l, e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
                >
                  <option value={VALEUR_VIDE}>— Non configuré (jamais proposée en création) —</option>
                  <option value={VALEUR_LAPOSTE}>La Poste — Lettre Verte Suivie ({PRIX_LETTRE_VERTE_SUIVIE_HT.toFixed(2)} € fixe)</option>
                  {parTransporteur.map(([transporteur, offres]) => (
                    <optgroup key={transporteur} label={transporteur}>
                      {offres.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.nom} {o.pointRelaisRequis ? '(point relais)' : ''} ({o.code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {ajoutManuel ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">
              Pour un mode de livraison vu sur une commande mais absent de la liste ci-dessus (ex. commande créée à la
              main).
            </p>
            <div className="mb-2 flex flex-wrap gap-2">
              <input
                value={nouveauMoyen}
                onChange={(e) => setNouveauMoyen(e.target.value)}
                placeholder="Texte exact du mode de livraison"
                className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none"
              />
              <select
                value={nouveauPoids}
                onChange={(e) => setNouveauPoids(e.target.value as ClassePoids)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm focus:border-indigo-300 focus:outline-none"
              >
                <option value="tous">Tous poids</option>
                <option value="leger">Léger</option>
                <option value="lourd">Lourd</option>
              </select>
              <select
                value={nouvelleDestination}
                onChange={(e) => setNouvelleDestination(e.target.value as ClasseDestination)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm focus:border-indigo-300 focus:outline-none"
              >
                <option value="tous">Toutes destinations</option>
                <option value="france">France</option>
                <option value="international">International</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={ajouterManuelle} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500">
                Ajouter
              </button>
              <button type="button" onClick={() => setAjoutManuel(false)} className="text-xs font-semibold text-slate-500 hover:underline">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAjoutManuel(true)}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
          >
            + Ajouter une possibilité imprévue
          </button>
        )}
      </div>
    </div>
  );
}
