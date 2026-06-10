import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  AnnouncementLogAction,
  AnnouncementStatus,
  AnnouncementTargetScope,
  UnitPersonLinkType,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAnnouncementsAdminApiAccess } from "@/lib/admin-api-guard";
import {
  buildAnnouncementTargets,
  canDeleteAnnouncement,
  canEditAnnouncement,
  getAnnouncementForAdministrator,
  normalizeBoolean,
  normalizeNullableString,
  normalizeRequiredString,
  parseAccessRoleOrNull,
  parseAnnouncementPriority,
  parseAnnouncementStatusForDraftFlow,
  parseAnnouncementTargetScope,
  parseAnnouncementType,
  parseDateOrNull,
  parseUnitPersonLinkTypeOrNull,
  type AnnouncementTargetInput,
} from "@/lib/announcement-admin-utils";



/* =========================================================
   API ADMIN - DETALHE DO COMUNICADO

   Arquivo:
   src/app/api/admin/comunicados/[id]/route.ts

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Métodos:
   - GET: detalhe do comunicado da administradora ativa.
   - PATCH: edita comunicado em rascunho ou agendado.
   - DELETE: remove comunicado ainda não publicado.

   Regra de preservação:
   - Comunicados publicados não são editados nem excluídos por esta rota.
   - Para comunicado publicado, usar arquivamento.
   ========================================================= */



type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



type UpdateAnnouncementBody = {
  title?: unknown;
  content?: unknown;
  type?: unknown;
  status?: unknown;
  priority?: unknown;
  targetScope?: unknown;
  condominiumId?: unknown;
  unitId?: unknown;
  block?: unknown;
  role?: unknown;
  linkType?: unknown;
  publishAt?: unknown;
  eventDate?: unknown;
  eventStartAt?: unknown;
  eventEndAt?: unknown;
  expiresAt?: unknown;
  requireReadingConfirmation?: unknown;
  targets?: unknown;
};



function badRequest(message: string) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 400,
    }
  );
}



function normalizeCustomTargets(value: unknown): AnnouncementTargetInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      return {};
    }

    const rawTarget = item as Record<string, unknown>;

    return {
      condominiumId: normalizeNullableString(rawTarget.condominiumId),
      unitId: normalizeNullableString(rawTarget.unitId),
      block: normalizeNullableString(rawTarget.block),
      role:
        typeof rawTarget.role === "string" &&
        Object.values(AccessRole).includes(rawTarget.role as AccessRole)
          ? (rawTarget.role as AccessRole)
          : null,
      linkType:
        typeof rawTarget.linkType === "string" &&
        Object.values(UnitPersonLinkType).includes(rawTarget.linkType as UnitPersonLinkType)
          ? (rawTarget.linkType as UnitPersonLinkType)
          : null,
    };
  });
}



export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAnnouncementsAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;

    const announcement = await getAnnouncementForAdministrator({
      administratorId: auth.administratorId,
      announcementId: id,
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

    return NextResponse.json({
      announcement,
    });
  } catch (error) {
    console.error("Erro ao buscar comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível buscar o comunicado.",
      },
      {
        status: 500,
      }
    );
  }
}



export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAnnouncementsAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;

    const currentAnnouncement = await db.announcement.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!currentAnnouncement) {
      return NextResponse.json(
        {
          error: "Comunicado não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    if (!canEditAnnouncement(currentAnnouncement.status)) {
      return NextResponse.json(
        {
          error:
            "Comunicados publicados ou arquivados não podem ser editados. Para preservar o histórico, arquive e crie uma nova versão.",
        },
        {
          status: 409,
        }
      );
    }

    const body = (await request.json()) as UpdateAnnouncementBody;

    const title = normalizeRequiredString(body.title);
    const content = normalizeRequiredString(body.content);

    if (title.length < 3) {
      return badRequest("Informe um título para o comunicado.");
    }

    if (content.length < 10) {
      return badRequest("Informe o conteúdo do comunicado.");
    }

    const typeValidation = parseAnnouncementType(body.type);
    if (!typeValidation.ok) {
      return badRequest(typeValidation.message);
    }

    const priorityValidation = parseAnnouncementPriority(body.priority);
    if (!priorityValidation.ok) {
      return badRequest(priorityValidation.message);
    }

    const targetScopeValidation = parseAnnouncementTargetScope(body.targetScope);
    if (!targetScopeValidation.ok) {
      return badRequest(targetScopeValidation.message);
    }

    const statusValidation = parseAnnouncementStatusForDraftFlow(body.status);
    if (!statusValidation.ok) {
      return badRequest(statusValidation.message);
    }

    if (statusValidation.value === AnnouncementStatus.PUBLISHED) {
      return badRequest("Para publicar o comunicado, use a ação Publicar.");
    }

    if (statusValidation.value === AnnouncementStatus.ARCHIVED) {
      return badRequest("Para arquivar o comunicado, use a ação Arquivar.");
    }

    const publishAtValidation = parseDateOrNull(body.publishAt);
    if (!publishAtValidation.ok) {
      return badRequest(publishAtValidation.message);
    }

    const eventDateValidation = parseDateOrNull(body.eventDate);
    if (!eventDateValidation.ok) {
      return badRequest(eventDateValidation.message);
    }

    const eventStartAtValidation = parseDateOrNull(body.eventStartAt);
    if (!eventStartAtValidation.ok) {
      return badRequest(eventStartAtValidation.message);
    }

    const eventEndAtValidation = parseDateOrNull(body.eventEndAt);
    if (!eventEndAtValidation.ok) {
      return badRequest(eventEndAtValidation.message);
    }

    if (
      eventStartAtValidation.value &&
      eventEndAtValidation.value &&
      eventEndAtValidation.value <= eventStartAtValidation.value
    ) {
      return badRequest(
        "O término previsto do evento deve ser posterior ao início previsto.",
      );
    }

    const expiresAtValidation = parseDateOrNull(body.expiresAt);
    if (!expiresAtValidation.ok) {
      return badRequest(expiresAtValidation.message);
    }

    if (
      publishAtValidation.value &&
      expiresAtValidation.value &&
      expiresAtValidation.value <= publishAtValidation.value
    ) {
      return badRequest("A data de expiração deve ser posterior à data de publicação.");
    }

    const roleValidation = parseAccessRoleOrNull(body.role);
    if (!roleValidation.ok) {
      return badRequest(roleValidation.message);
    }

    const linkTypeValidation = parseUnitPersonLinkTypeOrNull(body.linkType);
    if (!linkTypeValidation.ok) {
      return badRequest(linkTypeValidation.message);
    }

    const condominiumId = normalizeNullableString(body.condominiumId);
    const unitId = normalizeNullableString(body.unitId);
    const block = normalizeNullableString(body.block);
    const customTargets = normalizeCustomTargets(body.targets);

    const targetsValidation = await buildAnnouncementTargets({
      administratorId: auth.administratorId,
      targetScope: targetScopeValidation.value,
      condominiumId,
      unitId,
      block,
      role: roleValidation.value,
      linkType: linkTypeValidation.value,
      customTargets,
    });

    if (!targetsValidation.ok) {
      return NextResponse.json(
        {
          error: targetsValidation.message,
        },
        {
          status: targetsValidation.status ?? 400,
        }
      );
    }

    const status =
      statusValidation.value === AnnouncementStatus.SCHEDULED || publishAtValidation.value
        ? AnnouncementStatus.SCHEDULED
        : AnnouncementStatus.DRAFT;

    const updatedAnnouncement = await db.$transaction(async (tx) => {
      await tx.announcementTarget.deleteMany({
        where: {
          announcementId: id,
        },
      });

      const updated = await tx.announcement.update({
        where: {
          id,
        },
        data: {
          condominiumId:
            targetScopeValidation.value === AnnouncementTargetScope.ALL_ADMINISTRATOR
              ? null
              : condominiumId,
          title,
          content,
          type: typeValidation.value,
          status,
          priority: priorityValidation.value,
          targetScope: targetScopeValidation.value,
          publishAt: publishAtValidation.value,
          eventDate: eventStartAtValidation.value ?? eventDateValidation.value,
          eventStartAt: eventStartAtValidation.value ?? eventDateValidation.value,
          eventEndAt: eventEndAtValidation.value,
          expiresAt: expiresAtValidation.value,
          requireReadingConfirmation: normalizeBoolean(
            body.requireReadingConfirmation,
            true
          ),
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
        },
      });

      if (targetsValidation.value.length > 0) {
        await tx.announcementTarget.createMany({
          data: targetsValidation.value.map((target) => ({
            announcementId: id,
            condominiumId: target.condominiumId ?? null,
            unitId: target.unitId ?? null,
            block: target.block ?? null,
            role: target.role ?? null,
            linkType: target.linkType ?? null,
          })),
        });
      }

      await tx.announcementLog.create({
        data: {
          announcementId: id,
          userId: auth.authUser.id,
          action: status === AnnouncementStatus.SCHEDULED
            ? AnnouncementLogAction.SCHEDULED
            : AnnouncementLogAction.UPDATED,
          message: status === AnnouncementStatus.SCHEDULED
            ? "Comunicado editado e mantido como agendado."
            : "Comunicado editado pela administradora.",
          metadata: {
            status,
            targetScope: targetScopeValidation.value,
            targetsCount: targetsValidation.value.length,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      announcement: updatedAnnouncement,
      message: "Comunicado atualizado com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar o comunicado.",
      },
      {
        status: 500,
      }
    );
  }
}



export async function DELETE(_request: NextRequest, context: RouteContext) {
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

    if (!canDeleteAnnouncement(announcement.status)) {
      return NextResponse.json(
        {
          error:
            "Comunicados publicados não podem ser excluídos. Para preservar o histórico, use a ação Arquivar.",
        },
        {
          status: 409,
        }
      );
    }

    await db.announcement.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      message: "Comunicado removido com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao remover comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível remover o comunicado.",
      },
      {
        status: 500,
      }
    );
  }
}
