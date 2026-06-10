import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  CouncilAgendaItemStatus,
  CouncilMeetingLogAction,
  CouncilMeetingStatus,
  Status,
} from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasModuleAccess, MODULE_SLUGS } from "@/lib/plan-limits";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";

/* =========================================================
   API PORTAL - REGISTRO POR PAUTA DA REUNIÃO DE CONSELHO

   Arquivo:
   src/app/api/portal/reunioes-conselho/[id]/pautas/[itemId]/route.ts

   ETAPA 49.7 — REGISTRO POR PAUTA

   Método:
   - PATCH: permite ao Responsável Pelo Registro atualizar
     discussão, decisão, encaminhamento, responsável, prazo e status
     de uma pauta.

   Segurança:
   - Exige usuário autenticado.
   - Exige perfil ativo vinculado ao mesmo condomínio.
   - Exige módulo Reuniões De Conselho liberado para a administradora.
   - Exige que o usuário seja o Responsável Pelo Registro da reunião.
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
    itemId: string;
  }>;
};

type SessionUserShape = {
  id?: string;
  activeAccessId?: string | null;
  accessId?: string | null;
  userAccessId?: string | null;
};

type CookieActiveAccessShape = {
  id?: string | null;
  accessId?: string | null;
  role?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
};

type UpdateAgendaItemBody = {
  status?: unknown;
  discussionNotes?: unknown;
  decision?: unknown;
  responsibleName?: unknown;
  dueDate?: unknown;
};

type PortalAgendaWriteAccess = {
  authUser: {
    id: string;
    name: string | null;
    email: string;
  };
  accessId: string;
  role: AccessRole;
  administratorId: string;
  condominiumId: string;
  meeting: {
    id: string;
    title: string;
    status: CouncilMeetingStatus;
    recordKeeperUserId: string | null;
    recordKeeperParticipantId: string | null;
  };
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

function getSessionUserId(sessionUser: SessionUserShape | undefined) {
  if (!sessionUser?.id) {
    return null;
  }

  return sessionUser.id;
}

function getSessionAccessId(sessionUser: SessionUserShape | undefined) {
  return (
    sessionUser?.activeAccessId ||
    sessionUser?.accessId ||
    sessionUser?.userAccessId ||
    null
  );
}

function canEditAgendaFromPortal(status: CouncilMeetingStatus) {
  return (
    status === CouncilMeetingStatus.SCHEDULED ||
    status === CouncilMeetingStatus.IN_PROGRESS
  );
}

async function requirePortalAgendaWriteAccess(params: {
  meetingId: string;
}): Promise<PortalAgendaWriteAccess | { error: NextResponse }> {
  const { meetingId } = params;

  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUserShape | undefined;
  const userId = getSessionUserId(sessionUser);

  if (!userId) {
    return {
      error: NextResponse.json(
        {
          error: "Sessão expirada. Faça login novamente.",
        },
        {
          status: 401,
        },
      ),
    };
  }

  const cookieActiveAccess = (await getActiveUserAccessFromCookies({
    userId,
  })) as CookieActiveAccessShape | null;

  const cookieAccessId = cookieActiveAccess?.accessId || cookieActiveAccess?.id || null;
  const sessionAccessId = getSessionAccessId(sessionUser);
  const activeAccessId = cookieAccessId || sessionAccessId;

  const access = await db.userAccess.findFirst({
    where: {
      userId,
      isActive: true,
      ...(activeAccessId
        ? {
            id: activeAccessId,
          }
        : {}),
    },
    orderBy: activeAccessId
      ? undefined
      : [
          {
            isDefault: "desc",
          },
          {
            lastUsedAt: "desc",
          },
          {
            createdAt: "asc",
          },
        ],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
        },
      },
      condominium: {
        select: {
          id: true,
          status: true,
          administratorId: true,
          administrator: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!access || !access.user.isActive) {
    return {
      error: NextResponse.json(
        {
          error: "Perfil ativo não encontrado ou usuário inativo.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (!access.condominiumId || !access.condominium) {
    return {
      error: NextResponse.json(
        {
          error: "Selecione um perfil vinculado a um condomínio para registrar a reunião.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (access.condominium.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        {
          error: "Este condomínio está inativo. O registro da reunião está bloqueado.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (access.condominium.administrator.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        {
          error: "A administradora deste condomínio está inativa. O registro da reunião está bloqueado.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  const moduleAccess = await hasModuleAccess({
    administratorId: access.condominium.administratorId,
    moduleSlug: MODULE_SLUGS.REUNIOES_CONSELHO,
  });

  if (!moduleAccess.allowed) {
    return {
      error: NextResponse.json(
        {
          error: moduleAccess.message,
          code: "MODULE_ACCESS_DENIED",
          details: moduleAccess,
        },
        {
          status: 403,
        },
      ),
    };
  }

  const meeting = await db.councilMeeting.findFirst({
    where: {
      id: meetingId,
      administratorId: access.condominium.administratorId,
      condominiumId: access.condominiumId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      recordKeeperUserId: true,
      recordKeeperParticipantId: true,
    },
  });

  if (!meeting) {
    return {
      error: NextResponse.json(
        {
          error: "Reunião de conselho não encontrada para o perfil ativo.",
        },
        {
          status: 404,
        },
      ),
    };
  }

  if (!canEditAgendaFromPortal(meeting.status)) {
    return {
      error: NextResponse.json(
        {
          error:
            "O registro das pautas só pode ser feito em reuniões agendadas ou em andamento.",
        },
        {
          status: 409,
        },
      ),
    };
  }

  if (meeting.recordKeeperUserId !== access.user.id) {
    return {
      error: NextResponse.json(
        {
          error:
            "Apenas o responsável pelo registro da reunião pode atualizar as pautas pelo portal.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  return {
    authUser: {
      id: access.user.id,
      name: access.user.name,
      email: access.user.email,
    },
    accessId: access.id,
    role: access.role,
    administratorId: access.condominium.administratorId,
    condominiumId: access.condominiumId,
    meeting,
  };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id, itemId } = await context.params;

    const access = await requirePortalAgendaWriteAccess({
      meetingId: id,
    });

    if ("error" in access) {
      return access.error;
    }

    const body = (await request.json()) as UpdateAgendaItemBody;

    const statusValidation = parseAgendaStatus(body.status);
    if (!statusValidation.ok) {
      return badRequest(statusValidation.message);
    }

    const dueDateValidation = parseDateOrNull(body.dueDate);
    if (!dueDateValidation.ok) {
      return badRequest(dueDateValidation.message);
    }

    const agendaItem = await db.councilMeetingAgendaItem.findFirst({
      where: {
        id: itemId,
        councilMeetingId: access.meeting.id,
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
          councilMeetingId: access.meeting.id,
          userId: access.authUser.id,
          action: CouncilMeetingLogAction.AGENDA_ITEM_UPDATED,
          message: `Responsável pelo registro atualizou a pauta: ${agendaItem.title}.`,
          metadata: {
            agendaItemId: agendaItem.id,
            previousStatus: agendaItem.status,
            status: updatedAgendaItem.status,
            accessId: access.accessId,
            role: access.role,
            source: "PORTAL_RECORD_KEEPER_AGENDA_ITEM_UPDATE",
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
    console.error("Erro ao atualizar registro da pauta pelo portal:", error);

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
