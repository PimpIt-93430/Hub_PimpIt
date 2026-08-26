import { ProfilExpeditionClient } from './ProfilExpeditionClient';

/** Réplique l'écran "Profils d'expédition" de l'ancien admin (Shopify Pimp IT/admin/public/
 * index.html, screen-shipping) — pure Shopify Admin API, pas de Supabase. Le chargement est
 * manuel (bouton "Analyser les profils"), donc la page reste un simple wrapper client. */
export default function ProfilExpeditionPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Profils d&apos;expédition</h1>
      <p className="mb-6 text-sm text-slate-400">
        Analysez et gérez l&apos;assignation de vos produits aux profils d&apos;expédition Shopify.
      </p>

      <ProfilExpeditionClient />
    </div>
  );
}
