import {
  Prisma,
  type Administrator,
  type Condominium,
  type Resident,
  type Ticket,
  type Unit,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageCondominiums } from "@/lib/access-control";



/* =========================================================
   DETALHE DO CONDOMÍNIO - API ADMINISTRATIVA

   ETAPA 45.3 — DETALHE OPERACIONAL DO CONDOMÍNIO

   ETAPA 45.7 — REVISÃO FINAL / ESCALABILIDADE
   - Mantida proteção por administradora ativa.
   - Mantida proteção por activeAccess ADMINISTRADORA.
   - Mantida permissão MANAGE_CONDOMINIUMS.
   - Mantido isolamento por administratorId do perfil ativo.
   - Removida necessidade de carregar listas completas apenas para
     calcular resumos.
   - Resumos passam a usar count().
   - Prévias passam a buscar somente registros recentes/necessários.
   - Removido helper não utilizado para manter lint limpo.
   - Preparado para condomínios com grande volume de unidades,
     moradores e chamados.

   Objetivo:
   - Retornar o condomínio completo dentro da carteira ativa.
   - Retornar resumo de unidades vinculadas.
   - Retornar resumo de moradores/proprietários vinculados.
   - Retornar chamados recentes do condomínio.
   - Preparar base para vínculos, governança, comunicados,
     assembleias, fornecedores, financeiro e relatórios.

   Segurança:
   - Exige administradora ativa.
   - Exige perfil ativo de ADMINISTRADORA.
   - Exige permissão MANAGE_CONDOMINIUMS.
   - SUPER_ADMIN não opera por /admin.
   - O condomínio precisa pertencer à administradora do perfil ativo.
   - administratorId nunca é aceito via body/query.
   ========================================================= */



interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}



/* =========================================================
   TYPES
   ========================================================= */

type AuthSessionUser = {
  id: string;
  role?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
};



type AdminContextUser = AuthSessionUser & {
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



type CondominiumBase = Condominium & {
  administrator: Administrator;
};



type RelatedUnit = Pick<
  Unit,
  "id" | "status" | "unitNumber" | "block" | "createdAt"
>;



type RelatedResident = Pick<
  Resident,
  "id" | "status" | "name" | "email" | "phone" | "createdAt"
> & {
  unit?: Pick<Unit, "id" | "unitNumber" | "block"> | null;
};



type RelatedTicket = Pick<
  Ticket,
  "id" | "title" | "status" | "priority" | "createdAt"
> & {
  unit?: Pick<Unit, "id" | "unitNumber" | "block"> | null;
};



type OperationalSummaries = {
  unitsTotal: number;
  unitsActive: number;
  unitsRecent: RelatedUnit[];

  residentsTotal: number;
  residentsActive: number;
  residentsRecent: RelatedResident[];

  ticketsTotal: number;
  ticketsOpen: number;
  ticketsRecent: RelatedTicket[];
};



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



async function getAdminContextUser(): Promise<AdminContextUser> {
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



function validateAdminContext(user: AdminContextUser): ContextValidationResult {
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
        "Este contexto não possui acesso ao detalhe administrativo de condomínios.",
    };
  }

  if (!activeAccess.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canManageCondominiums(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para gerenciar condomínios.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



function getAdministratorIdFromContext(user: AdminContextUser) {
  return user.activeAccess?.administratorId || null;
}



function buildUnitLabel(unit?: Pick<Unit, "unitNumber" | "block"> | null) {
  if (!unit) {
    return "-";
  }

  const parts = [unit.block, unit.unitNumber].filter(Boolean);

  return parts.length > 0 ? parts.join(" - ") : unit.unitNumber || "-";
}



function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}



/* =========================================================
   RESPOSTA PADRONIZADA
   ========================================================= */

function buildCondominiumResponse({
  condominio,
  summaries,
}: {
  condominio: CondominiumBase;
  summaries: OperationalSummaries;
}) {
  const unidadesRecentes = summaries.unitsRecent.map((unit) => ({
    id: unit.id,
    unitNumber: unit.unitNumber,
    block: unit.block,
    label: buildUnitLabel(unit),
    status: unit.status,
    createdAt: unit.createdAt,
  }));

  const moradoresRecentes = summaries.residentsRecent.map((resident) => ({
    id: resident.id,
    name: resident.name,
    email: resident.email,
    phone: resident.phone,
    status: resident.status,
    createdAt: resident.createdAt,
    unit: resident.unit
      ? {
          id: resident.unit.id,
          unitNumber: resident.unit.unitNumber,
          block: resident.unit.block,
          label: buildUnitLabel(resident.unit),
        }
      : null,
  }));

  const chamadosRecentes = summaries.ticketsRecent.map((ticket) => ({
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.createdAt,
    unit: ticket.unit
      ? {
          id: ticket.unit.id,
          unitNumber: ticket.unit.unitNumber,
          block: ticket.unit.block,
          label: buildUnitLabel(ticket.unit),
        }
      : null,
  }));

  return {
    condominio: {
      id: condominio.id,
      administratorId: condominio.administratorId,
      administrator: condominio.administrator,

      name: condominio.name,
      legalName: condominio.legalName,
      cnpj: condominio.cnpj,
      type: condominio.type,
      status: condominio.status,
      facadeImagePath: condominio.facadeImagePath,

      email: condominio.email,
      phone: condominio.phone,
      administrativeContactName: condominio.administrativeContactName,
      administrativeContactEmail: condominio.administrativeContactEmail,
      administrativeContactPhone: condominio.administrativeContactPhone,

      cep: condominio.cep,
      address: condominio.address,
      number: condominio.number,
      complement: condominio.complement,
      district: condominio.district,
      city: condominio.city,
      state: condominio.state,

      unitsCount: condominio.unitsCount,
      blocksCount: condominio.blocksCount,
      managementStartDate: condominio.managementStartDate,
      managementEndDate: condominio.managementEndDate,
      notes: condominio.notes,
      metadata: condominio.metadata,

      createdAt: condominio.createdAt,
      updatedAt: condominio.updatedAt,

      totalUnits: summaries.unitsTotal,
      activeUnits: summaries.unitsActive,

      totalResidents: summaries.residentsTotal,
      activeResidents: summaries.residentsActive,

      totalTickets: summaries.ticketsTotal,
      openTickets: summaries.ticketsOpen,
    },

    unidadesResumo: {
      total: summaries.unitsTotal,
      active: summaries.unitsActive,
      inactive: Math.max(summaries.unitsTotal - summaries.unitsActive, 0),
      recent: unidadesRecentes,
    },

    moradoresResumo: {
      total: summaries.residentsTotal,
      active: summaries.residentsActive,
      inactive: Math.max(
        summaries.residentsTotal - summaries.residentsActive,
        0
      ),
      recent: moradoresRecentes,
    },

    sindicoAtual: null,

    chamadosResumo: {
      total: summaries.ticketsTotal,
      open: summaries.ticketsOpen,
      recent: chamadosRecentes,
    },
  };
}



/* =========================================================
   GET - DETALHE OPERACIONAL DO CONDOMÍNIO
   ========================================================= */

export async function GET(_req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();
    const { id } = await context.params;
    const condominiumId = cleanText(id);

    if (!condominiumId) {
      return NextResponse.json(
        { error: "ID do condomínio não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateAdminContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const administratorId = getAdministratorIdFromContext(user);

    if (!administratorId) {
      return NextResponse.json(
        { error: "Contexto de administradora sem vínculo com administradora." },
        { status: 403 }
      );
    }



    /* =========================================================
       VALIDA ACESSO AO CONDOMÍNIO

       Mesmo que o ID seja válido, precisa pertencer à carteira
       da administradora do perfil ativo.
       ========================================================= */

    const condominio = await db.condominium.findFirst({
      where: {
        id: condominiumId,
        administratorId,
      },
      include: {
        administrator: true,
      },
    });

    if (!condominio) {
      return NextResponse.json(
        { error: "Condomínio não encontrado ou acesso negado." },
        { status: 404 }
      );
    }



    /* =========================================================
       RESUMOS E PRÉVIAS ESCALÁVEIS

       Importante:
       - Não carregamos todos os registros relacionados.
       - Contagens usam count().
       - Cards recentes usam take: 8.
       ========================================================= */

    const [
      unitsTotal,
      unitsActive,
      unitsRecent,

      residentsTotal,
      residentsActive,
      residentsRecent,

      ticketsTotal,
      ticketsOpen,
      ticketsRecent,
    ] = await Promise.all([
      db.unit.count({
        where: {
          condominiumId,
        },
      }),

      db.unit.count({
        where: {
          condominiumId,
          status: "ACTIVE",
        },
      }),

      db.unit.findMany({
        where: {
          condominiumId,
        },
        select: {
          id: true,
          unitNumber: true,
          block: true,
          status: true,
          createdAt: true,
        },
        orderBy: [
          {
            status: "asc",
          },
          {
            block: "asc",
          },
          {
            unitNumber: "asc",
          },
        ],
        take: 8,
      }),

      db.resident.count({
        where: {
          condominiumId,
        },
      }),

      db.resident.count({
        where: {
          condominiumId,
          status: "ACTIVE",
        },
      }),

      db.resident.findMany({
        where: {
          condominiumId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          unit: {
            select: {
              id: true,
              unitNumber: true,
              block: true,
            },
          },
        },
        orderBy: [
          {
            status: "asc",
          },
          {
            name: "asc",
          },
        ],
        take: 8,
      }),

      db.ticket.count({
        where: {
          condominiumId,
        },
      }),

      db.ticket.count({
        where: {
          condominiumId,
          status: {
            in: ["OPEN", "IN_PROGRESS"],
          },
        },
      }),

      db.ticket.findMany({
        where: {
          condominiumId,
        },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true,
          unit: {
            select: {
              id: true,
              unitNumber: true,
              block: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
      }),
    ]);

    return NextResponse.json(
      buildCondominiumResponse({
        condominio,
        summaries: {
          unitsTotal,
          unitsActive,
          unitsRecent,

          residentsTotal,
          residentsActive,
          residentsRecent,

          ticketsTotal,
          ticketsOpen,
          ticketsRecent,
        },
      })
    );
  } catch (error: unknown) {
    console.error("ERRO AO CARREGAR DETALHE DO CONDOMÍNIO:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (isPrismaKnownRequestError(error)) {
      return NextResponse.json(
        { error: "Erro ao consultar dados do condomínio." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao carregar detalhe do condomínio." },
      { status: 500 }
    );
  }
}