import Link from 'next/link';

import { determinerRoleHub } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

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
  const ajd = debutJour.toISOString().slice(0, 10);

  const [
    { data: ventesSumup },
    { data: ventesEspeces },
    { data: ventesMoisSumup },
    { data: ventesMoisEspeces },
    { data: mesCreneauxAujourdhui },
    { data: pinsPourAlerte },
    { data: packsAProbleme },
    { count: pinsARajouter },
    { count: commandesFournisseurEnAttente },
    { count: commandesPopUpAPreparer },
    { data: commandesFournisseurRecentes },
    { data: commandesPopUpRecentes },
  ] = await Promise.all([
    supabase.from('ventes_sumup').select('montant, statut').gte('horodatage', debutJour.toISOString()),
    supabase.from('ventes_especes').select('montant, statut').gte('created_at', debutJour.toISOString()),
    supabase.from('ventes_sumup').select('montant, statut').gte('horodatage', debutMois.toISOString()),
    supabase.from('ventes_especes').select('montant, statut').gte('created_at', debutMois.toISOString()),
    profil
      ? supabase
          .from('planning_shifts')
          .select('id, heure_debut, heure_fin, pop_up:pop_ups(nom, couleur)')
          .eq('profile_id', profil.id)
          .eq('date', ajd)
          .order('heure_debut')
      : Promise.resolve({ data: null }),
    supabase.from('hub_pins').select('name, stock, seuil_cible'),
    supabase.from('hub_packs').select('nom_du_pack').eq('probleme', true).limit(4),
    supabase.from('hub_pins').select('*', { count: 'exact', head: true }).eq('pas_dans_unite', true),
    supabase.from('hub_purchase_orders').select('*', { count: 'exact', head: true }).eq('statut', 'en attente'),
    supabase.from('commandes_pop_up').select('*', { count: 'exact', head: true }).neq('statut', 'recue'),
    supabase.from('hub_purchase_orders').select('id, ref, label, statut, date_creation, date_reception').order('date_creation', { ascending: false }).limit(5),
    supabase.from('commandes_pop_up').select('id, statut, envoyee_at, recue_at, pop_up:pop_ups(nom)').order('envoyee_at', { ascending: false }).limit(5),
  ]);

  const caCarte = (ventesSumup ?? []).filter((v) => v.statut === 'SUCCESSFUL').reduce((s, v) => s + v.montant, 0);
  const caEspeces = (ventesEspeces ?? []).filter((v) => v.statut === 'confirmee').reduce((s, v) => s + v.montant, 0);
  const caMois =
    (ventesMoisSumup ?? []).filter((v) => v.statut === 'SUCCESSFUL').reduce((s, v) => s + v.montant, 0) +
    (ventesMoisEspeces ?? []).filter((v) => v.statut === 'confirmee').reduce((s, v) => s + v.montant, 0);

  // Même seuil que la modale "Alertes" de Database Pin's (< 30% du seuil cible).
  const pinsCritiques = (pinsPourAlerte ?? [])
    .map((p) => ({ nom: p.name, stock: Number(p.stock ?? 0), seuil: Number(p.seuil_cible ?? 0) }))
    .filter((p) => p.seuil > 0 && p.stock < p.seuil * 0.3)
    .map((p) => ({ ...p, pct: Math.round((p.stock / p.seuil) * 100) }))
    .sort((a, b) => a.pct - b.pct);

  const taches = [
    (commandesFournisseurEnAttente ?? 0) > 0 && {
      texte: `${commandesFournisseurEnAttente} commande${(commandesFournisseurEnAttente ?? 0) > 1 ? 's' : ''} fournisseur à réceptionner`,
      href: '/commandes',
    },
    (commandesPopUpAPreparer ?? 0) > 0 && {
      texte: `${commandesPopUpAPreparer} commande${(commandesPopUpAPreparer ?? 0) > 1 ? 's' : ''} pop-up à préparer`,
      href: '/local',
    },
    pinsCritiques.length > 0 && { texte: `${pinsCritiques.length} pin's à recommander (stock critique)`, href: '/pins' },
    (packsAProbleme ?? []).length > 0 && { texte: `${(packsAProbleme ?? []).length} pack(s) signalé(s) à problème`, href: '/packs' },
    (pinsARajouter ?? 0) > 0 && { texte: `${pinsARajouter} pin's pas encore en ligne`, href: '/pins-unite' },
  ].filter((t): t is { texte: string; href: string } => Boolean(t));

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

  const raccourcis = [
    { href: '/pins', label: "Pin's", icone: '📌' },
    { href: '/commandes', label: 'Commandes fourn.', icone: '📦' },
    { href: '/equipe', label: 'Équipe', icone: '👥' },
    { href: '/planning', label: 'Planning', icone: '📅' },
    { href: '/stock', label: 'Stock pop-up', icone: '📊' },
    { href: '/ventes', label: 'Ventes', icone: '💰' },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Tableau de bord</h1>
      <p className="mb-6 text-sm text-slate-400">
        {profil?.nom_complet ? `Bonjour ${profil.nom_complet.split(' ')[0]} — ` : ''}vue d&apos;ensemble du jour.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Tâches quotidiennes */}
        <Carte titre="Tâches quotidiennes" icone="📋" couleur="indigo">
          {taches.length === 0 ? (
            <EtatVide texte="Rien en attente 🎉" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {taches.map((t) => (
                <li key={t.href + t.texte}>
                  <Link
                    href={t.href}
                    className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="flex-1">{t.texte}</span>
                    <span className="text-slate-300">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        {/* Chiffres de la journée */}
        <Carte titre="Chiffres de la journée" icone="💰" couleur="emerald">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">CA carte</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatMontant(caCarte)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Espèces</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatMontant(caEspeces)}</p>
            </div>
            <div className="col-span-2 rounded-xl bg-emerald-50 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">CA du mois</p>
              <p className="mt-1 text-xl font-bold text-emerald-800">{formatMontant(caMois)}</p>
            </div>
          </div>
        </Carte>

        {/* Mon planning */}
        <Carte titre="Mon planning" icone="📅" couleur="violet" href="/planning">
          {!mesCreneauxAujourdhui || mesCreneauxAujourdhui.length === 0 ? (
            <EtatVide texte="Aucun créneau pour toi aujourd'hui" />
          ) : (
            <ul className="flex flex-col gap-2">
              {mesCreneauxAujourdhui.map((c) => {
                const popUp = c.pop_up as unknown as { nom: string; couleur: string | null } | null;
                return (
                  <li key={c.id} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: popUp?.couleur ?? '#94a3b8' }} />
                    <span className="flex-1 text-sm font-semibold text-slate-800">{popUp?.nom ?? '—'}</span>
                    <span className="text-xs text-slate-500">
                      {c.heure_debut?.slice(0, 5)}–{c.heure_fin?.slice(0, 5)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Carte>

        {/* Alertes */}
        <Carte titre="Alertes" icone="🔔" couleur="amber">
          {pinsCritiques.length === 0 && (packsAProbleme ?? []).length === 0 ? (
            <EtatVide texte="Aucune alerte 🎉" />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pinsCritiques.slice(0, 4).map((p) => (
                <li key={p.nom}>
                  <Link href="/pins" className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-slate-50">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{p.pct}%</span>
                    <span className="flex-1 truncate text-slate-700">{p.nom}</span>
                  </Link>
                </li>
              ))}
              {(packsAProbleme ?? []).map((p) => (
                <li key={p.nom_du_pack}>
                  <Link href="/packs" className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-slate-50">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">!</span>
                    <span className="flex-1 truncate text-slate-700">{p.nom_du_pack}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        {/* Raccourcis rapides */}
        <Carte titre="Raccourcis rapides" icone="⚡" couleur="sky">
          <div className="grid grid-cols-2 gap-2">
            {raccourcis.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-slate-50 px-2 py-4 text-center hover:bg-slate-100"
              >
                <span className="text-lg">{r.icone}</span>
                <span className="text-xs font-semibold text-slate-600">{r.label}</span>
              </Link>
            ))}
          </div>
        </Carte>

        {/* Activité récente */}
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
  );
}
