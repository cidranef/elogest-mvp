import { NextRequest, NextResponse } from "next/server";
import {
  CouncilAgendaItemStatus,
  CouncilMeetingLogAction,
  CouncilMeetingStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { MODULE_SLUGS } from "@/lib/plan-limits";

/* =========================================================
   API ADMIN - REGISTRO POR PAUTA DA REUNIÃO DE CONSELHO

   Arquivo:
   src/app/api/admin/reunioes-conselho/[id]/pautas/[itemId]/route.ts

   ETAPA 49.7 — REGISTRO POR PAUTA

   Método:
   - PATCH: atualiza discussão, decisão, encaminhamento,
     responsável, prazo e status de uma pauta.

   Regra:
   - Administradora pode apoiar/corrigir registros pela área admin.
   - A proteção real permanece por administradora ativa, módulo liberado
     e reunião pertencente à carteira.
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
    itemId: string;
  }>;
};

type UpdateAgendaItemBody = {
  status?: unknown;
  discussionNotes?: unknown;
  decision?: unknown;
  responsibleName?: unknown;
  dueDate?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 400,
    },
  );
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDateOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  if (typeof value !== "string" && !(value instanceof Date)) {
    return {
      ok: false as const,
      message: "Informe uma data válida para o prazo.",
    };
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false as const,
      message: "Informe uma data válida para o prazo.",
    };
  }

  return {
    ok: true as const,
    value: date,
  };
}

function parseAgendaStatus(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: true as const,
      value: null,
    };
  }

  if (!Object.values(CouncilAgendaItemStatus).includes(value as CouncilAgendaItemStatus)) {
    return {
      ok: false as const,
      message: "Status da pauta inválido.",
    };
  }

  return {
    ok: true as const,
    value: value as CouncilAgendaItemStatus,
  };
}

function canEditAgendaItem(status: CouncilMeetingStatus) {
  return (
    status === CouncilMeetingStatus.DRAFT ||
    status === CouncilMeetingStatus.SCHEDULED ||
    status === CouncilMeetingStatus.IN_PROGRESS
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    MODULE_SLUGS.REUNIOES_CONSELHO,
    "Reuniões De Conselho",
  );

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id, itemId } = await context.params;
    const body = (await request.json()) as UpdateAgendaItemBody;

    const statusValidation = parseAgendaStatus(body.status);
    if (!statusValidation.ok) {
      return badRequest(statusValidation.message);
    }

    const dueDateValidation = parseDateOrNull(body.dueDate);
    if (!dueDateValidation.ok) {
      return badRequest(dueDateValidation.message);
    }

    const meeting = await db.councilMeeting.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!meeting) {
      return NextResponse.json(
        {
          error: "Reunião de conselho não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    if (!canEditAgendaItem(meeting.status)) {
      return NextResponse.json(
        {
          error:
            "Pautas de reuniões concluídas, canceladas ou arquivadas não podem ser editadas por esta ação.",
        },
        {
          status: 409,
        },
      );
    }

    const agendaItem = await db.councilMeetingAgendaItem.findFirst({
      where: {
        id: itemId,
        councilMeetingId: meeting.id,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!agendaItem) {
      return NextResponse.json(
        {
          error: "Pauta não encontrada nesta reunião.",
        },
        {
          status: 404,
        },
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const updatedAgendaItem = await tx.councilMeetingAgendaItem.update({
        where: {
          id: agendaItem.id,
        },
        data: {
          ...(statusValidation.value
            ? {
                status: statusValidation.value,
              }
            : {}),
          discussionNotes: normalizeNullableString(body.discussionNotes),
          decision: normalizeNullableString(body.decision),
          responsibleName: normalizeNullableString(body.responsibleName),
          dueDate: dueDateValidation.value,
        },
      });

      await tx.councilMeetingLog.create({
        data: {
          councilMeetingId: meeting.id,
          userId: auth.authUser.id,
          action: CouncilMeetingLogAction.AGENDA_ITEM_UPDATED,
          message: `Pauta atualizada: ${agendaItem.title}.`,
          metadata: {
            agendaItemId: agendaItem.id,
            previousStatus: agendaItem.status,
            status: updatedAgendaItem.status,
            source: "ADMIN_AGENDA_ITEM_UPDATE",
          },
        },
      });

      return updatedAgendaItem;
    });

    return NextResponse.json({
      agendaItem: updated,
      message: "Registro da pauta atualizado com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar registro da pauta no admin:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar o registro da pauta.",
      },
      {
        status: 500,
      },
    );
  }
}
