import { Prisma, Role, Status } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import { canAssignTicket } from "@/lib/access-control";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";



/* =========================================================
   RESPONSÁVEIS VÁLIDOS PARA UM CHAMADO

   Revisão de lint/segurança:
   - Removidos tipos any.
   - Adicionado requireActiveAdminApiAccess().
   - Mantida operação exclusiva para ADMINISTRADORA ativa.
   - Mantido isolamento por administratorId do activeAccess.
   ========================================================= */



type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



type AuthSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
};



type ResponsaveisContextUser = AuthSessionUser & {
  activeAccess: ActiveUserAccess | null;
};



type ContextValidationResult =
  | {
      ok: true;
      status: 200;
      message: "";
    }
  | {
      ok: false;
      status: 403;
      message: string;
    };



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO
   ========================================================= */

async function getResponsaveisContextUser(): Promise<ResponsaveisContextUser> {
  const sessionUser = (await getAuthUser()) as AuthSessionUser | null;

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess: ActiveUserAccess | null =
    await getActiveUserAccessFromCookies({
      userId: sessionUser.id,
    });

  if (!activeAccess) {
    return {
      ...sessionUser,
      activeAccess: null,
    };
  }

  return {
    ...sessionUser,

    role: activeAccess.role || sessionUser.role,

    administratorId:
      activeAccess.administratorId !== undefined
        ? activeAccess.administratorId
        : sessionUser.administratorId,

    condominiumId:
      activeAccess.condominiumId !== undefined
        ? activeAccess.condominiumId
        : sessionUser.condominiumId,

    unitId:
      activeAccess.unitId !== undefined
        ? activeAccess.unitId
        : sessionUser.unitId,

    residentId:
      activeAccess.residentId !== undefined
        ? activeAccess.residentId
        : sessionUser.residentId,

    activeAccess,
  };
}



/* =========================================================
   VALIDA CONTEXTO DA ROTA ADMINISTRATIVA
   ========================================================= */

function validateResponsaveisContext(
  user: ResponsaveisContextUser
): ContextValidationResult {
  const activeAccess = user.activeAccess;

  if (!activeAccess) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!isAdministradoraAccess(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso à rota administrativa de responsáveis. Use o portal ou a área EloGest.",
    };
  }

  if (!user.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canAssignTicket(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para listar responsáveis do chamado.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



/* =========================================================
   FILTRO DO CHAMADO PELO CONTEXTO ATIVO
   ========================================================= */

function getTicketWhereByContext(
  user: ResponsaveisContextUser,
  ticketId: string
): Prisma.TicketWhereInput {
  const activeAccess = user.activeAccess;

  if (activeAccess && isAdministradoraAccess(activeAccess) && user.administratorId) {
    return {
      id: ticketId,
      condominium: {
        administratorId: user.administratorId,
      },
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



/* =========================================================
   GET - LISTAR RESPONSÁVEIS VÁLIDOS PARA O CHAMADO
   ========================================================= */

export async function GET(_req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getResponsaveisContextUser();
    const { id } = await context.params;

    const ticketId = cleanText(id);

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateResponsaveisContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const chamado = await db.ticket.findFirst({
      where: getTicketWhereByContext(user, ticketId),
      include: {
        condominium: {
          include: {
            administrator: true,
          },
        },
      },
    });

    if (!chamado) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    if (
      chamado.condominium?.status !== Status.ACTIVE ||
      chamado.condominium?.administrator?.status !== Status.ACTIVE
    ) {
      return NextResponse.json([]);
    }

    const responsaveis = await db.user.findMany({
      where: {
        isActive: true,
        OR: [
          {
            role: Role.ADMINISTRADORA,
            administratorId: chamado.condominium.administratorId,
            administrator: {
              status: Status.ACTIVE,
            },
          },
          {
            role: Role.SINDICO,
            condominiumId: chamado.condominiumId,
            condominium: {
              status: Status.ACTIVE,
              administrator: {
                status: Status.ACTIVE,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,

        administratorId: true,
        condominiumId: true,

        administrator: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },

        condominium: {
          select: {
            id: true,
            name: true,
            status: true,
            administratorId: true,
          },
        },
      },
      orderBy: [
        {
          role: "asc",
        },
        {
          name: "asc",
        },
      ],
    });

    return NextResponse.json(responsaveis);
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR RESPONSÁVEIS DO CHAMADO:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (isPrismaKnownRequestError(error)) {
      return NextResponse.json(
        { error: "Erro ao consultar responsáveis." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao listar responsáveis." },
      { status: 500 }
    );
  }
}
