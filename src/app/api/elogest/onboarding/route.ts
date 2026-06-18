import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";

/* =========================================================
   API ELOGEST — ONBOARDING

   Rotas:
   GET /api/elogest/onboarding

   ETAPA 56.6 — ÁREA SUPER ADMIN DE SOLICITAÇÕES

   Objetivo:
   - Listar solicitações públicas de acesso recebidas pelo site.
   - Retornar KPIs simples para a tela interna do Super Admin.
   - Manter acesso exclusivo ao Super Admin EloGest.
   ========================================================= */

export const dynamic = "force-dynamic";

const ALLOWED_STATUS_FILTERS = [
  "PENDING_REVIEW",
  "IN_CONTACT",
  "APPROVED",
  "CONVERTED",
  "REJECTED",
] as const;

type AllowedStatusFilter = (typeof ALLOWED_STATUS_FILTERS)[number];

function normalizeStatus(value: string | null): AllowedStatusFilter | null {
  const status = String(value || "").trim().toUpperCase();

  if (ALLOWED_STATUS_FILTERS.includes(status as (typeof ALLOWED_STATUS_FILTERS)[number])) {
    return status as AllowedStatusFilter;
  }

  return null;
}

function onboardingRequestSelect() {
  return {
    id: true,
    administratorName: true,
    responsibleName: true,
    email: true,
    phone: true,
    city: true,
    state: true,
    condominiumEstimate: true,
    unitEstimate: true,
    message: true,
    status: true,
    rejectionReason: true,
    reviewedAt: true,
    convertedAt: true,
    rejectedAt: true,
    createdAt: true,
    updatedAt: true,
    interestedPlan: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
    reviewedByUser: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
    convertedAdmin: {
      select: {
        id: true,
        name: true,
        status: true,
      },
    },
  } as const;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const url = new URL(request.url);
    const status = normalizeStatus(url.searchParams.get("status"));

    const where = status
      ? {
          status,
        }
      : {};

    const [requests, total, pending, inContact, approved, converted, rejected] =
      await Promise.all([
        db.onboardingRequest.findMany({
          where,
          select: onboardingRequestSelect(),
          orderBy: [
            {
              createdAt: "desc",
            },
          ],
        }),
        db.onboardingRequest.count(),
        db.onboardingRequest.count({
          where: {
            status: "PENDING_REVIEW",
          },
        }),
        db.onboardingRequest.count({
          where: {
            status: "IN_CONTACT",
          },
        }),
        db.onboardingRequest.count({
          where: {
            status: "APPROVED",
          },
        }),
        db.onboardingRequest.count({
          where: {
            status: "CONVERTED",
          },
        }),
        db.onboardingRequest.count({
          where: {
            status: "REJECTED",
          },
        }),
      ]);

    return NextResponse.json({
      requests,
      summary: {
        total,
        pending,
        inContact,
        approved,
        converted,
        rejected,
      },
    });
  } catch (error) {
    console.error("Erro ao listar solicitações de onboarding:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar as solicitações de acesso.",
      },
      {
        status: 500,
      },
    );
  }
}
