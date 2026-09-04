import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DeconnexionBouton } from '@/components/DeconnexionBouton';
import { determinerRoleHub } from '@/lib/roles';
import { definirApercuProfil } from './profil/actions';
import { SidebarNav, type CategorieNav } from './SidebarNav';

const ACCUEIL = { href: '/', label: 'Tableau de bord', icone: '🏠' };

/** Menu en catégories par pôle d'activité (cf. discussion 2026-08-27, réorganisé le 2026-08-28 :
 * Logistique = commandes uniquement, Pop up = tout ce qui concerne les lieux de vente) plutôt qu'un
 * mur de liens. "Commercial" (Clients/Tâches/Recommandations) n'existe pas encore ici : ces écrans
 * restent mis de côté (cf. commentaire plus bas) tant qu'ils ne sont pas repris — pas de catégorie
 * vide affichée. Profil est volontairement hors catégorie (cf. rendu plus bas, à côté de
 * Déconnexion) : c'est personnel, pas un pôle d'activité. */
const CATEGORIES: CategorieNav[] = [
  {
    titre: 'Gestion des produits',
    icone: '📌',
    couleur: 'indigo',
    liens: [
      { href: '/pins', label: "Pin's", icone: '📌' },
      { href: '/pins-unite', label: "Pin's à l'unité", icone: '🔗' },
      { href: '/packs', label: "Packs de pin's", icone: '🎁' },
      { href: '/profil-expedition', label: "Profil d'expédition", icone: '🚚' },
      { href: '/tiktok-shop', label: 'TikTok Shop', icone: '🎵' },
    ],
  },
  {
    titre: 'Logistique',
    icone: '🚚',
    couleur: 'sky',
    liens: [
      { href: '/commandes', label: 'Commandes fournisseurs', icone: '📦' },
      { href: '/commandes-shopify', label: 'Commandes Shopify', icone: '🛒' },
    ],
  },
  {
    titre: 'Pop up',
    icone: '🏪',
    couleur: 'amber',
    liens: [
      { href: '/pop-ups', label: 'Pop up', icone: '🏪' },
      { href: '/stock-cible', label: 'Stock cible', icone: '🎯' },
      { href: '/stock', label: 'Stock pop up', icone: '📊' },
    ],
  },
  {
    titre: 'Planning & RH',
    icone: '📅',
    couleur: 'violet',
    liens: [
      { href: '/planning', label: 'Planning', icone: '📅' },
      { href: '/equipe', label: 'Équipe', icone: '👥' },
      { href: '/export-comptable', label: 'Export comptable', icone: '🧾' },
    ],
  },
  {
    titre: 'Finance',
    icone: '💰',
    couleur: 'emerald',
    liens: [{ href: '/ventes', label: 'Ventes', icone: '💰' }],
  },
  // "Commercial" (Clients, Tâches, Recommandations) et les autres écrans Shopify/Airtable mis de
  // côté le 2026-08-26 (Produits, Sabots, Sabots personnalisés, Produits complémentaires) restent
  // sur le disque (app/(hub)/produits, sabots, sabots-custom, produits-complementaires, clients,
  // taches, recommandations) — à rajouter ici en nouvelle catégorie le jour où ils sont repris.
];

/** Le Hub s'ouvre à trois rôles — cf. discussion 2026-08-29 : l'admin (accès complet), "local"
 * (l'équipe qui travaille au local, cf. determinerRoleHub) qui voit tout SAUF Finance, Export
 * comptable et Équipe (salaires/infos RH nominatives — cf. exigerAdmin, appelé en plus sur ces 3
 * pages : cacher le lien ici ne suffit pas, il faut aussi bloquer l'accès direct par URL), et
 * "comptable" (cf. migration 0092, retour utilisateur du 2026-09-04) qui ne voit que Planning, en
 * lecture seule (bloqué en plus côté middleware et actions serveur, cf. leurs en-têtes). Un
 * compte "inconnu" (connecté mais sans rôle Hub) est renvoyé vers /local, pas vers une page
 * d'erreur — il a un compte valide, juste pas encore de rôle attribué ici. */
export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const { role, profil, enApercu } = await determinerRoleHub();
  if (role === 'inconnu') redirect('/local');

  const estAdmin = role === 'admin';
  const estComptable = role === 'comptable';
  const seulementPlanning = (liens: CategorieNav['liens']) => liens.filter((l) => l.href === '/planning');
  const categories = estAdmin
    ? CATEGORIES
    : estComptable
      ? CATEGORIES.filter((c) => c.titre === 'Planning & RH').map((c) => ({ ...c, liens: seulementPlanning(c.liens) }))
      : CATEGORIES.filter((c) => c.titre !== 'Finance').map((c) =>
          c.titre === 'Planning & RH' ? { ...c, liens: seulementPlanning(c.liens) } : c,
        );
  // Pas de "Tableau de bord" pour un comptable : le middleware le renverrait de toute façon vers
  // /planning, autant ne pas afficher un lien mort.
  const epingles = estComptable ? [] : [ACCUEIL];

  const nomAffiche = profil?.nom_complet ?? profil?.email ?? '';
  const initiale = (profil?.nom_complet || profil?.email || '?').slice(0, 1).toUpperCase();
  const couleurAvatar = profil?.couleur ?? '#4F46E5';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
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
        {/* Sidebar sombre — cf. référence visuelle 2026-08-27 (fintech dashboard). Masquée à
            l'impression (print:hidden) : personne ne veut le menu dans un PDF exporté depuis une
            page du Hub, cf. Export comptable (2026-08-28). */}
        <aside className="flex w-64 shrink-0 flex-col bg-[#15141F] px-4 py-6 print:hidden">
          <div className="mb-8 flex items-center gap-2.5 px-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-base shadow-sm">
              📌
            </div>
            <p className="text-base font-bold leading-tight text-white">Pimp It Hub</p>
          </div>

          <SidebarNav epingles={epingles} categories={categories} />

          <div className="mt-2 border-t border-white/10 pt-2">
            <Link
              href="/profil"
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm">👤</span>
              Profil
            </Link>
            <DeconnexionBouton variant="dark" />
          </div>
        </aside>

        <div className="flex flex-1 flex-col">
          {/* Barre du haut — recherche à venir une fois qu'il y aura quelque chose de pertinent à
              chercher (cf. discussion 2026-08-27) : pour l'instant juste le raccourci profil, pas
              de contrôle qui ferait semblant de marcher. */}
          <header className="flex h-16 shrink-0 items-center justify-end border-b border-slate-200 bg-white px-8 print:hidden">
            <Link href="/profil" className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3 hover:bg-slate-50">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: couleurAvatar }}
              >
                {initiale}
              </span>
              <span className="text-sm font-semibold text-slate-700">{nomAffiche}</span>
            </Link>
          </header>

          <main className="flex-1 px-8 py-8 print:p-0">
            <div className="mx-auto max-w-[1800px] print:max-w-none">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
