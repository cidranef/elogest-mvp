import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  CouncilMeetingLogAction,
  CouncilMeetingStatus,
  MeetingProvider,
  MeetingRoomLogAction,
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
import { notifyCouncilMeetingAudience } from "@/lib/notifications";

/* =========================================================
   API PORTAL - ABRIR SALA DE REUNIÃO ELOGEST

   Arquivo:
   src/app/api/portal/reunioes-conselho/[id]/sala/abrir/route.ts

   ETAPA 49 — REUNIÕES DE CONSELHO

   Objetivo:
   - Permitir que o próprio portal abra/inicie a reunião de conselho.
   - Síndico, Conselheiro ou Responsável Pelo Registro podem iniciar.
   - A administradora continua podendo abrir pelo admin como apoio.
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

type PortalRoomManagerAccess = {
  authUser: {
    id: string;
    name: string | null;
    email: string;
  };
  accessId: string;
  role: AccessRole;
  administratorId: string;
  condominiumId: string;
  isGovernanceProfile: boolean;
};

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

function isBlockedMeetingStatus(status: CouncilMeetingStatus) {
  return (
    status === CouncilMeetingStatus.COMPLETED ||
    status === CouncilMeetingStatus.CANCELED ||
    status === CouncilMeetingStatus.ARCHIVED
  );
}

async function requirePortalRoomManagerAccess(): Promise<
  PortalRoomManagerAccess | { error: NextResponse }
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
        { error: "Perfil ativo não encontrado ou usuário inativo." },
        { status: 403 },
      ),
    };
  }

  if (!access.condominiumId || !access.condominium) {
    return {
      error: NextResponse.json(
        { error: "Selecione um perfil vinculado ao condomínio para iniciar a reunião." },
        { status: 403 },
      ),
    };
  }

  if (access.condominium.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        { error: "Este condomínio está inativo. A reunião não pode ser iniciada." },
        { status: 403 },
      ),
    };
  }

  if (access.condominium.administrator.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        { error: "A administradora deste condomínio está inativa. A reunião não pode ser iniciada." },
        { status: 403 },
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
        { status: 403 },
      ),
    };
  }

  const isGovernanceProfile =
    access.role === AccessRole.SINDICO || access.role === AccessRole.CONSELHEIRO;

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
    isGovernanceProfile,
  };
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const access = await requirePortalRoomManagerAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const { id } = await context.params;

    const currentMeeting = await db.councilMeeting.findFirst({
      where: {
        id,
        administratorId: access.administratorId,
        condominiumId: access.condominiumId,
      },
      include: {
        meetingRoom: {
          select: {
            id: true,
            status: true,
          },
        },
        participants: {
          select: {
            userId: true,
            userAccessId: true,
            role: true,
            status: true,
          },
        },
      },
    });

    if (!currentMeeting) {
      return NextResponse.json(
        { error: "Reunião de conselho não encontrada para o perfil ativo." },
        { status: 404 },
      );
    }

    const isParticipant = currentMeeting.participants.some(
      (participant) => participant.userId === access.authUser.id,
    );
    const isRecordKeeper = currentMeeting.recordKeeperUserId === access.authUser.id;
    const canOpenRoom = access.isGovernanceProfile || isRecordKeeper || isParticipant;

    if (!canOpenRoom) {
      return NextResponse.json(
        {
          error:
            "Apenas síndico, conselheiro, participante autorizado ou responsável pelo registro pode iniciar a reunião.",
        },
        { status: 403 },
      );
    }

    if (isBlockedMeetingStatus(currentMeeting.status)) {
      return NextResponse.json(
        {
          error:
            "Esta reunião já foi concluída, cancelada ou arquivada. A sala permanece apenas para consulta do histórico.",
        },
        { status: 409 },
      );
    }

    if (
      currentMeeting.status === CouncilMeetingStatus.IN_PROGRESS &&
      currentMeeting.meetingRoom?.status === MeetingRoomStatus.OPEN
    ) {
      return NextResponse.json({
        message: "A Sala De Reunião EloGest já está aberta.",
      });
    }

    const now = new Date();

    const openedMeeting = await db.$transaction(async (tx) => {
      let meetingRoomId = currentMeeting.meetingRoomId;

      if (!meetingRoomId) {
        const room = await tx.meetingRoom.create({
          data: {
            administratorId: currentMeeting.administratorId,
            condominiumId: currentMeeting.condominiumId,
            type: MeetingRoomType.COUNCIL,
            mode: currentMeeting.mode,
            status: MeetingRoomStatus.OPEN,
            title: currentMeeting.title,
            description: currentMeeting.description,
            scheduledStartAt: currentMeeting.scheduledStartAt,
            scheduledEndAt: currentMeeting.scheduledEndAt,
            openedAt: now,
            location: currentMeeting.location,
            provider: MeetingProvider.INTERNAL_PENDING,
            internalAccessCode: generateInternalAccessCode(),
            accessInstructions: null,
            createdByUserId: currentMeeting.createdByUserId,
            metadata: {
              source: "PORTAL_COUNCIL_MEETING_ROOM_OPEN",
              councilMeetingId: currentMeeting.id,
            },
          },
        });

        meetingRoomId = room.id;

        await tx.councilMeeting.update({
          where: { id: currentMeeting.id },
          data: { meetingRoomId },
        });

        if (currentMeeting.participants.length > 0) {
          await tx.meetingRoomParticipant.createMany({
            data: currentMeeting.participants.map((participant) => ({
              meetingRoomId: room.id,
              userId: participant.userId,
              userAccessId: participant.userAccessId,
              role: participant.role,
              status: participant.status,
            })),
            skipDuplicates: true,
          });
        }

        await tx.meetingRoomLog.create({
          data: {
            meetingRoomId: room.id,
            userId: access.authUser.id,
            action: MeetingRoomLogAction.CREATED,
            message: "Sala De Reunião EloGest criada automaticamente pelo portal.",
            metadata: {
              source: "PORTAL_OPEN_ROOM_ACTION",
              councilMeetingId: currentMeeting.id,
            },
          },
        });
      } else {
        await tx.meetingRoom.update({
          where: { id: meetingRoomId },
          data: {
            status: MeetingRoomStatus.OPEN,
            openedAt: now,
            closedAt: null,
            canceledAt: null,
          },
        });
      }

      const meeting = await tx.councilMeeting.update({
        where: { id: currentMeeting.id },
        data: {
          status: CouncilMeetingStatus.IN_PROGRESS,
          completedAt: null,
          canceledAt: null,
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

      await tx.meetingRoomLog.create({
        data: {
          meetingRoomId,
          userId: access.authUser.id,
          action: MeetingRoomLogAction.OPENED,
          message: "Sala De Reunião EloGest aberta pelo portal.",
          metadata: {
            councilMeetingId: currentMeeting.id,
            openedAt: now.toISOString(),
          },
        },
      });

      await tx.councilMeetingLog.create({
        data: {
          councilMeetingId: currentMeeting.id,
          userId: access.authUser.id,
          action: CouncilMeetingLogAction.STARTED,
          message: "Reunião de conselho iniciada pela abertura da sala no portal.",
          metadata: {
            meetingRoomId,
            openedAt: now.toISOString(),
            source: "PORTAL_COUNCIL_MEETING_ROOM_OPEN",
          },
        },
      });

      return meeting;
    });

    await notifyCouncilMeetingAudience({
      meeting: openedMeeting,
      actorUser: access.authUser,
      type: "COUNCIL_MEETING_ROOM_OPENED",
      title: "Sala De Reunião EloGest aberta",
      message: `A sala da reunião "${openedMeeting.title}" foi aberta no EloGest.`,
      room: true,
      metadata: {
        status: CouncilMeetingStatus.IN_PROGRESS,
        roomStatus: MeetingRoomStatus.OPEN,
        source: "PORTAL_COUNCIL_MEETING_ROOM_OPEN",
      },
    });

    return NextResponse.json({
      message: "Sala De Reunião EloGest aberta com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao abrir Sala De Reunião EloGest pelo portal:", error);

    return NextResponse.json(
      { error: "Não foi possível abrir a Sala De Reunião EloGest." },
      { status: 500 },
    );
  }
}
