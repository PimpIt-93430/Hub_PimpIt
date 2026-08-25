'use server';

import { revalidatePath } from 'next/cache';

import { creerClientSupabaseServeur } from '@/lib/supabase/server';

interface ResultatSynchroVentes {
  transactions_vues: number;
  nouvelles_ou_modifiees: number;
  reattributions: number;
  plafond_details_atteint: boolean;
}

/** Déclenche l'Edge Function `sync-ventes-sumup` (même fonction, même projet Supabase que l'app
 * Pimp It — cf. App PIMP IT/src/api/ventesSumup.ts) : récupère les nouvelles ventes SumUp et
 * réattribue pop-up/salarié sur toutes les ventes connues. Contrairement à l'app RN, qui la
 * déclenche automatiquement à l'ouverture de l'écran Finance, ici elle n'est appelée qu'au clic
 * sur "Actualiser" (cf. SyncButton.tsx) — sinon un Server Component rechargé à chaque requête
 * déclencherait la synchro en continu. */
export async function synchroniserVentes(): Promise<ResultatSynchroVentes> {
  const supabase = await creerClientSupabaseServeur();
  const { data, error } = await supabase.functions.invoke('sync-ventes-sumup', { body: {} });
  if (error) {
    // supabase-js ne lit pas le corps de la réponse pour nous sur une erreur HTTP (juste "Edge
    // Function returned a non-2xx status code") — on va chercher le vrai message qu'on renvoie
    // nous-mêmes (cf. reponseJson côté fonction) dans error.context, le Response brut.
    let message = error.message;
    const contexte = (error as { context?: unknown }).context;
    if (contexte instanceof Response) {
      try {
        const corps = await contexte.clone().json();
        if (corps?.error) message = corps.error;
      } catch {
        // Corps non-JSON (ex. timeout réseau) : on garde le message générique.
      }
    }
    throw new Error(message);
  }

  revalidatePath('/ventes');
  return data as ResultatSynchroVentes;
}
