import { NextRequest, NextResponse } from "next/server";
import {
  CouncilMeetingLogAction,
  CouncilMeetingStatus,
  MeetingRoomLogAction,
  MeetingRoomStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { MODULE_SLUGS } from "@/lib/plan-limits";
import { notifyCouncilMeetingAudience } from "@/lib/notifications";

/* =========================================================
   API ADMIN - ENCERRAR SALA DE REUNIÃO ELOGEST

   Arquivo:
   src/app/api/admin/reunioes-conselho/[id]/sala/encerrar/route.ts

   ETAPA 49 — REUNIÕES DE CONSELHO

   Objetivo:
   - Encerrar a Sala De Reunião EloGest com persistência real.
   - Atualizar MeetingRoom.status para CLOSED.
   - Atualizar CouncilMeeting.status para COMPLETED.
   - Registrar histórico na reunião e na sala.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Exige módulo Reuniões De Conselho liberado no plano.
   - Isola dados por administratorId do perfil ativo.
   - Não permite encerrar reunião cancelada, arquivada ou já concluída.
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getMeetingInclude() {
  return {
    condominium: {
      select: {
        id: true,
        name: true,
      },
    },
    createdByUser: {
      select: {
        id: true,
        name: true,
        email: true,
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
            createdAt: "asc" as const,
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
            createdAt: "desc" as const,
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
        createdAt: "asc" as const,
      },
    },
    agendaItems: {
      orderBy: {
        order: "asc" as const,
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
        createdAt: "desc" as const,
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
        createdAt: "desc" as const,
      },
    },
  };
}

export async function POST(_request: NextRequest, context: RouteContext) {
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
      include: {
        meetingRoom: {
          select: {
            id: true,
            status: true,
          },
        },
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

    if (currentMeeting.status === CouncilMeetingStatus.COMPLETED) {
      return NextResponse.json(
        {
          error: "Esta reunião já foi concluída. O histórico foi preservado.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      currentMeeting.status === CouncilMeetingStatus.CANCELED ||
      currentMeeting.status === CouncilMeetingStatus.ARCHIVED
    ) {
      return NextResponse.json(
        {
          error:
            "Esta reunião foi cancelada ou arquivada e não pode ter a sala encerrada por esta ação.",
        },
        {
          status: 409,
        },
      );
    }

    if (!currentMeeting.meetingRoomId) {
      return NextResponse.json(
        {
          error: "Esta reunião ainda não possui uma Sala De Reunião EloGest vinculada.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      currentMeeting.status !== CouncilMeetingStatus.IN_PROGRESS &&
      currentMeeting.meetingRoom?.status !== MeetingRoomStatus.OPEN
    ) {
      return NextResponse.json(
        {
          error: "A sala precisa estar aberta antes de ser encerrada.",
        },
        {
          status: 409,
        },
      );
    }

    const now = new Date();

    const closedMeeting = await db.$transaction(async (tx) => {
      await tx.meetingRoom.update({
        where: {
          id: currentMeeting.meetingRoomId!,
        },
        data: {
          status: MeetingRoomStatus.CLOSED,
          closedAt: now,
        },
      });

      await tx.councilMeeting.update({
        where: {
          id: currentMeeting.id,
        },
        data: {
          status: CouncilMeetingStatus.COMPLETED,
          completedAt: now,
        },
      });

      await tx.meetingRoomLog.create({
        data: {
          meetingRoomId: currentMeeting.meetingRoomId!,
          userId: auth.authUser.id,
          action: MeetingRoomLogAction.CLOSED,
          message: "Sala De Reunião EloGest encerrada pela administradora.",
          metadata: {
            councilMeetingId: currentMeeting.id,
            closedAt: now.toISOString(),
          },
        },
      });

      await tx.councilMeetingLog.create({
        data: {
          councilMeetingId: currentMeeting.id,
          userId: auth.authUser.id,
          action: CouncilMeetingLogAction.COMPLETED,
          message: "Reunião de conselho concluída pelo encerramento da Sala De Reunião EloGest.",
          metadata: {
            meetingRoomId: currentMeeting.meetingRoomId,
            closedAt: now.toISOString(),
          },
        },
      });

      return tx.councilMeeting.findFirst({
        where: {
          id: currentMeeting.id,
          administratorId: auth.administratorId,
        },
        include: getMeetingInclude(),
      });
    });

    if (closedMeeting) {
      await notifyCouncilMeetingAudience({
        meeting: closedMeeting,
        actorUser: auth.authUser,
        type: "COUNCIL_MEETING_ROOM_CLOSED",
        title: "Sala De Reunião EloGest encerrada",
        message: `A reunião "${closedMeeting.title}" foi concluída no EloGest.`,
        metadata: {
          status: CouncilMeetingStatus.COMPLETED,
          roomStatus: MeetingRoomStatus.CLOSED,
          source: "ADMIN_COUNCIL_MEETING_ROOM_CLOSE",
        },
        includeAdministradora: true,
      });
    }

    return NextResponse.json({
      meeting: closedMeeting,
      message: "Sala De Reunião EloGest encerrada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao encerrar Sala De Reunião EloGest:", error);

    return NextResponse.json(
      {
        error: "Não foi possível encerrar a Sala De Reunião EloGest.",
      },
      {
        status: 500,
      },
    );
  }
}
