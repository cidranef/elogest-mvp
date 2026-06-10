import { NextRequest, NextResponse } from "next/server";
import { AnnouncementLogAction, AnnouncementStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAnnouncementsAdminApiAccess } from "@/lib/admin-api-guard";
import {
  createAnnouncementPublishedNotifications,
  parseDateOrNull,
} from "@/lib/announcement-admin-utils";
import { sendAnnouncementPublishedEmails } from "@/lib/announcement-email-utils";



/* =========================================================
   API ADMIN - PUBLICAR COMUNICADO

   Arquivo:
   src/app/api/admin/comunicados/[id]/publicar/route.ts

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Método:
   - POST: publica imediatamente ou agenda um comunicado.

   Regras:
   - Apenas comunicado DRAFT ou SCHEDULED pode ser publicado/agendado.
   - Comunicado ARCHIVED não volta por esta rota.
   - Comunicado PUBLISHED não é republicado.
   - Se publishAt for futuro, status vira SCHEDULED.
   - Se publishAt for ausente ou passado, status vira PUBLISHED.
   ========================================================= */



type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



type PublishAnnouncementBody = {
  publishAt?: unknown;
};



export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAnnouncementsAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as PublishAnnouncementBody;

    const announcement = await db.announcement.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      include: {
        targets: {
          select: {
            id: true,
          },
        },
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

    if (announcement.status === AnnouncementStatus.PUBLISHED) {
      return NextResponse.json(
        {
          error: "Este comunicado já está publicado.",
        },
        {
          status: 409,
        }
      );
    }

    if (announcement.status === AnnouncementStatus.ARCHIVED) {
      return NextResponse.json(
        {
          error: "Comunicados arquivados não podem ser publicados novamente.",
        },
        {
          status: 409,
        }
      );
    }

    if (announcement.title.trim().length < 3 || announcement.content.trim().length < 10) {
      return NextResponse.json(
        {
          error: "Revise o título e o conteúdo antes de publicar o comunicado.",
        },
        {
          status: 400,
        }
      );
    }

    const publishAtValidation = parseDateOrNull(body.publishAt);

    if (!publishAtValidation.ok) {
      return NextResponse.json(
        {
          error: publishAtValidation.message,
        },
        {
          status: 400,
        }
      );
    }

    const now = new Date();
    const requestedPublishAt = publishAtValidation.value;
    const shouldSchedule = !!requestedPublishAt && requestedPublishAt > now;

    const updatedAnnouncement = await db.$transaction(async (tx) => {
      const updated = await tx.announcement.update({
        where: {
          id,
        },
        data: {
          status: shouldSchedule ? AnnouncementStatus.SCHEDULED : AnnouncementStatus.PUBLISHED,
          publishAt: requestedPublishAt ?? now,
          publishedAt: shouldSchedule ? null : now,
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
          action: shouldSchedule
            ? AnnouncementLogAction.SCHEDULED
            : AnnouncementLogAction.PUBLISHED,
          message: shouldSchedule
            ? "Comunicado agendado pela administradora."
            : "Comunicado publicado pela administradora.",
          metadata: {
            publishAt: (requestedPublishAt ?? now).toISOString(),
            publishedAt: shouldSchedule ? null : now.toISOString(),
          },
        },
      });

      return updated;
    });

    const notificationResult = shouldSchedule
      ? { created: 0 }
      : await createAnnouncementPublishedNotifications({
          administratorId: auth.administratorId,
          announcementId: updatedAnnouncement.id,
          title: updatedAnnouncement.title,
        });

    const emailResult = shouldSchedule
      ? { attempted: 0, sent: 0, skipped: 0, failed: 0, recipients: [] as string[] }
      : await sendAnnouncementPublishedEmails({
          administratorId: auth.administratorId,
          announcementId: updatedAnnouncement.id,
          userId: auth.authUser.id,
        });

    return NextResponse.json({
      announcement: updatedAnnouncement,
      notificationsCreated: notificationResult.created,
      emailsAttempted: emailResult.attempted,
      emailsSent: emailResult.sent,
      emailsSkipped: emailResult.skipped,
      emailsFailed: emailResult.failed,
      message: shouldSchedule
        ? "Comunicado agendado com sucesso."
        : notificationResult.created > 0 || emailResult.sent > 0 || emailResult.skipped > 0
          ? `Comunicado publicado, ${notificationResult.created} notificação(ões) interna(s) criada(s) e ${emailResult.sent} e-mail(s) enviado(s).`
          : "Comunicado publicado com sucesso. Nenhum perfil elegível foi encontrado para notificação interna ou e-mail.",
    });
  } catch (error) {
    console.error("Erro ao publicar comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível publicar o comunicado.",
      },
      {
        status: 500,
      }
    );
  }
}
