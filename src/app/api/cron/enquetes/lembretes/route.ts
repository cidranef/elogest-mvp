import { NextResponse } from "next/server";
import { PollLogAction, PollStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { notifyPollExpiryAdministradoraUsers } from "@/lib/notifications";

/* =========================================================
   CRON - LEMBRETES DE ENQUETES VENCIDAS

   Arquivo:
   src/app/api/cron/enquetes/lembretes/route.ts

   ETAPA 50 — ENQUETES

   Objetivo:
   - Identificar enquetes publicadas cujo prazo final se esgotou.
   - Notificar usuários ativos da administradora responsável.
   - Evitar notificações repetidas com adminExpiryReminderSentAt.
   - Registrar histórico operacional na enquete.

   Segurança:
   - Exige CRON_SECRET configurado no ambiente.
   - Aceita Authorization: Bearer <CRON_SECRET>.
   - Aceita também x-cron-secret para facilitar execução controlada.
   - Não depende de sessão do usuário.
   ========================================================= */

export const dynamic = "force-dynamic";

const MAX_POLLS_PER_RUN = 100;

function getProvidedSecret(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const bearerPrefix = "Bearer ";

  if (authorization.startsWith(bearerPrefix)) {
    return authorization.slice(bearerPrefix.length).trim();
  }

  return (request.headers.get("x-cron-secret") || "").trim();
}

function isAuthorizedCronRequest(request: Request) {
  const expectedSecret = String(process.env.CRON_SECRET || "").trim();
  const providedSecret = getProvidedSecret(request);

  return Boolean(expectedSecret && providedSecret && expectedSecret === providedSecret);
}

async function processExpiredPollReminders() {
  const now = new Date();

  const polls = await db.poll.findMany({
    where: {
      status: PollStatus.PUBLISHED,
      endsAt: {
        lte: now,
      },
      adminExpiryReminderSentAt: null,
    },
    select: {
      id: true,
      title: true,
      administratorId: true,
      condominiumId: true,
      endsAt: true,
      condominium: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      endsAt: "asc",
    },
    take: MAX_POLLS_PER_RUN,
  });

  const processed: Array<{
    pollId: string;
    notificationsCreated: number;
  }> = [];

  const skipped: Array<{
    pollId: string;
    reason: string;
  }> = [];

  for (const poll of polls) {
    const reserved = await db.poll.updateMany({
      where: {
        id: poll.id,
        status: PollStatus.PUBLISHED,
        endsAt: {
          lte: now,
        },
        adminExpiryReminderSentAt: null,
      },
      data: {
        adminExpiryReminderSentAt: now,
      },
    });

    if (reserved.count === 0) {
      skipped.push({
        pollId: poll.id,
        reason: "ALREADY_RESERVED_OR_UPDATED",
      });
      continue;
    }

    try {
      const notifications =
        await notifyPollExpiryAdministradoraUsers({
          pollId: poll.id,
          administratorId: poll.administratorId,
          pollTitle: poll.title,
          condominiumName: poll.condominium?.name || null,
          endsAt: poll.endsAt,
          metadata: {
            source: "CRON_POLL_EXPIRY_REMINDER",
            condominiumId: poll.condominiumId || null,
            reminderSentAt: now.toISOString(),
          },
        });

      await db.pollLog.create({
        data: {
          pollId: poll.id,
          action: PollLogAction.REMINDER_SENT,
          message:
            "Lembrete operacional enviado à administradora: prazo da enquete encerrado.",
          metadata: {
            source: "CRON_POLL_EXPIRY_REMINDER",
            reminderSentAt: now.toISOString(),
            endsAt: poll.endsAt?.toISOString() || null,
            notificationsCreated: notifications.length,
          },
        },
      });

      processed.push({
        pollId: poll.id,
        notificationsCreated: notifications.length,
      });
    } catch (error) {
      console.error("Erro ao processar lembrete de enquete vencida:", {
        pollId: poll.id,
        error,
      });

      await db.poll.update({
        where: {
          id: poll.id,
        },
        data: {
          adminExpiryReminderSentAt: null,
        },
      });

      skipped.push({
        pollId: poll.id,
        reason: "PROCESSING_ERROR",
      });
    }
  }

  return {
    checkedAt: now.toISOString(),
    totalCandidates: polls.length,
    totalProcessed: processed.length,
    totalSkipped: skipped.length,
    processed,
    skipped,
  };
}

async function handleCron(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      {
        error: "Não autorizado.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const result = await processExpiredPollReminders();

    return NextResponse.json({
      ok: true,
      message: "Lembretes de enquetes vencidas processados com sucesso.",
      ...result,
    });
  } catch (error) {
    console.error("Erro geral ao processar lembretes de enquetes:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Não foi possível processar os lembretes de enquetes.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
