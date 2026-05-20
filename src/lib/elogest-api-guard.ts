import { NextResponse } from "next/server";
import {
  getAuthUser,
  isAuthError,
  type AuthUser,
} from "@/lib/auth-guard";
import {
  canUseEloGestAreaAccess,
  getActiveUserAccessFromCookies,
} from "@/lib/user-access";



/* =========================================================
   ELOGEST API GUARD

   Arquivo sugerido:
   src/lib/elogest-api-guard.ts

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   Objetivo:
   - Centralizar a proteção das APIs internas da EloGest.
   - Evitar repetição de requireSuperAdmin() em cada rota.
   - Garantir que /api/elogest/* use o perfil ativo/UserAccess.
   - Manter /elogest como área exclusiva do SUPER_ADMIN.

   Regra oficial:
   - Não autenticado → 401
   - Perfil ativo diferente de SUPER_ADMIN → 403
   - Perfil ativo SUPER_ADMIN → permite

   Observação importante:
   Este helper deve ser usado nas rotas:
   - src/app/api/elogest/*

   A área operacional da administradora continua usando /admin.
   O portal continua usando /portal.
   ========================================================= */



export type EloGestApiAuth = {
  authUser: AuthUser;
  activeAccess: Awaited<ReturnType<typeof getActiveUserAccessFromCookies>>;
};



export type EloGestApiGuardResult =
  | EloGestApiAuth
  | {
      error: NextResponse;
    };



export async function requireEloGestSuperAdmin(): Promise<EloGestApiGuardResult> {
  try {
    const authUser = await getAuthUser();

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: authUser.id,
    });

    if (!canUseEloGestAreaAccess(activeAccess)) {
      return {
        error: NextResponse.json(
          {
            error: "Acesso restrito ao Super Admin EloGest.",
          },
          {
            status: 403,
          }
        ),
      };
    }

    return {
      authUser,
      activeAccess,
    };
  } catch (error) {
    if (isAuthError(error)) {
      return {
        error: NextResponse.json(
          {
            error: "Usuário não autenticado.",
          },
          {
            status: 401,
          }
        ),
      };
    }

    throw error;
  }
}
