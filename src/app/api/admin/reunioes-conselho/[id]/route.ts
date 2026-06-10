import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  CouncilMeetingLogAction,
  CouncilMeetingStatus,
  CouncilParticipantStatus,
  MeetingMode,
  MeetingRoomLogAction,
  MeetingRoomParticipantStatus,
  MeetingRoomStatus,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { MODULE_SLUGS } from "@/lib/plan-limits";
import { notifyCouncilMeetingAudience, notifyCouncilMeetingRecordKeeperAssigned } from "@/lib/notifications";

/* =========================================================
   API ADMIN - DETALHE DA REUNIÃO DE CONSELHO

   Arquivo:
   src/app/api/admin/reunioes-conselho/[id]/route.ts

   ETAPA 49 — REUNIÕES DE CONSELHO

   Métodos:
   - GET: detalhe da reunião da administradora ativa.
   - PATCH: edita dados básicos enquanto a reunião não estiver finalizada.
   - DELETE: remove somente reunião em rascunho.

   Regra de preservação:
   - Reunião concluída, cancelada ou arquivada não recebe edição comum.
   - Para preservar histórico, cancelamento/conclusão devem ficar registrados.
   - A Sala De Reunião EloGest acompanha o status operacional da reunião.
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdateCouncilMeetingBody = {
  action?: unknown;
  recordKeeperParticipantId?: unknown;
  title?: unknown;
  description?: unknown;
  condominiumId?: unknown;
  status?: unknown;
  mode?: unknown;
  scheduledStartAt?: unknown;
  scheduledEndAt?: unknown;
  location?: unknown;
  accessInstructions?: unknown;
  summary?: unknown;
  decisions?: unknown;
  nextSteps?: unknown;
  internalNotes?: unknown;
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

function normalizeRequiredString(value: unknown) {
  return normalizeNullableString(value) ?? "";
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
      message: "Informe uma data válida.",
    };
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false as const,
      message: "Informe uma data válida.",
    };
  }

  return {
    ok: true as const,
    value: date,
  };
}

function parseMeetingMode(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: true as const,
      value: MeetingMode.ONLINE,
    };
  }

  if (!Object.values(MeetingMode).includes(value as MeetingMode)) {
    return {
      ok: false as const,
      message: "Formato da reunião inválido.",
    };
  }

  return {
    ok: true as const,
    value: value as MeetingMode,
  };
}

function parseCouncilStatusForUpdate(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: true as const,
      value: null,
    };
  }

  const allowedStatuses: CouncilMeetingStatus[] = [
    CouncilMeetingStatus.DRAFT,
    CouncilMeetingStatus.SCHEDULED,
    CouncilMeetingStatus.IN_PROGRESS,
    CouncilMeetingStatus.COMPLETED,
    CouncilMeetingStatus.CANCELED,
  ];

  if (!allowedStatuses.includes(value as CouncilMeetingStatus)) {
    return {
      ok: false as const,
      message: "Status da reunião inválido para esta ação.",
    };
  }

  return {
    ok: true as const,
    value: value as CouncilMeetingStatus,
  };
}

function canEditCouncilMeeting(status: CouncilMeetingStatus) {
  return (
    status === CouncilMeetingStatus.DRAFT ||
    status === CouncilMeetingStatus.SCHEDULED ||
    status === CouncilMeetingStatus.IN_PROGRESS
  );
}

function canDeleteCouncilMeeting(status: CouncilMeetingStatus) {
  return status === CouncilMeetingStatus.DRAFT;
}

function toRoomStatus(status: CouncilMeetingStatus) {
  if (status === CouncilMeetingStatus.SCHEDULED) {
    return MeetingRoomStatus.SCHEDULED;
  }

  if (status === CouncilMeetingStatus.IN_PROGRESS) {
    return MeetingRoomStatus.OPEN;
  }

  if (status === CouncilMeetingStatus.COMPLETED) {
    return MeetingRoomStatus.CLOSED;
  }

  if (status === CouncilMeetingStatus.CANCELED) {
    return MeetingRoomStatus.CANCELED;
  }

  return MeetingRoomStatus.DRAFT;
}

function getCouncilLogAction(status: CouncilMeetingStatus) {
  if (status === CouncilMeetingStatus.SCHEDULED) {
    return CouncilMeetingLogAction.SCHEDULED;
  }

  if (status === CouncilMeetingStatus.IN_PROGRESS) {
    return CouncilMeetingLogAction.STARTED;
  }

  if (status === CouncilMeetingStatus.COMPLETED) {
    return CouncilMeetingLogAction.COMPLETED;
  }

  if (status === CouncilMeetingStatus.CANCELED) {
    return CouncilMeetingLogAction.CANCELED;
  }

  return CouncilMeetingLogAction.UPDATED;
}

function getRoomLogAction(status: CouncilMeetingStatus) {
  if (status === CouncilMeetingStatus.IN_PROGRESS) {
    return MeetingRoomLogAction.OPENED;
  }

  if (status === CouncilMeetingStatus.COMPLETED) {
    return MeetingRoomLogAction.CLOSED;
  }

  if (status === CouncilMeetingStatus.CANCELED) {
    return MeetingRoomLogAction.CANCELED;
  }

  if (status === CouncilMeetingStatus.SCHEDULED) {
    return MeetingRoomLogAction.SCHEDULED;
  }

  return MeetingRoomLogAction.UPDATED;
}


type ParticipantInput = {
  userId: string;
  userAccessId: string | null;
  role: AccessRole;
};

function getParticipantRolePriority(role: AccessRole) {
  if (role === AccessRole.SINDICO) return 1;
  if (role === AccessRole.CONSELHEIRO) return 2;
  if (role === AccessRole.ADMINISTRADORA) return 3;

  return 99;
}

function consolidateParticipantsByUser(participants: ParticipantInput[]) {
  const byUser = new Map<string, ParticipantInput>();

  for (const participant of participants) {
    const current = byUser.get(participant.userId);

    if (
      !current ||
      getParticipantRolePriority(participant.role) <
        getParticipantRolePriority(current.role)
    ) {
      byUser.set(participant.userId, participant);
    }
  }

  return Array.from(byUser.values());
}

async function getAutomaticGovernanceParticipants(params: {
  condominiumId: string;
}): Promise<ParticipantInput[]> {
  const { condominiumId } = params;

  const accesses = await db.userAccess.findMany({
    where: {
      isActive: true,
      condominiumId,
      role: {
        in: [AccessRole.SINDICO, AccessRole.CONSELHEIRO],
      },
      user: {
        isActive: true,
      },
    },
    select: {
      id: true,
      userId: true,
      role: true,
    },
    orderBy: [
      {
        role: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  return consolidateParticipantsByUser(
    accesses.map((access) => ({
      userId: access.userId,
      userAccessId: access.id,
      role: access.role,
    })),
  );
}

async function getMeetingForAdministrator(params: {
  administratorId: string;
  meetingId: string;
}) {
  const { administratorId, meetingId } = params;

  return db.councilMeeting.findFirst({
    where: {
      id: meetingId,
      administratorId,
    },
    include: {
      condominium: {
        select: {
          id: true,
          name: true,
        },
      },
      meetingRoom: {
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              userAccess: {
                select: {
                  id: true,
                  role: true,
                  label: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          logs: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      },
      recordKeeperUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      recordKeeperParticipant: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          userAccess: {
            select: {
              id: true,
              role: true,
              label: true,
            },
          },
        },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          userAccess: {
            select: {
              id: true,
              role: true,
              label: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      agendaItems: {
        orderBy: {
          order: "asc",
        },
      },
      attachments: {
        include: {
          uploadedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      logs: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    MODULE_SLUGS.REUNIOES_CONSELHO,
    "Reuniões De Conselho",
  );

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;

    const meeting = await getMeetingForAdministrator({
      administratorId: auth.administratorId,
      meetingId: id,
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

    return NextResponse.json({
      meeting,
    });
  } catch (error) {
    console.error("Erro ao buscar reunião de conselho:", error);

    return NextResponse.json(
      {
        error: "Não foi possível buscar a reunião de conselho.",
      },
      {
        status: 500,
      },
    );
  }
}


async function assignRecordKeeper(params: {
  meetingId: string;
  administratorId: string;
  actorUserId: string;
  body: UpdateCouncilMeetingBody;
}) {
  const { meetingId, administratorId, actorUserId, body } = params;
  const recordKeeperParticipantId = normalizeRequiredString(
    body.recordKeeperParticipantId,
  );

  if (!recordKeeperParticipantId) {
    return badRequest("Selecione um participante responsável pelo registro.");
  }

  const meeting = await db.councilMeeting.findFirst({
    where: {
      id: meetingId,
      administratorId,
    },
    select: {
      id: true,
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

  if (!canEditCouncilMeeting(meeting.status)) {
    return NextResponse.json(
      {
        error:
          "O responsável pelo registro não pode ser alterado em reunião concluída, cancelada ou arquivada.",
      },
      {
        status: 409,
      },
    );
  }

  const participant = await db.councilMeetingParticipant.findFirst({
    where: {
      id: recordKeeperParticipantId,
      councilMeetingId: meetingId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      userAccess: {
        select: {
          id: true,
          role: true,
          label: true,
        },
      },
    },
  });

  if (!participant) {
    return NextResponse.json(
      {
        error:
          "O responsável pelo registro precisa ser um participante da reunião.",
      },
      {
        status: 404,
      },
    );
  }

  const now = new Date();
  const participantName = participant.user.name || participant.user.email;

  await db.$transaction(async (tx) => {
    await tx.councilMeeting.update({
      where: {
        id: meetingId,
      },
      data: {
        recordKeeperUserId: participant.userId,
        recordKeeperParticipantId: participant.id,
        recordKeeperAssignedAt: now,
      },
    });

    await tx.councilMeetingLog.create({
      data: {
        councilMeetingId: meetingId,
        userId: actorUserId,
        action: CouncilMeetingLogAction.UPDATED,
        message: `${participantName} foi definido como responsável pelo registro da reunião.`,
        metadata: {
          action: "RECORD_KEEPER_ASSIGNED",
          recordKeeperParticipantId: participant.id,
          recordKeeperUserId: participant.userId,
          recordKeeperUserAccessId: participant.userAccessId,
          recordKeeperRole: participant.role,
          assignedAt: now.toISOString(),
        },
      },
    });
  });

  const updatedMeeting = await getMeetingForAdministrator({
    administratorId,
    meetingId,
  });

  if (updatedMeeting) {
    void notifyCouncilMeetingRecordKeeperAssigned({
      meeting: {
        id: updatedMeeting.id,
        title: updatedMeeting.title,
        administratorId,
        condominiumId: updatedMeeting.condominium?.id || null,
        scheduledStartAt: updatedMeeting.scheduledStartAt,
        scheduledEndAt: updatedMeeting.scheduledEndAt,
        meetingMode: updatedMeeting.mode,
        condominium: updatedMeeting.condominium
          ? {
              id: updatedMeeting.condominium.id,
              name: updatedMeeting.condominium.name,
              administratorId,
            }
          : null,
        meetingRoom: updatedMeeting.meetingRoom
          ? {
              id: updatedMeeting.meetingRoom.id,
              status: updatedMeeting.meetingRoom.status,
            }
          : null,
      },
      recordKeeperUserId: participant.userId,
      actorUser: {
        id: actorUserId,
      },
      metadata: {
        recordKeeperParticipantId: participant.id,
        recordKeeperUserId: participant.userId,
        recordKeeperUserAccessId: participant.userAccessId,
        recordKeeperRole: participant.role,
        source: "ADMIN_COUNCIL_MEETING_RECORD_KEEPER",
      },
    }).catch((error) => {
      console.error(
        "Erro ao notificar responsável pelo registro da reunião de conselho:",
        error,
      );
    });
  }

  return NextResponse.json({
    meeting: updatedMeeting,
    message: "Responsável pelo registro definido com sucesso.",
  });
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
    const { id } = await context.params;

    const currentMeeting = await db.councilMeeting.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        status: true,
        meetingRoomId: true,
      },
    });

    if (!currentMeeting) {
      return NextResponse.json(
        {
          error: "Reunião de conselho não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    if (!canEditCouncilMeeting(currentMeeting.status)) {
      return NextResponse.json(
        {
          error:
            "Reuniões concluídas, canceladas ou arquivadas não podem ser editadas por esta ação.",
        },
        {
          status: 409,
        },
      );
    }

    const body = (await request.json()) as UpdateCouncilMeetingBody;
    const action = normalizeNullableString(body.action);

    if (action === "SET_RECORD_KEEPER") {
      return assignRecordKeeper({
        meetingId: id,
        administratorId: auth.administratorId,
        actorUserId: auth.authUser.id,
        body,
      });
    }

    const title = normalizeRequiredString(body.title);
    const description = normalizeNullableString(body.description);
    const condominiumId = normalizeRequiredString(body.condominiumId);
    const location = normalizeNullableString(body.location);
    const accessInstructions = normalizeNullableString(body.accessInstructions);
    const summary = normalizeNullableString(body.summary);
    const decisions = normalizeNullableString(body.decisions);
    const nextSteps = normalizeNullableString(body.nextSteps);
    const internalNotes = normalizeNullableString(body.internalNotes);

    if (title.length < 3) {
      return badRequest("Informe um título para a reunião.");
    }

    if (!condominiumId) {
      return badRequest("Informe o condomínio da reunião.");
    }

    const statusValidation = parseCouncilStatusForUpdate(body.status);
    if (!statusValidation.ok) {
      return badRequest(statusValidation.message);
    }

    const modeValidation = parseMeetingMode(body.mode);
    if (!modeValidation.ok) {
      return badRequest(modeValidation.message);
    }

    const scheduledStartAtValidation = parseDateOrNull(body.scheduledStartAt);
    if (!scheduledStartAtValidation.ok) {
      return badRequest(scheduledStartAtValidation.message);
    }

    const scheduledEndAtValidation = parseDateOrNull(body.scheduledEndAt);
    if (!scheduledEndAtValidation.ok) {
      return badRequest(scheduledEndAtValidation.message);
    }

    if (
      scheduledStartAtValidation.value &&
      scheduledEndAtValidation.value &&
      scheduledEndAtValidation.value <= scheduledStartAtValidation.value
    ) {
      return badRequest(
        "O término previsto da reunião deve ser posterior ao início previsto.",
      );
    }

    const nextStatus = statusValidation.value ?? currentMeeting.status;

    if (
      nextStatus === CouncilMeetingStatus.SCHEDULED &&
      !scheduledStartAtValidation.value
    ) {
      return badRequest("Informe a data e horário para agendar a reunião.");
    }

    if (modeValidation.value === MeetingMode.PRESENTIAL && !location) {
      return badRequest("Informe o local da reunião presencial.");
    }

    if (modeValidation.value === MeetingMode.HYBRID && !location) {
      return badRequest("Informe o local da reunião híbrida.");
    }

    const condominium = await db.condominium.findFirst({
      where: {
        id: condominiumId,
        administratorId: auth.administratorId,
        status: Status.ACTIVE,
      },
      select: {
        id: true,
        name: true,
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

    const now = new Date();
    const shouldMarkStarted =
      nextStatus === CouncilMeetingStatus.IN_PROGRESS &&
      currentMeeting.status !== CouncilMeetingStatus.IN_PROGRESS;
    const shouldMarkCompleted = nextStatus === CouncilMeetingStatus.COMPLETED;
    const shouldMarkCanceled = nextStatus === CouncilMeetingStatus.CANCELED;

    const automaticGovernanceParticipants =
      await getAutomaticGovernanceParticipants({
        condominiumId,
      });

    const updatedMeeting = await db.$transaction(async (tx) => {
      const updated = await tx.councilMeeting.update({
        where: {
          id,
        },
        data: {
          condominiumId,
          title,
          description,
          status: nextStatus,
          mode: modeValidation.value,
          scheduledStartAt: scheduledStartAtValidation.value,
          scheduledEndAt: scheduledEndAtValidation.value,
          location,
          summary,
          decisions,
          nextSteps,
          internalNotes,
          completedAt: shouldMarkCompleted ? now : undefined,
          canceledAt: shouldMarkCanceled ? now : undefined,
        },
        include: {
          condominium: {
            select: {
              id: true,
              name: true,
            },
          },
          meetingRoom: true,
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (currentMeeting.meetingRoomId) {
        await tx.meetingRoom.update({
          where: {
            id: currentMeeting.meetingRoomId,
          },
          data: {
            condominiumId,
            title,
            description,
            mode: modeValidation.value,
            status: toRoomStatus(nextStatus),
            scheduledStartAt: scheduledStartAtValidation.value,
            scheduledEndAt: scheduledEndAtValidation.value,
            location,
            accessInstructions,
            openedAt: shouldMarkStarted ? now : undefined,
            closedAt: shouldMarkCompleted ? now : undefined,
            canceledAt: shouldMarkCanceled ? now : undefined,
          },
        });

        await tx.meetingRoomLog.create({
          data: {
            meetingRoomId: currentMeeting.meetingRoomId,
            userId: auth.authUser.id,
            action: getRoomLogAction(nextStatus),
            message: "Sala De Reunião EloGest atualizada pela administradora.",
            metadata: {
              councilMeetingId: id,
              status: toRoomStatus(nextStatus),
              mode: modeValidation.value,
            },
          },
        });
      }

      if (
        automaticGovernanceParticipants.length > 0 &&
        (nextStatus === CouncilMeetingStatus.SCHEDULED ||
          nextStatus === CouncilMeetingStatus.IN_PROGRESS)
      ) {
        await tx.councilMeetingParticipant.createMany({
          data: automaticGovernanceParticipants.map((participant) => ({
            councilMeetingId: id,
            userId: participant.userId,
            userAccessId: participant.userAccessId,
            role: participant.role,
            status: CouncilParticipantStatus.INVITED,
          })),
          skipDuplicates: true,
        });

        if (currentMeeting.meetingRoomId) {
          const meetingRoomId = currentMeeting.meetingRoomId;

          await tx.meetingRoomParticipant.createMany({
            data: automaticGovernanceParticipants.map((participant) => ({
              meetingRoomId,
              userId: participant.userId,
              userAccessId: participant.userAccessId,
              role: participant.role,
              status: MeetingRoomParticipantStatus.INVITED,
            })),
            skipDuplicates: true,
          });
        }
      }

      await tx.councilMeetingLog.create({
        data: {
          councilMeetingId: id,
          userId: auth.authUser.id,
          action: getCouncilLogAction(nextStatus),
          message: "Reunião de conselho atualizada pela administradora.",
          metadata: {
            previousStatus: currentMeeting.status,
            status: nextStatus,
            mode: modeValidation.value,
          },
        },
      });

      return updated;
    });

    const shouldNotifyAudience =
      nextStatus === CouncilMeetingStatus.SCHEDULED ||
      nextStatus === CouncilMeetingStatus.IN_PROGRESS ||
      nextStatus === CouncilMeetingStatus.CANCELED ||
      nextStatus === CouncilMeetingStatus.COMPLETED;

    if (shouldNotifyAudience) {
      const notificationType = shouldMarkCanceled
        ? "COUNCIL_MEETING_CANCELED"
        : "COUNCIL_MEETING_UPDATED";

      const notificationTitle = shouldMarkCanceled
        ? "Reunião de conselho cancelada"
        : "Reunião de conselho atualizada";

      const notificationMessage = shouldMarkCanceled
        ? `A reunião "${updatedMeeting.title}" foi cancelada no EloGest.`
        : `A reunião "${updatedMeeting.title}" teve informações atualizadas no EloGest.`;

      await notifyCouncilMeetingAudience({
        meeting: updatedMeeting,
        actorUser: auth.authUser,
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        metadata: {
          previousStatus: currentMeeting.status,
          status: nextStatus,
          mode: updatedMeeting.mode,
          source: "ADMIN_COUNCIL_MEETING_UPDATE",
        },
        includeAdministradora: shouldMarkCanceled,
      });
    }

    return NextResponse.json({
      meeting: updatedMeeting,
      message: "Reunião de conselho atualizada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar reunião de conselho:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar a reunião de conselho.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    MODULE_SLUGS.REUNIOES_CONSELHO,
    "Reuniões De Conselho",
  );

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;

    const meeting = await db.councilMeeting.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        status: true,
        meetingRoomId: true,
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

    if (!canDeleteCouncilMeeting(meeting.status)) {
      return NextResponse.json(
        {
          error:
            "Somente reuniões em rascunho podem ser removidas. Para preservar o histórico, cancele a reunião.",
        },
        {
          status: 409,
        },
      );
    }

    await db.$transaction(async (tx) => {
      await tx.councilMeeting.delete({
        where: {
          id: meeting.id,
        },
      });

      if (meeting.meetingRoomId) {
        await tx.meetingRoom.delete({
          where: {
            id: meeting.meetingRoomId,
          },
        });
      }
    });

    return NextResponse.json({
      message: "Reunião de conselho removida com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao remover reunião de conselho:", error);

    return NextResponse.json(
      {
        error: "Não foi possível remover a reunião de conselho.",
      },
      {
        status: 500,
      },
    );
  }
}
