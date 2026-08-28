'use client';

import { useState, useTransition } from 'react';

import { basculerTacheQuotidienne, creerTacheQuotidienne, retirerTacheQuotidienne, type TacheQuotidienne } from './taches-quotidiennes-actions';

function domaineDuLien(lien: string): string | null {
  try {
    return new URL(lien).hostname;
  } catch {
    return null;
  }
}

/** Domaine racine (2 derniers segments, ex. message.alibaba.com → alibaba.com) — Google s2 renvoie
 * souvent une icône générique 16px pour un sous-domaine qu'il ne connaît pas spécifiquement, alors
 * qu'il a la vraie favicon du domaine principal. */
function domaineRacine(hostname: string): string {
  const parties = hostname.split('.');
  return parties.length <= 2 ? hostname : parties.slice(-2).join('.');
}

/** Favicon de la tâche. Trois cas :
 * 1) `icone` est déjà une URL d'image (posée à la main en base pour une tâche de départ, cf.
 *    migration hub_taches_quotidiennes icone/lien) — utilisée telle quelle. Google s2 (cf. cas 2)
 *    s'est révélé trop peu fiable pour ces services précis (réponses tantôt bonnes, tantôt une
 *    icône générique 16px, de façon non déterministe d'un appel à l'autre) : pour eux, on hotlink
 *    directement la vraie favicon depuis le CDN du service.
 * 2) Sinon, tentative via Google s2 à partir du lien, en 2 paliers : sous-domaine exact (ex.
 *    mail.google.com), puis domaine racine si le premier n'a renvoyé que l'icône générique 16px
 *    (ex. message.alibaba.com → alibaba.com).
 * 3) Repli sur l'emoji si tout échoue ou qu'il n'y a pas de lien. */
function IconeTache({ icone, lien }: { icone: string | null; lien: string | null }) {
  // Hook appelé inconditionnellement (règle des hooks) même s'il ne sert pas dans le cas 1 ci-dessous.
  const [palier, setPalier] = useState<'sous-domaine' | 'racine' | 'emoji'>('sous-domaine');

  if (icone?.startsWith('http')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icone} alt="" className="h-4 w-4 shrink-0 rounded-sm" />;
  }

  const hostname = lien ? domaineDuLien(lien) : null;
  const domaine =
    palier === 'sous-domaine' ? hostname : palier === 'racine' && hostname ? domaineRacine(hostname) : null;

  if (domaine && palier !== 'emoji') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://www.google.com/s2/favicons?sz=64&domain=${domaine}`}
        alt=""
        className="h-4 w-4 shrink-0 rounded-sm"
        onLoad={(e) => {
          // Icône générique (16px) malgré la taille sz=64 demandée : Google n'a pas de favicon
          // spécifique pour ce sous-domaine exact — on retente avec le domaine racine.
          if (palier === 'sous-domaine' && e.currentTarget.naturalWidth <= 16) setPalier('racine');
        }}
        onError={() => setPalier((p) => (p === 'sous-domaine' ? 'racine' : 'emoji'))}
      />
    );
  }
  if (icone) return <span className="shrink-0 text-sm">{icone}</span>;
  return null;
}

/** Checklist quotidienne (cf. discussion 2026-08-27 : pas un calcul automatique — une vraie liste
 * de tâches récurrentes fixes, cochée à la main chaque jour, qui se réinitialise le lendemain). */
export function TachesQuotidiennesCard({ tachesInitiales }: { tachesInitiales: TacheQuotidienne[] }) {
  const [taches, setTaches] = useState(tachesInitiales);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [nouveauLibelle, setNouveauLibelle] = useState('');
  const [, demarrer] = useTransition();

  const basculer = (id: string) => {
    setTaches((ts) => ts.map((t) => (t.id === id ? { ...t, valideAujourdhui: !t.valideAujourdhui } : t)));
    const tache = taches.find((t) => t.id === id);
    demarrer(async () => {
      try {
        await basculerTacheQuotidienne(id, !tache?.valideAujourdhui);
      } catch {
        // en cas d'échec (droits...), on resynchronise l'affichage sur l'état d'avant
        setTaches((ts) => ts.map((t) => (t.id === id ? { ...t, valideAujourdhui: tache?.valideAujourdhui ?? false } : t)));
      }
    });
  };

  const retirer = (id: string) => {
    setTaches((ts) => ts.filter((t) => t.id !== id));
    demarrer(() => retirerTacheQuotidienne(id));
  };

  const ajouter = () => {
    const libelle = nouveauLibelle.trim();
    if (!libelle) return;
    setNouveauLibelle('');
    setAjoutOuvert(false);
    demarrer(async () => {
      await creerTacheQuotidienne(libelle);
      setTaches((ts) => [...ts, { id: `temp-${Date.now()}`, libelle, icone: null, lien: null, valideAujourdhui: false }]);
    });
  };

  const nbFaites = taches.filter((t) => t.valideAujourdhui).length;

  return (
    <>
      <div className="mb-1 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm text-indigo-600">📋</span>
        <h2 className="text-sm font-bold text-slate-900">Tâches quotidiennes</h2>
        <span className="ml-auto text-xs font-semibold text-slate-400">
          {nbFaites}/{taches.length}
        </span>
      </div>

      <div className="mt-4 flex-1">
        {taches.length === 0 ? (
          <p className="flex h-full items-center justify-center text-center text-sm text-slate-400">Aucune tâche pour l&apos;instant</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {taches.map((t) => (
              <li key={t.id} className="group flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50">
                <button
                  onClick={() => basculer(t.id)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    t.valideAujourdhui ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {t.valideAujourdhui && <span className="text-[10px] font-bold text-white">✓</span>}
                </button>
                <IconeTache icone={t.icone} lien={t.lien} />
                {t.lien ? (
                  <a
                    href={t.lien}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex-1 text-left text-sm hover:underline ${t.valideAujourdhui ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                  >
                    {t.libelle}
                  </a>
                ) : (
                  <span className={`flex-1 text-left text-sm ${t.valideAujourdhui ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {t.libelle}
                  </span>
                )}
                <button
                  onClick={() => retirer(t.id)}
                  className="shrink-0 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                  title="Retirer"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ajoutOuvert ? (
        <div className="mt-2 flex gap-1.5">
          <input
            autoFocus
            value={nouveauLibelle}
            onChange={(e) => setNouveauLibelle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ajouter();
              if (e.key === 'Escape') setAjoutOuvert(false);
            }}
            placeholder="Nouvelle tâche…"
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
          <button onClick={ajouter} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">
            Ajouter
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAjoutOuvert(true)}
          className="mt-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-400 hover:text-indigo-600"
        >
          + Ajouter une tâche
        </button>
      )}
    </>
  );
}
