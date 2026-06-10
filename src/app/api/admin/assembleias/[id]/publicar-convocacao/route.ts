import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyAttachmentScope,
  AssemblyEligibilityStatus,
  AssemblyLogAction,
  AssemblyStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { notifyAssemblyAudience } from "@/lib/notifications";

/* =========================================================
   API ADMIN - PUBLICAÇÃO DA CONVOCAÇÃO

   Arquivo:
   src/app/api/admin/assembleias/[id]/publicar-convocacao/route.ts

   ELOGEST — ETAPA 51.6

   A publicação:
   - valida preparação mínima;
   - registra responsável e horário;
   - altera status para SCHEDULED;
   - congela alterações estruturais;
   - preserva log auditável.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function badRequest(message: string, missingItems?: string[]) {
  return NextResponse.json(
    { error: message, missingItems: missingItems || [] },
    { status: 400 },
  );
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function getDocumentType(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = (metadata as Record<string, unknown>).documentType;
  return typeof value === "string" ? value : "";
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;

    const assembly = await db.assembly.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      include: {
        agendaItems: {
          select: { id: true },
        },
        eligibleUnits: {
          where: {
            status: AssemblyEligibilityStatus.ELIGIBLE,
          },
          select: { id: true },
        },
        attachments: {
          where: {
            scope: AssemblyAttachmentScope.CONVOCATION,
          },
          select: {
            id: true,
            metadata: true,
          },
        },
      },
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    if (assembly.convocationPublishedAt) {
      return badRequest("A convocação desta assembleia já foi publicada.");
    }

    if (
      assembly.status !== AssemblyStatus.DRAFT &&
      assembly.status !== AssemblyStatus.SCHEDULED
    ) {
      return badRequest(
        "A convocação não pode ser publicada após a abertura ou encerramento da assembleia.",
      );
    }

    const missingItems: string[] = [];

    if (!assembly.title.trim()) {
      missingItems.push("Título da assembleia");
    }

    if (!assembly.scheduledStartAt) {
      missingItems.push("Data e horário da assembleia");
    }

    if (!assembly.votingStartsAt) {
      missingItems.push("Início da votação");
    }

    if (!assembly.votingEndsAt) {
      missingItems.push("Fim da votação");
    }

    if (
      assembly.votingStartsAt &&
      assembly.votingEndsAt &&
      assembly.votingEndsAt <= assembly.votingStartsAt
    ) {
      missingItems.push("Prazo de votação válido");
    }

    if (!assembly.convocationText?.trim()) {
      missingItems.push("Texto da convocação");
    }

    if (assembly.agendaItems.length === 0) {
      missingItems.push("Pelo menos uma pauta");
    }

    if (assembly.eligibleUnits.length === 0) {
      missingItems.push("Fotografia com pelo menos uma unidade apta");
    }

    const hasNotice = assembly.attachments.some(
      (attachment) => getDocumentType(attachment.metadata) === "NOTICE",
    );

    if (!hasNotice) {
      missingItems.push("Documento classificado como edital");
    }

    if (missingItems.length > 0) {
      return badRequest(
        "Finalize os itens obrigatórios antes de publicar a convocação.",
        missingItems,
      );
    }

    const publishedAt = new Date();

    const updatedAssembly = await db.$transaction(async (tx) => {
      const updated = await tx.assembly.update({
        where: { id: assembly.id },
        data: {
          status: AssemblyStatus.SCHEDULED,
          convocationPublishedAt: publishedAt,
          convocationPublishedByUserId: auth.authUser.id,
        },
        include: {
          convocationPublishedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: assembly.id,
          userId: auth.authUser.id,
          action: AssemblyLogAction.SCHEDULED,
          message: "Convocação oficial publicada pela administradora.",
          metadata: {
            publishedAt: publishedAt.toISOString(),
            attachments: assembly.attachments.length,
            agendaItems: assembly.agendaItems.length,
            eligibleUnits: assembly.eligibleUnits.length,
          },
        },
      });

      return updated;
    });

    const notificationResult = await notifyAssemblyAudience({
      assemblyId: assembly.id,
      mode: "CONVOCATION",
      actorUser: auth.authUser,
    });

    await db.assemblyLog.create({
      data: {
        assemblyId: assembly.id,
        userId: auth.authUser.id,
        action: AssemblyLogAction.UPDATED,
        message: "Avisos da convocação processados para os participantes internos elegíveis.",
        metadata: {
          notificationsCreated: notificationResult.createdNotifications.length,
          externalRepresentativesPendingValidation: notificationResult.externalRepresentatives.length,
        },
      },
    });

    return NextResponse.json({
      assembly: updatedAssembly,
      notificationsCreated: notificationResult.createdNotifications.length,
      externalRepresentativesPendingValidation: notificationResult.externalRepresentatives.length,
      message:
        "Convocação publicada com sucesso. A estrutura da assembleia foi congelada e os participantes internos elegíveis foram avisados.",
    });
  } catch (error) {
    console.error("Erro ao publicar convocação da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível publicar a convocação da assembleia." },
      { status: 500 },
    );
  }
}
