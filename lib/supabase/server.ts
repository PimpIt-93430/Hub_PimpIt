import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Client Supabase côté serveur (Server Components / Route Handlers), lié à la session cookie de
 * la personne connectée — clé anon uniquement, jamais de service role : le Hub compte sur la RLS
 * existante (is_admin()) pour l'accès élevé, exactement comme l'app mobile/web Pimp It. */
export async function creerClientSupabaseServeur() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesAEcrire: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesAEcrire) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Appelé depuis un Server Component (pas un Route Handler/Server Action) : l'écriture
            // de cookie y est interdite, sans conséquence tant que le middleware rafraîchit la
            // session (cf. middleware.ts).
          }
        },
      },
    },
  );
}
