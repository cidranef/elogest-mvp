import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";



/* =========================================================
   PROXY DE PROTEÇÃO DE ROTAS - ELOGEST

   ETAPA 14:
   Protege rotas por perfil de usuário.

   Regras:

   - Usuário deslogado tentando acessar /admin ou /portal
     volta para /login.

   - SUPER_ADMIN / ADMINISTRADORA
     acessam área administrativa.

   - SINDICO / MORADOR
     acessam portal.

   - Usuário logado acessando /login
     é redirecionado para a área correta.
   ========================================================= */



type UserRole = "SUPER_ADMIN" | "ADMINISTRADORA" | "SINDICO" | "MORADOR" | string;



/* =========================================================
   HELPERS DE PERFIL
   ========================================================= */

function isAdminRole(role?: UserRole | null) {
  return role === "SUPER_ADMIN" || role === "ADMINISTRADORA";
}

function isPortalRole(role?: UserRole | null) {
  return role === "SINDICO" || role === "MORADOR";
}

function getHomeByRole(role?: UserRole | null) {
  if (isAdminRole(role)) {
    return "/admin/dashboard";
  }

  if (isPortalRole(role)) {
    return "/portal/dashboard";
  }

  return "/login";
}



/* =========================================================
   PROXY PRINCIPAL
   ========================================================= */

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const role = token?.role as UserRole | undefined;



  /* =========================================================
     USUÁRIO LOGADO ACESSANDO /login
     ========================================================= */

  if (pathname === "/login") {
    if (token) {
      const homeUrl = new URL(getHomeByRole(role), request.url);
      return NextResponse.redirect(homeUrl);
    }

    return NextResponse.next();
  }



  /* =========================================================
     ROTA LEGADA /dashboard
     ========================================================= */

  if (pathname === "/dashboard") {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    const homeUrl = new URL(getHomeByRole(role), request.url);
    return NextResponse.redirect(homeUrl);
  }



  /* =========================================================
     USUÁRIO DESLOGADO TENTANDO ACESSAR ÁREA PROTEGIDA
     ========================================================= */

  if (!token && (pathname.startsWith("/admin") || pathname.startsWith("/portal"))) {
    const loginUrl = new URL("/login", request.url);

    loginUrl.searchParams.set("callbackUrl", pathname);

    return NextResponse.redirect(loginUrl);
  }



  /* =========================================================
     BLOQUEIO DE ADMINISTRADOR NO PORTAL
     ========================================================= */

  if (pathname.startsWith("/portal") && isAdminRole(role)) {
    const adminUrl = new URL("/admin/dashboard", request.url);
    return NextResponse.redirect(adminUrl);
  }



  /* =========================================================
     BLOQUEIO DE SÍNDICO/MORADOR NA ÁREA ADMINISTRATIVA
     ========================================================= */

  if (pathname.startsWith("/admin") && isPortalRole(role)) {
    const portalUrl = new URL("/portal/dashboard", request.url);
    return NextResponse.redirect(portalUrl);
  }



  /* =========================================================
     PERFIL DESCONHECIDO
     ========================================================= */

  if (
    token &&
    (pathname.startsWith("/admin") || pathname.startsWith("/portal")) &&
    !isAdminRole(role) &&
    !isPortalRole(role)
  ) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }



  return NextResponse.next();
}



/* =========================================================
   MATCHER
   ========================================================= */

export const config = {
  matcher: [
    "/login",
    "/dashboard",
    "/admin/:path*",
    "/portal/:path*",
  ],
};