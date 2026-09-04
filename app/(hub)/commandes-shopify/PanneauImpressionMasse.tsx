'use client';

import { useEffect, useMemo, useState } from 'react';

import { PRIX_LETTRE_VERTE_SUIVIE_HT } from '@/lib/laposte';
import type { OptionExpedition } from '@/lib/sendcloud';
import type { ClassificationCommande } from '@/lib/classification-produits';
import type { RegleLivraison } from '@/lib/regles-livraison';
import type { CommandeShopify } from '@/lib/shopify';
import {
  chargerDetailPointRelais,
  chargerPointEtCarrierConnu,
  creerEtiquette,
  creerEtiquetteLaPoste,
  verifierCommandesEnSuspens,
} from './actions';
import {
  adresseLivraisonVersDestinataire,
  base64VersBlobUrl,
  chargerExpediteur,
  destinataireExploitable,
  DIMENSIONS_PAR_DEFAUT,
  type Expediteur,
  POIDS_PAR_DEFAUT_KG,
  prixInconnu,
  resoudreExpedition,
  versAdresseLaPoste,
  versSendcloudAddress,
} from './expedition-commun';

const POIDS_GRAMMES_DEFAUT = Math.round(POIDS_PAR_DEFAUT_KG * 1000);

type StatutLigne = 'attente' | 'en_cours' | 'succes' | 'echec';
type Methode = 'laposte' | 'sendcloud';

interface Ligne {
  commande: CommandeShopify;
  eligible: boolean;
  raisonExclusion?: string;
  methode?: Methode;
  /** Sendcloud uniquement — La Poste n'a pas d'offre à comparer, juste le tarif contractuel fixe. */
  offre?: OptionExpedition;
  /** Point relais déjà connu par Sendcloud pour cette commande (choix réel du client au checkout,
   * cf. retour utilisateur du 2026-09-05 : "le point de retrait il est deja choisi") — permet de
   * créer l'étiquette en masse sans vérification manuelle quand ce n'est pas un point deviné/auto-
   * assigné (cf. lib/sendcloud.ts PointEtCarrierConnu.autoAssigne). */
  pointRelaisId?: number;
  pointRelaisNom?: string;
  poidsGrammes: number;
}

/** Libellé du groupe dans le récapitulatif — "Lettre Suivie" pour La Poste, le nom du transporteur
 * Sendcloud sinon (ex. "Mondial Relay") : reflète ce qui a réellement matché la règle de livraison,
 * pas un libellé générique "Sendcloud". */
function libelleGroupe(l: Ligne): string {
  return l.methode === 'laposte' ? 'Lettre Suivie (La Poste)' : (l.offre?.transporteurNom ?? 'Sendcloud');
}

/** Prix estimé d'une ligne éligible — tarif fixe pour La Poste (pas de devis en direct côté API,
 * cf. lib/laposte.ts), prix Sendcloud sinon (peut être inconnu avant création, cf. prixInconnu). */
function prixLigne(l: Ligne): number | null {
  if (l.methode === 'laposte') return PRIX_LETTRE_VERTE_SUIVIE_HT;
  if (!l.offre || prixInconnu(l.offre)) return null;
  return l.offre.prix!.value;
}

interface Resultat {
  statut: StatutLigne;
  message?: string;
  etiquetteUrl?: string | null;
}

function formatPrix(n: number): string {
  return `${n.toFixed(2)} €`;
}

/** Création en masse d'étiquettes (cf. discussion 2026-08-29 : "un bouton imprimer toutes les
 * commandes", migré de Boxtal) — RÉEL et FACTURÉ pour chaque commande éligible, une confirmation
 * unique avec le total estimé avant de lancer. Routage 100% piloté par les règles de livraison (cf.
 * retour utilisateur du 2026-09-05, lib/regles-livraison.ts) : chaque commande doit correspondre
 * EXACTEMENT (mode de livraison Shopify, poids, destination) à une règle qui dit La Poste ou
 * Sendcloud+code — sans correspondance exacte, exclue avec la raison affichée, jamais de tentative
 * "au hasard" ni de repli implicite. */
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
  const [pdfFusionUrl, setPdfFusionUrl] = useState<string | null>(null);
  const [fusionEnCours, setFusionEnCours] = useState(false);
  const [fusionErreur, setFusionErreur] = useState<string | null>(null);

  useEffect(() => {
    setExpediteur(chargerExpediteur());
  }, []);

  useEffect(() => {
    if (!expediteur) return;
    let annule = false;
    setEtape('chargement');
    const aVerifier = commandes.filter((cmd) => cmd.statutExpedition === 'a_creer' || cmd.statutExpedition === 'partielle');

    (async () => {
      // Cf. retour utilisateur du 2026-09-05 : des commandes "Shipped by Seller" arrivent parfois
      // suspendues côté Shopify (ON_HOLD) — invisible depuis le statut REST utilisé pour la liste
      // (fulfillment_status vaut null aussi bien pour "pas encore créée" que "suspendue"), donc
      // vérifié à part ici avant de proposer quoi que ce soit en création. Jamais tentée en masse
      // tant que ce n'est pas confirmé, quel que soit le nombre de commandes candidates.
      const enSuspens = await verifierCommandesEnSuspens(aVerifier.map((c) => c.id))
        .then((ids) => new Set(ids))
        .catch(() => new Set<number>());

      const r = await Promise.all(
        aVerifier.map(async (commande): Promise<Ligne> => {
          const poidsGrammes = poidsConnus.get(commande.id) ?? POIDS_GRAMMES_DEFAUT;
          const estLeger = classification.get(commande.id) === 'leger';
          const destinataire = adresseLivraisonVersDestinataire(commande.adresseLivraison, commande.email);

          if (enSuspens.has(commande.id)) {
            return {
              commande,
              eligible: false,
              raisonExclusion: "commande suspendue sur Shopify — ne pas expédier tant que le blocage n'est pas levé",
              poidsGrammes,
            };
          }

          if (!destinataireExploitable(destinataire)) return { commande, eligible: false, raisonExclusion: 'adresse destinataire incomplète', poidsGrammes };

          // Cf. retour utilisateur du 2026-09-05 : matching EXACT (mode de livraison, poids,
          // destination) uniquement, plus aucun repli implicite — cf. expedition-commun.ts
          // resoudreExpedition. Sans règle exacte pour cette combinaison, la commande est exclue,
          // point final : ni "léger + France → La Poste par défaut", ni "moins cher tous
          // transporteurs confondus".
          const resultat = await resoudreExpedition(commande, regles, poidsGrammes, estLeger, expediteur);
          if (!resultat) {
            return { commande, eligible: false, raisonExclusion: 'aucune règle ne correspond exactement (mode de livraison, poids, destination)', poidsGrammes };
          }
          if (resultat.transporteur === 'laposte') {
            return { commande, eligible: true, methode: 'laposte', poidsGrammes };
          }

          const offre = resultat.offre;
          // Point relais : Sendcloud connaît déjà le point choisi par le client à son propre
          // sélecteur post-achat (cf. lib/sendcloud.ts recupererPointEtCarrierCommande, retour
          // utilisateur du 2026-09-05 : "le point de retrait il est deja choisi") — on ne le
          // redemande/devine jamais, mais s'il est confirmé (pas juste auto-assigné par Sendcloud
          // faute de choix réel, cf. PointEtCarrierConnu.autoAssigne) on peut créer directement avec
          // ce point ici plutôt que forcer une vérification manuelle commande par commande.
          if (offre.pointRelaisRequis) {
            const connu = await chargerPointEtCarrierConnu(commande.nom).catch(() => null);
            if (!connu?.pointRelaisId || connu.autoAssigne) {
              const raison = connu?.autoAssigne
                ? 'point relais auto-assigné par Sendcloud (pas un choix confirmé du client) — vérification manuelle requise'
                : 'point relais — sélection manuelle du point requise';
              return { commande, eligible: false, raisonExclusion: raison, poidsGrammes };
            }
            const pointRelaisNom = await chargerDetailPointRelais(connu.pointRelaisId)
              .then((p) => p.nom)
              .catch(() => undefined);
            return { commande, eligible: true, methode: 'sendcloud', offre, pointRelaisId: connu.pointRelaisId, pointRelaisNom, poidsGrammes };
          }
          return { commande, eligible: true, methode: 'sendcloud', offre, poidsGrammes };
        }),
      );

      if (annule) return;
      setLignes(r);
      setEtape('apercu');
    })();

    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expediteur, commandes, regles, poidsConnus, classification]);

  const eligibles = lignes.filter((l) => l.eligible);
  const exclues = lignes.filter((l) => !l.eligible);
  const totalEstime = eligibles.reduce((s, l) => s + (prixLigne(l) ?? 0), 0);
  const eligiblesSansPrix = eligibles.filter((l) => prixLigne(l) === null);

  // Récapitulatif par méthode (retour utilisateur du 2026-09-04 : "X lettre suivi X mondial
  // relay avec le prix estimé à côté") — groupé par transporteur réel, pas juste
  // La Poste/Sendcloud : deux règles de livraison Sendcloud différentes peuvent matcher des
  // transporteurs différents, chacun mérite sa propre ligne plutôt qu'un total "Sendcloud" flou.
  const recapParGroupe = useMemo(() => {
    const parGroupe = new Map<string, { lignes: Ligne[]; total: number; sansPrix: number }>();
    for (const l of eligibles) {
      const cle = libelleGroupe(l);
      const groupe = parGroupe.get(cle) ?? { lignes: [], total: 0, sansPrix: 0 };
      groupe.lignes.push(l);
      const prix = prixLigne(l);
      if (prix === null) groupe.sansPrix += 1;
      else groupe.total += prix;
      parGroupe.set(cle, groupe);
    }
    return [...parGroupe.entries()].sort(([, a], [, b]) => b.lignes.length - a.lignes.length);
  }, [eligibles]);

  const expediteurPret = expediteur && destinataireExploitable(expediteur);

  const lancer = async () => {
    if (!expediteur) return;
    setEtape('traitement');
    for (const ligne of eligibles) {
      setResultats((prev) => new Map(prev).set(ligne.commande.id, { statut: 'en_cours' }));
      try {
        const destinataire = adresseLivraisonVersDestinataire(ligne.commande.adresseLivraison, ligne.commande.email);
        let etiquetteUrl: string | null;
        let fulfillmentShopifyId: string | null;
        if (ligne.methode === 'laposte') {
          const expedition = await creerEtiquetteLaPoste({
            produit: 'K7',
            poidsGrammes: ligne.poidsGrammes,
            expediteur: versAdresseLaPoste(expediteur),
            destinataire: versAdresseLaPoste(destinataire),
            commandeShopifyId: ligne.commande.id,
            commandeNom: ligne.commande.nom,
          });
          etiquetteUrl = base64VersBlobUrl(expedition.visualOutputBase64, 'application/pdf');
          fulfillmentShopifyId = expedition.fulfillmentShopifyId;
        } else {
          const resultat = await creerEtiquette({
            shippingOptionCode: ligne.offre!.code,
            fromAddress: versSendcloudAddress(expediteur),
            toAddress: versSendcloudAddress(destinataire),
            poidsKg: ligne.poidsGrammes / 1000,
            dimensionsCm: DIMENSIONS_PAR_DEFAUT,
            totalCommande: { value: Number(ligne.commande.totalPrix) || 1, devise: ligne.commande.devise },
            commandeShopifyId: ligne.commande.id,
            commandeNom: ligne.commande.nom,
            pointRelaisId: ligne.pointRelaisId,
          });
          etiquetteUrl = resultat.etiquetteUrl;
          fulfillmentShopifyId = resultat.fulfillmentShopifyId;
        }
        // Cf. retour utilisateur du 2026-09-05 (commande #27024) — l'étiquette peut réussir
        // (facturée) alors que la synchro Shopify échoue silencieusement côté serveur : sans ce
        // message la commande reste "à créer" sans explication, avec le risque de la recréer par
        // erreur au prochain passage dans ce panneau.
        const messageAverti =
          fulfillmentShopifyId === null
            ? "⚠ créée et facturée mais synchro Shopify échouée — la commande va rester \"à créer\", ne pas recréer"
            : undefined;
        setResultats((prev) => new Map(prev).set(ligne.commande.id, { statut: 'succes', etiquetteUrl, message: messageAverti }));
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

  // Cf. retour utilisateur du 2026-09-05 : "quand jappuie sur tout ouvrir imprimer ca fait un pdf
  // quavec une etiquette et pas les 20" — appeler window.open() en boucle (une fois par étiquette)
  // se heurte au bloqueur de popups du navigateur, qui n'autorise qu'un seul window.open() par
  // clic ; tous les suivants sont silencieusement bloqués, d'où l'impression qu'une seule étiquette
  // a été ouverte. Remplacé par une fusion de toutes les étiquettes réussies en UN SEUL PDF
  // (pdf-lib, même lib que pour le recadrage Chronopost) ouvert via un unique lien <a> — jamais
  // bloqué, contrairement à window.open().
  useEffect(() => {
    if (etape !== 'termine') {
      setPdfFusionUrl(null);
      setFusionErreur(null);
      return;
    }
    const urls = [...resultats.values()].filter((r) => r.statut === 'succes' && r.etiquetteUrl).map((r) => r.etiquetteUrl!);
    if (urls.length === 0) return;
    let annule = false;
    setFusionEnCours(true);
    setFusionErreur(null);
    (async () => {
      const { PDFDocument } = await import('pdf-lib');
      const fusion = await PDFDocument.create();
      for (const url of urls) {
        const octets = await fetch(url).then((r) => r.arrayBuffer());
        const doc = await PDFDocument.load(octets);
        const pages = await fusion.copyPages(doc, doc.getPageIndices());
        for (const p of pages) fusion.addPage(p);
      }
      const octetsFusion = await fusion.save();
      return URL.createObjectURL(new Blob([octetsFusion.buffer as ArrayBuffer], { type: 'application/pdf' }));
    })()
      .then((url) => {
        if (!annule) setPdfFusionUrl(url);
      })
      .catch((e) => {
        if (!annule) setFusionErreur(e instanceof Error ? e.message : 'Échec de la fusion des étiquettes.');
      })
      .finally(() => {
        if (!annule) setFusionEnCours(false);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape]);

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
                Compte de production — chaque commande ci-dessous sera réellement expédiée et facturée (La Poste
                pour les produits légers, Sendcloud sinon). Poids calculé depuis les articles pesés en stock quand
                c&apos;est possible, sinon poids par défaut ({POIDS_PAR_DEFAUT_KG} kg) — vérifie les commandes
                marquées &quot;poids par défaut&quot; ci-dessous avant de lancer. Dimensions Sendcloud toujours par
                défaut ({DIMENSIONS_PAR_DEFAUT.longueur}×{DIMENSIONS_PAR_DEFAUT.largeur}×{DIMENSIONS_PAR_DEFAUT.hauteur} cm).
                Pour les commandes lourdes, seules celles dont le mode de livraison correspond à une règle de
                livraison sont proposées ici, et les points relais sont exclus (vérification du point requise) —
                crée-les une par une depuis la commande.
              </p>

              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {eligibles.length} commande{eligibles.length > 1 ? 's' : ''} prête{eligibles.length > 1 ? 's' : ''} — total
                estimé {formatPrix(totalEstime)}
                {eligiblesSansPrix.length > 0 &&
                  ` (+ ${eligiblesSansPrix.length} commande${eligiblesSansPrix.length > 1 ? 's' : ''} à prix inconnu avant création)`}
              </p>

              {/* Récapitulatif par transporteur (retour utilisateur du 2026-09-04) — ex. "12 Lettre
                  Suivie (La Poste) — 21,60 €" / "5 Mondial Relay — 34,50 €". */}
              {recapParGroupe.length > 0 && (
                <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  {recapParGroupe.map(([libelle, g]) => (
                    <div key={libelle} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">
                        {g.lignes.length} {libelle}
                      </span>
                      <span className="font-semibold text-slate-700">
                        {formatPrix(g.total)}
                        {g.sansPrix > 0 && ` (+ ${g.sansPrix} prix inconnu)`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                {eligibles.map((l) => {
                  const r = resultats.get(l.commande.id);
                  const prix = prixLigne(l);
                  return (
                    <div
                      key={l.commande.id}
                      className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-0"
                    >
                      <span className="text-slate-700">
                        {l.commande.nom} — {l.commande.client}
                        <span className="ml-1.5 text-xs text-slate-400">
                          (⚙ {libelleGroupe(l)}
                          {l.offre ? ` — ${l.offre.nom}` : ''}
                          {l.pointRelaisNom ? ` → ${l.pointRelaisNom}` : ''}, {(l.poidsGrammes / 1000).toFixed(3)} kg
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
                        <span className="font-semibold text-slate-600">{prix === null ? 'prix après création' : formatPrix(prix)}</span>
                        {r?.statut === 'en_cours' && <span className="text-xs text-slate-400">…</span>}
                        {r?.statut === 'succes' && (
                          <>
                            {r.etiquetteUrl ? (
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
                            )}
                            {r.message && (
                              <span className="text-xs font-semibold text-amber-600" title={r.message}>
                                ⚠
                              </span>
                            )}
                          </>
                        )}
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
                  {nbSucces > 0 &&
                    (fusionEnCours ? (
                      <span className="text-xs font-semibold text-slate-400">Préparation du PDF…</span>
                    ) : fusionErreur ? (
                      <span className="text-xs font-semibold text-red-600" title={fusionErreur}>
                        Échec de la fusion — ouvre les étiquettes une par une ci-dessus
                      </span>
                    ) : pdfFusionUrl ? (
                      <a
                        href={pdfFusionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        Ouvrir le PDF ({nbSucces} étiquette{nbSucces > 1 ? 's' : ''})
                      </a>
                    ) : null)}
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
