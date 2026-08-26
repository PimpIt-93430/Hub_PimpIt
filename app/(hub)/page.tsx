import Link from 'next/link';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

function Carte({
  titre,
  valeur,
  sousTitre,
  accent,
}: {
  titre: string;
  valeur: string;
  sousTitre?: string;
  accent?: 'amber' | 'red';
}) {
  const couleurValeur = accent === 'red' ? 'text-red-600' : accent === 'amber' ? 'text-amber-600' : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titre}</p>
      <p className={`mt-2 text-2xl font-bold ${couleurValeur}`}>{valeur}</p>
      {sousTitre && <p className="mt-1 text-xs text-slate-400">{sousTitre}</p>}
    </div>
  );
}

function CarteLien({
  href,
  titre,
  valeur,
  sousTitre,
  accent,
}: {
  href: string;
  titre: string;
  valeur: string;
  sousTitre?: string;
  accent?: 'amber' | 'red';
}) {
  const couleurValeur = accent === 'red' ? 'text-red-600' : accent === 'amber' ? 'text-amber-600' : 'text-slate-900';
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titre}</p>
      <p className={`mt-2 text-2xl font-bold ${couleurValeur}`}>{valeur}</p>
      {sousTitre && <p className="mt-1 text-xs text-slate-400">{sousTitre}</p>}
    </Link>
  );
}

function LienRapide({ href, label, valeur }: { href: string; label: string; valeur: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className="text-sm font-bold text-slate-900">{valeur}</span>
    </Link>
  );
}

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

export default async function DashboardPage() {
  const supabase = await creerClientSupabaseServeur();
  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);
  const debutMois = new Date(debutJour.getFullYear(), debutJour.getMonth(), 1);

  const [
    { data: ventesSumup },
    { data: ventesEspeces },
    { data: ventesMoisSumup },
    { data: ventesMoisEspeces },
    { data: shiftsAujourdhui },
    { data: pinsPourSeuil },
    { count: pinsARajouter },
    { count: packsAProbleme },
    { count: commandesFournisseurEnAttente },
    { count: commandesPopUpAPreparer },
    { count: equipeActive },
    { count: popUpsActifs },
    { count: pinsTotal },
    { count: packsTotal },
  ] = await Promise.all([
    supabase.from('ventes_sumup').select('montant, statut').gte('horodatage', debutJour.toISOString()),
    supabase.from('ventes_especes').select('montant, statut').gte('created_at', debutJour.toISOString()),
    supabase.from('ventes_sumup').select('montant, statut').gte('horodatage', debutMois.toISOString()),
    supabase.from('ventes_especes').select('montant, statut').gte('created_at', debutMois.toISOString()),
    supabase.from('planning_shifts').select('id').eq('date', debutJour.toISOString().slice(0, 10)),
    supabase.from('hub_pins').select('stock, seuil_cible'),
    supabase.from('hub_pins').select('*', { count: 'exact', head: true }).eq('pas_dans_unite', true),
    supabase.from('hub_packs').select('*', { count: 'exact', head: true }).eq('probleme', true),
    supabase.from('hub_purchase_orders').select('*', { count: 'exact', head: true }).eq('statut', 'en attente'),
    supabase.from('commandes_pop_up').select('*', { count: 'exact', head: true }).neq('statut', 'recue'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('actif', true),
    supabase.from('pop_ups').select('*', { count: 'exact', head: true }).eq('actif', true),
    supabase.from('hub_pins').select('*', { count: 'exact', head: true }),
    supabase.from('hub_packs').select('*', { count: 'exact', head: true }),
  ]);

  // Même seuil que la modale "Alertes" de Database Pin's (< 30% du seuil cible), pour que ce
  // chiffre corresponde exactement à ce qu'on voit en cliquant dessus.
  const pinsAlerte = (pinsPourSeuil ?? []).filter((p) => {
    const stock = Number(p.stock ?? 0);
    const seuil = Number(p.seuil_cible ?? 0);
    return seuil > 0 && stock < seuil * 0.3;
  }).length;

  const caCarte = (ventesSumup ?? []).filter((v) => v.statut === 'SUCCESSFUL').reduce((s, v) => s + v.montant, 0);
  const caEspeces = (ventesEspeces ?? []).filter((v) => v.statut === 'confirmee').reduce((s, v) => s + v.montant, 0);
  const caMois =
    (ventesMoisSumup ?? []).filter((v) => v.statut === 'SUCCESSFUL').reduce((s, v) => s + v.montant, 0) +
    (ventesMoisEspeces ?? []).filter((v) => v.statut === 'confirmee').reduce((s, v) => s + v.montant, 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Tableau de bord</h1>
      <p className="mb-6 text-sm text-slate-400">Pimp It Hub — vue d&apos;ensemble du jour.</p>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Aujourd&apos;hui</p>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Carte titre="CA carte aujourd'hui" valeur={formatMontant(caCarte)} />
        <Carte titre="Espèces aujourd'hui" valeur={formatMontant(caEspeces)} />
        <Carte titre="CA du mois" valeur={formatMontant(caMois)} />
        <Carte titre="Créneaux planifiés aujourd'hui" valeur={String(shiftsAujourdhui?.length ?? 0)} />
      </div>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">À traiter</p>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CarteLien
          href="/pins"
          titre="Pin's sous 30% du seuil"
          valeur={String(pinsAlerte)}
          sousTitre="Voir les alertes"
          accent={pinsAlerte > 0 ? 'red' : undefined}
        />
        <CarteLien
          href="/commandes"
          titre="Commandes fournisseurs en attente"
          valeur={String(commandesFournisseurEnAttente ?? 0)}
          sousTitre="À réceptionner"
          accent={(commandesFournisseurEnAttente ?? 0) > 0 ? 'amber' : undefined}
        />
        <CarteLien
          href="/local"
          titre="Commandes pop-up à préparer"
          valeur={String(commandesPopUpAPreparer ?? 0)}
          sousTitre="Espace Local"
          accent={(commandesPopUpAPreparer ?? 0) > 0 ? 'amber' : undefined}
        />
        <CarteLien
          href="/pins-unite"
          titre="Pin's pas encore en ligne"
          valeur={String(pinsARajouter ?? 0)}
          sousTitre="À ajouter à un produit Shopify"
          accent={(pinsARajouter ?? 0) > 0 ? 'amber' : undefined}
        />
      </div>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Aperçu</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <LienRapide href="/equipe" label="Membres d'équipe actifs" valeur={String(equipeActive ?? 0)} />
        <LienRapide href="/pop-ups" label="Pop-ups actifs" valeur={String(popUpsActifs ?? 0)} />
        <LienRapide href="/pins" label="Pin's en catalogue" valeur={String(pinsTotal ?? 0)} />
        <LienRapide href="/packs" label="Packs de pin's" valeur={String(packsTotal ?? 0)} />
        <LienRapide href="/packs" label="Packs signalés à problème" valeur={String(packsAProbleme ?? 0)} />
        <LienRapide href="/planning" label="Planning de la semaine" valeur="voir" />
      </div>
    </div>
  );
}
