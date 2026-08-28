'use client';

import { useEffect, useMemo, useState } from 'react';

import type { OptionExpedition } from '@/lib/sendcloud';
import type { ClassificationCommande } from '@/lib/classification-produits';
import type { RegleLivraison } from '@/lib/regles-livraison';
import type { CommandeShopify } from '@/lib/shopify';
import { creerEtiquette } from './actions';
import {
  adresseLivraisonVersDestinataire,
  chargerExpediteur,
  destinataireExploitable,
  DIMENSIONS_PAR_DEFAUT,
  type Expediteur,
  meilleureOffre,
  POIDS_PAR_DEFAUT_KG,
  prixInconnu,
  versSendcloudAddress,
} from './expedition-commun';

const POIDS_GRAMMES_DEFAUT = Math.round(POIDS_PAR_DEFAUT_KG * 1000);

type StatutLigne = 'attente' | 'en_cours' | 'succes' | 'echec';

interface Ligne {
  commande: CommandeShopify;
  eligible: boolean;
  raisonExclusion?: string;
  offre?: OptionExpedition & { viaRegle: boolean };
  poidsGrammes: number;
}

interface Resultat {
  statut: StatutLigne;
  message?: string;
  etiquetteUrl?: string | null;
}

function formatPrix(n: number): string {
  return `${n.toFixed(2)} €`;
}

/** Création en masse d'étiquettes Sendcloud (cf. discussion 2026-08-29 : "un bouton imprimer toutes
 * les commandes", migré de Boxtal) — RÉEL et FACTURÉ pour chaque commande éligible, une
 * confirmation unique avec le total estimé avant de lancer. Ignore silencieusement (avec raison
 * affichée) toute commande sans offre trouvée, sans règle de livraison correspondante, ou avec une
 * adresse incomplète — jamais de tentative "au hasard". Les offres sont calculées de façon
 * asynchrone (appel Sendcloud en direct, cf. expedition-commun.ts meilleureOffre) — un court
 * chargement s'affiche à l'ouverture. */
export function PanneauImpressionMasse({
  commandes,
  regles,
  poidsConnus,
  classification,
  onFermer,
}: {
  commandes: CommandeShopify[];
  regles: RegleLivraison[];
  /** Poids réel (grammes) par commande — cf. lib/poids-commandes.ts. Une commande absente utilise
   * le poids par défaut, à ne jamais laisser créer une étiquette en masse sans avoir vérifié le
   * vrai poids d'abord si le colis contient autre chose que des pins pesés. */
  poidsConnus: Map<number, number>;
  /** 'leger'/'lourd' par commande (cf. lib/classification-produits.ts) — conditionne les règles de
   * livraison réservées aux produits légers. */
  classification: Map<number, ClassificationCommande>;
  onFermer: () => void;
}) {
  const [expediteur, setExpediteur] = useState<Expediteur | null>(null);
  const [etape, setEtape] = useState<'chargement' | 'apercu' | 'confirmation' | 'traitement' | 'termine'>('chargement');
  const [resultats, setResultats] = useState<Map<number, Resultat>>(new Map());
  const [lignes, setLignes] = useState<Ligne[]>([]);

  useEffect(() => {
    setExpediteur(chargerExpediteur());
  }, []);

  useEffect(() => {
    if (!expediteur) return;
    let annule = false;
    setEtape('chargement');
    Promise.all(
      commandes
        .filter((cmd) => cmd.statutExpedition === 'a_creer' || cmd.statutExpedition === 'partielle')
        .map(async (commande): Promise<Ligne> => {
          const poidsGrammes = poidsConnus.get(commande.id) ?? POIDS_GRAMMES_DEFAUT;
          const estLeger = classification.get(commande.id) === 'leger';
          const destinataire = adresseLivraisonVersDestinataire(commande.adresseLivraison, commande.email);

          if (!destinataireExploitable(destinataire)) return { commande, eligible: false, raisonExclusion: 'adresse destinataire incomplète', poidsGrammes };

          const offre = await meilleureOffre(commande, regles, poidsGrammes, estLeger, expediteur);
          if (!offre) return { commande, eligible: false, raisonExclusion: 'aucune offre trouvée pour ce poids/cette destination', poidsGrammes };
          // Cf. discussion 2026-08-29 : en création en masse (contrairement à l'écran d'une seule
          // commande), on ne veut jamais que le "moins cher tous transporteurs confondus" serve de
          // filet de sécurité — seule une commande dont le mode de livraison matche une règle de
          // livraison peut être créée automatiquement ici.
          if (!offre.viaRegle) return { commande, eligible: false, raisonExclusion: 'aucune règle de livraison ne correspond', poidsGrammes };
          // Point relais : le point exact doit être vérifié à la main (cf. PanneauExpedition.tsx),
          // jamais deviné en masse — même si Sendcloud connaît parfois déjà le choix du client, on
          // préfère la vérification individuelle ici (montant réel engagé, création irréversible).
          if (offre.pointRelaisRequis) return { commande, eligible: false, raisonExclusion: 'point relais — sélection manuelle du point requise', poidsGrammes };

          return { commande, eligible: true, offre, poidsGrammes };
        }),
    ).then((r) => {
      if (annule) return;
      setLignes(r);
      setEtape('apercu');
    });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expediteur, commandes, regles, poidsConnus, classification]);

  const eligibles = lignes.filter((l) => l.eligible);
  const exclues = lignes.filter((l) => !l.eligible);
  const eligiblesAvecPrix = eligibles.filter((l) => !prixInconnu(l.offre!));
  const eligiblesSansPrix = eligibles.filter((l) => prixInconnu(l.offre!));
  const totalEstime = eligiblesAvecPrix.reduce((s, l) => s + (l.offre!.prix?.value ?? 0), 0);

  const expediteurPret = expediteur && destinataireExploitable(expediteur);

  const lancer = async () => {
    if (!expediteur) return;
    setEtape('traitement');
    for (const ligne of eligibles) {
      setResultats((prev) => new Map(prev).set(ligne.commande.id, { statut: 'en_cours' }));
      try {
        const destinataire = adresseLivraisonVersDestinataire(ligne.commande.adresseLivraison, ligne.commande.email);
        const { etiquetteUrl } = await creerEtiquette({
          shippingOptionCode: ligne.offre!.code,
          fromAddress: versSendcloudAddress(expediteur),
          toAddress: versSendcloudAddress(destinataire),
          poidsKg: ligne.poidsGrammes / 1000,
          dimensionsCm: DIMENSIONS_PAR_DEFAUT,
          totalCommande: { value: Number(ligne.commande.totalPrix) || 1, devise: ligne.commande.devise },
          commandeShopifyId: ligne.commande.id,
          commandeNom: ligne.commande.nom,
        });
        setResultats((prev) => new Map(prev).set(ligne.commande.id, { statut: 'succes', etiquetteUrl }));
      } catch (e) {
        setResultats((prev) =>
          new Map(prev).set(ligne.commande.id, {
            statut: 'echec',
            message: e instanceof Error ? e.message : 'Échec.',
          }),
        );
      }
    }
    setEtape('termine');
  };

  const toutOuvrir = () => {
    for (const [, r] of resultats) {
      if (r.statut === 'succes' && r.etiquetteUrl) window.open(r.etiquetteUrl, '_blank');
    }
  };

  const nbSucces = [...resultats.values()].filter((r) => r.statut === 'succes').length;
  const nbEchecs = [...resultats.values()].filter((r) => r.statut === 'echec').length;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={etape === 'apercu' ? onFermer : undefined}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Créer et imprimer les étiquettes</h2>
          {etape !== 'traitement' && (
            <button type="button" onClick={onFermer} className="text-slate-400 hover:text-slate-700">
              ✕
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!expediteur ? (
            <p className="text-sm text-slate-400">Chargement…</p>
          ) : !expediteurPret ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Renseigne d&apos;abord ton adresse expéditeur : ouvre n&apos;importe quelle commande pas encore
              expédiée, remplis la section &quot;Expéditeur&quot; du panneau, puis reviens ici.
            </p>
          ) : etape === 'chargement' ? (
            <p className="text-sm text-slate-400">Calcul des offres pour chaque commande…</p>
          ) : (
            <>
              <p className="mb-3 text-xs font-semibold text-amber-700">
                Compte de production — chaque commande ci-dessous sera réellement expédiée et facturée par Sendcloud.
                Poids calculé depuis les articles pesés en stock quand c&apos;est possible, sinon poids par défaut
                ({POIDS_PAR_DEFAUT_KG} kg) — vérifie les commandes marquées &quot;poids par défaut&quot; ci-dessous
                avant de lancer. Dimensions toujours par défaut ({DIMENSIONS_PAR_DEFAUT.longueur}×
                {DIMENSIONS_PAR_DEFAUT.largeur}×{DIMENSIONS_PAR_DEFAUT.hauteur} cm). Seules les commandes dont le
                mode de livraison correspond à une règle de livraison sont proposées ici. Les commandes en point
                relais sont exclues d&apos;ici (vérification du point requise) — crée-les une par une depuis la
                commande.
              </p>

              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {eligibles.length} commande{eligibles.length > 1 ? 's' : ''} prête{eligibles.length > 1 ? 's' : ''} — total
                estimé {formatPrix(totalEstime)}
                {eligiblesSansPrix.length > 0 &&
                  ` (+ ${eligiblesSansPrix.length} commande${eligiblesSansPrix.length > 1 ? 's' : ''} à prix inconnu avant création)`}
              </p>
              <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                {eligibles.map((l) => {
                  const r = resultats.get(l.commande.id);
                  return (
                    <div
                      key={l.commande.id}
                      className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-0"
                    >
                      <span className="text-slate-700">
                        {l.commande.nom} — {l.commande.client}
                        <span className="ml-1.5 text-xs text-slate-400">
                          (⚙ {l.offre!.transporteurNom} — {l.offre!.nom}, {(l.poidsGrammes / 1000).toFixed(3)} kg
                          {!poidsConnus.has(l.commande.id) && (
                            <span className="text-amber-600" title="Poids par défaut — au moins un article sans poids pesé en stock">
                              {' '}
                              (défaut)
                            </span>
                          )}
                          )
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-slate-600">
                          {prixInconnu(l.offre!) ? 'prix après création' : formatPrix(l.offre!.prix!.value)}
                        </span>
                        {r?.statut === 'en_cours' && <span className="text-xs text-slate-400">…</span>}
                        {r?.statut === 'succes' &&
                          (r.etiquetteUrl ? (
                            <a
                              href={r.etiquetteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-emerald-600 hover:underline"
                            >
                              Ouvrir
                            </a>
                          ) : (
                            <span className="text-xs font-semibold text-emerald-600">Créée</span>
                          ))}
                        {r?.statut === 'echec' && (
                          <span className="text-xs font-semibold text-red-600" title={r.message}>
                            Échec
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
                {eligibles.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">Aucune commande éligible.</p>}
              </div>

              {exclues.length > 0 && (
                <details className="mb-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-400">
                    {exclues.length} commande{exclues.length > 1 ? 's' : ''} ignorée{exclues.length > 1 ? 's' : ''}
                  </summary>
                  <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50">
                    {exclues.map((l) => (
                      <div key={l.commande.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-slate-600">
                          {l.commande.nom} — {l.commande.client}
                        </span>
                        <span className="text-red-500">{l.raisonExclusion}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {etape === 'termine' && (
                <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-700">
                    {nbSucces} créée{nbSucces > 1 ? 's' : ''}
                    {nbEchecs > 0 && `, ${nbEchecs} échec${nbEchecs > 1 ? 's' : ''}`}
                  </p>
                  {nbSucces > 0 && (
                    <button
                      type="button"
                      onClick={toutOuvrir}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      Tout ouvrir / imprimer
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {expediteurPret && etape !== 'termine' && etape !== 'chargement' && (
          <div className="border-t border-slate-100 px-6 py-4">
            {etape === 'confirmation' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={lancer}
                  disabled={eligibles.length === 0}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  Confirmer — {formatPrix(totalEstime)} facturés
                  {eligiblesSansPrix.length > 0 && ` (+ ${eligiblesSansPrix.length} commande${eligiblesSansPrix.length > 1 ? 's' : ''})`}
                </button>
                <button
                  type="button"
                  onClick={() => setEtape('apercu')}
                  className="text-sm font-semibold text-slate-500 hover:underline"
                >
                  Annuler
                </button>
              </div>
            ) : etape === 'traitement' ? (
              <p className="text-sm font-semibold text-slate-500">Création en cours… ne ferme pas cette fenêtre.</p>
            ) : (
              <button
                type="button"
                onClick={() => setEtape('confirmation')}
                disabled={eligibles.length === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                Créer les {eligibles.length} étiquette{eligibles.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
