import Link from 'next/link';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { DeconnexionBouton } from './deconnexion-bouton';

const SECTIONS: { titre: string | null; liens: { href: string; label: string }[] }[] = [
  { titre: null, liens: [{ href: '/', label: 'Tableau de bord' }, { href: '/pins', label: "Pin's" }] },
  {
    // Écrans repris à l'identique de l'ancien site et vérifiés (données + interface), au fur et à
    // mesure — cf. demande utilisateur du 2026-08-26 : les regrouper ici pour distinguer d'un
    // coup d'œil ce qui est déjà bon de ce qui reste à refaire.
    titre: 'Vérifiés',
    liens: [
      { href: '/pins-unite', label: "Pin's à l'unité" },
      { href: '/packs', label: "Packs de pin's" },
      { href: '/commandes', label: 'Commandes fournisseurs' },
      { href: '/profil-expedition', label: "Profil d'expédition" },
    ],
  },
  // Sections "Shopify" (Produits) et "Airtable" (Sabots, Sabots personnalisés, Produits
  // complémentaires, Clients, Tâches, Recommandations) volontairement retirées du menu à la
  // demande de l'utilisateur (2026-08-26) — mises de côté, pas supprimées : les pages existent
  // toujours sous app/(hub)/produits, sabots, sabots-custom, produits-complementaires, clients,
  // taches, recommandations, on verra plus tard si elles sont reprises.
  {
    titre: 'Application',
    liens: [
      { href: '/planning', label: 'Planning' },
      { href: '/equipe', label: 'Équipe' },
      { href: '/ventes', label: 'Ventes' },
      { href: '/stock', label: 'Stock pop-up' },
      { href: '/stock-cible', label: 'Stock cible' },
      { href: '/pop-ups', label: 'Pop-ups' },
      { href: '/profil', label: 'Profil' },
    ],
  },
];

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const supabase = await creerClientSupabaseServeur();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let nomAffiche = user?.email ?? '';
  if (user) {
    const { data: profil } = await supabase.from('profiles').select('nom_complet').eq('id', user.id).maybeSingle();
    if (profil?.nom_complet) nomAffiche = profil.nom_complet;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
        <div className="mb-8 px-2">
          <p className="text-lg font-bold text-slate-900">Pimp It Hub</p>
          <p className="text-xs text-slate-400">{nomAffiche}</p>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {SECTIONS.map((section, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              {section.titre && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text2">
                  {section.titre}
                </p>
              )}
              {section.liens.map((lien) => (
                <Link
                  key={lien.href}
                  href={lien.href}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-text2 transition-colors hover:bg-bg hover:text-gray-900"
                >
                  {lien.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <DeconnexionBouton />
      </aside>

      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
