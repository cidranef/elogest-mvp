import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  CouncilMeetingLogAction,
  CouncilMeetingStatus,
  MeetingProvider,
  MeetingRoomLogAction,
  MeetingRoomStatus,
  MeetingRoomType,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { MODULE_SLUGS } from "@/lib/plan-limits";
import { notifyCouncilMeetingAudience } from "@/lib/notifications";

/* =========================================================
   API ADMIN - ABRIR SALA DE REUNIÃO ELOGEST

   Arquivo:
   src/app/api/admin/reunioes-conselho/[id]/sala/abrir/route.ts

   ETAPA 49 — REUNIÕES DE CONSELHO

   Objetivo:
   - Abrir a Sala De Reunião EloGest com persistência real.
   - Atualizar MeetingRoom.status para OPEN.
   - Atualizar CouncilMeeting.status para IN_PROGRESS.
   - Registrar histórico na reunião e na sala.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Exige módulo Reuniões De Conselho liberado no plano.
   - Isola dados por administratorId do perfil ativo.
   - Não permite abrir reunião concluída, cancelada ou arquivada.

   Observação:
   - Se por algum motivo uma reunião antiga não tiver MeetingRoom,
     esta rota cria a Sala De Reunião EloGest antes de abrir.
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function generateInternalAccessCode() {
  return randomBytes(18).toString("hex");
}

function isBlockedMeetingStatus(status: CouncilMeetingStatus) {
  return (
    status === CouncilMeetingStatus.COMPLETED ||
    status === CouncilMeetingStatus.CANCELED ||
    status === CouncilMeetingStatus.ARCHIVED
  );
}

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
        {
          error: "Reunião de conselho não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    if (isBlockedMeetingStatus(currentMeeting.status)) {
      return NextResponse.json(
        {
          error:
            "Esta reunião já foi concluída, cancelada ou arquivada. A sala permanece disponível apenas para consulta do histórico.",
        },
        {
          status: 409,
        },
      );
    }

    if (
      currentMeeting.status === CouncilMeetingStatus.IN_PROGRESS &&
      currentMeeting.meetingRoom?.status === MeetingRoomStatus.OPEN
    ) {
      const meeting = await db.councilMeeting.findFirst({
        where: {
          id,
          administratorId: auth.administratorId,
        },
        include: getMeetingInclude(),
      });

      return NextResponse.json({
        meeting,
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
              source: "COUNCIL_MEETING",
              councilMeetingId: currentMeeting.id,
            },
          },
        });

        meetingRoomId = room.id;

        await tx.councilMeeting.update({
          where: {
            id: currentMeeting.id,
          },
          data: {
            meetingRoomId,
          },
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
            userId: auth.authUser.id,
            action: MeetingRoomLogAction.CREATED,
            message: "Sala De Reunião EloGest criada automaticamente para a reunião de conselho.",
            metadata: {
              source: "OPEN_ROOM_ACTION",
              councilMeetingId: currentMeeting.id,
            },
          },
        });
      } else {
        await tx.meetingRoom.update({
          where: {
            id: meetingRoomId,
          },
          data: {
            status: MeetingRoomStatus.OPEN,
            openedAt: now,
            closedAt: null,
            canceledAt: null,
          },
        });
      }

      await tx.councilMeeting.update({
        where: {
          id: currentMeeting.id,
        },
        data: {
          status: CouncilMeetingStatus.IN_PROGRESS,
          completedAt: null,
          canceledAt: null,
        },
      });

      await tx.meetingRoomLog.create({
        data: {
          meetingRoomId,
          userId: auth.authUser.id,
          action: MeetingRoomLogAction.OPENED,
          message: "Sala De Reunião EloGest aberta pela administradora.",
          metadata: {
            councilMeetingId: currentMeeting.id,
            openedAt: now.toISOString(),
          },
        },
      });

      await tx.councilMeetingLog.create({
        data: {
          councilMeetingId: currentMeeting.id,
          userId: auth.authUser.id,
          action: CouncilMeetingLogAction.STARTED,
          message: "Reunião de conselho iniciada pela abertura da Sala De Reunião EloGest.",
          metadata: {
            meetingRoomId,
            openedAt: now.toISOString(),
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

    if (openedMeeting) {
      await notifyCouncilMeetingAudience({
        meeting: openedMeeting,
        actorUser: auth.authUser,
        type: "COUNCIL_MEETING_ROOM_OPENED",
        title: "Sala De Reunião EloGest aberta",
        message: `A sala da reunião "${openedMeeting.title}" foi aberta no EloGest.`,
        room: true,
        metadata: {
          status: CouncilMeetingStatus.IN_PROGRESS,
          roomStatus: MeetingRoomStatus.OPEN,
          source: "ADMIN_COUNCIL_MEETING_ROOM_OPEN",
        },
      });
    }

    return NextResponse.json({
      meeting: openedMeeting,
      message: "Sala De Reunião EloGest aberta com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao abrir Sala De Reunião EloGest:", error);

    return NextResponse.json(
      {
        error: "Não foi possível abrir a Sala De Reunião EloGest.",
      },
      {
        status: 500,
      },
    );
  }
}
