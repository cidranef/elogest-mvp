import { AnnouncementLogAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildPortalAnnouncementDetailWhere,
  requirePortalAnnouncementAccess,
} from "@/lib/announcement-portal-utils";



/* =========================================================
   API PORTAL - CONFIRMAR LEITURA DO COMUNICADO

   Arquivo:
   src/app/api/portal/comunicados/[id]/confirmar-leitura/route.ts

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Método:
   - POST: registra confirmação de leitura para o perfil ativo.

   Segurança:
   - Só confirma leitura de comunicado visível ao perfil ativo.
   - Não duplica confirmação: operação idempotente via upsert.
   - Registra userId + accessId para preservar o perfil usado.
   ========================================================= */



export async function POST(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const access = await requirePortalAnnouncementAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const { id } = await context.params;

    const announcement = await db.announcement.findFirst({
      where: buildPortalAnnouncementDetailWhere({
        access,
        announcementId: id,
      }),
      select: {
        id: true,
        title: true,
        requireReadingConfirmation: true,
      },
    });

    if (!announcement) {
      return NextResponse.json(
        {
          error: "Comunicado não encontrado para o perfil ativo.",
        },
        {
          status: 404,
        }
      );
    }

    const existingReading = await db.announcementReading.findUnique({
      where: {
        announcementId_userId_accessId: {
          announcementId: announcement.id,
          userId: access.authUser.id,
          accessId: access.accessId,
        },
      },
      select: {
        id: true,
      },
    });

    const reading = await db.$transaction(async (tx) => {
      const savedReading = await tx.announcementReading.upsert({
        where: {
          announcementId_userId_accessId: {
            announcementId: announcement.id,
            userId: access.authUser.id,
            accessId: access.accessId,
          },
        },
        update: {},
        create: {
          announcementId: announcement.id,
          userId: access.authUser.id,
          accessId: access.accessId,
        },
        select: {
          id: true,
          announcementId: true,
          userId: true,
          accessId: true,
          readAt: true,
          createdAt: true,
        },
      });

      if (!existingReading) {
        await tx.announcementLog.create({
          data: {
            announcementId: announcement.id,
            userId: access.authUser.id,
            action: AnnouncementLogAction.READING_CONFIRMED,
            message: "Leitura confirmada no portal.",
            metadata: {
              accessId: access.accessId,
              readingId: savedReading.id,
            },
          },
        });
      }

      return savedReading;
    });

    return NextResponse.json({
      success: true,
      message: "Leitura confirmada com sucesso.",
      reading,
    });
  } catch (error) {
    console.error("Erro ao confirmar leitura do comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível confirmar a leitura do comunicado.",
      },
      {
        status: 500,
      }
    );
  }
}
