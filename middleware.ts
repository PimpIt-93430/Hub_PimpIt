import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Rafraîchit la session Supabase à chaque requête et protège tout le Hub derrière /login — un
 * admin non connecté est redirigé, quelle que soit la page demandée. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesAEcrire: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesAEcrire) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesAEcrire) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const surPageConnexion =
    request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/premiere-connexion');
  // /revendeurs (cf. app/revendeurs) : catalogue B2B public, remplace l'ancienne page Railway
  // "Espace Revendeur" — jamais derrière /login, accessible sans compte, aussi bien pour un
  // revendeur que pour un admin qui la prévisualise (pas de redirection dans un sens ni l'autre).
  const surPageRevendeurs = request.nextUrl.pathname.startsWith('/revendeurs');

  if (!user && !surPageConnexion && !surPageRevendeurs) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && surPageConnexion) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Rôle Hub "comptable" (cf. lib/roles.ts, migration 0092) : accès restreint au Planning en
  // lecture seule (+ Profil pour se déconnecter) — bloqué ici, avant même le rendu de la page,
  // plutôt que de rajouter un exigerAdmin-like sur chacune des ~15 autres routes du Hub. Une seule
  // requête profiles de plus, uniquement pour une personne connectée qui vise une page hors de
  // cette liste.
  if (user && !surPageConnexion && !surPageRevendeurs) {
    const autorise =
      request.nextUrl.pathname.startsWith('/planning') || request.nextUrl.pathname.startsWith('/profil');
    if (!autorise) {
      const { data: profil } = await supabase
        .from('profiles')
        .select('role, hub_role_comptable')
        .eq('id', user.id)
        .maybeSingle();
      if (profil && profil.role !== 'admin' && profil.hub_role_comptable) {
        const url = request.nextUrl.clone();
        url.pathname = '/planning';
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
