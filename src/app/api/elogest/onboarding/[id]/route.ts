import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";

/* =========================================================
   API ELOGEST — DETALHE DA SOLICITAÇÃO DE ONBOARDING

   Rotas:
   PATCH /api/elogest/onboarding/[id]

   ETAPA 56.6 — ÁREA SUPER ADMIN DE SOLICITAÇÕES

   Objetivo:
   - Atualizar o status de uma solicitação pública.
   - Registrar análise pelo Super Admin.
   - Permitir rejeição com motivo.
   - Não converter em administradora nesta subetapa.
   ========================================================= */

export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
};

type RequestBody = Record<string, unknown>;

const ACTION_STATUS_MAP = {
  markInContact: "IN_CONTACT",
  approve: "APPROVED",
  reject: "REJECTED",
} as const;

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

async function getRouteId(context: RouteContext) {
  const params = await Promise.resolve(context.params);

  return params.id;
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const id = await getRouteId(context);

    if (!id) {
      return NextResponse.json(
        {
          error: "Solicitação não identificada.",
        },
        {
          status: 400,
        },
      );
    }

    const body = (await request.json()) as RequestBody;
    const action = normalizeText(body.action);
    const targetStatus = ACTION_STATUS_MAP[action as keyof typeof ACTION_STATUS_MAP];

    if (!targetStatus) {
      return NextResponse.json(
        {
          error: "Ação inválida para a solicitação de acesso.",
        },
        {
          status: 400,
        },
      );
    }

    const currentRequest = await db.onboardingRequest.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
        convertedAdminId: true,
      },
    });

    if (!currentRequest) {
      return NextResponse.json(
        {
          error: "Solicitação de acesso não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    if (currentRequest.status === "CONVERTED" || currentRequest.convertedAdminId) {
      return NextResponse.json(
        {
          error:
            "Esta solicitação já foi convertida em administradora e não pode mais ter o status alterado por esta ação.",
        },
        {
          status: 409,
        },
      );
    }

    const rejectionReason = normalizeText(body.rejectionReason);

    if (targetStatus === "REJECTED" && rejectionReason.length < 5) {
      return NextResponse.json(
        {
          error: "Informe um motivo para rejeitar a solicitação.",
        },
        {
          status: 400,
        },
      );
    }

    const now = new Date();

    const updatedRequest = await db.onboardingRequest.update({
      where: {
        id,
      },
      data: {
        status: targetStatus,
        reviewedAt: now,
        reviewedByUserId: auth.authUser.id,
        rejectedAt: targetStatus === "REJECTED" ? now : null,
        rejectionReason: targetStatus === "REJECTED" ? rejectionReason : null,
      },
      select: onboardingRequestSelect(),
    });

    const messages = {
      IN_CONTACT: "Solicitação marcada como em contato.",
      APPROVED: "Solicitação aprovada para conversão posterior.",
      REJECTED: "Solicitação rejeitada com motivo registrado.",
    } as const;

    return NextResponse.json({
      message: messages[targetStatus as keyof typeof messages],
      request: updatedRequest,
    });
  } catch (error) {
    console.error("Erro ao atualizar solicitação de onboarding:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar a solicitação de acesso.",
      },
      {
        status: 500,
      },
    );
  }
}
