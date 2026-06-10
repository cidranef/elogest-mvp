import { AnnouncementLogAction, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnnouncementsAdminApiAccess } from "@/lib/admin-api-guard";
import { normalizeNullableString } from "@/lib/announcement-admin-utils";

/* =========================================================
   API ADMIN - HISTÓRICO DO COMUNICADO

   Arquivo:
   src/app/api/admin/comunicados/[id]/historico/route.ts

   ETAPA 48.9.4 — HISTÓRICO / AUDITORIA DE COMUNICADOS

   Método:
   - GET: lista os eventos registrados no ciclo de vida do comunicado.

   Segurança:
   - Só retorna histórico de comunicado pertencente à administradora ativa.
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAnnouncementsAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);

    const pageParam = Number(searchParams.get("page") ?? "1");
    const pageSizeParam = Number(searchParams.get("pageSize") ?? "80");
    const actionParam = normalizeNullableString(searchParams.get("action"));
    const action =
      actionParam && actionParam !== "ALL" &&
      Object.values(AnnouncementLogAction).includes(actionParam as AnnouncementLogAction)
        ? (actionParam as AnnouncementLogAction)
        : null;

    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(Math.floor(pageSizeParam), 120)
        : 80;

    const announcement = await db.announcement.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        title: true,
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
        },
      );
    }

    const where: Prisma.AnnouncementLogWhereInput = {
      announcementId: id,
      ...(action
        ? {
            action,
          }
        : {}),
    };

    const [total, logs] = await Promise.all([
      db.announcementLog.count({ where }),
      db.announcementLog.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      announcement,
      logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
      summary: {
        totalLogs: total,
      },
    });
  } catch (error) {
    console.error("Erro ao listar histórico do comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar o histórico do comunicado.",
      },
      {
        status: 500,
      },
    );
  }
}
