import { redirect } from 'next/navigation';

import { DeconnexionBouton } from '@/components/DeconnexionBouton';
import { determinerRoleHub } from '@/lib/roles';
import { definirApercuProfil } from './profil/actions';
import { SidebarNav, type SectionNav } from './SidebarNav';

const SECTIONS: SectionNav[] = [
  {
    titre: null,
    couleur: 'indigo',
    liens: [
      { href: '/', label: 'Tableau de bord', icone: '🏠' },
      { href: '/pins', label: "Pin's", icone: '📌' },
    ],
  },
  {
    // Écrans repris à l'identique de l'ancien site et vérifiés (données + interface), au fur et à
    // mesure — cf. demande utilisateur du 2026-08-26 : les regrouper ici pour distinguer d'un
    // coup d'œil ce qui est déjà bon de ce qui reste à refaire.
    titre: 'Vérifiés',
    couleur: 'emerald',
    liens: [
      { href: '/pins-unite', label: "Pin's à l'unité", icone: '🔗' },
      { href: '/packs', label: "Packs de pin's", icone: '🎁' },
      { href: '/commandes', label: 'Commandes fournisseurs', icone: '📦' },
      { href: '/profil-expedition', label: "Profil d'expédition", icone: '🚚' },
    ],
  },
  // Sections "Shopify" (Produits) et "Airtable" (Sabots, Sabots personnalisés, Produits
  // complémentaires, Clients, Tâches, Recommandations) volontairement retirées du menu à la
  // demande de l'utilisateur (2026-08-26) — mises de côté, pas supprimées : les pages existent
  // toujours sous app/(hub)/produits, sabots, sabots-custom, produits-complementaires, clients,
  // taches, recommandations, on verra plus tard si elles sont reprises.
  {
    titre: 'Application',
    couleur: 'sky',
    liens: [
      { href: '/planning', label: 'Planning', icone: '📅' },
      { href: '/equipe', label: 'Équipe', icone: '👥' },
      { href: '/ventes', label: 'Ventes', icone: '💰' },
      { href: '/stock', label: 'Stock pop-up', icone: '📊' },
      { href: '/stock-cible', label: 'Stock cible', icone: '🎯' },
      { href: '/pop-ups', label: 'Pop-ups', icone: '🏪' },
      { href: '/profil', label: 'Profil', icone: '👤' },
    ],
  },
];

/** Le Hub (ce layout et tout ce qui est en-dessous) reste réservé aux admins — cf. discussion
 * 2026-08-26 : on construit un espace séparé par rôle plutôt que d'ouvrir le Hub tel quel à tout
 * le monde. Une personne connectée non-admin est renvoyée vers son espace (/local pour l'instant,
 * d'autres à venir), pas vers une page d'erreur — elle a un compte valide, juste pas ici. */
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const { role, profil, enApercu } = await determinerRoleHub();
  if (role !== 'admin') redirect('/local');

  const nomAffiche = profil?.nom_complet ?? profil?.email ?? '';

  return (
    <div className="flex min-h-screen flex-col">
      {enApercu && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs font-semibold text-amber-800">
          Tu vois le Hub comme {nomAffiche} le verrait
          <form action={definirApercuProfil.bind(null, null)}>
            <button type="submit" className="underline">
              Revenir à mon compte
            </button>
          </form>
        </div>
      )}
      <div className="flex flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
          <div className="mb-8 flex items-center gap-2.5 px-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-base shadow-sm">
              📌
            </div>
            <div>
              <p className="text-base font-bold leading-tight text-slate-900">Pimp It Hub</p>
              <p className="text-xs text-slate-400">{nomAffiche}</p>
            </div>
          </div>

          <SidebarNav sections={SECTIONS} />

          <DeconnexionBouton />
        </aside>

        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
