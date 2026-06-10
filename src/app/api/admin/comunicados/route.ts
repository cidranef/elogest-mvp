import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  AnnouncementLogAction,
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementTargetScope,
  AnnouncementType,
  UnitPersonLinkType,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAnnouncementsAdminApiAccess } from "@/lib/admin-api-guard";
import {
  buildAnnouncementTargets,
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
   API ADMIN - COMUNICADOS

   Arquivo:
   src/app/api/admin/comunicados/route.ts

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Métodos:
   - GET: lista comunicados da administradora ativa.
   - POST: cria comunicado como rascunho ou agendado.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Bloqueia administradora INACTIVE.
   - Exige módulo comercial Comunicados liberado.
   - Isola dados por administratorId do perfil ativo.
   - SUPER_ADMIN não opera esta API.
   ========================================================= */

type CreateAnnouncementBody = {
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
    },
  );
}

function normalizeCustomTargets(
  value: unknown,
): AnnouncementTargetInput[] | null {
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
        Object.values(UnitPersonLinkType).includes(
          rawTarget.linkType as UnitPersonLinkType,
        )
          ? (rawTarget.linkType as UnitPersonLinkType)
          : null,
    };
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAnnouncementsAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);

    const search = normalizeNullableString(searchParams.get("q"));
    const condominiumId = normalizeNullableString(
      searchParams.get("condominiumId"),
    );
    const statusParam = normalizeNullableString(searchParams.get("status"));
    const typeParam = normalizeNullableString(searchParams.get("type"));
    const priorityParam = normalizeNullableString(searchParams.get("priority"));
    const pageParam = Number(searchParams.get("page") ?? "1");
    const pageSizeParam = Number(searchParams.get("pageSize") ?? "20");

    const page =
      Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(Math.floor(pageSizeParam), 100)
        : 20;

    const where: Prisma.AnnouncementWhereInput = {
      administratorId: auth.administratorId,
      ...(search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                content: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
      ...(condominiumId
        ? {
            condominiumId,
          }
        : {}),
      ...(statusParam && statusParam !== "ALL"
        ? {
            status: statusParam as AnnouncementStatus,
          }
        : {}),
      ...(typeParam && typeParam !== "ALL"
        ? {
            type: typeParam as AnnouncementType,
          }
        : {}),
      ...(priorityParam && priorityParam !== "ALL"
        ? {
            priority: priorityParam as AnnouncementPriority,
          }
        : {}),
    };

    const [total, announcements, kpis] = await Promise.all([
      db.announcement.count({ where }),
      db.announcement.findMany({
        where,
        orderBy: [
          {
            publishedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      }),
      db.announcement.groupBy({
        by: ["status"],
        where: {
          administratorId: auth.administratorId,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const readingCount = await db.announcementReading.count({
      where: {
        announcement: {
          administratorId: auth.administratorId,
        },
      },
    });

    const statusTotals = kpis.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    return NextResponse.json({
      announcements,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
      kpis: {
        totalPublished: statusTotals.PUBLISHED ?? 0,
        totalDraft: statusTotals.DRAFT ?? 0,
        totalScheduled: statusTotals.SCHEDULED ?? 0,
        totalArchived: statusTotals.ARCHIVED ?? 0,
        totalReadings: readingCount,
      },
    });
  } catch (error) {
    console.error("Erro ao listar comunicados:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar os comunicados.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAnnouncementsAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as CreateAnnouncementBody;

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

    const targetScopeValidation = parseAnnouncementTargetScope(
      body.targetScope,
    );
    if (!targetScopeValidation.ok) {
      return badRequest(targetScopeValidation.message);
    }

    const statusValidation = parseAnnouncementStatusForDraftFlow(body.status);
    if (!statusValidation.ok) {
      return badRequest(statusValidation.message);
    }

    if (statusValidation.value === AnnouncementStatus.PUBLISHED) {
      return badRequest(
        "Crie o comunicado como rascunho ou agendado. Para publicar, use a ação Publicar.",
      );
    }

    if (statusValidation.value === AnnouncementStatus.ARCHIVED) {
      return badRequest("Não é possível criar um comunicado já arquivado.");
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
      return badRequest(
        "A data de expiração deve ser posterior à data de publicação.",
      );
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
        },
      );
    }

    const status =
      statusValidation.value === AnnouncementStatus.SCHEDULED ||
      publishAtValidation.value
        ? AnnouncementStatus.SCHEDULED
        : AnnouncementStatus.DRAFT;

    const announcement = await db.$transaction(async (tx) => {
      const created = await tx.announcement.create({
        data: {
          administratorId: auth.administratorId,
          condominiumId:
            targetScopeValidation.value ===
            AnnouncementTargetScope.ALL_ADMINISTRATOR
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
            true,
          ),
          createdByUserId: auth.authUser.id,
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
            announcementId: created.id,
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
          announcementId: created.id,
          userId: auth.authUser.id,
          action: AnnouncementLogAction.CREATED,
          message: "Comunicado criado pela administradora.",
          metadata: {
            status,
            targetScope: targetScopeValidation.value,
            targetsCount: targetsValidation.value.length,
          },
        },
      });

      if (status === AnnouncementStatus.SCHEDULED) {
        await tx.announcementLog.create({
          data: {
            announcementId: created.id,
            userId: auth.authUser.id,
            action: AnnouncementLogAction.SCHEDULED,
            message: "Comunicado salvo como agendado.",
            metadata: {
              publishAt: publishAtValidation.value?.toISOString() ?? null,
            },
          },
        });
      }

      return created;
    });

    return NextResponse.json(
      {
        announcement,
        message: "Comunicado criado com sucesso.",
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Erro ao criar comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível criar o comunicado.",
      },
      {
        status: 500,
      },
    );
  }
}
