import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthUser, isAuthError } from "@/lib/auth-guard";
import {
  canUseEloGestAreaAccess,
  getActiveUserAccessFromCookies,
  getDefaultHomeForAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";



/* =========================================================
   ELOGEST LAYOUT GUARD

   Arquivo:
   src/app/elogest/layout.tsx

   Protege toda a área:
   /elogest/*

   ETAPA 42.2.3 — SEGURANÇA DE SEPARAÇÃO DE AMBIENTES

   Regras:
   - Não autenticado → /login
   - SUPER_ADMIN → permite
   - Outros perfis → redireciona para sua área correta

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   Revisão final:
   - /elogest permanece exclusivo para perfil ativo SUPER_ADMIN.
   - ADMINISTRADORA é redirecionada para /admin.
   - Perfis de portal são redirecionados para /portal.
   - Sem perfil ativo, o usuário volta para /contexto.

   ETAPA 47 — PLANOS, MÓDULOS E LIMITES

   Correção:
   - JSX não é mais construído dentro do try/catch, evitando alerta do
     React Compiler em react-hooks/error-boundaries.

   Observação:
   /elogest é a área interna da dona da plataforma.
   Administradoras devem usar /admin.
   Portal deve usar /portal.
   ========================================================= */

export const dynamic = "force-dynamic";



export default async function EloGestLayout({
  children,
}: {
  children: ReactNode;
}) {
  let activeAccess: ActiveUserAccess | null = null;

  try {
    const sessionUser = await getAuthUser();

    activeAccess = await getActiveUserAccessFromCookies({
      userId: sessionUser.id,
    });
  } catch (error) {
    if (isAuthError(error)) {
      redirect("/login");
    }

    throw error;
  }

  if (!canUseEloGestAreaAccess(activeAccess)) {
    redirect(getDefaultHomeForAccess(activeAccess));
  }

  return <>{children}</>;
}
