import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser, isAuthError } from "@/lib/auth-guard";
import {
  canUseAdminAreaAccess,
  getActiveUserAccessFromCookies,
  type ActiveUserAccess,
} from "@/lib/user-access";



/* =========================================================
   ADMIN API GUARD - ELOGEST

   Arquivo:
   src/lib/admin-api-guard.ts

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   Objetivo:
   - Centralizar a proteção das APIs administrativas:
     /api/admin/*
   - Garantir que a área administrativa seja usada apenas por
     perfil ativo ADMINISTRADORA.
   - Bloquear chamadas diretas às APIs quando a administradora
     vinculada estiver INACTIVE.
   - Evitar que o layout /admin seja a única camada de segurança.

   Regra estratégica:
   - SUPER_ADMIN opera em /elogest e /api/elogest/*.
   - ADMINISTRADORA opera em /admin e /api/admin/*,
     somente se a administradora estiver ACTIVE.
   - Perfis de portal operam em /portal e /api/portal/*.

   Correção de build:
   - Adicionada validação explícita de activeAccess antes de retornar
     o objeto do guard.
   - Isso evita o erro TypeScript:
     Type 'ActiveUserAccess | null' is not assignable to type 'ActiveUserAccess'.

   Uso recomendado nas rotas /api/admin/*:

   const auth = await requireActiveAdminApiAccess();

   if ("error" in auth) {
     return auth.error;
   }

   const { activeAccess, administratorId } = auth;

   Depois disso, usar administratorId nos filtros Prisma.
   ========================================================= */



/* =========================================================
   TIPOS
   ========================================================= */

export type AdminApiGuardUser = {
  id: string;
  role?: string | null;
  name?: string | null;
  email?: string | null;
};



export type ActiveAdminApiAccess = {
  authUser: AdminApiGuardUser;
  activeAccess: ActiveUserAccess;
  administratorId: string;
  administrator: {
    id: string;
    name: string;
    status: string;
  };
};



export type AdminApiGuardResult =
  | ActiveAdminApiAccess
  | {
      error: NextResponse;
    };



/* =========================================================
   RESPOSTAS PADRÃO
   ========================================================= */

function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: "Usuário não autenticado.",
    },
    {
      status: 401,
    }
  );
}



function forbiddenResponse(message = "Acesso restrito à administradora.") {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 403,
    }
  );
}



function inactiveAdministratorResponse() {
  return NextResponse.json(
    {
      error:
        "A administradora vinculada a este perfil está inativa. O acesso às rotinas administrativas foi bloqueado.",
      code: "ADMINISTRATOR_INACTIVE",
    },
    {
      status: 403,
    }
  );
}



/* =========================================================
   GUARD PRINCIPAL DAS APIs ADMINISTRATIVAS
   ========================================================= */

export async function requireActiveAdminApiAccess(): Promise<AdminApiGuardResult> {
  try {
    const authUser = (await getAuthUser()) as AdminApiGuardUser;

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: authUser.id,
    });

    /*
       Correção importante para TypeScript e segurança:
       primeiro validamos explicitamente se activeAccess existe.
       Assim, depois desta condição, o TypeScript entende que
       activeAccess não é mais null.
    */
    if (!activeAccess) {
      return {
        error: forbiddenResponse(
          "Não foi possível identificar o perfil administrativo ativo."
        ),
      };
    }

    /*
       /api/admin/* é área da administradora cliente.

       SUPER_ADMIN não deve operar por aqui.
       A visão global e as rotas globais pertencem a /api/elogest/*.
    */
    if (!canUseAdminAreaAccess(activeAccess)) {
      return {
        error: forbiddenResponse(
          "Acesso restrito à área administrativa da administradora."
        ),
      };
    }

    const administratorId = activeAccess.administratorId || null;

    if (!administratorId) {
      return {
        error: forbiddenResponse(
          "Perfil administrativo sem administradora vinculada."
        ),
      };
    }

    /*
       ETAPA 44 — BLOQUEIO POR STATUS DA ADMINISTRADORA

       Mesmo que o usuário e o UserAccess estejam ativos, a administradora
       cliente pode ter sido inativada pelo Super Admin EloGest.

       Neste caso, as APIs /api/admin/* também devem bloquear.
    */
    const administrator = await db.administrator.findUnique({
      where: {
        id: administratorId,
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!administrator) {
      return {
        error: forbiddenResponse(
          "Administradora vinculada ao perfil não foi encontrada."
        ),
      };
    }

    if (administrator.status !== "ACTIVE") {
      return {
        error: inactiveAdministratorResponse(),
      };
    }

    return {
      authUser,
      activeAccess,
      administratorId,
      administrator,
    };
  } catch (error) {
    if (isAuthError(error)) {
      return {
        error: unauthorizedResponse(),
      };
    }

    console.error("Erro ao validar acesso administrativo:", error);

    return {
      error: NextResponse.json(
        {
          error: "Não foi possível validar o acesso administrativo.",
        },
        {
          status: 500,
        }
      ),
    };
  }
}



/* =========================================================
   HELPERS COMPLEMENTARES

   Usar quando a rota já executou requireActiveAdminApiAccess()
   e precisa comparar escopo de carteira com segurança.
   ========================================================= */

export function getAdminApiAdministratorId(auth: ActiveAdminApiAccess) {
  return auth.administratorId;
}



export function assertSameAdministratorScope(
  auth: ActiveAdminApiAccess,
  administratorId?: string | null
) {
  return !!administratorId && administratorId === auth.administratorId;
}



export function adminScopeForbiddenResponse() {
  return forbiddenResponse(
    "Acesso negado para dados de outra administradora."
  );
}
