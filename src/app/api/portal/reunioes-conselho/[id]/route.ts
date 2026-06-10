import { NextResponse } from "next/server";
import {
  AccessRole,
  CouncilMeetingLogAction,
  CouncilMeetingStatus,
  Status,
  type Prisma,
} from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasModuleAccess, MODULE_SLUGS } from "@/lib/plan-limits";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { notifyCouncilMeetingAdministradoraUsers, notifySingleUser } from "@/lib/notifications";

/* =========================================================
   API PORTAL - DETALHE DA REUNIÃO DE CONSELHO

   Arquivo:
   src/app/api/portal/reunioes-conselho/[id]/route.ts

   ETAPA 49 — REUNIÕES DE CONSELHO

   Métodos:
   - GET: exibe reunião de conselho compatível com o perfil ativo.
   - PATCH: permite ao usuário confirmar ou recusar presença.
   - PATCH também notifica a administradora sobre a resposta do participante.

   Segurança:
   - Não permite abrir reunião fora do condomínio do perfil ativo.
   - Permite acesso para SÍNDICO e CONSELHEIRO do condomínio.
   - Permite acesso para participante convidado.
   - Não expõe observações internas da administradora.
   - Não permite edição operacional da reunião pelo portal.
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
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

type PortalCouncilAccess = {
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
  unitId: string | null;
  linkType: string | null;
  isGovernanceProfile: boolean;
  governanceAccessIds: string[];
  governanceAccessLabel: string | null;
  governanceRole: AccessRole | null;
  relatedAccessIds: string[];
};

type UpdatePresenceBody = {
  action?: unknown;
  recordKeeperUserId?: unknown;
};

type ParticipantForConsolidation = {
  id: string;
  userAccessId: string | null;
  role: AccessRole | string;
  status: string;
  invitedAt: Date | null;
  respondedAt: Date | null;
  confirmedAt: Date | null;
  joinedAt: Date | null;
  attendanceNote: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

function getRoleLabel(role?: string | null) {
  if (role === AccessRole.SINDICO) return "Síndico";
  if (role === AccessRole.CONSELHEIRO) return "Conselheiro";
  if (role === AccessRole.ADMINISTRADORA) return "Administradora";

  return role || "Perfil";
}

function getPresencePriority(status?: string | null) {
  if (status === "ATTENDED") return 1;
  if (status === "CONFIRMED") return 2;
  if (status === "INVITED") return 3;
  if (status === "DECLINED") return 4;
  if (status === "ABSENT") return 5;

  return 99;
}

function formatRoleList(roles: string[]) {
  const labels = roles.map(getRoleLabel);

  if (labels.length <= 1) {
    return labels[0] || "Perfil";
  }

  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

function consolidateParticipantsByPerson(participants: ParticipantForConsolidation[]) {
  const byUser = new Map<string, ParticipantForConsolidation[]>();

  for (const participant of participants) {
    const list = byUser.get(participant.user.id) ?? [];
    list.push(participant);
    byUser.set(participant.user.id, list);
  }

  return Array.from(byUser.values()).map((list) => {
    const sortedByStatus = [...list].sort((a, b) => {
      const statusCompare = getPresencePriority(a.status) - getPresencePriority(b.status);

      if (statusCompare !== 0) {
        return statusCompare;
      }

      return (a.invitedAt?.getTime() ?? 0) - (b.invitedAt?.getTime() ?? 0);
    });

    const main = sortedByStatus[0];
    const roles = Array.from(new Set(list.map((item) => String(item.role))));

    return {
      ...main,
      role: formatRoleList(roles),
      status: main.status,
      respondedAt: main.respondedAt,
      confirmedAt: main.confirmedAt,
      attendanceNote: main.attendanceNote,
      roles,
      participantIds: list.map((item) => item.id),
      userAccessIds: list
        .map((item) => item.userAccessId)
        .filter((item): item is string => Boolean(item)),
    };
  });
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

async function requirePortalCouncilMeetingAccess(): Promise<
  PortalCouncilAccess | { error: NextResponse }
> {
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

  const activeAccessWhere: Prisma.UserAccessWhereInput = {
    userId,
    isActive: true,
  };

  if (activeAccessId) {
    activeAccessWhere.id = activeAccessId;
  } else if (cookieActiveAccess?.role) {
    activeAccessWhere.role = cookieActiveAccess.role as AccessRole;

    if (cookieActiveAccess.administratorId) {
      activeAccessWhere.administratorId = cookieActiveAccess.administratorId;
    }

    if (cookieActiveAccess.condominiumId) {
      activeAccessWhere.condominiumId = cookieActiveAccess.condominiumId;
    }

    if (cookieActiveAccess.unitId) {
      activeAccessWhere.unitId = cookieActiveAccess.unitId;
    }

    if (cookieActiveAccess.residentId) {
      activeAccessWhere.residentId = cookieActiveAccess.residentId;
    }
  }

  const access = await db.userAccess.findFirst({
    where: activeAccessWhere,
    orderBy: activeAccessId || cookieActiveAccess?.role
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
      unitPersonLink: {
        select: {
          linkType: true,
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
          error: "Selecione um perfil vinculado a um condomínio para acessar reuniões de conselho.",
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
          error: "Este condomínio está inativo. O acesso às reuniões está bloqueado.",
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
          error: "A administradora deste condomínio está inativa. O acesso às reuniões está bloqueado.",
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

  const governanceRoles: AccessRole[] = [
    AccessRole.SINDICO,
    AccessRole.CONSELHEIRO,
  ];

  const governanceAccesses = await db.userAccess.findMany({
    where: {
      userId,
      isActive: true,
      condominiumId: access.condominiumId,
      role: {
        in: governanceRoles,
      },
    },
    select: {
      id: true,
      label: true,
      role: true,
      isDefault: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: [
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
  });

  const governanceAccessIds = governanceAccesses.map((item) => item.id);
  const relatedAccessIds = Array.from(
    new Set([
      access.id,
      ...governanceAccessIds,
    ]),
  );
  const primaryGovernanceAccess = governanceAccesses[0] ?? null;
  const activeAccessIsGovernance = governanceRoles.includes(access.role);
  const isGovernanceProfile =
    activeAccessIsGovernance || governanceAccesses.length > 0;

  return {
    authUser: {
      id: access.user.id,
      name: access.user.name,
      email: access.user.email,
    },
    accessId: access.id,
    accessLabel: access.label,
    role: access.role,
    administratorId: access.condominium.administratorId,
    condominiumId: access.condominiumId,
    unitId: access.unitId,
    linkType: access.unitPersonLink?.linkType ?? null,
    isGovernanceProfile,
    governanceAccessIds,
    governanceAccessLabel: primaryGovernanceAccess?.label ?? null,
    governanceRole: primaryGovernanceAccess?.role ?? null,
    relatedAccessIds,
  };
}

function buildParticipantWhere(
  access: PortalCouncilAccess,
): Prisma.CouncilMeetingWhereInput {
  return {
    participants: {
      some: {
        OR: [
          {
            userId: access.authUser.id,
          },
          {
            userAccessId: {
              in: access.relatedAccessIds,
            },
          },
        ],
      },
    },
  };
}

function buildPortalCouncilMeetingDetailWhere(params: {
  access: PortalCouncilAccess;
  meetingId: string;
}): Prisma.CouncilMeetingWhereInput {
  const { access, meetingId } = params;

  const visibleStatuses: CouncilMeetingStatus[] = [
    CouncilMeetingStatus.DRAFT,
    CouncilMeetingStatus.SCHEDULED,
    CouncilMeetingStatus.IN_PROGRESS,
    CouncilMeetingStatus.COMPLETED,
    CouncilMeetingStatus.CANCELED,
  ];

  const where: Prisma.CouncilMeetingWhereInput = {
    id: meetingId,
    administratorId: access.administratorId,
    condominiumId: access.condominiumId,
    status: {
      in: visibleStatuses,
    },
  };

  /*
    Síndico e Conselheiro do condomínio, inclusive como perfis
    complementares, podem consultar a reunião mesmo quando ainda
    não há participantes cadastrados. Para usuários sem governança,
    continua obrigatório estar na lista de participantes.
  */
  if (!access.isGovernanceProfile) {
    where.OR = [buildParticipantWhere(access)];
  }

  return where;
}

function parsePresenceAction(value: unknown) {
  if (value !== "CONFIRM" && value !== "DECLINE") {
    return null;
  }

  return value;
}

function hasConfirmedRoomPresence(status?: string | null) {
  return status === "CONFIRMED" || status === "ATTENDED";
}

function normalizeRecordKeeperUserId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const access = await requirePortalCouncilMeetingAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const { id } = await context.params;

    const meeting = await db.councilMeeting.findFirst({
      where: buildPortalCouncilMeetingDetailWhere({
        access,
        meetingId: id,
      }),
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        mode: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        completedAt: true,
        canceledAt: true,
        location: true,
        summary: true,
        decisions: true,
        nextSteps: true,
        recordKeeperUserId: true,
        recordKeeperParticipantId: true,
        recordKeeperAssignedAt: true,
        recordKeeperUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        recordKeeperParticipant: {
          select: {
            id: true,
            userId: true,
            userAccessId: true,
            role: true,
            status: true,
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
        createdAt: true,
        updatedAt: true,
        condominium: {
          select: {
            id: true,
            name: true,
          },
        },
        meetingRoom: {
          select: {
            id: true,
            type: true,
            mode: true,
            status: true,
            scheduledStartAt: true,
            scheduledEndAt: true,
            openedAt: true,
            closedAt: true,
            location: true,
            provider: true,
            accessInstructions: true,
          },
        },
        agendaItems: {
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
          },
          orderBy: [
            {
              order: "asc",
            },
            {
              createdAt: "asc",
            },
          ],
        },
        participants: {
          select: {
            id: true,
            userAccessId: true,
            role: true,
            status: true,
            invitedAt: true,
            respondedAt: true,
            confirmedAt: true,
            joinedAt: true,
            attendanceNote: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: [
            {
              role: "asc",
            },
            {
              invitedAt: "asc",
            },
          ],
        },
        attachments: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            url: true,
            description: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        logs: {
          where: {
            action: {
              in: [
                CouncilMeetingLogAction.CREATED,
                CouncilMeetingLogAction.SCHEDULED,
                CouncilMeetingLogAction.STARTED,
                CouncilMeetingLogAction.COMPLETED,
                CouncilMeetingLogAction.CANCELED,
                CouncilMeetingLogAction.ATTENDANCE_CONFIRMED,
                CouncilMeetingLogAction.PRESENCE_REGISTERED,
                CouncilMeetingLogAction.DECISION_REGISTERED,
              ],
            },
          },
          select: {
            id: true,
            action: true,
            message: true,
            createdAt: true,
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
    });

    if (!meeting) {
      return NextResponse.json(
        {
          error: "Reunião de conselho não encontrada para o perfil ativo.",
        },
        {
          status: 404,
        },
      );
    }

    const consolidatedParticipants = consolidateParticipantsByPerson(
      meeting.participants,
    );

    const myParticipant =
      consolidatedParticipants.find((participant) => {
        return (
          participant.user.id === access.authUser.id ||
          participant.userAccessIds.some((userAccessId) =>
            access.relatedAccessIds.includes(userAccessId),
          )
        );
      }) ?? null;

    const recordKeeper = meeting.recordKeeperUser
      ? {
          userId: meeting.recordKeeperUser.id,
          participantId: meeting.recordKeeperParticipant?.id || null,
          userAccessId: meeting.recordKeeperParticipant?.userAccessId || null,
          name:
            meeting.recordKeeperUser.name ||
            meeting.recordKeeperUser.email ||
            "Responsável pelo registro",
          email: meeting.recordKeeperUser.email,
          role: meeting.recordKeeperParticipant?.role || null,
          roleLabel: getRoleLabel(meeting.recordKeeperParticipant?.role),
          assignedAt: meeting.recordKeeperAssignedAt,
        }
      : null;

    const isCurrentUserRecordKeeper =
      meeting.recordKeeperUserId === access.authUser.id ||
      Boolean(
        meeting.recordKeeperParticipantId &&
          myParticipant?.participantIds?.includes(meeting.recordKeeperParticipantId),
      );

    const hasConfirmedPresence = hasConfirmedRoomPresence(myParticipant?.status);

    return NextResponse.json({
      meeting: {
        ...meeting,
        participants: consolidatedParticipants,
        myParticipant,
        recordKeeper,
        isCurrentUserRecordKeeper,
        canManageRoom:
          (access.isGovernanceProfile || isCurrentUserRecordKeeper) &&
          (meeting.status === CouncilMeetingStatus.DRAFT ||
            meeting.status === CouncilMeetingStatus.SCHEDULED ||
            meeting.status === CouncilMeetingStatus.IN_PROGRESS),
        hasConfirmedPresence,
        canAccessRoom:
          hasConfirmedPresence &&
          (meeting.status === CouncilMeetingStatus.DRAFT ||
            meeting.status === CouncilMeetingStatus.SCHEDULED ||
            meeting.status === CouncilMeetingStatus.IN_PROGRESS ||
            meeting.status === CouncilMeetingStatus.COMPLETED),
      },
      activeAccess: {
        id: access.accessId,
        role: access.role,
        label: access.accessLabel,
        condominiumId: access.condominiumId,
        unitId: access.unitId,
        linkType: access.linkType,
        isGovernanceProfile: access.isGovernanceProfile,
        governanceAccessIds: access.governanceAccessIds,
        governanceAccessLabel: access.governanceAccessLabel,
        governanceRole: access.governanceRole,
      },
    });
  } catch (error) {
    console.error("Erro ao carregar reunião de conselho do portal:", error);

    return NextResponse.json(
      {
        error: "Não foi possível carregar a reunião de conselho.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requirePortalCouncilMeetingAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdatePresenceBody;

    if (body.action === "SET_RECORD_KEEPER") {
      const recordKeeperUserId = normalizeRecordKeeperUserId(body.recordKeeperUserId);

      if (!recordKeeperUserId) {
        return NextResponse.json(
          { error: "Selecione o responsável pelo registro." },
          { status: 400 },
        );
      }

      const meetingForRecordKeeper = await db.councilMeeting.findFirst({
        where: buildPortalCouncilMeetingDetailWhere({
          access,
          meetingId: id,
        }),
        select: {
          id: true,
          title: true,
          status: true,
          recordKeeperUserId: true,
          participants: {
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
                  isActive: true,
                },
              },
            },
          },
        },
      });

      if (!meetingForRecordKeeper) {
        return NextResponse.json(
          { error: "Reunião de conselho não encontrada para o perfil ativo." },
          { status: 404 },
        );
      }

      if (
        meetingForRecordKeeper.status === CouncilMeetingStatus.COMPLETED ||
        meetingForRecordKeeper.status === CouncilMeetingStatus.CANCELED ||
        meetingForRecordKeeper.status === CouncilMeetingStatus.ARCHIVED
      ) {
        return NextResponse.json(
          {
            error:
              "Não é possível trocar o responsável pelo registro em reunião concluída, cancelada ou arquivada.",
          },
          { status: 409 },
        );
      }

      const canAssignRecordKeeper =
        access.isGovernanceProfile ||
        meetingForRecordKeeper.recordKeeperUserId === access.authUser.id;

      if (!canAssignRecordKeeper) {
        return NextResponse.json(
          {
            error:
              "Apenas síndico, conselheiro ou o responsável atual pode definir o responsável pelo registro.",
          },
          { status: 403 },
        );
      }

      const selectedParticipant = meetingForRecordKeeper.participants.find(
        (participant) => participant.userId === recordKeeperUserId && participant.user.isActive,
      );

      if (!selectedParticipant) {
        return NextResponse.json(
          {
            error:
              "O responsável pelo registro precisa estar na lista de participantes da reunião.",
          },
          { status: 400 },
        );
      }

      const now = new Date();

      await db.$transaction(async (tx) => {
        await tx.councilMeeting.update({
          where: { id: meetingForRecordKeeper.id },
          data: {
            recordKeeperUserId: selectedParticipant.userId,
            recordKeeperParticipantId: selectedParticipant.id,
            recordKeeperAssignedAt: now,
          },
        });

        await tx.councilMeetingLog.create({
          data: {
            councilMeetingId: meetingForRecordKeeper.id,
            userId: access.authUser.id,
            action: CouncilMeetingLogAction.UPDATED,
            message: `Responsável pelo registro definido: ${
              selectedParticipant.user.name || selectedParticipant.user.email || "Participante"
            }.`,
            metadata: {
              source: "PORTAL_RECORD_KEEPER_ASSIGN",
              recordKeeperUserId: selectedParticipant.userId,
              recordKeeperParticipantId: selectedParticipant.id,
              assignedByUserId: access.authUser.id,
              assignedAt: now.toISOString(),
            },
          },
        });
      });

      await notifySingleUser({
        targetUser: {
          id: selectedParticipant.user.id,
          name: selectedParticipant.user.name,
          email: selectedParticipant.user.email,
          isActive: selectedParticipant.user.isActive,
        },
        actorUser: access.authUser,
        allowNotifyActor: true,
        type: "COUNCIL_MEETING_RECORD_KEEPER_ASSIGNED",
        title: "Você foi definido como responsável pelo registro",
        message: `Você foi definido como responsável pelo registro da reunião "${meetingForRecordKeeper.title}".`,
        href: `/portal/reunioes-conselho/${meetingForRecordKeeper.id}/sala`,
        metadata: {
          councilMeetingId: meetingForRecordKeeper.id,
          recordKeeperUserId: selectedParticipant.userId,
          recordKeeperParticipantId: selectedParticipant.id,
          source: "PORTAL_RECORD_KEEPER_ASSIGN",
        },
      });

      return NextResponse.json({
        message: "Responsável pelo registro definido com sucesso.",
      });
    }

    const action = parsePresenceAction(body.action);

    if (!action) {
      return NextResponse.json(
        {
          error: "Informe uma ação válida para a presença.",
        },
        {
          status: 400,
        },
      );
    }

    const meeting = await db.councilMeeting.findFirst({
      where: buildPortalCouncilMeetingDetailWhere({
        access,
        meetingId: id,
      }),
      select: {
        id: true,
        title: true,
        administratorId: true,
        condominiumId: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        mode: true,
        status: true,
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
        participants: {
          where: {
            OR: [
              {
                userId: access.authUser.id,
              },
              {
                userAccessId: {
                  in: access.relatedAccessIds,
                },
              },
            ],
          },
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json(
        {
          error: "Reunião de conselho não encontrada para o perfil ativo.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      meeting.status !== CouncilMeetingStatus.SCHEDULED &&
      meeting.status !== CouncilMeetingStatus.IN_PROGRESS
    ) {
      return NextResponse.json(
        {
          error: "A presença só pode ser confirmada ou recusada em reuniões agendadas ou em andamento.",
        },
        {
          status: 409,
        },
      );
    }

    const participant = meeting.participants[0] ?? null;

    if (!participant) {
      return NextResponse.json(
        {
          error: "Seu perfil não está na lista de participantes desta reunião.",
        },
        {
          status: 403,
        },
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const now = new Date();
      const nextStatus = action === "CONFIRM" ? "CONFIRMED" : "DECLINED";

      await tx.councilMeetingParticipant.updateMany({
        where: {
          councilMeetingId: meeting.id,
          userId: participant.userId,
        },
        data: {
          status: nextStatus,
          respondedAt: now,
          confirmedAt: action === "CONFIRM" ? now : null,
        },
      });

      const updatedParticipant = await tx.councilMeetingParticipant.findFirstOrThrow({
        where: {
          councilMeetingId: meeting.id,
          userId: participant.userId,
        },
        select: {
          id: true,
          role: true,
          status: true,
          respondedAt: true,
          confirmedAt: true,
        },
      });

      await tx.councilMeetingLog.create({
        data: {
          councilMeetingId: meeting.id,
          userId: access.authUser.id,
          action:
            action === "CONFIRM"
              ? CouncilMeetingLogAction.ATTENDANCE_CONFIRMED
              : CouncilMeetingLogAction.PRESENCE_REGISTERED,
          message:
            action === "CONFIRM"
              ? "Participante confirmou presença pelo portal."
              : "Participante recusou presença pelo portal.",
          metadata: {
            accessId: access.accessId,
            role: access.governanceRole ?? access.role,
            action,
            participantId: participant.id,
            participantIds: meeting.participants.map((item) => item.id),
          },
        },
      });

      return updatedParticipant;
    });

    void notifyCouncilMeetingAdministradoraUsers({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        administratorId: meeting.administratorId,
        condominiumId: meeting.condominiumId,
        scheduledStartAt: meeting.scheduledStartAt,
        scheduledEndAt: meeting.scheduledEndAt,
        meetingMode: meeting.mode,
        condominium: meeting.condominium,
        meetingRoom: meeting.meetingRoom,
      },
      actorUser: access.authUser,
      type:
        action === "CONFIRM"
          ? "COUNCIL_MEETING_ATTENDANCE_CONFIRMED"
          : "COUNCIL_MEETING_ATTENDANCE_DECLINED",
      title:
        action === "CONFIRM"
          ? "Presença confirmada em reunião de conselho"
          : "Presença recusada em reunião de conselho",
      message:
        action === "CONFIRM"
          ? `${access.authUser.name || "Participante"} confirmou presença na reunião "${meeting.title}".`
          : `${access.authUser.name || "Participante"} recusou presença na reunião "${meeting.title}".`,
      metadata: {
        attendanceAction: action,
        participantStatus: updated.status,
        participantId: participant.id,
        participantIds: meeting.participants.map((item) => item.id),
        participantUserId: access.authUser.id,
        participantName: access.authUser.name,
        participantEmail: access.authUser.email,
        participantRole: access.governanceRole ?? access.role,
        accessId: access.accessId,
        governanceAccessIds: access.governanceAccessIds,
      },
    }).catch((error) => {
      console.error(
        "Erro ao notificar administradora sobre presença na reunião de conselho:",
        error,
      );
    });

    return NextResponse.json({
      participant: updated,
      message:
        action === "CONFIRM"
          ? "Presença confirmada com sucesso."
          : "Presença recusada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar presença na reunião de conselho:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar sua presença.",
      },
      {
        status: 500,
      },
    );
  }
}
