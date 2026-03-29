/**
 * Middleware de Next.js — Tenant resolution + Auth guard
 *
 * Responsabilidades:
 * 1. Detectar subdominio o dominio personalizado → resolver tenant
 * 2. Redirigir a /login si el usuario no está autenticado en rutas protegidas
 * 3. Redirigir al onboarding si el JWT no tiene tenant_id
 * 4. Redirigir a /portal si es un paciente intentando acceder al dashboard
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const ROOT_DOMAIN = process.env['NEXT_PUBLIC_ROOT_DOMAIN'] ?? 'medicore.ec';

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? '';
  const pathname = request.nextUrl.pathname;

  // -------------------------------------------------------
  // 1. Resolver tenant desde subdominio/dominio personalizado
  // -------------------------------------------------------
  const isRootDomain =
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}` ||
    hostname.includes('localhost') && !hostname.includes('.localhost');

  let tenantSlug: string | null = null;

  if (!isRootDomain) {
    if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
      // Subdominio: slug.medicore.ec
      tenantSlug = hostname.replace(`.${ROOT_DOMAIN}`, '');
    } else if (hostname.endsWith('.localhost:3000') || hostname.endsWith('.localhost')) {
      // Desarrollo local: slug.localhost:3000
      tenantSlug = hostname.split('.')[0] ?? null;
    } else {
      // Dominio personalizado — se resolverá en el layout del tenant
      tenantSlug = hostname;
    }
  }

  // -------------------------------------------------------
  // 2. Supabase SSR — verificar sesión
  // -------------------------------------------------------
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // -------------------------------------------------------
  // 3. Rutas del tenant app (slug.medicore.ec/...)
  // -------------------------------------------------------
  if (tenantSlug) {
    // Auth paths se sirven directamente (sin rewrite) para evitar redirect loops
    const isAuthPath =
      pathname.startsWith('/login') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/onboarding');

    if (isAuthPath) {
      return response;
    }

    // Si el path ya incluye /app/[slug]/ redirigir sin ese prefijo para evitar double-nesting
    const appPrefix = `/app/${tenantSlug}`;
    if (pathname.startsWith(`${appPrefix}/`) || pathname === appPrefix) {
      const cleanPath = pathname.slice(appPrefix.length) || '/';
      const cleanUrl = new URL(cleanPath, request.url);
      return NextResponse.redirect(cleanUrl);
    }

    // Reescribir internamente a /app/[slug]/...
    const url = request.nextUrl.clone();
    const isPortalPath = pathname.startsWith('/portal');

    if (!isPortalPath) {
      url.pathname = `/app/${tenantSlug}${pathname}`;
    }

    // Proteger rutas de app — requerir autenticación
    if (!isPortalPath && !user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      loginUrl.searchParams.set('tenant', tenantSlug);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.rewrite(url);
  }

  // -------------------------------------------------------
  // 4. Rutas del dominio raíz
  // -------------------------------------------------------

  // Proteger rutas del dashboard
  const isProtectedPath =
    pathname.startsWith('/app') ||
    pathname.startsWith('/onboarding');

  if (isProtectedPath && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Si hay sesión y va a login/register, redirigir
  const isAuthPath = pathname.startsWith('/login') || pathname.startsWith('/register');
  if (isAuthPath && user) {
    // Redirigir a onboarding — si ya tiene tenant, ese page redirige al dashboard
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Excluir archivos estáticos y _next
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
