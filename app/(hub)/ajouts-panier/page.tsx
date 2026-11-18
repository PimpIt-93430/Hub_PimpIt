import Link from 'next/link';

import { exigerAdmin } from '@/lib/roles';
import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface StatPage {
  page_path: string | null;
  ajouts: number;
  articles: number;
  visiteurs: number;
  visiteurs_commande: number;
}

interface StatProduit {
  page_path: string | null;
  produit_titre: string | null;
  variante_titre: string | null;
  sku: string | null;
  ajouts: number;
  articles: number;
}

const PERIODES = [1, 7, 30, 90];

function pourcentage(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)} %` : '—';
}

/** Ajouts au panier par page (retour utilisateur du 2026-11-18) — alimenté par le pixel
 * personnalisé Shopify (scripts/shopify-pixel-ajouts-panier.js de l'appli, table
 * shopify_evenements_panier, migration 0138) : la page EXACTE où le bouton "Ajouter au panier" a été
 * cliqué, ce que Shopify Analytics ne donne pas (page d'entrée seulement). */
export default async function AjoutsPanierPage({ searchParams }: { searchParams: Promise<{ jours?: string; page?: string }> }) {
  await exigerAdmin();
  const params = await searchParams;
  const jours = PERIODES.includes(Number(params.jours)) ? Number(params.jours) : 7;
  const pageChoisie = params.page ?? null;
  const depuis = new Date(Date.now() - jours * 24 * 3600 * 1000).toISOString();

  const supabase = await creerClientSupabaseServeur();
  const [{ data: parPage, error: erreurPage }, { data: parProduit }, { data: derniers }] = await Promise.all([
    supabase.rpc('stats_ajouts_panier_par_page', { p_depuis: depuis }),
    supabase.rpc('stats_ajouts_panier_par_produit', { p_depuis: depuis }),
    supabase.from('shopify_evenements_panier').select('created_at').order('created_at', { ascending: false }).limit(1),
  ]);

  const pages = ((parPage ?? []) as StatPage[]).map((p) => ({ ...p, ajouts: Number(p.ajouts), articles: Number(p.articles), visiteurs: Number(p.visiteurs), visiteurs_commande: Number(p.visiteurs_commande) }));
  const produits = ((parProduit ?? []) as StatProduit[])
    .map((p) => ({ ...p, ajouts: Number(p.ajouts), articles: Number(p.articles) }))
    .filter((p) => !pageChoisie || p.page_path === pageChoisie);
  const totalAjouts = pages.reduce((s, p) => s + p.ajouts, 0);
  const totalArticles = pages.reduce((s, p) => s + p.articles, 0);
  const dernierEvenement = (derniers as { created_at: string }[] | null)?.[0]?.created_at;

  // Regroupe les pin's par produit sur la sélection (toutes pages ou la page choisie).
  const produitsAgreges = new Map<string, { titre: string; variante: string | null; sku: string | null; ajouts: number; articles: number }>();
  for (const p of produits) {
    const cle = `${p.produit_titre}|${p.variante_titre}|${p.sku}`;
    const actuel = produitsAgreges.get(cle) ?? { titre: p.produit_titre ?? '?', variante: p.variante_titre, sku: p.sku, ajouts: 0, articles: 0 };
    actuel.ajouts += p.ajouts;
    actuel.articles += p.articles;
    produitsAgreges.set(cle, actuel);
  }
  const topProduits = [...produitsAgreges.values()].sort((a, b) => b.ajouts - a.ajouts).slice(0, 40);

  const lien = (j: number, page: string | null) => `/ajouts-panier?jours=${j}${page ? `&page=${encodeURIComponent(page)}` : ''}`;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Ajouts au panier</h1>
      <p className="mb-6 text-sm text-slate-400">
        Page exacte où le client a cliqué sur « Ajouter au panier » sur pimp-it.store (pixel Shopify). « Ont commandé » = le
        même visiteur a passé commande dans les 7 jours.
        {dernierEvenement
          ? ` Dernier ajout reçu : ${new Date(dernierEvenement).toLocaleString('fr-FR')}.`
          : ' Aucun ajout reçu pour l’instant — vérifie que le pixel est bien connecté dans Shopify.'}
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {PERIODES.map((j) => (
          <Link
            key={j}
            href={lien(j, pageChoisie)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${j === jours ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {j === 1 ? '24 h' : `${j} jours`}
          </Link>
        ))}
        <span className="ml-2 text-sm font-semibold text-slate-600">
          {totalAjouts} ajout{totalAjouts > 1 ? 's' : ''} · {totalArticles} article{totalArticles > 1 ? 's' : ''}
        </span>
      </div>

      {erreurPage && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreurPage.message}</p>}

      <div className="mb-8 overflow-x-auto rounded-[20px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Page où l&apos;ajout a été fait</th>
              <th className="px-4 py-3 text-right">Ajouts</th>
              <th className="px-4 py-3 text-right">Part</th>
              <th className="px-4 py-3 text-right">Articles</th>
              <th className="px-4 py-3 text-right">Visiteurs</th>
              <th className="px-4 py-3 text-right">Ont commandé</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.page_path ?? '?'} className={`border-b border-slate-50 last:border-0 ${p.page_path === pageChoisie ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                <td className="px-4 py-3">
                  <Link href={lien(jours, p.page_path === pageChoisie ? null : p.page_path)} className="font-semibold text-indigo-600 hover:underline">
                    {p.page_path ?? '(inconnue)'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-bold text-slate-800">{p.ajouts}</td>
                <td className="px-4 py-3 text-right text-slate-500">{pourcentage(p.ajouts, totalAjouts)}</td>
                <td className="px-4 py-3 text-right text-slate-600">{p.articles}</td>
                <td className="px-4 py-3 text-right text-slate-600">{p.visiteurs}</td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                  {p.visiteurs_commande} ({pourcentage(p.visiteurs_commande, p.visiteurs)})
                </td>
              </tr>
            ))}
            {pages.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  Aucun ajout au panier sur cette période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-bold text-slate-900">
        Pin&apos;s les plus ajoutés {pageChoisie ? `depuis ${pageChoisie}` : '(toutes pages)'}
        {pageChoisie && (
          <Link href={lien(jours, null)} className="ml-3 text-xs font-semibold text-indigo-600 hover:underline">
            voir toutes les pages
          </Link>
        )}
      </h2>
      <div className="overflow-x-auto rounded-[20px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Produit</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Ajouts</th>
              <th className="px-4 py-3 text-right">Articles</th>
            </tr>
          </thead>
          <tbody>
            {topProduits.map((p, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 text-slate-700">
                  {p.titre}
                  {p.variante && p.variante !== 'Default Title' ? <span className="text-slate-400"> — {p.variante}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-slate-500">{p.sku ?? '—'}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-800">{p.ajouts}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{p.articles}</td>
              </tr>
            ))}
            {topProduits.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                  Rien pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
