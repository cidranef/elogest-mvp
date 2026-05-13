import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthUser, isAuthError } from "@/lib/auth-guard";
import {
  canUseAdminAreaAccess,
  getActiveUserAccessFromCookies,
} from "@/lib/user-access";



/* =========================================================
   ADMIN LAYOUT GUARD - ELOGEST

   Arquivo:
   src/app/admin/layout.tsx

   Protege toda a área:
   /admin/*

   ETAPA 42.2.3 — SEGURANÇA DE SEPARAÇÃO DE AMBIENTES

   Regras:
   - Não autenticado → /login
   - SUPER_ADMIN → /elogest/dashboard
   - ADMINISTRADORA com administratorId → permite
   - Qualquer outro perfil → /contexto

   Observação:
   /admin é a área operacional da administradora cliente.
   O Super Admin deve usar /elogest.
   ========================================================= */

export const dynamic = "force-dynamic";



export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    const sessionUser = await getAuthUser();

    /*
       Bloqueio imediato por sessão.
       Mesmo que exista cookie antigo de contexto, SUPER_ADMIN
       não deve renderizar nenhuma rota dentro de /admin.
    */
    if (sessionUser.role === "SUPER_ADMIN") {
      redirect("/elogest/dashboard");
    }

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: sessionUser.id,
    });

    if (activeAccess?.role === "SUPER_ADMIN") {
      redirect("/elogest/dashboard");
    }

    if (!canUseAdminAreaAccess(activeAccess)) {
      redirect("/contexto");
    }

    return <>{children}</>;
  } catch (error) {
    if (isAuthError(error)) {
      redirect("/login");
    }

    throw error;
  }
}
