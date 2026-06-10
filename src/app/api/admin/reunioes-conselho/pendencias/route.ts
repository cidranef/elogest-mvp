import { NextRequest, NextResponse } from "next/server";
import {
  CouncilAgendaItemStatus,
  CouncilMeetingStatus,
  Status,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { MODULE_SLUGS } from "@/lib/plan-limits";

/* =========================================================
   API ADMIN - PENDÊNCIAS ABERTAS DE REUNIÕES DE CONSELHO

   Arquivo:
   src/app/api/admin/reunioes-conselho/pendencias/route.ts

   ETAPA 49.8 — PENDÊNCIAS DE REUNIÕES ANTERIORES

   Método:
   - GET: lista pautas ainda não finalizadas de reuniões anteriores
     da carteira ativa da administradora.

   Uso previsto:
   - Administradora acompanhar pendências por condomínio.
   - Futuramente permitir reaproveitar pendências abertas na criação
     de uma nova reunião de conselho.

   Segurança:
   - Exige administradora ativa.
   - Exige módulo Reuniões De Conselho liberado no plano.
   - Retorna apenas condomínios da carteira ativa da administradora.
   ========================================================= */

const OPEN_PENDING_STATUSES: CouncilAgendaItemStatus[] = [
  CouncilAgendaItemStatus.OPEN,
  CouncilAgendaItemStatus.DISCUSSED,
  CouncilAgendaItemStatus.POSTPONED,
];

const MEETING_VISIBLE_STATUSES: CouncilMeetingStatus[] = [
  CouncilMeetingStatus.SCHEDULED,
  CouncilMeetingStatus.IN_PROGRESS,
  CouncilMeetingStatus.COMPLETED,
];

function normalizeQueryParam(value: string | null) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseTake(value: string | null) {
  const parsed = Number(value || "");

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.floor(parsed), 100);
}

function buildSearchWhere(search: string | null): Prisma.CouncilMeetingAgendaItemWhereInput {
  if (!search) {
    return {};
  }

  return {
    OR: [
      {
        title: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        discussionNotes: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        decision: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        responsibleName: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        councilMeeting: {
          title: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
    ],
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminModuleApiAccess(
    MODULE_SLUGS.REUNIOES_CONSELHO,
    "Reuniões De Conselho",
  );

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const url = new URL(request.url);
    const condominiumId = normalizeQueryParam(url.searchParams.get("condominiumId"));
    const search = normalizeQueryParam(url.searchParams.get("q"));
    const take = parseTake(url.searchParams.get("take"));

    if (condominiumId) {
      const condominium = await db.condominium.findFirst({
        where: {
          id: condominiumId,
          administratorId: auth.administratorId,
          status: Status.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      if (!condominium) {
        return NextResponse.json(
          {
            error: "Condomínio não encontrado na carteira ativa da administradora.",
          },
          {
            status: 404,
          },
        );
      }
    }

    const where: Prisma.CouncilMeetingAgendaItemWhereInput = {
      status: {
        in: OPEN_PENDING_STATUSES,
      },
      councilMeeting: {
        administratorId: auth.administratorId,
        ...(condominiumId
          ? {
              condominiumId,
            }
          : {}),
        status: {
          in: MEETING_VISIBLE_STATUSES,
        },
        condominium: {
          status: Status.ACTIVE,
        },
      },
      ...buildSearchWhere(search),
    };

    const pendingItems = await db.councilMeetingAgendaItem.findMany({
      where,
      take,
      orderBy: [
        {
          dueDate: "asc",
        },
        {
          updatedAt: "desc",
        },
        {
          order: "asc",
        },
      ],
      select: {
        id: true,
        order: true,
        title: true,
        description: true,
        status: true,
        discussionNotes: true,
        decision: true,
        responsibleName: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        councilMeeting: {
          select: {
            id: true,
            title: true,
            status: true,
            scheduledStartAt: true,
            condominium: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      pendingItems,
      total: pendingItems.length,
      filters: {
        condominiumId,
        search,
        statuses: OPEN_PENDING_STATUSES,
      },
    });
  } catch (error) {
    console.error("Erro ao listar pendências de reuniões de conselho:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar as pendências de reuniões de conselho.",
      },
      {
        status: 500,
      },
    );
  }
}
