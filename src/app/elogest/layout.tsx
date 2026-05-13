import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthUser, isAuthError } from "@/lib/auth-guard";
import {
  canUseEloGestAreaAccess,
  getActiveUserAccessFromCookies,
  getDefaultHomeForAccess,
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
  try {
    const sessionUser = await getAuthUser();

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: sessionUser.id,
    });

    if (!canUseEloGestAreaAccess(activeAccess)) {
      redirect(getDefaultHomeForAccess(activeAccess));
    }

    return <>{children}</>;
  } catch (error) {
    if (isAuthError(error)) {
      redirect("/login");
    }

    throw error;
  }
}
