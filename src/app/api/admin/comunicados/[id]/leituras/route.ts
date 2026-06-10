import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAnnouncementsAdminApiAccess } from "@/lib/admin-api-guard";
import { normalizeNullableString } from "@/lib/announcement-admin-utils";



/* =========================================================
   API ADMIN - LEITURAS DO COMUNICADO

   Arquivo:
   src/app/api/admin/comunicados/[id]/leituras/route.ts

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Método:
   - GET: lista confirmações de leitura de um comunicado.

   Segurança:
   - Só retorna leituras de comunicado pertencente à administradora
     ativa do usuário.
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
    const pageSizeParam = Number(searchParams.get("pageSize") ?? "50");
    const q = normalizeNullableString(searchParams.get("q"));

    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(Math.floor(pageSizeParam), 100)
        : 50;

    const announcement = await db.announcement.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        targetScope: true,
        requireReadingConfirmation: true,
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

    const where = {
      announcementId: id,
      ...(q
        ? {
            OR: [
              {
                user: {
                  name: {
                    contains: q,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                user: {
                  email: {
                    contains: q,
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, readings] = await Promise.all([
      db.announcementReading.count({ where }),
      db.announcementReading.findMany({
        where,
        orderBy: {
          readAt: "desc",
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          userAccess: {
            select: {
              id: true,
              role: true,
              label: true,
              condominiumId: true,
              unitId: true,
              condominium: {
                select: {
                  id: true,
                  name: true,
                },
              },
              unit: {
                select: {
                  id: true,
                  block: true,
                  unitNumber: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      announcement,
      readings,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
      summary: {
        totalReadings: total,
      },
    });
  } catch (error) {
    console.error("Erro ao listar leituras do comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar as leituras do comunicado.",
      },
      {
        status: 500,
      }
    );
  }
}
