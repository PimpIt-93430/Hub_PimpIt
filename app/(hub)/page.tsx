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
    { count: packsAProbleme },
    { count: commandesEnAttente },
    { count: tachesAFaire },
    { count: produitsShopifyActifs },
    { count: equipeActive },
    { data: popUps },
    { count: pinsTotal },
    { count: packsTotal },
  ] = await Promise.all([
    supabase.from('ventes_sumup').select('montant, statut').gte('horodatage', debutJour.toISOString()),
    supabase.from('ventes_especes').select('montant, statut').gte('created_at', debutJour.toISOString()),
    supabase.from('ventes_sumup').select('montant, statut').gte('horodatage', debutMois.toISOString()),
    supabase.from('ventes_especes').select('montant, statut').gte('created_at', debutMois.toISOString()),
    supabase.from('planning_shifts').select('id').eq('date', debutJour.toISOString().slice(0, 10)),
    supabase.from('hub_pins').select('stock, seuil_cible'),
    supabase.from('hub_packs').select('*', { count: 'exact', head: true }).eq('probleme', true),
    supabase.from('hub_purchase_orders').select('*', { count: 'exact', head: true }).eq('statut', 'en_attente'),
    supabase.from('hub_taches').select('*', { count: 'exact', head: true }).neq('statut', 'Terminé'),
    supabase.from('hub_produits_shopify').select('*', { count: 'exact', head: true }).eq('statut', 'active'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('actif', true),
    supabase.from('pop_ups').select('id, statut'),
    supabase.from('hub_pins').select('*', { count: 'exact', head: true }),
    supabase.from('hub_packs').select('*', { count: 'exact', head: true }),
  ]);

  const pinsSousLeSeuil = (pinsPourSeuil ?? []).filter((p) => (p.stock ?? 0) < (p.seuil_cible ?? 0)).length;

  const caCarte = (ventesSumup ?? []).filter((v) => v.statut === 'SUCCESSFUL').reduce((s, v) => s + v.montant, 0);
  const caEspeces = (ventesEspeces ?? []).filter((v) => v.statut === 'confirmee').reduce((s, v) => s + v.montant, 0);
  const caMois =
    (ventesMoisSumup ?? []).filter((v) => v.statut === 'SUCCESSFUL').reduce((s, v) => s + v.montant, 0) +
    (ventesMoisEspeces ?? []).filter((v) => v.statut === 'confirmee').reduce((s, v) => s + v.montant, 0);
  const popUpsActifs = (popUps ?? []).filter((p) => p.statut === 'actif' || p.statut === 'active').length;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Tableau de bord</h1>
      <p className="mb-6 text-sm text-slate-400">Pimp It Hub — Shopify, Airtable et Pimp It (app) au même endroit.</p>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Aujourd&apos;hui</p>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Carte titre="CA carte aujourd'hui" valeur={formatMontant(caCarte)} />
        <Carte titre="Espèces aujourd'hui" valeur={formatMontant(caEspeces)} />
        <Carte titre="CA du mois" valeur={formatMontant(caMois)} />
        <Carte titre="Créneaux planifiés aujourd'hui" valeur={String(shiftsAujourdhui?.length ?? 0)} />
      </div>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Alertes</p>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Carte
          titre="Pin's sous le seuil cible"
          valeur={String(pinsSousLeSeuil ?? 0)}
          sousTitre="Depuis Supabase (hub_pins)"
          accent={(pinsSousLeSeuil ?? 0) > 0 ? 'amber' : undefined}
        />
        <Carte
          titre="Packs signalés à problème"
          valeur={String(packsAProbleme ?? 0)}
          sousTitre="Depuis Supabase (hub_packs)"
          accent={(packsAProbleme ?? 0) > 0 ? 'red' : undefined}
        />
        <Carte
          titre="Commandes fournisseurs en attente"
          valeur={String(commandesEnAttente ?? 0)}
          sousTitre="Depuis Supabase (hub_purchase_orders)"
          accent={(commandesEnAttente ?? 0) > 0 ? 'amber' : undefined}
        />
        <Carte titre="Tâches à faire" valeur={String(tachesAFaire ?? 0)} sousTitre="Depuis Supabase (hub_taches)" />
      </div>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Aperçu</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <LienRapide href="/produits" label="Produits Shopify actifs" valeur={String(produitsShopifyActifs ?? 0)} />
        <LienRapide href="/equipe" label="Membres d'équipe actifs" valeur={String(equipeActive ?? 0)} />
        <LienRapide href="/pop-ups" label="Pop-ups actifs" valeur={String(popUpsActifs)} />
        <LienRapide href="/pins" label="Pin's en catalogue" valeur={String(pinsTotal ?? 0)} />
        <LienRapide href="/packs" label="Packs de pin's" valeur={String(packsTotal ?? 0)} />
        <LienRapide href="/commandes" label="Commandes fournisseurs" valeur="voir tout" />
      </div>

      <p className="mt-8 text-xs text-slate-400">
        La plupart des données du Hub sont synchronisées vers Supabase (tables hub_*) plutôt que
        lues en direct sur Airtable/Shopify à chaque page — plus rapide, et prêt pour la gestion
        complète à venir. Shopify/Airtable restent en lecture seule pour l&apos;instant ; seul
        Supabase est modifié par le Hub (de façon additive).
      </p>
    </div>
  );
}
