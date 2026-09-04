'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ClassificationCommande } from '@/lib/classification-produits';
import type { ExpeditionSendcloud } from '@/lib/expeditions-sendcloud';
import { PRIX_LETTRE_VERTE_SUIVIE_HT } from '@/lib/laposte';
import { chargerReglesLivraison, type RegleLivraison } from '@/lib/regles-livraison';
import type { CommandeShopify, StatutExpeditionCommande } from '@/lib/shopify';
import { rafraichirSuivisLivraison, verifierCommandesEnSuspens } from './actions';
import { chargerExpediteur, type Expediteur, POIDS_PAR_DEFAUT_KG, prixInconnu, resoudreExpedition, type ResultatRoutage } from './expedition-commun';
import { PanneauCodesTransporteurs } from './PanneauCodesTransporteurs';
import { PanneauExpedition } from './PanneauExpedition';
import { PanneauExpeditionLaPoste } from './PanneauExpeditionLaPoste';
import { PanneauImpressionMasse } from './PanneauImpressionMasse';
import { ReglesLivraisonPanel } from './ReglesLivraisonPanel';

// Libellés lisibles pour les codes de statut Sendcloud connus (cf. discussion 2026-08-29, migré de
// Boxtal) — affiché quand une étiquette a été créée depuis cet outil. Un code non listé s'affiche
// tel quel (fallback ?? plus bas), jamais une erreur.
const LIBELLE_SUIVI_SENDCLOUD: Record<string, string> = {
  ANNOUNCING: 'Bordereau en cours de création',
  READY_TO_SEND: 'Prêt à expédier',
  EN_ROUTE_TO_SORTING_CENTER: 'En transit',
  DELIVERED: 'Livré',
  CANCELLED: 'Annulé',
  ERROR: 'Erreur transporteur',
};

// Poids par défaut faute de mieux pour l'estimation dans la liste (le vrai poids n'est connu qu'au
// moment de peser le colis) — même défaut que PanneauExpedition.tsx/PanneauImpressionMasse.tsx (cf.
// expedition-commun.ts) : juste une estimation affichée avant ouverture de la commande.
const POIDS_ESTIMATION_GRAMMES = Math.round(POIDS_PAR_DEFAUT_KG * 1000);

const LIBELLE_STATUT: Record<StatutExpeditionCommande, string> = {
  a_creer: 'Pas encore créée',
  partielle: 'Partiellement expédiée',
  expediee: 'Expédiée',
  en_transit: 'En transit',
  tentative_echouee: 'Tentative échouée',
  livree: 'Livrée',
  perdue: 'Perdue',
  annulee: 'Annulée',
  archivee: 'Archivée',
};

const CLASSES_STATUT: Record<StatutExpeditionCommande, string> = {
  a_creer: 'bg-amber-100 text-amber-700',
  partielle: 'bg-amber-100 text-amber-700',
  expediee: 'bg-sky-100 text-sky-700',
  en_transit: 'bg-sky-100 text-sky-700',
  tentative_echouee: 'bg-orange-100 text-orange-700',
  livree: 'bg-emerald-100 text-emerald-700',
  perdue: 'bg-red-100 text-red-700',
  annulee: 'bg-slate-100 text-slate-500',
  archivee: 'bg-slate-100 text-slate-500',
};

const LIBELLE_PAIEMENT: Record<string, string> = {
  paid: 'Payée',
  pending: 'En attente',
  refunded: 'Remboursée',
  partially_refunded: 'Partiellement remboursée',
  voided: 'Annulée',
  authorized: 'Autorisée',
};

type Onglet = 'tous' | StatutExpeditionCommande;

const ONGLETS: { valeur: Onglet; label: string }[] = [
  { valeur: 'tous', label: 'Toutes' },
  { valeur: 'a_creer', label: 'Pas encore créées' },
  { valeur: 'partielle', label: 'Partiellement expédiées' },
  { valeur: 'expediee', label: 'Expédiées' },
  { valeur: 'en_transit', label: 'En transit' },
  { valeur: 'tentative_echouee', label: 'Tentative échouée' },
  { valeur: 'livree', label: 'Livrées' },
  { valeur: 'perdue', label: 'Perdues' },
  { valeur: 'annulee', label: 'Annulées' },
  { valeur: 'archivee', label: 'Archivées' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPrix(prix: string, devise: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise }).format(Number(prix));
}

export function CommandesShopifyClient({
  commandesInitiales,
  expeditionsInitiales,
  poidsInitiaux,
  classificationInitiale,
}: {
  commandesInitiales: CommandeShopify[];
  expeditionsInitiales: [number, ExpeditionSendcloud][];
  /** Poids réel (grammes) par commande, résolu depuis stock_pins.poids_unitaire (cf.
   * lib/poids-commandes.ts) — absente de la map = poids inconnu, à traiter avec le poids par
   * défaut plutôt qu'une estimation Shopify peu fiable. */
  poidsInitiaux: [number, number][];
  /** 'leger'/'lourd' par commande selon les profils d'expédition Shopify (cf.
   * lib/classification-produits.ts) — sert aux règles de livraison réservées aux produits légers
   * (lettre vs colis, cf. discussion 2026-08-29). */
  classificationInitiale: [number, ClassificationCommande][];
}) {
  const poidsConnus = useMemo(() => new Map(poidsInitiaux), [poidsInitiaux]);
  const classification = useMemo(() => new Map(classificationInitiale), [classificationInitiale]);
  const [recherche, setRecherche] = useState('');
  const [onglet, setOnglet] = useState<Onglet>('tous');
  const [commandeOuverte, setCommandeOuverte] = useState<CommandeShopify | null>(null);
  const [regles, setRegles] = useState<RegleLivraison[]>([]);
  const [reglesOuvertes, setReglesOuvertes] = useState(false);
  const [codesOuverts, setCodesOuverts] = useState(false);
  const [impressionMasseOuverte, setImpressionMasseOuverte] = useState(false);
  const [expeditions, setExpeditions] = useState<Map<number, ExpeditionSendcloud>>(new Map(expeditionsInitiales));
  const [rafraichissementEnCours, setRafraichissementEnCours] = useState(false);
  const [expediteur, setExpediteur] = useState<Expediteur | null>(null);
  // Cf. retour utilisateur du 2026-09-05 : "je veux même pas qu'elle descende dans le hub tant
  // qu'elles sont suspendu" — une commande "Shipped by Seller" suspendue côté Shopify (ON_HOLD) ne
  // doit même pas apparaître dans la liste tant que ce n'est pas levé, pas seulement être bloquée à
  // la création. Vérifié uniquement pour les commandes "pas encore créée"/"partielle" (une poignée
  // à la fois, jamais les 300+ de la liste complète — cf. lib/shopify.ts commandesEnSuspens).
  const [idsEnSuspens, setIdsEnSuspens] = useState<Set<number>>(new Set());

  useEffect(() => {
    setRegles(chargerReglesLivraison());
    setExpediteur(chargerExpediteur());
  }, []);

  useEffect(() => {
    let annule = false;
    const aVerifier = commandesInitiales.filter((cmd) => cmd.statutExpedition === 'a_creer' || cmd.statutExpedition === 'partielle');
    verifierCommandesEnSuspens(aVerifier.map((cmd) => cmd.id))
      .then((ids) => {
        if (!annule) setIdsEnSuspens(new Set(ids));
      })
      .catch(() => {
        if (!annule) setIdsEnSuspens(new Set());
      });
    return () => {
      annule = true;
    };
  }, [commandesInitiales]);

  const commandesVisibles = useMemo(
    () => commandesInitiales.filter((cmd) => !idsEnSuspens.has(cmd.id)),
    [commandesInitiales, idsEnSuspens],
  );

  /** Statut affiché en tenant compte du suivi Sendcloud (cf. discussion 2026-08-29) — Shopify ne
   * remonte jamais "livrée" pour ces envois (constaté sur #26382 avec Boxtal, même limitation côté
   * Sendcloud), donc on force ce statut si Sendcloud l'a confirmé, même si Shopify affiche encore
   * "expédiée". Ne s'applique qu'aux étiquettes créées depuis cet outil. */
  const statutAffiche = (cmd: CommandeShopify): StatutExpeditionCommande => {
    if (expeditions.get(cmd.id)?.statutSuivi === 'DELIVERED') return 'livree';
    return cmd.statutExpedition;
  };

  const verifierLivraisons = async () => {
    setRafraichissementEnCours(true);
    try {
      const resultat = await rafraichirSuivisLivraison();
      setExpeditions(new Map(resultat));
    } finally {
      setRafraichissementEnCours(false);
    }
  };

  const compteurs = useMemo(() => {
    const c: Partial<Record<StatutExpeditionCommande, number>> = {};
    for (const cmd of commandesVisibles) {
      const s = statutAffiche(cmd);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [commandesVisibles, expeditions]);

  const commandesFiltrees = useMemo(() => {
    const r = recherche.trim().toLowerCase();
    return commandesVisibles.filter((cmd) => {
      if (onglet !== 'tous' && statutAffiche(cmd) !== onglet) return false;
      if (r && !`${cmd.nom} ${cmd.client} ${cmd.email ?? ''}`.toLowerCase().includes(r)) return false;
      return true;
    });
  }, [commandesVisibles, recherche, onglet, expeditions]);

  // Cf. discussion 2026-08-29 : migration Boxtal → Sendcloud, resoudreExpedition() est devenue
  // async (appel réseau en direct, plus de grille tarifaire statique locale) — chargement progressif
  // plutôt qu'un calcul synchrone, avec le cache interne de expedition-commun.ts qui évite de
  // refaire le même appel pour des commandes qui partagent règle/poids/pays.
  const [estimationsExpedition, setEstimationsExpedition] = useState<Map<number, ResultatRoutage>>(new Map());

  useEffect(() => {
    if (!expediteur) return;
    let annule = false;
    const aCalculer = commandesFiltrees.filter((cmd) => cmd.statutExpedition === 'a_creer' || cmd.statutExpedition === 'partielle');
    Promise.all(
      aCalculer.map(async (cmd) => {
        const estLeger = classification.get(cmd.id) === 'leger';
        const resultat = await resoudreExpedition(cmd, regles, poidsConnus.get(cmd.id) ?? POIDS_ESTIMATION_GRAMMES, estLeger, expediteur);
        return [cmd.id, resultat] as const;
      }),
    ).then((paires) => {
      if (annule) return;
      const map = new Map<number, ResultatRoutage>();
      for (const [id, resultat] of paires) if (resultat) map.set(id, resultat);
      setEstimationsExpedition(map);
    });
    return () => {
      annule = true;
    };
  }, [commandesFiltrees, regles, poidsConnus, classification, expediteur]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Commandes Shopify</h1>
      <p className="mb-6 text-sm text-slate-400">
        Les {commandesVisibles.length} commandes les plus récentes, en direct depuis Shopify. Ouvre une commande
        pas encore expédiée pour créer son étiquette (Sendcloud).
        {idsEnSuspens.size > 0 && (
          <span className="ml-1 text-amber-600">
            ({idsEnSuspens.size} suspendue{idsEnSuspens.size > 1 ? 's' : ''} sur Shopify, masquée{idsEnSuspens.size > 1 ? 's' : ''} ici)
          </span>
        )}
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          placeholder="Rechercher une commande, un client, un email"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="w-full max-w-xs rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm focus:border-indigo-300 focus:outline-none"
        />
        <select
          value={onglet}
          onChange={(e) => setOnglet(e.target.value as Onglet)}
          className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 shadow-sm focus:border-indigo-300 focus:outline-none"
        >
          {ONGLETS.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.label}
              {o.valeur !== 'tous' && compteurs[o.valeur] ? ` (${compteurs[o.valeur]})` : ''}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCodesOuverts(true)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
          >
            📋 Codes transporteurs
          </button>
          <button
            type="button"
            onClick={() => setReglesOuvertes(true)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
          >
            ⚙ Règles de livraison
          </button>
          <button
            type="button"
            onClick={verifierLivraisons}
            disabled={rafraichissementEnCours}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-60"
          >
            {rafraichissementEnCours ? '🔄 Vérification…' : '🔄 Vérifier les livraisons'}
          </button>
          <button
            type="button"
            onClick={() => setImpressionMasseOuverte(true)}
            className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            🖨 Créer et imprimer toutes les étiquettes
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[20px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Commande</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Paiement</th>
              <th className="px-4 py-3">Expédition</th>
              <th className="px-4 py-3">Moyen d&apos;expédition</th>
              <th className="px-4 py-3">Suivi / Transporteur le moins cher</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {commandesFiltrees.map((cmd) => {
              const fulfillment = cmd.fulfillments[cmd.fulfillments.length - 1];
              const estimation = estimationsExpedition.get(cmd.id);
              const statut = statutAffiche(cmd);
              const suiviSendcloud = expeditions.get(cmd.id);
              const barree = statut === 'annulee' || statut === 'archivee';
              return (
                <tr
                  key={cmd.id}
                  onClick={() => setCommandeOuverte(cmd)}
                  className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 ${barree ? 'opacity-50' : ''}`}
                >
                  <td className={`px-4 py-3 font-semibold text-slate-800 ${barree ? 'line-through' : ''}`}>{cmd.nom}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(cmd.creeLe)}</td>
                  <td className={`px-4 py-3 text-slate-700 ${barree ? 'line-through' : ''}`}>{cmd.client}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {cmd.statutPaiement ? (LIBELLE_PAIEMENT[cmd.statutPaiement] ?? cmd.statutPaiement) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CLASSES_STATUT[statut]}`}>
                      {LIBELLE_STATUT[statut]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{cmd.moyenExpedition ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {suiviSendcloud && suiviSendcloud.statutSuivi !== 'inconnu' && (
                      <div
                        className={`mb-0.5 text-[11px] font-semibold ${
                          suiviSendcloud.statutSuivi === 'DELIVERED' ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {LIBELLE_SUIVI_SENDCLOUD[suiviSendcloud.statutSuivi] ?? suiviSendcloud.statutSuivi}
                      </div>
                    )}
                    {fulfillment?.trackingNumber ? (
                      <a
                        href={fulfillment.trackingUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-indigo-600 hover:underline"
                      >
                        {fulfillment.trackingCompany ?? 'Suivi'} — {fulfillment.trackingNumber}
                      </a>
                    ) : estimation ? (
                      <span title="Choisi par une règle de livraison">
                        ⚙{' '}
                        {estimation.transporteur === 'laposte'
                          ? `Lettre Suivie (La Poste) — ${PRIX_LETTRE_VERTE_SUIVIE_HT.toFixed(2)} €`
                          : `${estimation.offre.transporteurNom} — ${
                              prixInconnu(estimation.offre) ? 'prix connu après création' : `${estimation.offre.prix!.value.toFixed(2)} €`
                            }`}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatPrix(cmd.totalPrix, cmd.devise)}</td>
                </tr>
              );
            })}
            {commandesFiltrees.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                  Aucune commande ne correspond.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {commandeOuverte && (
        <div className="fixed inset-0 z-20 flex justify-end bg-black/20" onClick={() => setCommandeOuverte(null)}>
          <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{commandeOuverte.nom}</h2>
              <button type="button" onClick={() => setCommandeOuverte(null)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <span
              className={`mb-4 inline-block w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${CLASSES_STATUT[statutAffiche(commandeOuverte)]}`}
            >
              {LIBELLE_STATUT[statutAffiche(commandeOuverte)]}
            </span>

            <dl className="mb-4 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-400">Date</dt>
              <dd className="text-slate-700">{formatDate(commandeOuverte.creeLe)}</dd>
              <dt className="text-slate-400">Client</dt>
              <dd className="text-slate-700">{commandeOuverte.client}</dd>
              <dt className="text-slate-400">Email</dt>
              <dd className="text-slate-700">{commandeOuverte.email ?? '—'}</dd>
              <dt className="text-slate-400">Adresse</dt>
              <dd className="text-slate-700">{commandeOuverte.adresse ?? '—'}</dd>
              <dt className="text-slate-400">Total</dt>
              <dd className="font-semibold text-slate-700">{formatPrix(commandeOuverte.totalPrix, commandeOuverte.devise)}</dd>
            </dl>

            {
              // Cf. retour utilisateur du 2026-09-05 : "quand jappuie sur tout ouvrir imprimer ca
              // fait un pdf quavec une etiquette" / "quand je clique sur la commande il faut
              // pouvoir la réimprimer" — avant, ce panneau disparaissait dès que Shopify montrait
              // la commande "Expédiée", rendant l'étiquette déjà créée irrécupérable depuis le Hub
              // (seul le numéro de suivi Shopify restait visible, pas le PDF). On l'affiche donc
              // aussi pour une commande déjà expédiée — chaque panneau (cf. `dejaExpediee` ci-
              // dessous) n'affiche alors QUE la réimpression d'une étiquette déjà enregistrée chez
              // nous, jamais le formulaire de création, pour ne jamais risquer un second envoi réel
              // sur une commande que Shopify considère déjà expédiée par un autre biais.
              (classification.get(commandeOuverte.id) === 'leger' &&
              commandeOuverte.adresseLivraison?.paysCode?.toUpperCase() === 'FR' ? (
                <PanneauExpeditionLaPoste
                  commande={commandeOuverte}
                  poidsConnuGrammes={poidsConnus.get(commandeOuverte.id)}
                  dejaExpediee={commandeOuverte.statutExpedition === 'expediee'}
                />
              ) : (
                <PanneauExpedition
                  commande={commandeOuverte}
                  poidsConnuGrammes={poidsConnus.get(commandeOuverte.id)}
                  classification={classification.get(commandeOuverte.id)}
                  dejaExpediee={commandeOuverte.statutExpedition === 'expediee'}
                />
              ))
            }

            {commandeOuverte.fulfillments.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Expédition</p>
                {commandeOuverte.fulfillments.map((f, i) => (
                  <div key={i} className="mb-1.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {f.trackingCompany ?? 'Transporteur inconnu'} — {f.trackingNumber ?? 'sans numéro'}
                    {f.trackingUrl && (
                      <a href={f.trackingUrl} target="_blank" rel="noreferrer" className="ml-2 text-indigo-600 hover:underline">
                        Suivre
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Articles</p>
              <div className="flex flex-col gap-1.5">
                {commandeOuverte.lignes.map((l, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-700">
                      {l.titre}
                      {l.variante ? ` — ${l.variante}` : ''}
                    </span>
                    <span className="font-semibold text-slate-500">×{l.quantite}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {reglesOuvertes && (
        <ReglesLivraisonPanel regles={regles} onChange={setRegles} onFermer={() => setReglesOuvertes(false)} />
      )}

      {codesOuverts && <PanneauCodesTransporteurs onFermer={() => setCodesOuverts(false)} />}

      {impressionMasseOuverte && (
        <PanneauImpressionMasse
          commandes={commandesFiltrees}
          regles={regles}
          poidsConnus={poidsConnus}
          classification={classification}
          onFermer={() => setImpressionMasseOuverte(false)}
        />
      )}
    </div>
  );
}
