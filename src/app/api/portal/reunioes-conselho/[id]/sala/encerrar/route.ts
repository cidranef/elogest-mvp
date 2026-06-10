import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  CouncilMeetingLogAction,
  CouncilMeetingStatus,
  MeetingRoomLogAction,
  MeetingRoomStatus,
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
   API PORTAL - ENCERRAR SALA DE REUNIÃO ELOGEST

   Arquivo:
   src/app/api/portal/reunioes-conselho/[id]/sala/encerrar/route.ts

   ETAPA 49 — REUNIÕES DE CONSELHO

   Objetivo:
   - Permitir que o portal encerre/conclua a reunião de conselho.
   - Síndico, Conselheiro ou Responsável Pelo Registro podem encerrar.
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
        { error: "Selecione um perfil vinculado ao condomínio para encerrar a reunião." },
        { status: 403 },
      ),
    };
  }

  if (access.condominium.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        { error: "Este condomínio está inativo. A reunião não pode ser encerrada." },
        { status: 403 },
      ),
    };
  }

  if (access.condominium.administrator.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        { error: "A administradora deste condomínio está inativa. A reunião não pode ser encerrada." },
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
    const canCloseRoom = access.isGovernanceProfile || isRecordKeeper || isParticipant;

    if (!canCloseRoom) {
      return NextResponse.json(
        {
          error:
            "Apenas síndico, conselheiro, participante autorizado ou responsável pelo registro pode encerrar a reunião.",
        },
        { status: 403 },
      );
    }

    if (currentMeeting.status === CouncilMeetingStatus.COMPLETED) {
      return NextResponse.json(
        { error: "Esta reunião já foi concluída. O histórico foi preservado." },
        { status: 409 },
      );
    }

    if (
      currentMeeting.status === CouncilMeetingStatus.CANCELED ||
      currentMeeting.status === CouncilMeetingStatus.ARCHIVED
    ) {
      return NextResponse.json(
        {
          error:
            "Esta reunião foi cancelada ou arquivada e não pode ser encerrada por esta ação.",
        },
        { status: 409 },
      );
    }

    if (!currentMeeting.meetingRoomId) {
      return NextResponse.json(
        { error: "Esta reunião ainda não possui uma Sala De Reunião EloGest vinculada." },
        { status: 409 },
      );
    }

    if (
      currentMeeting.status !== CouncilMeetingStatus.IN_PROGRESS &&
      currentMeeting.meetingRoom?.status !== MeetingRoomStatus.OPEN
    ) {
      return NextResponse.json(
        { error: "A sala precisa estar aberta antes de ser encerrada." },
        { status: 409 },
      );
    }

    const now = new Date();

    const closedMeeting = await db.$transaction(async (tx) => {
      await tx.meetingRoom.update({
        where: { id: currentMeeting.meetingRoomId! },
        data: {
          status: MeetingRoomStatus.CLOSED,
          closedAt: now,
        },
      });

      const meeting = await tx.councilMeeting.update({
        where: { id: currentMeeting.id },
        data: {
          status: CouncilMeetingStatus.COMPLETED,
          completedAt: now,
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
          meetingRoomId: currentMeeting.meetingRoomId!,
          userId: access.authUser.id,
          action: MeetingRoomLogAction.CLOSED,
          message: "Sala De Reunião EloGest encerrada pelo portal.",
          metadata: {
            councilMeetingId: currentMeeting.id,
            closedAt: now.toISOString(),
            source: "PORTAL_COUNCIL_MEETING_ROOM_CLOSE",
          },
        },
      });

      await tx.councilMeetingLog.create({
        data: {
          councilMeetingId: currentMeeting.id,
          userId: access.authUser.id,
          action: CouncilMeetingLogAction.COMPLETED,
          message: "Reunião de conselho concluída pelo encerramento da sala no portal.",
          metadata: {
            meetingRoomId: currentMeeting.meetingRoomId,
            closedAt: now.toISOString(),
            source: "PORTAL_COUNCIL_MEETING_ROOM_CLOSE",
          },
        },
      });

      return meeting;
    });

    await notifyCouncilMeetingAudience({
      meeting: closedMeeting,
      actorUser: access.authUser,
      type: "COUNCIL_MEETING_ROOM_CLOSED",
      title: "Sala De Reunião EloGest encerrada",
      message: `A reunião "${closedMeeting.title}" foi concluída no EloGest.`,
      metadata: {
        status: CouncilMeetingStatus.COMPLETED,
        roomStatus: MeetingRoomStatus.CLOSED,
        source: "PORTAL_COUNCIL_MEETING_ROOM_CLOSE",
      },
      includeAdministradora: true,
    });

    return NextResponse.json({
      message: "Sala De Reunião EloGest encerrada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao encerrar Sala De Reunião EloGest pelo portal:", error);

    return NextResponse.json(
      { error: "Não foi possível encerrar a Sala De Reunião EloGest." },
      { status: 500 },
    );
  }
}
