import { NextRequest, NextResponse } from "next/server";
import { AnnouncementLogAction, AnnouncementStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAnnouncementsAdminApiAccess } from "@/lib/admin-api-guard";



/* =========================================================
   API ADMIN - ARQUIVAR COMUNICADO

   Arquivo:
   src/app/api/admin/comunicados/[id]/arquivar/route.ts

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Método:
   - POST: arquiva comunicado da administradora ativa.

   Regra:
   - Arquivar preserva histórico, leituras e rastreabilidade.
   - É a ação recomendada para comunicados publicados.
   ========================================================= */



type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAnnouncementsAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;

    const announcement = await db.announcement.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!announcement) {
      return NextResponse.json(
        {
          error: "Comunicado não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    if (announcement.status === AnnouncementStatus.ARCHIVED) {
      return NextResponse.json(
        {
          error: "Este comunicado já está arquivado.",
        },
        {
          status: 409,
        }
      );
    }

    const updatedAnnouncement = await db.$transaction(async (tx) => {
      const updated = await tx.announcement.update({
        where: {
          id,
        },
        data: {
          status: AnnouncementStatus.ARCHIVED,
        },
        include: {
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
          _count: {
            select: {
              readings: true,
              targets: true,
            },
          },
        },
      });

      await tx.announcementLog.create({
        data: {
          announcementId: id,
          userId: auth.authUser.id,
          action: AnnouncementLogAction.ARCHIVED,
          message: "Comunicado arquivado pela administradora.",
          metadata: {
            previousStatus: announcement.status,
            newStatus: AnnouncementStatus.ARCHIVED,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      announcement: updatedAnnouncement,
      message: "Comunicado arquivado com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao arquivar comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível arquivar o comunicado.",
      },
      {
        status: 500,
      }
    );
  }
}
