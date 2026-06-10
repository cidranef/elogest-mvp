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
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasModuleAccess, MODULE_SLUGS } from "@/lib/plan-limits";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { notifyCouncilMeetingAudience, sendNotification } from "@/lib/notifications";

/* =========================================================
   API PORTAL - NOVA REUNIÃO DE CONSELHO

   Arquivo:
   src/app/api/portal/reunioes-conselho/nova/route.ts

   ETAPA 49.8.2 — NOVA REUNIÃO PELO PORTAL

   Objetivo:
   - Permitir que SÍNDICO ou CONSELHEIRO crie reunião de conselho
     pelo portal, sem depender da administradora.
   - A administradora continua podendo criar pela área admin como apoio.
   - Permitir reaproveitar pendências abertas de reuniões anteriores.

   Segurança:
   - Exige usuário autenticado.
   - Usa perfil ativo via cookie/sessão.
   - Exige vínculo ativo SÍNDICO ou CONSELHEIRO no condomínio.
   - Bloqueia condomínio/administradora inativos.
   - Exige módulo comercial Reuniões De Conselho liberado.
   - Cria reunião somente no condomínio do perfil de governança.
   ========================================================= */

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

type PortalGovernanceAccess = {
  authUser: {
    id: string;
    name: string | null;
    email: string;
  };
  accessId: string;
  accessLabel: string | null;
  role: AccessRole;
  administratorId: string;
  condominiumId: string;
  condominiumName: string;
};

type CreatePortalCouncilMeetingBody = {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  mode?: unknown;
  scheduledStartAt?: unknown;
  scheduledEndAt?: unknown;
  location?: unknown;
  accessInstructions?: unknown;
  agendaItems?: unknown;
  pendingAgendaItemIds?: unknown;
  recordKeeperUserId?: unknown;
  invitedUserAccessIds?: unknown;
};

type AgendaInput = {
  title: string;
  description: string | null;
  sourceAgendaItemId?: string | null;
};

type ParticipantInput = {
  userId: string;
  userAccessId: string | null;
  role: AccessRole;
  label?: string | null;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown) {
  return normalizeNullableString(value) ?? "";
}

function parseDateOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: null };
  }

  if (typeof value !== "string" && !(value instanceof Date)) {
    return { ok: false as const, message: "Informe uma data válida." };
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { ok: false as const, message: "Informe uma data válida." };
  }

  return { ok: true as const, value: date };
}

function parseMeetingMode(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: true as const, value: MeetingMode.ONLINE };
  }

  if (!Object.values(MeetingMode).includes(value as MeetingMode)) {
    return { ok: false as const, message: "Formato da reunião inválido." };
  }

  return { ok: true as const, value: value as MeetingMode };
}

function parseCouncilStatus(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: true as const, value: CouncilMeetingStatus.SCHEDULED };
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

  return { ok: true as const, value: value as CouncilMeetingStatus };
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

function getSessionUserId(sessionUser: SessionUserShape | undefined) {
  return sessionUser?.id || null;
}

function getSessionAccessId(sessionUser: SessionUserShape | undefined) {
  return (
    sessionUser?.activeAccessId ||
    sessionUser?.accessId ||
    sessionUser?.userAccessId ||
    null
  );
}

function getParticipantRolePriority(role: AccessRole) {
  if (role === AccessRole.SINDICO) return 1;
  if (role === AccessRole.CONSELHEIRO) return 2;
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

function normalizeAgendaItems(value: unknown): AgendaInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const raw = item as Record<string, unknown>;
      const title = normalizeRequiredString(raw.title);

      if (title.length < 3) return null;

      return {
        title,
        description: normalizeNullableString(raw.description),
      } satisfies AgendaInput;
    })
    .filter((item): item is AgendaInput => Boolean(item));
}

function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => normalizeNullableString(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

async function requirePortalGovernanceAccess(): Promise<
  PortalGovernanceAccess | { error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUserShape | undefined;
  const userId = getSessionUserId(sessionUser);

  if (!userId) {
    return {
      error: NextResponse.json(
        { error: "Sessão expirada. Faça login novamente." },
        { status: 401 },
      ),
    };
  }

  const cookieActiveAccess = (await getActiveUserAccessFromCookies({
    userId,
  })) as CookieActiveAccessShape | null;

  const cookieAccessId = cookieActiveAccess?.accessId || cookieActiveAccess?.id || null;
  const sessionAccessId = getSessionAccessId(sessionUser);
  const activeAccessId = cookieAccessId || sessionAccessId;

  const activeAccessWhere: Prisma.UserAccessWhereInput = {
    userId,
    isActive: true,
  };

  if (activeAccessId) {
    activeAccessWhere.id = activeAccessId;
  }

  const activeAccess = await db.userAccess.findFirst({
    where: activeAccessWhere,
    orderBy: activeAccessId
      ? undefined
      : [
          { isDefault: "desc" },
          { lastUsedAt: "desc" },
          { createdAt: "asc" },
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
          name: true,
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

  if (!activeAccess || !activeAccess.user.isActive) {
    return {
      error: NextResponse.json(
        { error: "Perfil ativo não encontrado ou usuário inativo." },
        { status: 403 },
      ),
    };
  }

  if (!activeAccess.condominiumId || !activeAccess.condominium) {
    return {
      error: NextResponse.json(
        {
          error:
            "Selecione um perfil vinculado a um condomínio para criar reuniões de conselho.",
        },
        { status: 403 },
      ),
    };
  }

  if (activeAccess.condominium.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        { error: "Este condomínio está inativo. A criação de reuniões está bloqueada." },
        { status: 403 },
      ),
    };
  }

  if (activeAccess.condominium.administrator.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        {
          error:
            "A administradora deste condomínio está inativa. A criação de reuniões está bloqueada.",
        },
        { status: 403 },
      ),
    };
  }

  const governanceRoles: AccessRole[] = [AccessRole.SINDICO, AccessRole.CONSELHEIRO];

  const governanceAccess = governanceRoles.includes(activeAccess.role)
    ? activeAccess
    : await db.userAccess.findFirst({
        where: {
          userId,
          isActive: true,
          condominiumId: activeAccess.condominiumId,
          role: {
            in: governanceRoles,
          },
        },
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
              name: true,
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
        orderBy: [
          { isDefault: "desc" },
          { lastUsedAt: "desc" },
          { createdAt: "asc" },
        ],
      });

  if (!governanceAccess || !governanceRoles.includes(governanceAccess.role)) {
    return {
      error: NextResponse.json(
        {
          error:
            "Somente síndicos e conselheiros podem criar reuniões de conselho pelo portal.",
        },
        { status: 403 },
      ),
    };
  }

  if (!governanceAccess.condominiumId || !governanceAccess.condominium) {
    return {
      error: NextResponse.json(
        {
          error:
            "O perfil de governança selecionado não está vinculado a um condomínio válido.",
        },
        { status: 403 },
      ),
    };
  }

  const governanceCondominium = governanceAccess.condominium;

  const moduleAccess = await hasModuleAccess({
    administratorId: governanceCondominium.administratorId,
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
        { status: 403 },
      ),
    };
  }

  return {
    authUser: {
      id: governanceAccess.user.id,
      name: governanceAccess.user.name,
      email: governanceAccess.user.email,
    },
    accessId: governanceAccess.id,
    accessLabel: governanceAccess.label,
    role: governanceAccess.role,
    administratorId: governanceCondominium.administratorId,
    condominiumId: governanceAccess.condominiumId,
    condominiumName: governanceCondominium.name,
  };
}

async function getAutomaticGovernanceParticipants(params: {
  condominiumId: string;
}) {
  const accesses = await db.userAccess.findMany({
    where: {
      isActive: true,
      condominiumId: params.condominiumId,
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
      label: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return consolidateParticipantsByUser(
    accesses.map((access) => ({
      userId: access.userId,
      userAccessId: access.id,
      role: access.role,
      label: access.label,
      user: access.user,
    })),
  );
}



async function getInviteCandidateParticipants(params: {
  condominiumId: string;
}) {
  const accesses = await db.userAccess.findMany({
    where: {
      isActive: true,
      condominiumId: params.condominiumId,
      role: {
        in: [AccessRole.MORADOR, AccessRole.PROPRIETARIO],
      },
      user: {
        isActive: true,
      },
    },
    select: {
      id: true,
      userId: true,
      role: true,
      label: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      unit: {
        select: {
          id: true,
          block: true,
          unitNumber: true,
        },
      },
      resident: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [
      { role: "asc" },
      { label: "asc" },
      { createdAt: "asc" },
    ],
  });

  const byAccess = new Map<string, (typeof accesses)[number]>();

  for (const access of accesses) {
    byAccess.set(access.id, access);
  }

  return Array.from(byAccess.values());
}

function getInviteCandidateContext(candidate: Awaited<ReturnType<typeof getInviteCandidateParticipants>>[number]) {
  const unitLabel = candidate.unit
    ? [candidate.unit.block ? `Bloco ${candidate.unit.block}` : null, `Unidade ${candidate.unit.unitNumber}`]
        .filter(Boolean)
        .join(" / ")
    : null;

  return unitLabel || candidate.label || candidate.resident?.name || null;
}

export async function GET() {
  const access = await requirePortalGovernanceAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const participants = await getAutomaticGovernanceParticipants({
      condominiumId: access.condominiumId,
    });

    const automaticParticipantUserIds = new Set(
      participants.map((participant) => participant.userId),
    );

    const inviteCandidates = (
      await getInviteCandidateParticipants({
        condominiumId: access.condominiumId,
      })
    ).filter((candidate) => !automaticParticipantUserIds.has(candidate.userId));

    return NextResponse.json({
      activeAccess: {
        id: access.accessId,
        role: access.role,
        label: access.accessLabel,
        condominiumId: access.condominiumId,
        condominiumName: access.condominiumName,
      },
      condominium: {
        id: access.condominiumId,
        name: access.condominiumName,
      },
      participants: participants.map((participant) => ({
        userId: participant.userId,
        userAccessId: participant.userAccessId,
        role: participant.role,
        label: participant.label || null,
        isCurrentUser: participant.userId === access.authUser.id,
        user: participant.user || {
          id: participant.userId,
          name: null,
          email: null,
        },
      })),
      inviteCandidates: inviteCandidates.map((candidate) => ({
        userAccessId: candidate.id,
        userId: candidate.userId,
        role: candidate.role,
        label: candidate.label || null,
        contextLabel: getInviteCandidateContext(candidate),
        user: candidate.user,
        resident: candidate.resident,
        unit: candidate.unit,
      })),
    });
  } catch (error) {
    console.error("Erro ao preparar criação de reunião pelo portal:", error);

    return NextResponse.json(
      { error: "Não foi possível preparar a criação da reunião de conselho." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await requirePortalGovernanceAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const body = (await request.json()) as CreatePortalCouncilMeetingBody;

    const title = normalizeRequiredString(body.title);
    const description = normalizeNullableString(body.description);
    const location = normalizeNullableString(body.location);
    const accessInstructions = normalizeNullableString(body.accessInstructions);
    const requestedRecordKeeperUserId = normalizeNullableString(
      body.recordKeeperUserId,
    );

    if (title.length < 3) {
      return badRequest("Informe um título para a reunião.");
    }

    const statusValidation = parseCouncilStatus(body.status);
    if (!statusValidation.ok) return badRequest(statusValidation.message);

    const modeValidation = parseMeetingMode(body.mode);
    if (!modeValidation.ok) return badRequest(modeValidation.message);

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

    const directAgendaItems = normalizeAgendaItems(body.agendaItems);
    const pendingAgendaItemIds = normalizeIdList(body.pendingAgendaItemIds);
    const invitedUserAccessIds = normalizeIdList(body.invitedUserAccessIds);

    const pendingItems = pendingAgendaItemIds.length
      ? await db.councilMeetingAgendaItem.findMany({
          where: {
            id: {
              in: pendingAgendaItemIds,
            },
            status: {
              in: [
                CouncilAgendaItemStatus.OPEN,
                CouncilAgendaItemStatus.DISCUSSED,
                CouncilAgendaItemStatus.POSTPONED,
              ],
            },
            councilMeeting: {
              condominiumId: access.condominiumId,
              administratorId: access.administratorId,
            },
          },
          select: {
            id: true,
            title: true,
            description: true,
            discussionNotes: true,
            decision: true,
            responsibleName: true,
            dueDate: true,
            councilMeeting: {
              select: {
                id: true,
                title: true,
                scheduledStartAt: true,
              },
            },
          },
          orderBy: [
            {
              dueDate: "asc",
            },
            {
              createdAt: "asc",
            },
          ],
        })
      : [];

    const pendingAgendaItems: AgendaInput[] = pendingItems.map((item) => {
      const originDate = item.councilMeeting.scheduledStartAt
        ? new Intl.DateTimeFormat("pt-BR").format(item.councilMeeting.scheduledStartAt)
        : "sem data definida";

      const details = [
        item.description ? `Descrição original: ${item.description}` : null,
        item.discussionNotes ? `Discussão anterior: ${item.discussionNotes}` : null,
        item.decision ? `Decisão/encaminhamento anterior: ${item.decision}` : null,
        item.responsibleName ? `Responsável anterior: ${item.responsibleName}` : null,
        item.dueDate
          ? `Prazo anterior: ${new Intl.DateTimeFormat("pt-BR").format(item.dueDate)}`
          : null,
        `Origem: ${item.councilMeeting.title} (${originDate}).`,
      ].filter(Boolean);

      return {
        title: item.title,
        description: details.join("\n"),
        sourceAgendaItemId: item.id,
      };
    });

    const agendaItems = [...pendingAgendaItems, ...directAgendaItems];

    if (agendaItems.length === 0) {
      return badRequest(
        "Inclua ao menos uma pauta nova ou selecione uma pendência anterior.",
      );
    }

    const automaticParticipants = await getAutomaticGovernanceParticipants({
      condominiumId: access.condominiumId,
    });

    const automaticParticipantUserIds = new Set(
      automaticParticipants.map((participant) => participant.userId),
    );

    const invitedAccesses = invitedUserAccessIds.length
      ? await db.userAccess.findMany({
          where: {
            id: { in: invitedUserAccessIds },
            isActive: true,
            condominiumId: access.condominiumId,
            role: {
              in: [AccessRole.MORADOR, AccessRole.PROPRIETARIO],
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
        })
      : [];

    if (invitedUserAccessIds.length !== invitedAccesses.length) {
      return badRequest(
        "Um ou mais convidados selecionados não pertencem ao condomínio ou não estão ativos.",
      );
    }

    const invitedParticipants: ParticipantInput[] = invitedAccesses
      .filter((candidate) => !automaticParticipantUserIds.has(candidate.userId))
      .map((candidate) => ({
        userId: candidate.userId,
        userAccessId: candidate.id,
        role: candidate.role,
      }));

    const participants = consolidateParticipantsByUser([
      ...automaticParticipants,
      ...invitedParticipants,
    ]);

    if (
      requestedRecordKeeperUserId &&
      !participants.some(
        (participant) => participant.userId === requestedRecordKeeperUserId,
      )
    ) {
      return badRequest(
        "O responsável pelo registro precisa estar entre os participantes da reunião.",
      );
    }

    const createdMeeting = await db.$transaction(async (tx) => {
      const room = await tx.meetingRoom.create({
        data: {
          administratorId: access.administratorId,
          condominiumId: access.condominiumId,
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
          createdByUserId: access.authUser.id,
          metadata: {
            source: "PORTAL_COUNCIL_MEETING_CREATE",
            createdByAccessId: access.accessId,
            createdByAccessRole: access.role,
          },
        },
      });

      const meeting = await tx.councilMeeting.create({
        data: {
          administratorId: access.administratorId,
          condominiumId: access.condominiumId,
          meetingRoomId: room.id,
          title,
          description,
          status: statusValidation.value,
          mode: modeValidation.value,
          scheduledStartAt: scheduledStartAtValidation.value,
          scheduledEndAt: scheduledEndAtValidation.value,
          location,
          createdByUserId: access.authUser.id,
          metadata: {
            source: "PORTAL_COUNCIL_MEETING_CREATE",
            createdByAccessId: access.accessId,
            createdByAccessRole: access.role,
            selectedPendingAgendaItemIds: pendingItems.map((item) => item.id),
            invitedUserAccessIds,
            invitedUsersCount: invitedParticipants.length,
            requestedRecordKeeperUserId,
          },
        },
        include: {
          condominium: {
            select: {
              id: true,
              name: true,
              administratorId: true,
            },
          },
          meetingRoom: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      let finalMeeting = meeting;

      await tx.councilMeetingAgendaItem.createMany({
        data: agendaItems.map((item, index) => ({
          councilMeetingId: meeting.id,
          order: index + 1,
          title: item.title,
          description: item.description,
          status: CouncilAgendaItemStatus.OPEN,
          metadata: item.sourceAgendaItemId
            ? {
                source: "PREVIOUS_PENDING_AGENDA_ITEM",
                sourceAgendaItemId: item.sourceAgendaItemId,
              }
            : {
                source: "PORTAL_MANUAL_AGENDA_ITEM",
              },
        })),
      });

      if (participants.length > 0) {
        await tx.councilMeetingParticipant.createMany({
          data: participants.map((participant) => ({
            councilMeetingId: meeting.id,
            userId: participant.userId,
            userAccessId: participant.userAccessId,
            role: participant.role,
            status: CouncilParticipantStatus.INVITED,
          })),
          skipDuplicates: true,
        });

        await tx.meetingRoomParticipant.createMany({
          data: participants.map((participant) => ({
            meetingRoomId: room.id,
            userId: participant.userId,
            userAccessId: participant.userAccessId,
            role: participant.role,
            status: MeetingRoomParticipantStatus.INVITED,
          })),
          skipDuplicates: true,
        });
      }

      if (requestedRecordKeeperUserId) {
        const recordKeeperParticipant =
          await tx.councilMeetingParticipant.findFirst({
            where: {
              councilMeetingId: meeting.id,
              userId: requestedRecordKeeperUserId,
            },
            select: {
              id: true,
              userId: true,
              userAccessId: true,
              role: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          });

        if (recordKeeperParticipant) {
          finalMeeting = await tx.councilMeeting.update({
            where: {
              id: meeting.id,
            },
            data: {
              recordKeeperUserId: recordKeeperParticipant.userId,
              recordKeeperParticipantId: recordKeeperParticipant.id,
              recordKeeperAssignedAt: new Date(),
            },
            include: {
              condominium: {
                select: {
                  id: true,
                  name: true,
                  administratorId: true,
                },
              },
              meetingRoom: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          });

          await tx.councilMeetingLog.create({
            data: {
              councilMeetingId: meeting.id,
              userId: access.authUser.id,
              action: CouncilMeetingLogAction.UPDATED,
              message: `Responsável pelo registro definido: ${
                recordKeeperParticipant.user.name ||
                recordKeeperParticipant.user.email ||
                "participante"
              }.`,
              metadata: {
                source: "PORTAL_COUNCIL_MEETING_RECORD_KEEPER_ON_CREATE",
                recordKeeperUserId: recordKeeperParticipant.userId,
                recordKeeperParticipantId: recordKeeperParticipant.id,
                recordKeeperUserAccessId:
                  recordKeeperParticipant.userAccessId || null,
                recordKeeperRole: recordKeeperParticipant.role,
              },
            },
          });
        }
      }

      await tx.councilMeetingLog.create({
        data: {
          councilMeetingId: meeting.id,
          userId: access.authUser.id,
          action:
            statusValidation.value === CouncilMeetingStatus.SCHEDULED
              ? CouncilMeetingLogAction.SCHEDULED
              : CouncilMeetingLogAction.CREATED,
          message: "Reunião de conselho criada pelo portal.",
          metadata: {
            source: "PORTAL_COUNCIL_MEETING_CREATE",
            createdByAccessId: access.accessId,
            createdByAccessRole: access.role,
            agendaItemsCount: agendaItems.length,
            selectedPendingAgendaItemIds: pendingItems.map((item) => item.id),
            invitedUserAccessIds,
            invitedUsersCount: invitedParticipants.length,
          },
        },
      });

      await tx.meetingRoomLog.create({
        data: {
          meetingRoomId: room.id,
          userId: access.authUser.id,
          action:
            statusValidation.value === CouncilMeetingStatus.SCHEDULED
              ? MeetingRoomLogAction.SCHEDULED
              : MeetingRoomLogAction.CREATED,
          message: "Sala De Reunião EloGest criada pelo portal.",
          metadata: {
            source: "PORTAL_COUNCIL_MEETING_CREATE",
            councilMeetingId: meeting.id,
          },
        },
      });

      return finalMeeting;
    });

    void notifyCouncilMeetingAudience({
      meeting: {
        id: createdMeeting.id,
        title: createdMeeting.title,
        administratorId: createdMeeting.administratorId,
        condominiumId: createdMeeting.condominiumId,
        scheduledStartAt: createdMeeting.scheduledStartAt,
        scheduledEndAt: createdMeeting.scheduledEndAt,
        meetingMode: createdMeeting.mode,
        condominium: createdMeeting.condominium,
        meetingRoom: createdMeeting.meetingRoom,
      },
      actorUser: access.authUser,
      type: "COUNCIL_MEETING_CREATED",
      title: "Nova reunião de conselho criada",
      message: `${access.authUser.name || "Um participante"} criou a reunião "${createdMeeting.title}" no EloGest.`,
      metadata: {
        source: "PORTAL_COUNCIL_MEETING_CREATE",
        createdByAccessId: access.accessId,
        createdByAccessRole: access.role,
        invitedUsersCount: invitedParticipants.length,
      },
    }).catch((error) => {
      console.error("Erro ao notificar criação de reunião pelo portal:", error);
    });

    if (requestedRecordKeeperUserId) {
      void sendNotification({
        channel: "SYSTEM",
        userId: requestedRecordKeeperUserId,
        type: "COUNCIL_MEETING_RECORD_KEEPER_ASSIGNED",
        title: "Você foi definido como responsável pelo registro",
        message: `Você foi escolhido para registrar as informações da reunião "${createdMeeting.title}".`,
        href: `/portal/reunioes-conselho/${createdMeeting.id}/sala`,
        metadata: {
          source: "PORTAL_COUNCIL_MEETING_CREATE",
          councilMeetingId: createdMeeting.id,
          recordKeeperUserId: requestedRecordKeeperUserId,
        },
      }).catch((error) => {
        console.error(
          "Erro ao notificar responsável pelo registro definido pelo portal:",
          error,
        );
      });
    }

    return NextResponse.json({
      meeting: createdMeeting,
      message: "Reunião de conselho criada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao criar reunião de conselho pelo portal:", error);

    return NextResponse.json(
      { error: "Não foi possível criar a reunião de conselho." },
      { status: 500 },
    );
  }
}
