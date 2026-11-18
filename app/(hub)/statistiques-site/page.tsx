import Link from 'next/link';
import type { ReactNode } from 'react';

import { exigerAdmin } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

// Tableau de bord d'analyse du site (retour utilisateur du 2026-11-18) — alimenté par le pixel
// personnalisé Shopify (scripts/shopify-pixel-analytique.js de l'appli, table shopify_evenements,
// migration 0139). Tout est calculé côté base en un appel (stats_site), période courante + période
// précédente pour les évolutions.

type Ligne = Record<string, string | number | null>;

interface Stats {
  dernier_evenement: string | null;
  kpis: Record<string, number>;
  entonnoir: { etape: string; sessions: number }[];
  sources: Ligne[];
  campagnes: Ligne[];
  appareils: Ligne[];
  pages_entree: Ligne[];
  pages_vues: Ligne[];
  pages_ajout: Ligne[];
  produits: Ligne[];
  recherches: Ligne[];
  par_jour: Ligne[];
  par_heure: Ligne[];
  par_jour_semaine: Ligne[];
  pays: Ligne[];
  codes_promo: Ligne[];
  erreurs_paiement: Ligne[];
  livraisons: Ligne[];
}

const PERIODES = [
  { jours: 1, label: '24 h' },
  { jours: 7, label: '7 jours' },
  { jours: 30, label: '30 jours' },
  { jours: 90, label: '90 jours' },
  { jours: 365, label: '1 an' },
];

const ETAPES: Record<string, string> = {
  page_viewed: 'Visite du site',
  product_viewed: 'A vu un produit',
  product_added_to_cart: 'A ajouté au panier',
  cart_viewed: 'A ouvert le panier',
  checkout_started: 'A commencé le paiement',
  checkout_contact_info_submitted: 'A rempli ses coordonnées',
  checkout_address_info_submitted: 'A rempli son adresse',
  checkout_shipping_info_submitted: 'A choisi la livraison',
  payment_info_submitted: 'A saisi le paiement',
  checkout_completed: 'A commandé',
};

const JOURS_SEMAINE = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const entier = (v: unknown) => n(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
const euros = (v: unknown) => n(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euros2 = (v: unknown) => n(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const pct = (a: unknown, b: unknown) => (n(b) > 0 ? `${((n(a) / n(b)) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—');
const duree = (s: unknown) => {
  const t = Math.round(n(s));
  return t >= 60 ? `${Math.floor(t / 60)} min ${String(t % 60).padStart(2, '0')}` : `${t} s`;
};

function Evolution({ actuel, precedent, inverse = false }: { actuel: number; precedent: number; inverse?: boolean }) {
  if (!precedent) return <span className="text-[11px] text-slate-400">pas de comparaison</span>;
  const delta = ((actuel - precedent) / precedent) * 100;
  if (Math.abs(delta) < 0.5) return <span className="text-[11px] text-slate-400">= stable</span>;
  const bon = inverse ? delta < 0 : delta > 0;
  return (
    <span className={`text-[11px] font-semibold ${bon ? 'text-emerald-600' : 'text-red-600'}`}>
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} % vs période précédente
    </span>
  );
}

function Tuile({ titre, valeur, detail, children }: { titre: string; valeur: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titre}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{valeur}</p>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Section({ titre, sousTitre, children }: { titre: string; sousTitre?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-slate-900">{titre}</h2>
      {sousTitre && <p className="mb-2 text-xs text-slate-400">{sousTitre}</p>}
      {!sousTitre && <div className="mb-2" />}
      {children}
    </section>
  );
}

interface Colonne {
  titre: string;
  rendu: (l: Ligne) => ReactNode;
  droite?: boolean;
}

function Tableau({ colonnes, lignes, vide = 'Pas encore de données.' }: { colonnes: Colonne[]; lignes: Ligne[]; vide?: string }) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {colonnes.map((c) => (
              <th key={c.titre} className={`px-4 py-2.5 ${c.droite ? 'text-right' : ''}`}>
                {c.titre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
              {colonnes.map((c) => (
                <td key={c.titre} className={`px-4 py-2 ${c.droite ? 'text-right tabular-nums text-slate-700' : 'text-slate-700'}`}>
                  {c.rendu(l)}
                </td>
              ))}
            </tr>
          ))}
          {lignes.length === 0 && (
            <tr>
              <td colSpan={colonnes.length} className="px-4 py-8 text-center text-sm text-slate-400">
                {vide}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Barres verticales à une seule série (volume de sessions), info au survol. */
function Histogramme({ points }: { points: { label: string; valeur: number; info: string }[] }) {
  const max = Math.max(1, ...points.map((p) => p.valeur));
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex h-40 items-end gap-[2px]">
        {points.map((p) => (
          <div key={p.label} className="group relative flex h-full flex-1 items-end" title={p.info}>
            <div
              className="w-full rounded-t-[4px] bg-indigo-500 transition-colors group-hover:bg-indigo-700"
              style={{ height: `${Math.max(2, (p.valeur / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {points.map((p, i) => (
          <div key={p.label} className="flex-1 truncate text-center text-[10px] text-slate-400">
            {points.length <= 31 || i % Math.ceil(points.length / 15) === 0 ? p.label : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function StatistiquesSitePage({ searchParams }: { searchParams: Promise<{ jours?: string }> }) {
  await exigerAdmin();
  const params = await searchParams;
  const jours = PERIODES.some((p) => p.jours === Number(params.jours)) ? Number(params.jours) : 7;
  const maintenant = Date.now();
  const debut = new Date(maintenant - jours * 864e5).toISOString();
  const debutPrecedent = new Date(maintenant - 2 * jours * 864e5).toISOString();

  const supabase = await creerClientSupabaseServeur();
  const [{ data, error }, { data: dataPrecedent }] = await Promise.all([
    supabase.rpc('stats_site', { p_depuis: debut }),
    supabase.rpc('stats_site', { p_depuis: debutPrecedent, p_jusqua: debut }),
  ]);
  const s = data as Stats | null;
  const p = (dataPrecedent as Stats | null)?.kpis ?? {};
  const k = s?.kpis ?? {};

  const tauxConv = n(k.sessions) ? n(k.sessions_commande) / n(k.sessions) : 0;
  const tauxConvPrec = n(p.sessions) ? n(p.sessions_commande) / n(p.sessions) : 0;
  const panierMoyen = n(k.commandes) ? n(k.ca) / n(k.commandes) : 0;
  const panierMoyenPrec = n(p.commandes) ? n(p.ca) / n(p.commandes) : 0;
  const tauxPanier = n(k.sessions) ? n(k.sessions_panier) / n(k.sessions) : 0;
  const tauxPanierPrec = n(p.sessions) ? n(p.sessions_panier) / n(p.sessions) : 0;
  const rebond = n(k.sessions) ? n(k.rebonds) / n(k.sessions) : 0;
  const rebondPrec = n(p.sessions) ? n(p.rebonds) / n(p.sessions) : 0;

  const entonnoir = s?.entonnoir ?? [];
  const base = n(entonnoir[0]?.sessions);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Statistiques site</h1>
      <p className="mb-5 text-sm text-slate-400">
        pimp-it.store, en direct depuis le pixel Shopify (hors TikTok Shop).{' '}
        {s?.dernier_evenement
          ? `Dernier événement reçu : ${new Date(s.dernier_evenement).toLocaleString('fr-FR')}.`
          : 'Aucune donnée reçue pour l’instant — vérifie que le pixel est connecté dans Shopify (Paramètres > Événements clients).'}
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {PERIODES.map((pe) => (
          <Link
            key={pe.jours}
            href={`/statistiques-site?jours=${pe.jours}`}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              pe.jours === jours ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {pe.label}
          </Link>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}

      {/* Indicateurs clés */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile titre="Chiffre d'affaires" valeur={euros(k.ca)} detail={`${entier(k.commandes)} commandes`}>
          <Evolution actuel={n(k.ca)} precedent={n(p.ca)} />
        </Tuile>
        <Tuile titre="Sessions" valeur={entier(k.sessions)} detail={`${entier(k.visiteurs)} visiteurs · ${entier(k.visiteurs_revenants)} revenus`}>
          <Evolution actuel={n(k.sessions)} precedent={n(p.sessions)} />
        </Tuile>
        <Tuile titre="Taux de conversion" valeur={pct(k.sessions_commande, k.sessions)} detail="sessions qui commandent">
          <Evolution actuel={tauxConv} precedent={tauxConvPrec} />
        </Tuile>
        <Tuile titre="Panier moyen" valeur={euros2(panierMoyen)}>
          <Evolution actuel={panierMoyen} precedent={panierMoyenPrec} />
        </Tuile>
        <Tuile titre="Ajout au panier" valeur={pct(k.sessions_panier, k.sessions)} detail={`${entier(k.sessions_panier)} sessions · ${entier(k.retraits_panier)} retraits`}>
          <Evolution actuel={tauxPanier} precedent={tauxPanierPrec} />
        </Tuile>
        <Tuile titre="Rebond" valeur={pct(k.rebonds, k.sessions)} detail="1 seule page vue, rien au panier">
          <Evolution actuel={rebond} precedent={rebondPrec} inverse />
        </Tuile>
        <Tuile titre="Engagement" valeur={`${n(k.pages_par_session).toLocaleString('fr-FR')} pages`} detail={`par session · durée moy. ${duree(k.duree_moyenne_s)}`} />
        <Tuile
          titre="Paiements abandonnés"
          valeur={entier(k.paiements_abandonnes)}
          detail={`${pct(k.paiements_abandonnes, k.sessions_paiement)} des paiements commencés · ${euros(k.valeur_abandonnee)} perdus`}
        >
          <Evolution actuel={n(k.paiements_abandonnes)} precedent={n(p.paiements_abandonnes)} inverse />
        </Tuile>
      </div>

      <Section titre="Entonnoir de vente" sousTitre="Sessions qui atteignent chaque étape · entre parenthèses, la part de l'étape précédente qui passe à la suivante">
        <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
          {entonnoir.map((et, i) => {
            const precedent = i > 0 ? n(entonnoir[i - 1].sessions) : n(et.sessions);
            const largeur = base ? (n(et.sessions) / base) * 100 : 0;
            const passage = precedent ? (n(et.sessions) / precedent) * 100 : 0;
            return (
              <div key={et.etape} className="mb-1.5 flex items-center gap-3" title={`${ETAPES[et.etape] ?? et.etape} : ${entier(et.sessions)} sessions`}>
                <div className="w-52 shrink-0 text-xs font-semibold text-slate-600">{ETAPES[et.etape] ?? et.etape}</div>
                <div className="relative h-6 flex-1 rounded-[4px] bg-slate-50">
                  <div className="h-6 rounded-r-[4px] bg-indigo-500" style={{ width: `${Math.max(largeur, n(et.sessions) > 0 ? 0.5 : 0)}%` }} />
                </div>
                <div className="w-40 shrink-0 text-right text-xs tabular-nums text-slate-700">
                  <span className="font-bold">{entier(et.sessions)}</span>
                  {i > 0 && (
                    <span className={`ml-1 ${passage < 30 ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                      ({passage.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {entonnoir.length === 0 && <p className="text-sm text-slate-400">Pas encore de données.</p>}
        </div>
      </Section>

      <Section titre="Évolution" sousTitre="Sessions par jour (survole une barre pour le détail)">
        <Histogramme
          points={(s?.par_jour ?? []).map((j) => ({
            label: new Date(String(j.jour)).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
            valeur: n(j.sessions),
            info: `${new Date(String(j.jour)).toLocaleDateString('fr-FR')} : ${entier(j.sessions)} sessions, ${entier(j.paniers)} paniers, ${entier(j.commandes)} commandes, ${euros(j.ca)}`,
          }))}
        />
      </Section>

      <Section titre="Sources de trafic" sousTitre="D'où viennent les visiteurs (UTM, clics de pub, navigateurs intégrés TikTok/Instagram, site référent)">
        <Tableau
          lignes={s?.sources ?? []}
          colonnes={[
            { titre: 'Source', rendu: (l) => <span className="font-semibold">{l.source}</span> },
            { titre: 'Type', rendu: (l) => <span className="text-slate-500">{l.medium}</span> },
            { titre: 'Sessions', droite: true, rendu: (l) => entier(l.sessions) },
            { titre: 'Rebond', droite: true, rendu: (l) => pct(l.rebonds, l.sessions) },
            { titre: 'Ajout panier', droite: true, rendu: (l) => pct(l.paniers, l.sessions) },
            { titre: 'Commandes', droite: true, rendu: (l) => entier(l.commandes) },
            { titre: 'Conversion', droite: true, rendu: (l) => pct(l.commandes, l.sessions) },
            { titre: 'CA', droite: true, rendu: (l) => <span className="font-semibold">{euros(l.ca)}</span> },
          ]}
        />
      </Section>

      <Section titre="Campagnes" sousTitre="Liens avec utm_campaign (pubs, influenceurs, stories…) — ajoute ?utm_source=…&utm_campaign=… à tes liens pour les suivre">
        <Tableau
          lignes={s?.campagnes ?? []}
          vide="Aucune campagne marquée — ajoute des paramètres utm_campaign à tes liens de pub."
          colonnes={[
            { titre: 'Source', rendu: (l) => l.source },
            { titre: 'Campagne', rendu: (l) => <span className="font-semibold">{l.campagne}</span> },
            { titre: 'Sessions', droite: true, rendu: (l) => entier(l.sessions) },
            { titre: 'Ajout panier', droite: true, rendu: (l) => pct(l.paniers, l.sessions) },
            { titre: 'Commandes', droite: true, rendu: (l) => entier(l.commandes) },
            { titre: 'CA', droite: true, rendu: (l) => <span className="font-semibold">{euros(l.ca)}</span> },
          ]}
        />
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section titre="Pages où l'on ajoute au panier" sousTitre="Page exacte où le bouton a été cliqué">
          <Tableau
            lignes={s?.pages_ajout ?? []}
            colonnes={[
              { titre: 'Page', rendu: (l) => <span className="font-semibold text-indigo-600">{l.page}</span> },
              { titre: 'Ajouts', droite: true, rendu: (l) => entier(l.ajouts) },
              { titre: 'Articles', droite: true, rendu: (l) => entier(l.articles) },
              { titre: 'Sessions', droite: true, rendu: (l) => entier(l.sessions) },
            ]}
          />
        </Section>
        <Section titre="Pages d'entrée" sousTitre="Première page de la visite">
          <Tableau
            lignes={s?.pages_entree ?? []}
            colonnes={[
              { titre: 'Page', rendu: (l) => <span className="font-semibold">{l.page}</span> },
              { titre: 'Sessions', droite: true, rendu: (l) => entier(l.sessions) },
              { titre: 'Rebond', droite: true, rendu: (l) => pct(l.rebonds, l.sessions) },
              { titre: 'Panier', droite: true, rendu: (l) => pct(l.paniers, l.sessions) },
              { titre: 'CA', droite: true, rendu: (l) => euros(l.ca) },
            ]}
          />
        </Section>
      </div>

      <Section titre="Produits" sousTitre="Vus, ajoutés, retirés et achetés — un taux vue → panier faible = fiche produit à retravailler">
        <Tableau
          lignes={s?.produits ?? []}
          colonnes={[
            { titre: 'Produit', rendu: (l) => <span className="font-semibold">{l.titre}</span> },
            { titre: 'Vues', droite: true, rendu: (l) => entier(l.vues) },
            { titre: 'Ajouts', droite: true, rendu: (l) => entier(l.ajouts) },
            { titre: 'Vue → panier', droite: true, rendu: (l) => pct(l.ajouts, l.sessions_vue) },
            { titre: 'Retraits', droite: true, rendu: (l) => entier(l.retraits) },
            { titre: 'Achetés', droite: true, rendu: (l) => entier(l.achetes) },
            { titre: 'CA', droite: true, rendu: (l) => <span className="font-semibold">{euros(l.ca)}</span> },
          ]}
        />
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section titre="Appareils et navigateurs">
          <Tableau
            lignes={s?.appareils ?? []}
            colonnes={[
              { titre: 'Appareil', rendu: (l) => l.appareil },
              { titre: 'Navigateur', rendu: (l) => <span className="font-semibold">{l.navigateur}</span> },
              { titre: 'Sessions', droite: true, rendu: (l) => entier(l.sessions) },
              { titre: 'Panier', droite: true, rendu: (l) => pct(l.paniers, l.sessions) },
              { titre: 'Conversion', droite: true, rendu: (l) => pct(l.commandes, l.sessions) },
            ]}
          />
        </Section>
        <Section titre="Recherches sur le site" sousTitre="En rouge : aucun résultat = produit demandé que tu n'as pas (ou mal nommé)">
          <Tableau
            lignes={s?.recherches ?? []}
            colonnes={[
              { titre: 'Recherche', rendu: (l) => <span className={n(l.resultats_moyens) === 0 ? 'font-semibold text-red-600' : 'font-semibold'}>{l.terme}</span> },
              { titre: 'Fois', droite: true, rendu: (l) => entier(l.nb) },
              { titre: 'Résultats', droite: true, rendu: (l) => n(l.resultats_moyens).toLocaleString('fr-FR') },
            ]}
          />
        </Section>
      </div>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section titre="Heures de visite" sousTitre="Sessions par heure (heure de Paris) — utile pour programmer pubs et posts">
          <Histogramme
            points={Array.from({ length: 24 }, (_, h) => {
              const l = (s?.par_heure ?? []).find((x) => n(x.heure) === h);
              return { label: `${h}h`, valeur: n(l?.sessions), info: `${h}h : ${entier(l?.sessions)} sessions, ${entier(l?.commandes)} commandes, ${euros(l?.ca)}` };
            })}
          />
        </Section>
        <Section titre="Jours de la semaine">
          <Tableau
            lignes={s?.par_jour_semaine ?? []}
            colonnes={[
              { titre: 'Jour', rendu: (l) => JOURS_SEMAINE[n(l.jour)] },
              { titre: 'Sessions', droite: true, rendu: (l) => entier(l.sessions) },
              { titre: 'Commandes', droite: true, rendu: (l) => entier(l.commandes) },
              { titre: 'Conversion', droite: true, rendu: (l) => pct(l.commandes, l.sessions) },
              { titre: 'CA', droite: true, rendu: (l) => euros(l.ca) },
            ]}
          />
        </Section>
      </div>

      <div className="grid gap-x-6 lg:grid-cols-3">
        <Section titre="Codes promo">
          <Tableau
            lignes={s?.codes_promo ?? []}
            vide="Aucun code utilisé."
            colonnes={[
              { titre: 'Code', rendu: (l) => <span className="font-semibold">{l.code}</span> },
              { titre: 'Cmd', droite: true, rendu: (l) => entier(l.commandes) },
              { titre: 'CA', droite: true, rendu: (l) => euros(l.ca) },
            ]}
          />
        </Section>
        <Section titre="Livraison choisie">
          <Tableau
            lignes={s?.livraisons ?? []}
            colonnes={[
              { titre: 'Mode', rendu: (l) => l.livraison },
              { titre: 'Cmd', droite: true, rendu: (l) => entier(l.commandes) },
              { titre: 'Frais moy.', droite: true, rendu: (l) => euros2(l.frais_moyens) },
            ]}
          />
        </Section>
        <Section titre="Pays des commandes">
          <Tableau
            lignes={s?.pays ?? []}
            colonnes={[
              { titre: 'Pays', rendu: (l) => l.pays },
              { titre: 'Cmd', droite: true, rendu: (l) => entier(l.commandes) },
              { titre: 'CA', droite: true, rendu: (l) => euros(l.ca) },
            ]}
          />
        </Section>
      </div>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section titre="Erreurs affichées au paiement" sousTitre="Messages d'erreur vus par les clients pendant le paiement — chaque ligne est une vente qui a failli être perdue">
          <Tableau
            lignes={s?.erreurs_paiement ?? []}
            vide="Aucune erreur affichée 👍"
            colonnes={[
              { titre: 'Message', rendu: (l) => <span className="font-semibold text-red-600">{l.message}</span> },
              { titre: 'Champ', rendu: (l) => <span className="text-slate-500">{l.cible}</span> },
              { titre: 'Fois', droite: true, rendu: (l) => entier(l.nb) },
            ]}
          />
        </Section>
        <Section titre="Pages les plus vues">
          <Tableau
            lignes={s?.pages_vues ?? []}
            colonnes={[
              { titre: 'Page', rendu: (l) => <span className="font-semibold">{l.page}</span> },
              { titre: 'Vues', droite: true, rendu: (l) => entier(l.vues) },
              { titre: 'Sessions', droite: true, rendu: (l) => entier(l.sessions) },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
