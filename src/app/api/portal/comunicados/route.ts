import { NextRequest, NextResponse } from "next/server";
import { AnnouncementPriority, AnnouncementType, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildPortalAnnouncementWhere,
  formatAnnouncementForPortalList,
  normalizeSearchParam,
  requirePortalAnnouncementAccess,
} from "@/lib/announcement-portal-utils";



/* =========================================================
   API PORTAL - LISTAGEM DE COMUNICADOS

   Arquivo:
   src/app/api/portal/comunicados/route.ts

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Método:
   - GET: lista comunicados publicados compatíveis com o perfil ativo.

   Segurança:
   - Usa perfil ativo via UserAccess.
   - Filtra por administradora, condomínio, unidade, perfil e vínculo.
   - Bloqueia administradora inativa.
   - Bloqueia plano sem módulo Comunicados.
   ========================================================= */



function parsePositiveInteger(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value || ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}



function parseEnumFilter<T extends Record<string, string>>(enumObject: T, value: string | null) {
  if (!value) {
    return null;
  }

  const enumValues = Object.values(enumObject) as string[];

  return enumValues.includes(value) ? value : null;
}



export async function GET(request: NextRequest) {
  const access = await requirePortalAnnouncementAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const { searchParams } = new URL(request.url);

    const page = parsePositiveInteger(searchParams.get("page"), 1, 500);
    const limit = parsePositiveInteger(searchParams.get("limit"), 20, 100);
    const skip = (page - 1) * limit;

    const search = normalizeSearchParam(searchParams.get("search"));
    const readFilter = normalizeSearchParam(searchParams.get("read"));
    const typeFilter = parseEnumFilter(AnnouncementType, searchParams.get("type"));
    const priorityFilter = parseEnumFilter(AnnouncementPriority, searchParams.get("priority"));

    const where: Prisma.AnnouncementWhereInput = buildPortalAnnouncementWhere(access);

    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          content: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (typeFilter) {
      where.type = typeFilter as AnnouncementType;
    }

    if (priorityFilter) {
      where.priority = priorityFilter as AnnouncementPriority;
    }

    if (readFilter === "unread") {
      where.readings = {
        none: {
          userId: access.authUser.id,
          accessId: access.accessId,
        },
      };
    }

    if (readFilter === "read") {
      where.readings = {
        some: {
          userId: access.authUser.id,
          accessId: access.accessId,
        },
      };
    }

    const [total, unreadTotal, announcements] = await Promise.all([
      db.announcement.count({
        where,
      }),
      db.announcement.count({
        where: {
          ...buildPortalAnnouncementWhere(access),
          readings: {
            none: {
              userId: access.authUser.id,
              accessId: access.accessId,
            },
          },
        },
      }),
      db.announcement.findMany({
        where,
        orderBy: [
          {
            priority: "desc",
          },
          {
            publishedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip,
        take: limit,
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
          readings: {
            where: {
              userId: access.authUser.id,
              accessId: access.accessId,
            },
            select: {
              id: true,
              accessId: true,
              readAt: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      announcements: announcements.map((announcement) =>
        formatAnnouncementForPortalList({
          announcement,
          accessId: access.accessId,
        })
      ),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
      kpis: {
        total,
        unread: unreadTotal,
        read: Math.max(0, total - unreadTotal),
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
    console.error("Erro ao listar comunicados do portal:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar os comunicados.",
      },
      {
        status: 500,
      }
    );
  }
}
