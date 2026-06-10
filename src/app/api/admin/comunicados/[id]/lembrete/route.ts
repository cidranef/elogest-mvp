import { AnnouncementLogAction, AnnouncementStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnnouncementsAdminApiAccess } from "@/lib/admin-api-guard";
import { createAnnouncementUnreadReminderNotifications } from "@/lib/announcement-admin-utils";
import { sendAnnouncementUnreadReminderEmails } from "@/lib/announcement-email-utils";



/* =========================================================
   API ADMIN - LEMBRETE PARA NÃO LIDOS

   Arquivo:
   src/app/api/admin/comunicados/[id]/lembrete/route.ts

   ETAPA 48.9.3 — LEMBRETE PARA NÃO LIDOS

   Regras:
   - Apenas comunicado publicado pode receber lembrete.
   - O lembrete é enviado somente para quem ainda não confirmou leitura.
   - A ação cria novas notificações internas no portal.
   - A confirmação de leitura original não é alterada.
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
        title: true,
        status: true,
        requireReadingConfirmation: true,
        administratorId: true,
      },
    });

    if (!announcement) {
      return NextResponse.json(
        {
          error: "Comunicado não encontrado.",
        },
        {
          status: 404,
        },
      );
    }

    if (announcement.status !== AnnouncementStatus.PUBLISHED) {
      return NextResponse.json(
        {
          error: "Somente comunicados publicados podem receber lembrete de leitura.",
        },
        {
          status: 409,
        },
      );
    }

    if (!announcement.requireReadingConfirmation) {
      return NextResponse.json(
        {
          error: "Este comunicado não exige confirmação de leitura.",
        },
        {
          status: 409,
        },
      );
    }

    const result = await createAnnouncementUnreadReminderNotifications({
      administratorId: auth.administratorId,
      announcementId: announcement.id,
      title: announcement.title,
    });

    await db.announcementLog.create({
      data: {
        announcementId: announcement.id,
        userId: auth.authUser.id,
        action: AnnouncementLogAction.REMINDER_SENT,
        message: result.created > 0
          ? `${result.created} lembrete(s) enviado(s) para destinatários pendentes de leitura.`
          : "Tentativa de lembrete registrada, mas nenhum destinatário pendente foi localizado.",
        metadata: {
          notificationsCreated: result.created,
          reason: result.created > 0 ? "SENT" : "NO_PENDING_RECIPIENTS",
        },
      },
    });

    const emailResult = await sendAnnouncementUnreadReminderEmails({
      administratorId: auth.administratorId,
      announcementId: announcement.id,
      userId: auth.authUser.id,
    });

    if (result.created === 0 && emailResult.sent === 0 && emailResult.skipped === 0) {
      return NextResponse.json({
        message: "Nenhum lembrete foi enviado. Todos os destinatários localizados já confirmaram leitura ou não há destinatários pendentes.",
        result,
        emailResult,
      });
    }

    return NextResponse.json({
      message: `${result.created} lembrete(s) interno(s) e ${emailResult.sent} e-mail(s) enviados para destinatários pendentes de leitura.`,
      result,
      emailResult,
    });
  } catch (error) {
    console.error("Erro ao enviar lembrete de comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível enviar o lembrete de leitura.",
      },
      {
        status: 500,
      },
    );
  }
}
