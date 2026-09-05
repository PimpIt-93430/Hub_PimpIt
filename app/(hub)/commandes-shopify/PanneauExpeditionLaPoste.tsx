'use client';

import { useEffect, useMemo, useState } from 'react';

import type { ExpeditionLaPoste } from '@/lib/expeditions-laposte';
import { PRIX_LETTRE_VERTE_SUIVIE_HT, type ProduitLettre } from '@/lib/laposte';
import type { CommandeShopify } from '@/lib/shopify';
import { annulerEtiquetteLaPoste, creerEtiquetteLaPoste, verifierCommandesEnSuspens, verifierExpeditionLaPosteExistante } from './actions';
import {
  adresseLivraisonVersDestinataire,
  base64VersBlobUrl,
  chargerExpediteur,
  CLE_EXPEDITEUR,
  EXPEDITEUR_VIDE,
  type Expediteur,
  versAdresseLaPoste,
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

const LIBELLE_PRODUIT: Record<ProduitLettre, string> = {
  K7: 'Lettre Verte Suivie (J+3)',
  K8: 'Lettre Performance Suivie (J+2)',
};

function formatPrix(n: number): string {
  return `${n.toFixed(2)} €`;
}

// Seule la Lettre Verte Suivie est utilisée en pratique (retour utilisateur du 2026-09-03 : "il
// faut que lettre verte suivie le reste tu enlèves tout") — plus de sélecteur de produit, K8
// (Performance Suivie) reste supporté côté API si besoin plus tard mais n'est plus proposé ici.
const PRODUIT_UNIQUE: ProduitLettre = 'K7';

/** Création d'étiquette via l'API Postage de La Poste (Lettre Verte/Performance Suivie) — pour les
 * commandes classées "léger" (cf. lib/classification-produits.ts), en remplacement de Sendcloud.
 * Compte de PRODUCTION depuis le 2026-09-03 : toute étiquette créée est RÉELLE et FACTURÉE, d'où
 * l'étape de confirmation avant création (même principe que PanneauExpedition.tsx/Sendcloud) —
 * absente à l'origine quand c'était encore le compte de recette. Pas de tarification en direct ni
 * de point relais ici (l'offre "Lettre Suivie" est en boîte aux lettres/domicile uniquement, prix
 * géré par le contrat, pas par appel), contrairement à Sendcloud. */
export function PanneauExpeditionLaPoste({
  commande,
  poidsConnuGrammes,
  dejaExpediee,
}: {
  commande: CommandeShopify;
  poidsConnuGrammes?: number;
  /** true si Shopify montre déjà cette commande comme expédiée — cf. retour utilisateur du
   * 2026-09-05 : n'affiche alors QUE la réimpression d'une étiquette déjà enregistrée chez nous
   * (ci-dessous), jamais le formulaire de création, pour ne jamais risquer un second envoi réel. */
  dejaExpediee?: boolean;
}) {
  const [expediteur, setExpediteur] = useState<Expediteur>(EXPEDITEUR_VIDE);
  const [destinataire, setDestinataire] = useState<Expediteur>(() =>
    adresseLivraisonVersDestinataire(commande.adresseLivraison, commande.email),
  );
  const [poids, setPoids] = useState(String(poidsConnuGrammes ?? 200));
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ExpeditionLaPoste | null | undefined>(undefined);
  // Cf. retour utilisateur du 2026-09-05 : "il faut pouvoir dupliquer une commande, cest a dire
  // recréer une nouvelle etiquette si jamais un jour il y a un probleme" — échappatoire volontaire
  // et explicite (jamais automatique) pour forcer un nouvel envoi même quand un existe déjà, ex.
  // colis perdu. Reste à false par défaut : le flux normal (réimpression) prime toujours.
  const [forcerNouvelle, setForcerNouvelle] = useState(false);
  // Cf. retour utilisateur du 2026-09-05 : "il y a un problème avec les shipped by seller elles
  // arrivent en suspendu sur le shopify et tant qu'elles sont en suspendu faut pas qu'elles sortent
  // sur le hub" — undefined = vérification en cours, jamais le formulaire de création tant que ce
  // n'est pas confirmé.
  const [enSuspens, setEnSuspens] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    setExpediteur(chargerExpediteur());
    verifierExpeditionLaPosteExistante(commande.id)
      .then(setResultat)
      .catch(() => setResultat(null));
    verifierCommandesEnSuspens([commande.id])
      .then((ids) => setEnSuspens(ids.includes(commande.id)))
      .catch(() => setEnSuspens(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setEnCours(true);
    setErreur(null);
    try {
      const expedition = await creerEtiquetteLaPoste({
        produit: PRODUIT_UNIQUE,
        poidsGrammes: Number(poids) || 1,
        expediteur: versAdresseLaPoste(expediteur),
        destinataire: versAdresseLaPoste(destinataire),
        commandeShopifyId: commande.id,
        commandeNom: commande.nom,
        lignes: commande.lignes,
      });
      setResultat(expedition);
      setForcerNouvelle(false);
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
      await annulerEtiquetteLaPoste(resultat.laposteItemId);
      setResultat(null);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'annulation.");
    } finally {
      setEnCours(false);
    }
  };

  // useMemo (pas useEffect) : l'URL doit être prête dès le premier rendu où `resultat` est connu,
  // sinon le lien "Ouvrir l'étiquette" pointerait vers rien le temps d'un cycle de rendu. Recréée
  // seulement quand le PDF change réellement (nouvelle étiquette) — atob()/Blob restent bon marché
  // pour la taille d'un PDF d'étiquette.
  const etiquetteBlobUrl = useMemo(
    () => (resultat ? base64VersBlobUrl(resultat.visualOutputBase64, 'application/pdf') : null),
    [resultat],
  );
  useEffect(() => {
    return () => {
      if (etiquetteBlobUrl) URL.revokeObjectURL(etiquetteBlobUrl);
    };
  }, [etiquetteBlobUrl]);

  if (resultat === undefined) {
    return <p className="mb-4 text-xs text-slate-400">Vérification d&apos;une expédition existante…</p>;
  }

  // Commande déjà expédiée côté Shopify mais aucune étiquette La Poste enregistrée chez nous
  // (expédiée par un autre biais) — jamais le formulaire de création ici, cf. commentaire du prop.
  if (!resultat && dejaExpediee) return null;

  if (!resultat && enSuspens === undefined) {
    return <p className="mb-4 text-xs text-slate-400">Vérification du statut Shopify…</p>;
  }

  if (!resultat && enSuspens) {
    return (
      <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-semibold text-amber-800">
        Commande suspendue sur Shopify (fulfillment ON_HOLD) — pas de création d&apos;étiquette tant que le blocage
        n&apos;est pas levé côté Shopify.
      </p>
    );
  }

  if (resultat && !forcerNouvelle) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
        <p className="mb-1 text-sm font-bold text-emerald-800">
          Étiquette créée — {LIBELLE_PRODUIT[resultat.produit]} — suivi {resultat.laposteItemId}
        </p>
        <a
          href={etiquetteBlobUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Ouvrir / imprimer l&apos;étiquette
        </a>
        <button
          type="button"
          onClick={annuler}
          disabled={enCours}
          className="mt-2 block text-xs font-semibold text-red-600 hover:underline disabled:opacity-60"
        >
          {enCours ? 'Annulation…' : 'Annuler cette expédition (créée par erreur)'}
        </button>
        <button
          type="button"
          onClick={() => setForcerNouvelle(true)}
          className="mt-1 block text-xs font-semibold text-slate-500 hover:underline"
        >
          Un problème avec ce colis ? Créer une nouvelle étiquette
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3.5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Expédition (La Poste)
        <span className="ml-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-sky-700">
          Produit léger — lettre suivie
        </span>
      </p>

      {resultat && forcerNouvelle && (
        <p className="mb-3 rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700">
          Une étiquette existe déjà pour cette commande (suivi {resultat.laposteItemId}) — vérifie que c&apos;est
          justifié (colis perdu, erreur…) avant de continuer : ceci facture une 2ᵉ fois.{' '}
          <button type="button" onClick={() => setForcerNouvelle(false)} className="underline">
            Annuler, revenir à l&apos;étiquette existante
          </button>
        </p>
      )}

      <p className="mb-3 text-xs font-semibold text-amber-700">
        Compte de production — cliquer sur &quot;Générer l&apos;étiquette&quot; crée un vrai envoi ({LIBELLE_PRODUIT[PRODUIT_UNIQUE]}),
        facturé {formatPrix(PRIX_LETTRE_VERTE_SUIVIE_HT)} HT immédiatement. Annulable sous 7 jours et avant la fin du mois
        de génération.
      </p>

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
        Lettre
        {poidsConnuGrammes ? (
          <span className="ml-1.5 font-normal normal-case text-emerald-600">(poids calculé depuis les articles pesés)</span>
        ) : (
          <span className="ml-1.5 font-normal normal-case text-amber-600">(poids par défaut, à vérifier)</span>
        )}
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {champ('Poids (g)', poids, setPoids)}
      </div>

      {erreur && <p className="mb-2 text-xs font-semibold text-red-600">{erreur}</p>}

      {confirmer ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={lancerCreation}
            disabled={enCours}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {enCours ? 'Création…' : 'Confirmer — action facturée'}
          </button>
          <button type="button" onClick={() => setConfirmer(false)} className="text-xs font-semibold text-slate-500 hover:underline">
            Annuler
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmer(true)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500"
        >
          Générer l&apos;étiquette (payant)
        </button>
      )}
    </div>
  );
}
