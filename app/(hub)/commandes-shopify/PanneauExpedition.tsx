'use client';

import { useEffect, useState } from 'react';

import type { ExpeditionSendcloud } from '@/lib/expeditions-sendcloud';
import type { OptionExpedition, PointRelais } from '@/lib/sendcloud';
import type { ClassificationCommande } from '@/lib/classification-produits';
import type { CommandeShopify } from '@/lib/shopify';
import {
  annulerEtiquette,
  chargerDetailPointRelais,
  chargerEtiquetteExistante,
  chargerOptionsExpedition,
  chargerPointEtCarrierConnu,
  chargerPointsRelais,
  creerEtiquette,
  verifierExpeditionExistante,
} from './actions';
import {
  adresseLivraisonVersDestinataire,
  chargerExpediteur,
  CLE_EXPEDITEUR,
  EXPEDITEUR_VIDE,
  type Expediteur,
  versSendcloudAddress,
} from './expedition-commun';

function champ(
  label: string,
  valeur: string,
  onChange: (v: string) => void,
  options?: { placeholder?: string; className?: string },
) {
  return (
    <label className={`block ${options?.className ?? ''}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={options?.placeholder}
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-indigo-300 focus:bg-white focus:outline-none"
      />
    </label>
  );
}

/** Création d'étiquette d'expédition via Sendcloud (cf. discussion 2026-08-29 : migration Boxtal →
 * Sendcloud) — RÉEL et FACTURÉ dès le clic sur "Créer l'étiquette (payant)", pas de mode test
 * disponible avec ce compte. Contrairement à Boxtal, le prix est connu EN DIRECT avant création
 * (calculate_quotes) et, pour un envoi en point relais, le point choisi par le client est
 * généralement déjà connu (capté par le propre sélecteur post-achat de Sendcloud) — plus besoin de
 * deviner "le plus proche". L'adresse expéditeur est mémorisée dans ce navigateur (localStorage)
 * pour ne pas la ressaisir à chaque commande. */
export function PanneauExpedition({
  commande,
  poidsConnuGrammes,
  classification,
}: {
  commande: CommandeShopify;
  /** Poids réel de la commande (grammes), résolu depuis stock_pins.poids_unitaire (cf.
   * lib/poids-commandes.ts) — undefined si inconnu (au moins un article sans poids pesé en base),
   * auquel cas on part du poids par défaut, modifiable à la main avant de créer l'étiquette. */
  poidsConnuGrammes?: number;
  /** 'leger'/'lourd' selon les profils d'expédition Shopify (cf. lib/classification-produits.ts) —
   * undefined si la commande n'a pas pu être classée. */
  classification?: ClassificationCommande;
}) {
  const [expediteur, setExpediteur] = useState<Expediteur>(EXPEDITEUR_VIDE);
  const [destinataire, setDestinataire] = useState<Expediteur>(() =>
    adresseLivraisonVersDestinataire(commande.adresseLivraison, commande.email),
  );
  const [poids, setPoids] = useState(String(poidsConnuGrammes ? poidsConnuGrammes / 1000 : 0.2));
  const [longueur, setLongueur] = useState('20');
  const [largeur, setLargeur] = useState('15');
  const [hauteur, setHauteur] = useState('5');
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ id: string; etiquetteUrl: string | null } | null>(null);
  // undefined = chargement, tableau = offres triées moins cher en premier (vide = aucune trouvée).
  const [options, setOptions] = useState<OptionExpedition[] | undefined>(undefined);
  const [optionChoisie, setOptionChoisie] = useState<OptionExpedition | null>(null);
  const [pointsRelais, setPointsRelais] = useState<PointRelais[] | null>(null);
  const [chargementPoints, setChargementPoints] = useState(false);
  const [pointRelaisChoisi, setPointRelaisChoisi] = useState<PointRelais | null>(null);
  // 'client' = déjà connu par Sendcloud (capté au checkout/post-achat du client, fiable),
  // 'auto_assigne' = Sendcloud a rempli un point tout seul faute de sélection réelle (tag order
  // "Service Point Auto-Assigned", cf. discussion 2026-08-29 : vérifié en comparant aux vraies
  // commandes clients, qui n'ont jamais ce tag) — à vérifier comme un point deviné, pas un choix
  // confirmé. 'manuel' = choisi à la main dans la liste ci-dessous.
  const [pointRelaisConfiance, setPointRelaisConfiance] = useState<'client' | 'auto_assigne' | 'manuel' | null>(null);
  // undefined = chargement, null = rien connu par Sendcloud pour cette commande (livraison à
  // domicile, ou client pas encore passé par le sélecteur post-achat).
  const [connuSendcloud, setConnuSendcloud] = useState<{ pointRelaisId: number | null; autoAssigne: boolean } | null | undefined>(undefined);
  // undefined = vérification en cours (cf. incident #26586 avec Boxtal) — tant que c'est undefined,
  // le formulaire de création reste caché.
  const [verificationExpedition, setVerificationExpedition] = useState<ExpeditionSendcloud | null | undefined>(undefined);

  useEffect(() => {
    setExpediteur(chargerExpediteur());
    chargerPointEtCarrierConnu(commande.nom)
      .then(setConnuSendcloud)
      .catch(() => setConnuSendcloud(null));
    verifierExpeditionExistante(commande.id)
      .then((existante) => {
        setVerificationExpedition(existante ?? null);
        if (existante) {
          setResultat({ id: existante.sendcloudShipmentId, etiquetteUrl: null });
          chargerEtiquetteExistante(existante.sendcloudShipmentId)
            .then((url) => setResultat((r) => (r ? { ...r, etiquetteUrl: url } : r)))
            .catch(() => {});
        }
      })
      .catch(() => setVerificationExpedition(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Options d'expédition en direct (prix inclus) — dépend du poids et des deux adresses.
  useEffect(() => {
    const poidsKg = Number(poids);
    if (!destinataire.paysCode || !destinataire.ville || !destinataire.codePostal || !expediteur.adresse1 || !poidsKg) {
      setOptions(undefined);
      return;
    }
    let annule = false;
    setOptions(undefined);
    chargerOptionsExpedition({
      fromAddress: versSendcloudAddress(expediteur),
      toAddress: versSendcloudAddress(destinataire),
      poidsKg,
    })
      .then((r) => {
        if (annule) return;
        const triees = [...r].sort((a, b) => (a.prix?.value ?? Infinity) - (b.prix?.value ?? Infinity));
        setOptions(triees);
        // Cf. discussion 2026-08-29 : pas de shipping_option_code disponible depuis l'endpoint
        // /orders de Sendcloud (contrairement à ce que la doc suggérait) — seul le point relais est
        // connu à l'avance, pas l'offre exacte. Si le point relais du client est déjà connu,
        // présélectionne au moins la première offre EN point relais (plus pertinent que "le moins
        // cher tous types confondus" par défaut) ; l'utilisateur choisit l'offre précise ensuite.
        if (connuSendcloud?.pointRelaisId) {
          const enPointRelais = triees.find((o) => o.pointRelaisRequis);
          if (enPointRelais) setOptionChoisie(enPointRelais);
        }
      })
      .catch((e) => {
        if (!annule) setErreur(e instanceof Error ? e.message : 'Chargement des offres échoué.');
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poids, expediteur.adresse1, expediteur.ville, expediteur.codePostal, expediteur.paysCode, destinataire.adresse1, destinataire.ville, destinataire.codePostal, destinataire.paysCode, connuSendcloud]);

  // Point relais : si Sendcloud connaît déjà celui choisi par le client (capté au checkout), on le
  // relit directement par son id (fiable, pas de recherche/correspondance à faire) — sauf si c'est
  // un point auto-assigné par Sendcloud (cf. autoAssigne), auquel cas on le pré-remplit quand même
  // MAIS on cherche aussi la liste des points proches pour laisser l'utilisateur en choisir un
  // autre, comme pour une commande dont le point n'est pas du tout connu.
  useEffect(() => {
    if (!optionChoisie?.pointRelaisRequis) {
      setPointsRelais(null);
      setPointRelaisChoisi(null);
      setPointRelaisConfiance(null);
      return;
    }
    let annule = false;
    if (connuSendcloud?.pointRelaisId) {
      chargerDetailPointRelais(connuSendcloud.pointRelaisId)
        .then((p) => {
          if (annule) return;
          setPointRelaisChoisi(p);
          setPointRelaisConfiance(connuSendcloud.autoAssigne ? 'auto_assigne' : 'client');
        })
        .catch(() => {});
      if (!connuSendcloud.autoAssigne) return () => { annule = true; };
    }
    if (!destinataire.codePostal || !destinataire.ville) {
      setPointsRelais(null);
      return () => {
        annule = true;
      };
    }
    setChargementPoints(true);
    chargerPointsRelais(
      { street: destinataire.adresse1, city: destinataire.ville, postalCode: destinataire.codePostal, countryIsoCode: destinataire.paysCode.toUpperCase() },
      optionChoisie.transporteurCode,
    )
      .then((r) => {
        if (!annule) setPointsRelais(r);
      })
      .catch((e) => {
        if (!annule) setErreur(e instanceof Error ? e.message : 'Recherche des points relais échouée.');
      })
      .finally(() => {
        if (!annule) setChargementPoints(false);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionChoisie, connuSendcloud, destinataire.adresse1, destinataire.ville, destinataire.codePostal, destinataire.paysCode]);

  const modifierExpediteur = (patch: Partial<Expediteur>) => {
    const suivant = { ...expediteur, ...patch };
    setExpediteur(suivant);
    try {
      localStorage.setItem(CLE_EXPEDITEUR, JSON.stringify(suivant));
    } catch {
      /* navigation privée — tant pis, pas persisté */
    }
  };

  const lancerCreation = async () => {
    if (!optionChoisie) return;
    setEnCours(true);
    setErreur(null);
    try {
      const { envoi, etiquetteUrl } = await creerEtiquette({
        shippingOptionCode: optionChoisie.code,
        fromAddress: versSendcloudAddress(expediteur),
        toAddress: versSendcloudAddress(destinataire),
        poidsKg: Number(poids),
        dimensionsCm: { longueur: Number(longueur), largeur: Number(largeur), hauteur: Number(hauteur) },
        totalCommande: { value: Number(commande.totalPrix) || 1, devise: commande.devise },
        pointRelaisId: pointRelaisChoisi?.id,
        commandeShopifyId: commande.id,
        commandeNom: commande.nom,
      });
      setResultat({ id: envoi.id, etiquetteUrl });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de la création.');
    } finally {
      setEnCours(false);
      setConfirmer(false);
    }
  };

  const annuler = async () => {
    if (!resultat) return;
    setEnCours(true);
    try {
      await annulerEtiquette(resultat.id);
      setResultat(null);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'annulation.");
    } finally {
      setEnCours(false);
    }
  };

  if (verificationExpedition === undefined) {
    return <p className="mb-4 text-xs text-slate-400">Vérification d&apos;une expédition existante…</p>;
  }

  if (resultat) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
        <p className="mb-1 text-sm font-bold text-emerald-800">Étiquette créée — envoi {resultat.id}</p>
        {pointRelaisChoisi && (
          <p className="mb-2 text-xs text-emerald-700">
            Envoyé au point relais : <span className="font-semibold">{pointRelaisChoisi.nom}</span> — {pointRelaisChoisi.adresse}
            {pointRelaisConfiance === 'client' && <span className="ml-1 font-semibold text-emerald-800">(choisi par le client)</span>}
            {pointRelaisConfiance === 'auto_assigne' && (
              <span className="ml-1 font-semibold text-amber-700">(assigné par Sendcloud, pas confirmé par le client)</span>
            )}
          </p>
        )}
        {resultat.etiquetteUrl ? (
          <a
            href={resultat.etiquetteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Ouvrir / imprimer l&apos;étiquette
          </a>
        ) : (
          <p className="text-xs text-emerald-700">Étiquette pas encore prête côté Sendcloud — réessaie de rouvrir cette commande dans une minute.</p>
        )}
        <button
          type="button"
          onClick={annuler}
          disabled={enCours}
          className="mt-2 block text-xs font-semibold text-red-600 hover:underline disabled:opacity-60"
        >
          {enCours ? 'Annulation…' : 'Annuler cette expédition (créée par erreur)'}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Expédition (Sendcloud)
        {classification && (
          <span
            className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${
              classification === 'leger' ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-600'
            }`}
          >
            {classification === 'leger' ? 'Produit léger — lettre possible' : 'Produit lourd — colis'}
          </span>
        )}
      </p>

      <p className="mb-3 text-xs font-semibold text-amber-700">
        Compte de production — cliquer sur &quot;Créer l&apos;étiquette&quot; crée un vrai envoi, facturé immédiatement.
      </p>

      {connuSendcloud?.pointRelaisId && !connuSendcloud.autoAssigne && (
        <p className="mb-3 rounded-lg bg-sky-50 px-2.5 py-2 text-xs text-sky-800">
          Sendcloud connaît déjà le point relais choisi par le client pour cette commande — pré-sélectionné plus bas
          une fois l&apos;offre en point relais choisie, vérifie juste que ça correspond avant de confirmer.
        </p>
      )}
      {connuSendcloud?.pointRelaisId && connuSendcloud.autoAssigne && (
        <p className="mb-3 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          Le client n&apos;a pas encore choisi son point relais via le sélecteur Sendcloud — celui affiché plus bas a
          été assigné automatiquement par Sendcloud, pas confirmé, à vérifier avant de créer l&apos;étiquette.
        </p>
      )}

      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Expéditeur</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {champ('Entreprise', expediteur.entreprise, (v) => modifierExpediteur({ entreprise: v }))}
        {champ('Téléphone', expediteur.telephone, (v) => modifierExpediteur({ telephone: v }))}
        {champ('Email', expediteur.email, (v) => modifierExpediteur({ email: v }))}
        {champ('Adresse', expediteur.adresse1, (v) => modifierExpediteur({ adresse1: v }), { className: 'col-span-2' })}
        {champ('Ville', expediteur.ville, (v) => modifierExpediteur({ ville: v }))}
        {champ('Code postal', expediteur.codePostal, (v) => modifierExpediteur({ codePostal: v }))}
      </div>

      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Destinataire</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {champ('Prénom', destinataire.prenom, (v) => setDestinataire({ ...destinataire, prenom: v }))}
        {champ('Nom', destinataire.nom, (v) => setDestinataire({ ...destinataire, nom: v }))}
        {champ('Téléphone', destinataire.telephone, (v) => setDestinataire({ ...destinataire, telephone: v }))}
        {champ('Email', destinataire.email, (v) => setDestinataire({ ...destinataire, email: v }))}
        {champ('Adresse', destinataire.adresse1, (v) => setDestinataire({ ...destinataire, adresse1: v }), { className: 'col-span-2' })}
        {champ('Ville', destinataire.ville, (v) => setDestinataire({ ...destinataire, ville: v }))}
        {champ('Code postal', destinataire.codePostal, (v) => setDestinataire({ ...destinataire, codePostal: v }))}
      </div>

      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Colis
        {poidsConnuGrammes ? (
          <span className="ml-1.5 font-normal normal-case text-emerald-600">(poids calculé depuis les articles pesés — vérifie avant de confirmer)</span>
        ) : (
          <span className="ml-1.5 font-normal normal-case text-amber-600">(poids par défaut — au moins un article sans poids pesé en stock, à corriger à la main)</span>
        )}
      </p>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {champ('Poids (kg)', poids, setPoids)}
        {champ('Long. (cm)', longueur, setLongueur)}
        {champ('Larg. (cm)', largeur, setLargeur)}
        {champ('Haut. (cm)', hauteur, setHauteur)}
      </div>

      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Offres — prix en direct, moins cher en premier</p>
      <div className="mb-3 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {options === undefined && <p className="px-2.5 py-2 text-xs text-slate-400">Renseigne les deux adresses et le poids pour voir les offres.</p>}
        {Array.isArray(options) &&
          (options.length === 0 ? (
            <p className="px-2.5 py-2 text-xs font-semibold text-red-600">Aucune offre trouvée pour ce poids/cette destination.</p>
          ) : (
            options.map((o, i) => (
              <button
                key={o.code}
                type="button"
                onClick={() => setOptionChoisie(o)}
                className={`flex w-full items-center justify-between border-b border-slate-100 px-2.5 py-1.5 text-left text-xs last:border-0 hover:bg-slate-50 ${
                  i === 0 ? 'bg-emerald-50' : ''
                } ${optionChoisie?.code === o.code ? 'ring-1 ring-inset ring-indigo-400' : ''}`}
              >
                <span className="text-slate-700">
                  {o.transporteurNom} — {o.nom}
                  {o.pointRelaisRequis && <span className="ml-1 text-slate-400">(point relais)</span>}
                </span>
                <span className={`font-semibold ${i === 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {o.prix ? `${o.prix.value.toFixed(2)} ${o.prix.devise}` : 'prix après création'}
                </span>
              </button>
            ))
          ))}
      </div>

      {optionChoisie?.pointRelaisRequis && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Point relais
            {pointRelaisConfiance === 'client' && ' — déjà choisi par le client, vérifie et confirme'}
            {pointRelaisConfiance === 'auto_assigne' && ' — assigné par Sendcloud (pas confirmé), vérifie ou choisis-en un autre'}
            {pointRelaisConfiance === 'manuel' && ' — choisi à la main'}
            {!pointRelaisConfiance && ' — choisis un point ci-dessous'}
          </p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {chargementPoints && <p className="px-2.5 py-2 text-xs text-slate-400">Recherche des points relais…</p>}
            {!chargementPoints && pointRelaisConfiance !== 'client' && pointsRelais?.length === 0 && (
              <p className="px-2.5 py-2 text-xs font-semibold text-red-600">Aucun point relais trouvé pour cette adresse.</p>
            )}
            {!chargementPoints &&
              pointRelaisConfiance !== 'client' &&
              pointsRelais?.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPointRelaisChoisi(p);
                    setPointRelaisConfiance('manuel');
                  }}
                  className={`flex w-full items-center justify-between border-b border-slate-100 px-2.5 py-1.5 text-left text-xs last:border-0 hover:bg-slate-50 ${
                    pointRelaisChoisi?.id === p.id ? 'ring-1 ring-inset ring-indigo-400' : ''
                  }`}
                >
                  <span className="text-slate-700">
                    {p.nom}
                    <span className="ml-1 text-slate-400">— {p.adresse}</span>
                  </span>
                  {p.distanceMetres !== null && <span className="text-slate-400">{(p.distanceMetres / 1000).toFixed(1)} km</span>}
                </button>
              ))}
            {pointRelaisConfiance === 'client' && pointRelaisChoisi && (
              <div className="px-2.5 py-2 text-xs text-slate-700">
                {pointRelaisChoisi.nom} — {pointRelaisChoisi.adresse}
              </div>
            )}
          </div>
        </div>
      )}

      {erreur && <p className="mb-2 text-xs font-semibold text-red-600">{erreur}</p>}

      {(() => {
        const pointRelaisManquant = Boolean(optionChoisie?.pointRelaisRequis) && !pointRelaisChoisi;
        return confirmer ? (
          <div>
            {optionChoisie?.pointRelaisRequis && pointRelaisChoisi && (
              <p className="mb-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                Envoi vers le point relais : <span className="font-semibold">{pointRelaisChoisi.nom}</span> — {pointRelaisChoisi.adresse}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={lancerCreation}
                disabled={enCours || !optionChoisie || pointRelaisManquant}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {enCours ? 'Création…' : 'Confirmer — action facturée'}
              </button>
              <button type="button" onClick={() => setConfirmer(false)} className="text-xs font-semibold text-slate-500 hover:underline">
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmer(true)}
            disabled={!optionChoisie || pointRelaisManquant}
            title={pointRelaisManquant ? 'Choisis un point relais avant de continuer' : undefined}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Créer l&apos;étiquette (payant)
          </button>
        );
      })()}
    </div>
  );
}
