import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  CouncilAgendaItemStatus,
  CouncilMeetingLogAction,
  CouncilMeetingStatus,
  CouncilParticipantStatus,
  MeetingMode,
  MeetingProvider,
  MeetingRoomLogAction,
  MeetingRoomParticipantStatus,
  MeetingRoomStatus,
  MeetingRoomType,
  Status,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { MODULE_SLUGS } from "@/lib/plan-limits";
import { notifyCouncilMeetingAudience } from "@/lib/notifications";

/* =========================================================
   API ADMIN - REUNIÕES DE CONSELHO

   Arquivo:
   src/app/api/admin/reunioes-conselho/route.ts

   ETAPA 49 — REUNIÕES DE CONSELHO

   Métodos:
   - GET: lista reuniões de conselho da administradora ativa.
   - POST: cria reunião de conselho e a Sala De Reunião EloGest.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Bloqueia administradora INACTIVE pelo admin-api-guard.
   - Exige módulo comercial Reuniões De Conselho liberado.
   - Isola dados por administratorId do perfil ativo.
   - Valida se o condomínio pertence à carteira da administradora.
   - SUPER_ADMIN não opera esta API.

   Decisão de arquitetura:
   - MeetingRoom é a sala central e reutilizável da plataforma.
   - CouncilMeeting é o primeiro uso real da sala.
   - A mesma base será reaproveitada futuramente por Assembleias.
   ========================================================= */

type CreateCouncilMeetingBody = {
  title?: unknown;
  description?: unknown;
  condominiumId?: unknown;
  status?: unknown;
  mode?: unknown;
  scheduledStartAt?: unknown;
  scheduledEndAt?: unknown;
  location?: unknown;
  accessInstructions?: unknown;
  participants?: unknown;
  agendaItems?: unknown;
  internalNotes?: unknown;
};

type ParticipantInput = {
  userId: string;
  userAccessId: string | null;
  role: AccessRole;
};

type AgendaItemInput = {
  title: string;
  description: string | null;
  order: number;
};

function getParticipantRolePriority(role: AccessRole) {
  if (role === AccessRole.SINDICO) return 1;
  if (role === AccessRole.CONSELHEIRO) return 2;
  if (role === AccessRole.ADMINISTRADORA) return 3;

  return 99;
}

function choosePreferredParticipant(
  current: ParticipantInput | undefined,
  candidate: ParticipantInput,
) {
  if (!current) {
    return candidate;
  }

  return getParticipantRolePriority(candidate.role) <
    getParticipantRolePriority(current.role)
    ? candidate
    : current;
}

function consolidateParticipantsByUser(participants: ParticipantInput[]) {
  const byUser = new Map<string, ParticipantInput>();

  for (const participant of participants) {
    byUser.set(
      participant.userId,
      choosePreferredParticipant(byUser.get(participant.userId), participant),
    );
  }

  return Array.from(byUser.values());
}

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

function parseCouncilStatusForCreate(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: true as const,
      value: CouncilMeetingStatus.DRAFT,
    };
  }

  if (
    value !== CouncilMeetingStatus.DRAFT &&
    value !== CouncilMeetingStatus.SCHEDULED
  ) {
    return {
      ok: false as const,
      message: "Crie a reunião como rascunho ou agendada.",
    };
  }

  return {
    ok: true as const,
    value: value as CouncilMeetingStatus,
  };
}

function toRoomStatus(status: CouncilMeetingStatus) {
  if (status === CouncilMeetingStatus.SCHEDULED) {
    return MeetingRoomStatus.SCHEDULED;
  }

  return MeetingRoomStatus.DRAFT;
}

function generateInternalAccessCode() {
  return randomBytes(18).toString("hex");
}

function normalizeParticipants(value: unknown): ParticipantInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedRoles: AccessRole[] = [
    AccessRole.ADMINISTRADORA,
    AccessRole.SINDICO,
    AccessRole.CONSELHEIRO,
  ];

  const normalized: ParticipantInput[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const raw = item as Record<string, unknown>;
    const userId = normalizeNullableString(raw.userId);
    const userAccessId = normalizeNullableString(raw.userAccessId);
    const role = normalizeNullableString(raw.role);

    if (!userId || !role) {
      continue;
    }

    if (!allowedRoles.includes(role as AccessRole)) {
      continue;
    }

    const key = userId;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    normalized.push({
      userId,
      userAccessId,
      role: role as AccessRole,
    });
  }

  return normalized;
}

function normalizeAgendaItems(value: unknown): AgendaItemInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const title = normalizeRequiredString(raw.title);

      if (title.length < 3) {
        return null;
      }

      const orderParam = Number(raw.order ?? index + 1);
      const order = Number.isFinite(orderParam)
        ? Math.max(Math.floor(orderParam), 1)
        : index + 1;

      return {
        title,
        description: normalizeNullableString(raw.description),
        order,
      } satisfies AgendaItemInput;
    })
    .filter((item): item is AgendaItemInput => Boolean(item));
}

async function validateParticipants(params: {
  administratorId: string;
  condominiumId: string;
  participants: ParticipantInput[];
}) {
  const { administratorId, condominiumId, participants } = params;

  if (participants.length === 0) {
    return {
      ok: true as const,
      value: [] as ParticipantInput[],
    };
  }

  const accessIds = participants
    .map((participant) => participant.userAccessId)
    .filter((id): id is string => Boolean(id));

  const userIds = participants.map((participant) => participant.userId);

  const accessWhere: Prisma.UserAccessWhereInput = {
    isActive: true,
    userId: {
      in: userIds,
    },
    OR: [
      {
        administratorId,
        role: AccessRole.ADMINISTRADORA,
      },
      {
        condominiumId,
        role: {
          in: [AccessRole.SINDICO, AccessRole.CONSELHEIRO],
        },
      },
    ],
  };

  const validAccesses = await db.userAccess.findMany({
    where: accessIds.length > 0
      ? {
          ...accessWhere,
          id: {
            in: accessIds,
          },
        }
      : accessWhere,
    select: {
      id: true,
      userId: true,
      role: true,
    },
  });

  const validByUserAndRole = new Map<string, { id: string; userId: string; role: AccessRole }>();

  for (const access of validAccesses) {
    validByUserAndRole.set(`${access.userId}:${access.role}`, access);
  }

  const normalized: ParticipantInput[] = [];

  for (const participant of participants) {
    const validAccess = validByUserAndRole.get(
      `${participant.userId}:${participant.role}`,
    );

    if (!validAccess) {
      return {
        ok: false as const,
        message:
          "Um ou mais participantes não possuem vínculo ativo com esta administradora ou condomínio.",
      };
    }

    normalized.push({
      userId: participant.userId,
      userAccessId: validAccess.id,
      role: participant.role,
    });
  }

  return {
    ok: true as const,
    value: normalized,
  };
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

function mergeParticipants(
  manualParticipants: ParticipantInput[],
  automaticParticipants: ParticipantInput[],
) {
  return consolidateParticipantsByUser([
    ...manualParticipants,
    ...automaticParticipants,
  ]);
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
    const { searchParams } = new URL(request.url);

    const search = normalizeNullableString(searchParams.get("q"));
    const condominiumId = normalizeNullableString(
      searchParams.get("condominiumId"),
    );
    const statusParam = normalizeNullableString(searchParams.get("status"));
    const modeParam = normalizeNullableString(searchParams.get("mode"));
    const startAtParam = parseDateOrNull(searchParams.get("startAt"));
    const endAtParam = parseDateOrNull(searchParams.get("endAt"));
    const pageParam = Number(searchParams.get("page") ?? "1");
    const pageSizeParam = Number(searchParams.get("pageSize") ?? "20");

    if (!startAtParam.ok) {
      return badRequest(startAtParam.message);
    }

    if (!endAtParam.ok) {
      return badRequest(endAtParam.message);
    }

    const page =
      Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(Math.floor(pageSizeParam), 100)
        : 20;

    const where: Prisma.CouncilMeetingWhereInput = {
      administratorId: auth.administratorId,
      ...(search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                description: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                condominium: {
                  name: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
      ...(condominiumId
        ? {
            condominiumId,
          }
        : {}),
      ...(statusParam && statusParam !== "ALL"
        ? {
            status: statusParam as CouncilMeetingStatus,
          }
        : {}),
      ...(modeParam && modeParam !== "ALL"
        ? {
            mode: modeParam as MeetingMode,
          }
        : {}),
      ...(startAtParam.value || endAtParam.value
        ? {
            scheduledStartAt: {
              ...(startAtParam.value ? { gte: startAtParam.value } : {}),
              ...(endAtParam.value ? { lte: endAtParam.value } : {}),
            },
          }
        : {}),
    };

    const [total, meetings, kpis] = await Promise.all([
      db.councilMeeting.count({ where }),
      db.councilMeeting.findMany({
        where,
        orderBy: [
          {
            scheduledStartAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          condominium: {
            select: {
              id: true,
              name: true,
            },
          },
          meetingRoom: {
            select: {
              id: true,
              status: true,
              mode: true,
              provider: true,
              scheduledStartAt: true,
              scheduledEndAt: true,
            },
          },
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              participants: true,
              agendaItems: true,
              attachments: true,
            },
          },
        },
      }),
      db.councilMeeting.groupBy({
        by: ["status"],
        where: {
          administratorId: auth.administratorId,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const statusTotals = kpis.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    return NextResponse.json({
      meetings,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
      kpis: {
        totalDraft: statusTotals.DRAFT ?? 0,
        totalScheduled: statusTotals.SCHEDULED ?? 0,
        totalInProgress: statusTotals.IN_PROGRESS ?? 0,
        totalCompleted: statusTotals.COMPLETED ?? 0,
        totalCanceled: statusTotals.CANCELED ?? 0,
        totalArchived: statusTotals.ARCHIVED ?? 0,
      },
    });
  } catch (error) {
    console.error("Erro ao listar reuniões de conselho:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar as reuniões de conselho.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminModuleApiAccess(
    MODULE_SLUGS.REUNIOES_CONSELHO,
    "Reuniões De Conselho",
  );

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as CreateCouncilMeetingBody;

    const title = normalizeRequiredString(body.title);
    const description = normalizeNullableString(body.description);
    const condominiumId = normalizeRequiredString(body.condominiumId);
    const location = normalizeNullableString(body.location);
    const accessInstructions = normalizeNullableString(body.accessInstructions);
    const internalNotes = normalizeNullableString(body.internalNotes);

    if (title.length < 3) {
      return badRequest("Informe um título para a reunião.");
    }

    if (!condominiumId) {
      return badRequest("Informe o condomínio da reunião.");
    }

    const statusValidation = parseCouncilStatusForCreate(body.status);
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

    if (
      statusValidation.value === CouncilMeetingStatus.SCHEDULED &&
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

    const participantInputs = normalizeParticipants(body.participants);
    const automaticGovernanceParticipants =
      await getAutomaticGovernanceParticipants({
        condominiumId,
      });
    const agendaItems = normalizeAgendaItems(body.agendaItems);

    const participantsValidation = await validateParticipants({
      administratorId: auth.administratorId,
      condominiumId,
      participants: mergeParticipants(
        participantInputs,
        automaticGovernanceParticipants,
      ),
    });

    if (!participantsValidation.ok) {
      return badRequest(participantsValidation.message);
    }

    const meeting = await db.$transaction(async (tx) => {
      const room = await tx.meetingRoom.create({
        data: {
          administratorId: auth.administratorId,
          condominiumId,
          type: MeetingRoomType.COUNCIL,
          mode: modeValidation.value,
          status: toRoomStatus(statusValidation.value),
          title,
          description,
          scheduledStartAt: scheduledStartAtValidation.value,
          scheduledEndAt: scheduledEndAtValidation.value,
          location,
          provider: MeetingProvider.INTERNAL_PENDING,
          internalAccessCode: generateInternalAccessCode(),
          accessInstructions,
          createdByUserId: auth.authUser.id,
          metadata: {
            source: "COUNCIL_MEETING",
            createdFrom: "ADMIN_API",
          },
        },
      });

      const created = await tx.councilMeeting.create({
        data: {
          administratorId: auth.administratorId,
          condominiumId,
          meetingRoomId: room.id,
          title,
          description,
          status: statusValidation.value,
          mode: modeValidation.value,
          scheduledStartAt: scheduledStartAtValidation.value,
          scheduledEndAt: scheduledEndAtValidation.value,
          location,
          internalNotes,
          createdByUserId: auth.authUser.id,
          metadata: {
            roomId: room.id,
            roomProvider: MeetingProvider.INTERNAL_PENDING,
          },
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

      if (participantsValidation.value.length > 0) {
        await tx.councilMeetingParticipant.createMany({
          data: participantsValidation.value.map((participant) => ({
            councilMeetingId: created.id,
            userId: participant.userId,
            userAccessId: participant.userAccessId,
            role: participant.role,
            status: CouncilParticipantStatus.INVITED,
          })),
          skipDuplicates: true,
        });

        await tx.meetingRoomParticipant.createMany({
          data: participantsValidation.value.map((participant) => ({
            meetingRoomId: room.id,
            userId: participant.userId,
            userAccessId: participant.userAccessId,
            role: participant.role,
            status: MeetingRoomParticipantStatus.INVITED,
          })),
          skipDuplicates: true,
        });
      }

      if (agendaItems.length > 0) {
        await tx.councilMeetingAgendaItem.createMany({
          data: agendaItems.map((item) => ({
            councilMeetingId: created.id,
            order: item.order,
            title: item.title,
            description: item.description,
            status: CouncilAgendaItemStatus.OPEN,
          })),
        });
      }

      await tx.meetingRoomLog.create({
        data: {
          meetingRoomId: room.id,
          userId: auth.authUser.id,
          action: MeetingRoomLogAction.CREATED,
          message: "Sala De Reunião EloGest criada para reunião de conselho.",
          metadata: {
            councilMeetingId: created.id,
            status: toRoomStatus(statusValidation.value),
            mode: modeValidation.value,
          },
        },
      });

      await tx.councilMeetingLog.create({
        data: {
          councilMeetingId: created.id,
          userId: auth.authUser.id,
          action:
            statusValidation.value === CouncilMeetingStatus.SCHEDULED
              ? CouncilMeetingLogAction.SCHEDULED
              : CouncilMeetingLogAction.CREATED,
          message:
            statusValidation.value === CouncilMeetingStatus.SCHEDULED
              ? "Reunião de conselho criada e agendada pela administradora."
              : "Reunião de conselho criada como rascunho pela administradora.",
          metadata: {
            status: statusValidation.value,
            mode: modeValidation.value,
            participantsCount: participantsValidation.value.length,
            agendaItemsCount: agendaItems.length,
          },
        },
      });

      return created;
    });

    if (meeting.status === CouncilMeetingStatus.SCHEDULED) {
      await notifyCouncilMeetingAudience({
        meeting,
        actorUser: auth.authUser,
        type: "COUNCIL_MEETING_CREATED",
        title: "Nova reunião de conselho agendada",
        message: `A reunião "${meeting.title}" foi agendada no EloGest.`,
        metadata: {
          status: meeting.status,
          mode: meeting.mode,
          source: "ADMIN_COUNCIL_MEETING_CREATE",
        },
      });
    }

    return NextResponse.json(
      {
        meeting,
        message: "Reunião de conselho criada com sucesso.",
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Erro ao criar reunião de conselho:", error);

    return NextResponse.json(
      {
        error: "Não foi possível criar a reunião de conselho.",
      },
      {
        status: 500,
      },
    );
  }
}
