import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildPortalAnnouncementDetailWhere,
  requirePortalAnnouncementAccess,
} from "@/lib/announcement-portal-utils";



/* =========================================================
   API PORTAL - DETALHE DO COMUNICADO

   Arquivo:
   src/app/api/portal/comunicados/[id]/route.ts

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Método:
   - GET: exibe comunicado publicado compatível com o perfil ativo.

   Segurança:
   - Não permite abrir comunicado fora do escopo do usuário.
   - Usa a mesma regra centralizada da listagem.
   ========================================================= */



export async function GET(
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
        content: true,
        type: true,
        priority: true,
        targetScope: true,
        publishedAt: true,
        eventDate: true,
        eventStartAt: true,
        eventEndAt: true,
        expiresAt: true,
        requireReadingConfirmation: true,
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
        targets: {
          select: {
            id: true,
            condominiumId: true,
            unitId: true,
            block: true,
            role: true,
            linkType: true,
          },
        },
        attachments: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            url: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        readings: {
          where: {
            userId: access.authUser.id,
            accessId: access.accessId,
          },
          select: {
            id: true,
            readAt: true,
            createdAt: true,
          },
        },
        createdAt: true,
        updatedAt: true,
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

    const reading = announcement.readings[0] || null;

    return NextResponse.json({
      announcement: {
        ...announcement,
        readings: undefined,
        isRead: Boolean(reading),
        readAt: reading?.readAt || null,
      },
      activeAccess: {
        id: access.accessId,
        role: access.role,
        label: access.accessLabel,
        condominiumId: access.condominiumId,
        unitId: access.unitId,
        linkType: access.linkType,
      },
    });
  } catch (error) {
    console.error("Erro ao carregar comunicado do portal:", error);

    return NextResponse.json(
      {
        error: "Não foi possível carregar o comunicado.",
      },
      {
        status: 500,
      }
    );
  }
}
