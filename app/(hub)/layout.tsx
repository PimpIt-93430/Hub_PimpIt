import Link from 'next/link';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';
import { DeconnexionBouton } from './deconnexion-bouton';

const SECTIONS: { titre: string | null; liens: { href: string; label: string }[] }[] = [
  { titre: null, liens: [{ href: '/', label: 'Tableau de bord' }] },
  {
    titre: 'Shopify',
    liens: [
      { href: '/produits', label: 'Produits' },
      { href: '/pins-unite', label: "Pin's à l'unité" },
    ],
  },
  {
    titre: 'Airtable',
    liens: [
      { href: '/pins', label: "Pin's" },
      { href: '/commandes', label: 'Commandes fournisseurs' },
      { href: '/packs', label: "Packs de pin's" },
      { href: '/sabots', label: 'Sabots' },
      { href: '/sabots-custom', label: 'Sabots personnalisés' },
      { href: '/produits-complementaires', label: 'Produits complémentaires' },
      { href: '/clients', label: 'Clients' },
      { href: '/taches', label: 'Tâches' },
      { href: '/recommandations', label: 'Recommandations' },
    ],
  },
  {
    titre: 'Pimp It (app)',
    liens: [
      { href: '/planning', label: 'Planning' },
      { href: '/equipe', label: 'Équipe' },
      { href: '/ventes', label: 'Ventes' },
      { href: '/stock', label: 'Stock pop-up' },
      { href: '/pop-ups', label: 'Pop-ups' },
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
            <div key={i} className="flex flex-col gap-1">
              {section.titre && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {section.titre}
                </p>
              )}
              {section.liens.map((lien) => (
                <Link
                  key={lien.href}
                  href={lien.href}
                  className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  {lien.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <DeconnexionBouton />
      </aside>

      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
