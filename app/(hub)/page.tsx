import Link from 'next/link';

import { ventesShopifyDepuis } from '@/lib/shopify';
import { determinerRoleHub } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { chargerTachesQuotidiennes } from './taches-quotidiennes-actions';
import { TachesQuotidiennesCard } from './TachesQuotidiennesCard';

// Le tableau de bord doit toujours refléter l'instant présent (cf. discussion 2026-08-27 : "à
// chaque fois qu'on clique dessus ça actualise les chiffres") — sans ça, Next.js peut resservir un
// rendu mis en cache d'une visite précédente au lieu de refaire les requêtes Supabase/Shopify.
export const dynamic = 'force-dynamic';

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function tempsRelatif(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `il y a ${Math.floor(heures / 24)} j`;
}

const COULEURS_CARTE = {
  indigo: { chip: 'bg-indigo-50 text-indigo-600' },
  emerald: { chip: 'bg-emerald-50 text-emerald-600' },
  violet: { chip: 'bg-violet-50 text-violet-600' },
  amber: { chip: 'bg-amber-50 text-amber-600' },
  sky: { chip: 'bg-sky-50 text-sky-600' },
  slate: { chip: 'bg-slate-100 text-slate-500' },
} as const;

function Carte({
  titre,
  icone,
  couleur,
  href,
  children,
}: {
  titre: string;
  icone: string;
  couleur: keyof typeof COULEURS_CARTE;
  href?: string;
  children: React.ReactNode;
}) {
  const contenu = (
    <>
      <div className="mb-4 flex items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${COULEURS_CARTE[couleur].chip}`}>
          {icone}
        </span>
        <h2 className="text-sm font-bold text-slate-900">{titre}</h2>
        {href && <span className="ml-auto text-xs font-semibold text-slate-300">Voir tout →</span>}
      </div>
      <div className="flex-1">{children}</div>
    </>
  );
  const classe = 'flex h-full min-h-[300px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
  return href ? (
    <Link href={href} className={`${classe} transition hover:border-indigo-200 hover:shadow-md`}>
      {contenu}
    </Link>
  ) : (
    <div className={classe}>{contenu}</div>
  );
}

function EtatVide({ texte }: { texte: string }) {
  return <p className="flex h-full items-center justify-center text-center text-sm text-slate-400">{texte}</p>;
}

export default async function DashboardPage() {
  const supabase = await creerClientSupabaseServeur();
  const { profil } = await determinerRoleHub();

  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);
  const debutMois = new Date(debutJour.getFullYear(), debutJour.getMonth(), 1);

  const [
    { data: popUps },
    { data: emailsSumUp },
    { data: ventesSumup },
    { data: ventesEspeces },
    { data: ventesMoisSumup },
    { data: ventesMoisEspeces },
    ventesShopifyJour,
    ventesShopifyMois,
    { data: commandesFournisseurRecentes },
    { data: commandesPopUpRecentes },
    tachesQuotidiennes,
    { data: syncSumUp },
  ] = await Promise.all([
    supabase.from('pop_ups').select('id, nom').order('nom'),
    supabase.from('sumup_emails_pop_up').select('email, pop_up_id'),
    supabase.from('ventes_sumup').select('montant, statut, sumup_email').gte('horodatage', debutJour.toISOString()),
    supabase.from('ventes_especes').select('montant, statut, pop_up_id').gte('created_at', debutJour.toISOString()),
    supabase.from('ventes_sumup').select('montant, statut').gte('horodatage', debutMois.toISOString()),
    supabase.from('ventes_especes').select('montant, statut').gte('created_at', debutMois.toISOString()),
    // Chiffres en ligne (Shopify + TikTok Shop) — cf. discussion 2026-08-27 : le tableau de bord ne
    // montrait que les ventes en pop-up (SumUp/espèces), pas la boutique en ligne.
    ventesShopifyDepuis(debutJour.toISOString()),
    ventesShopifyDepuis(debutMois.toISOString()),
    supabase.from('hub_purchase_orders').select('id, ref, label, statut, date_creation, date_reception').order('date_creation', { ascending: false }).limit(5),
    supabase.from('commandes_pop_up').select('id, statut, envoyee_at, recue_at, pop_up:pop_ups(nom)').order('envoyee_at', { ascending: false }).limit(5),
    chargerTachesQuotidiennes(),
    // cf. migration 0077 (App Pimp It) — dernière exécution (succès ou échec) de la synchro SumUp,
    // écrite par la fonction elle-même à chaque appel (cron ou manuel) : donne un signal de
    // fraîcheur vérifiable dans l'UI plutôt qu'une simple affirmation que "le cron tourne".
    supabase.from('ventes_sumup_sync_etat').select('derniere_execution_le, ok, message, declenche_par').eq('id', true).maybeSingle(),
  ]);

  // Chiffres du jour séparés par pop-up (cf. discussion 2026-08-27 : "séparer les pop up"), et par
  // source dans chaque pop-up : "montant SumUp" (ventes_sumup — tout ce que SumUp a synchronisé,
  // carte ET espèces passées sur le terminal) vs "montant appli" (ventes_especes — espèces
  // déclarées à la main dans l'écran Ventes de l'app). Même distinction déjà établie côté app dans
  // RecapVentesEcran.tsx ("Espèce appli" vs "Espèce SumUp") : les fusionner masquait les écarts
  // entre les deux sources, d'où la demande de les remettre côte à côte plutôt qu'additionnées.
  //
  // pop_up_id n'est pas fiable : la réattribution automatique (fonction sync-ventes-sumup) ne va
  // pas au bout de la table (bug distinct, ~78% des ventes SumUp sans pop_up_id constaté le
  // 2026-08-27) — cf. discussion 2026-08-28 : "uniquement en fonction du mail attribué". Le CA
  // SumUp par pop-up vient donc exclusivement de sumup_emails_pop_up (email → pop-up déclaré à la
  // main, source de vérité), pas de pop_up_id ni du GPS. Tout email SumUp non déclaré dans cette
  // table (y compris un compte personnel comme octave.blanc@gmail.com, pas retiré de la table pour
  // l'instant) tombe dans "Ventes hors pop-up" plutôt que d'être silencieusement compté ou perdu.
  const popUpIdParEmail = new Map((emailsSumUp ?? []).map((e) => [e.email, e.pop_up_id]));

  const sumupParPopUp = new Map<string, number>();
  let sumupHorsPopUp = 0;
  for (const v of ventesSumup ?? []) {
    if (v.statut !== 'SUCCESSFUL') continue;
    const popUpId = v.sumup_email ? popUpIdParEmail.get(v.sumup_email) : undefined;
    if (popUpId) sumupParPopUp.set(popUpId, (sumupParPopUp.get(popUpId) ?? 0) + v.montant);
    else sumupHorsPopUp += v.montant;
  }
  const especesParPopUp = new Map<string, number>();
  for (const v of ventesEspeces ?? []) {
    if (v.statut !== 'confirmee' || !v.pop_up_id) continue;
    especesParPopUp.set(v.pop_up_id, (especesParPopUp.get(v.pop_up_id) ?? 0) + v.montant);
  }
  const chiffresParPopUp = (popUps ?? [])
    .map((p) => ({ nom: p.nom, sumup: sumupParPopUp.get(p.id) ?? 0, appli: especesParPopUp.get(p.id) ?? 0 }))
    .filter((p) => p.sumup > 0 || p.appli > 0);

  const caMois =
    (ventesMoisSumup ?? []).filter((v) => v.statut === 'SUCCESSFUL').reduce((s, v) => s + v.montant, 0) +
    (ventesMoisEspeces ?? []).filter((v) => v.statut === 'confirmee').reduce((s, v) => s + v.montant, 0) +
    ventesShopifyMois.shopify +
    ventesShopifyMois.tiktok;

  // Signal de fraîcheur de la synchro SumUp (cf. migration 0077, App Pimp It) : le cron tourne
  // toutes les 15 min, donc un écart de plus de 30 min (ou un dernier passage en échec) mérite un
  // signalement visible plutôt qu'un CA silencieusement à zéro comme avant.
  const syncSumUpMinutes = syncSumUp ? Math.floor((Date.now() - new Date(syncSumUp.derniere_execution_le).getTime()) / 60000) : null;
  const syncSumUpEnPanne = !syncSumUp || syncSumUp.ok === false || syncSumUpMinutes === null || syncSumUpMinutes > 30;

  interface Evenement {
    id: string;
    texte: string;
    quand: string;
    href: string;
  }
  const evenements: Evenement[] = [];
  for (const c of commandesFournisseurRecentes ?? []) {
    if (c.statut === 'recu' && c.date_reception) {
      evenements.push({ id: `cf-r-${c.id}`, texte: `Commande ${c.ref} réceptionnée`, quand: c.date_reception, href: '/commandes' });
    } else {
      evenements.push({ id: `cf-c-${c.id}`, texte: `Commande ${c.ref} créée — ${c.label}`, quand: c.date_creation, href: '/commandes' });
    }
  }
  for (const c of commandesPopUpRecentes ?? []) {
    const popUpNom = (c.pop_up as unknown as { nom: string } | null)?.nom ?? '?';
    if (c.statut === 'recue' && c.recue_at) {
      evenements.push({ id: `cp-r-${c.id}`, texte: `Commande reçue — ${popUpNom}`, quand: c.recue_at, href: '/local' });
    } else if (c.envoyee_at) {
      evenements.push({ id: `cp-e-${c.id}`, texte: `Commande envoyée à ${popUpNom}`, quand: c.envoyee_at, href: '/local' });
    }
  }
  evenements.sort((a, b) => new Date(b.quand).getTime() - new Date(a.quand).getTime());
  const derniersEvenements = evenements.slice(0, 5);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Tableau de bord</h1>
      <p className="mb-6 text-sm text-slate-400">
        {profil?.nom_complet ? `Bonjour ${profil.nom_complet.split(' ')[0]} — ` : ''}vue d&apos;ensemble du jour.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chiffres de la journée — carte principale du tableau de bord, cf. discussion 2026-08-27
            ("c'est le plus important") : grande, en premier, chiffres agrandis. */}
        <div className="flex min-h-[420px] flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm lg:col-span-2">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-600">💰</span>
            <h2 className="text-lg font-bold text-slate-900">Chiffres de la journée</h2>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {chiffresParPopUp.map((p) => (
                <div key={p.nom} className="flex flex-col justify-center rounded-2xl bg-slate-50 p-5">
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-400">{p.nom}</p>
                  <div className="mt-2 flex items-baseline gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">SumUp</p>
                      <p className="text-2xl font-bold text-slate-900">{formatMontant(p.sumup)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Appli</p>
                      <p className="text-2xl font-bold text-slate-900">{formatMontant(p.appli)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {chiffresParPopUp.length === 0 && (
                <div className="flex flex-col justify-center rounded-2xl bg-slate-50 p-5 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pop-ups</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">Aucune vente aujourd&apos;hui</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col justify-center rounded-2xl bg-sky-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Shopify</p>
                <p className="mt-2 text-2xl font-bold text-sky-900">{formatMontant(ventesShopifyJour.shopify)}</p>
              </div>
              <div className="flex flex-col justify-center rounded-2xl bg-violet-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">TikTok Shop</p>
                <p className="mt-2 text-2xl font-bold text-violet-900">{formatMontant(ventesShopifyJour.tiktok)}</p>
              </div>
              <div className="flex flex-col justify-center rounded-2xl bg-amber-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">SumUp hors pop-up</p>
                <p className="mt-2 text-2xl font-bold text-amber-900">{formatMontant(sumupHorsPopUp)}</p>
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-center rounded-2xl bg-emerald-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">CA du mois (tous canaux)</p>
              <p className="mt-2 text-4xl font-bold text-emerald-800">{formatMontant(caMois)}</p>
            </div>
          </div>
          <p className={`mt-4 flex items-center gap-1.5 text-xs font-medium ${syncSumUpEnPanne ? 'text-red-500' : 'text-slate-400'}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${syncSumUpEnPanne ? 'bg-red-500' : 'bg-emerald-500'}`} />
            {syncSumUp
              ? `Synchro SumUp ${syncSumUp.ok ? '' : '(échec) '}— ${tempsRelatif(syncSumUp.derniere_execution_le)}`
              : 'Synchro SumUp — jamais exécutée'}
          </p>
        </div>

        {/* Tâches quotidiennes — checklist récurrente cochée à la main, pas un calcul automatique
            (cf. discussion 2026-08-27) */}
        <div className="flex h-full min-h-[300px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <TachesQuotidiennesCard tachesInitiales={tachesQuotidiennes} />
        </div>

        {/* Activité récente — pour contrôler ce qui a été fait (cf. discussion 2026-08-27) */}
        <div className="lg:col-span-3">
          <Carte titre="Activité récente" icone="🕒" couleur="slate">
            {derniersEvenements.length === 0 ? (
              <EtatVide texte="Rien à signaler pour l'instant" />
            ) : (
              <ul className="flex flex-col gap-1">
                {derniersEvenements.map((e) => (
                  <li key={e.id}>
                    <Link href={e.href} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-slate-50">
                      <span className="flex-1 truncate text-slate-700">{e.texte}</span>
                      <span className="shrink-0 text-xs text-slate-400">{tempsRelatif(e.quand)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Carte>
        </div>
      </div>
    </div>
  );
}
