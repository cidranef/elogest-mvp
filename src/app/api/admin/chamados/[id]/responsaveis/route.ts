import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { Role, Status } from "@prisma/client";
import {
  canAssignTicket,
  isAdministradora,
  isSuperAdmin,
} from "@/lib/access-control";



/* =========================================================
   RESPONSÁVEIS VÁLIDOS PARA UM CHAMADO

   ETAPA 35.5 — FILTROS DE REGISTROS ATIVOS NOS FLUXOS OPERACIONAIS

   Retorna somente usuários que podem receber atribuição:

   - ADMINISTRADORA da mesma carteira do condomínio do chamado
   - SÍNDICO do mesmo condomínio do chamado

   Bloqueia como responsáveis:
   - MORADOR
   - PROPRIETÁRIO
   - CONSELHEIRO
   - SÍNDICO de outro condomínio
   - ADMINISTRADORA de outra carteira
   - usuário inativo
   - usuário vinculado a condomínio/administradora inativa

   Regras da rota:
   - /api/admin/... é exclusiva para contexto SUPER_ADMIN ou ADMINISTRADORA
   - SÍNDICO deve operar pelo portal
   - MORADOR / PROPRIETÁRIO devem operar pelo portal
   - Histórico do chamado permanece preservado

   ETAPA 40.3 — AUDITORIA DOS CHAMADOS PONTA A PONTA

   Ajustes desta revisão:
   - Contexto administrativo passa a usar helpers da matriz central.
   - Listagem de responsáveis exige permissão ASSIGN_TICKET.
   - ID da rota é normalizado.
   - Filtro do chamado fica defensivo contra contexto inválido.
   - Mantida regra de retornar [] quando condomínio/administradora
     estiver inativo, pois atribuição é ação operacional.
   ========================================================= */



type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO

   A sessão base identifica quem está logado.
   O contexto ativo define com qual papel/carteira ele está
   operando naquele momento.
   ========================================================= */

async function getResponsaveisContextUser() {
  const sessionUser: any = await getAuthUser();

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess: any = await getActiveUserAccessFromCookies({
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

   Permitidos:
   - SUPER_ADMIN
   - ADMINISTRADORA

   Bloqueados:
   - SINDICO
   - MORADOR
   - PROPRIETARIO
   - CONSELHEIRO
   ========================================================= */

function validateResponsaveisContext(user: any) {
  if (!user?.activeAccess) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!isSuperAdmin(user) && !isAdministradora(user)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso à rota administrativa de responsáveis. Use o portal.",
    };
  }

  if (isAdministradora(user) && !user.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canAssignTicket(user)) {
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

   SUPER_ADMIN:
   - acessa qualquer chamado.

   ADMINISTRADORA:
   - acessa chamados da administradora ativa.

   Defesa:
   - contexto inválido retorna filtro impossível.
   ========================================================= */

function getTicketWhereByContext(user: any, ticketId: string) {
  if (isSuperAdmin(user)) {
    return {
      id: ticketId,
    };
  }

  if (isAdministradora(user) && user.administratorId) {
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

export async function GET(req: Request, context: RouteContext) {
  try {
    const user: any = await getResponsaveisContextUser();
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



    /* =========================================================
       BUSCA DO CHAMADO COM VALIDAÇÃO DE ACESSO

       A busca respeita o contexto ativo administrativo:

       - SUPER_ADMIN: qualquer chamado;
       - ADMINISTRADORA: apenas carteira ativa.
       ========================================================= */

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



    /* =========================================================
       BLOQUEIO OPERACIONAL PARA CONDOMÍNIO INATIVO

       Observação:
       - O detalhe do chamado pode continuar exibindo histórico.
       - Porém, atribuir novo responsável é ação operacional.
       - Portanto, se condomínio ou administradora estiver inativo,
         não retornamos responsáveis para nova atribuição.
       ========================================================= */

    if (
      chamado.condominium?.status !== Status.ACTIVE ||
      chamado.condominium?.administrator?.status !== Status.ACTIVE
    ) {
      return NextResponse.json([]);
    }



    /* =========================================================
       RESPONSÁVEIS VÁLIDOS

       Regras:
       - usuário ativo;
       - ADMINISTRADORA da mesma carteira;
       - SÍNDICO do mesmo condomínio;
       - administradora/condomínio do responsável precisam estar ativos.
       ========================================================= */

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
  } catch (error: any) {
    console.error("ERRO AO LISTAR RESPONSÁVEIS DO CHAMADO:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao listar responsáveis." },
      { status: 500 }
    );
  }
}