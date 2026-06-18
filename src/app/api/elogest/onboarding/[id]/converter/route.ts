import { NextRequest, NextResponse } from "next/server";
import {
  AdministratorPlanStatus,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { ensureDefaultFinancialCategories } from "@/lib/financial-default-categories";

/* =========================================================
   API ELOGEST — CONVERSÃO DE ONBOARDING EM ADMINISTRADORA

   Rota:
   POST /api/elogest/onboarding/[id]/converter

   ETAPA 56.7 — CONVERSÃO CONTROLADA

   Objetivo:
   - Converter uma solicitação aprovada em administradora real.
   - Vincular plano de interesse ou Plano Free como fallback.
   - Criar categorias financeiras padrão da Etapa 53.
   - Bloquear conversão duplicada.
   - Não criar senha automática insegura.
   - Não enviar WhatsApp/e-mail externo nesta etapa.
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

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeOptional(value: unknown) {
  const normalized = normalizeText(value);

  return normalized || null;
}

function onlyNumbers(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

async function getRouteId(context: RouteContext) {
  const params = await Promise.resolve(context.params);

  return params.id;
}

async function getFallbackFreePlan() {
  return db.plan.findUnique({
    where: {
      slug: "free",
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  });
}

function administratorSelect() {
  return {
    id: true,
    name: true,
    cnpj: true,
    email: true,
    phone: true,
    status: true,
    planId: true,
    planStatus: true,
    planStartedAt: true,
    planExpiresAt: true,
    plan: {
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
      },
    },
    createdAt: true,
    updatedAt: true,
  } as const;
}

function convertedRequestSelect() {
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
    reviewedAt: true,
    convertedAt: true,
    convertedAdminId: true,
    rejectedAt: true,
    rejectionReason: true,
    interestedPlan: {
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
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
      select: administratorSelect(),
    },
    createdAt: true,
    updatedAt: true,
  } as const;
}

export async function POST(request: NextRequest, context: RouteContext) {
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

    const body = (await request.json().catch(() => ({}))) as RequestBody;

    const cnpj = onlyNumbers(body.cnpj) || null;
    const overridePlanId = normalizeOptional(body.planId);

    if (cnpj && cnpj.length !== 14) {
      return NextResponse.json(
        {
          error: "Informe um CNPJ válido com 14 dígitos ou deixe em branco.",
        },
        {
          status: 400,
        },
      );
    }

    const onboardingRequest = await db.onboardingRequest.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        administratorName: true,
        responsibleName: true,
        email: true,
        phone: true,
        city: true,
        state: true,
        status: true,
        interestedPlanId: true,
        convertedAdminId: true,
        convertedAt: true,
      },
    });

    if (!onboardingRequest) {
      return NextResponse.json(
        {
          error: "Solicitação de acesso não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    if (onboardingRequest.status === "CONVERTED" || onboardingRequest.convertedAdminId) {
      return NextResponse.json(
        {
          error: "Esta solicitação já foi convertida em administradora.",
        },
        {
          status: 409,
        },
      );
    }

    if (onboardingRequest.status !== "APPROVED") {
      return NextResponse.json(
        {
          error:
            "A solicitação precisa estar aprovada antes de ser convertida em administradora.",
        },
        {
          status: 409,
        },
      );
    }

    if (!onboardingRequest.administratorName.trim()) {
      return NextResponse.json(
        {
          error: "A solicitação não possui nome de administradora válido.",
        },
        {
          status: 400,
        },
      );
    }

    if (cnpj) {
      const existingAdministratorByCnpj = await db.administrator.findUnique({
        where: {
          cnpj,
        },
        select: {
          id: true,
        },
      });

      if (existingAdministratorByCnpj) {
        return NextResponse.json(
          {
            error: "Já existe uma administradora cadastrada com este CNPJ.",
          },
          {
            status: 409,
          },
        );
      }
    }

    let planId = overridePlanId || onboardingRequest.interestedPlanId;

    if (planId) {
      const selectedPlan = await db.plan.findUnique({
        where: {
          id: planId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!selectedPlan || selectedPlan.status !== Status.ACTIVE) {
        planId = null;
      }
    }

    if (!planId) {
      const freePlan = await getFallbackFreePlan();

      if (!freePlan || freePlan.status !== Status.ACTIVE) {
        return NextResponse.json(
          {
            error:
              "Plano Free ativo não encontrado. Execute ou revise o seed de planos antes de converter solicitações.",
          },
          {
            status: 500,
          },
        );
      }

      planId = freePlan.id;
    }

    const now = new Date();

    const result = await db.$transaction(async (tx) => {
      const administrator = await tx.administrator.create({
        data: {
          name: onboardingRequest.administratorName.trim(),
          cnpj,
          email: onboardingRequest.email.trim().toLowerCase() || null,
          phone: onlyNumbers(onboardingRequest.phone) || null,
          status: Status.ACTIVE,
          planId,
          planStatus: AdministratorPlanStatus.ACTIVE,
          planStartedAt: now,
          customLimitsEnabled: false,
        },
        select: administratorSelect(),
      });

      await ensureDefaultFinancialCategories(administrator.id, tx);

      const updatedRequest = await tx.onboardingRequest.update({
        where: {
          id: onboardingRequest.id,
        },
        data: {
          status: "CONVERTED",
          convertedAt: now,
          convertedAdminId: administrator.id,
          reviewedAt: now,
          reviewedByUserId: auth.authUser.id,
          rejectedAt: null,
          rejectionReason: null,
          metadata: {
            convertedFromPublicOnboarding: true,
            conversionSource: "ELOGEST_SUPER_ADMIN",
            convertedResponsibleName: onboardingRequest.responsibleName,
            convertedResponsibleEmail: onboardingRequest.email,
            convertedCity: onboardingRequest.city,
            convertedState: onboardingRequest.state,
            convertedAt: now.toISOString(),
          },
        },
        select: convertedRequestSelect(),
      });

      return {
        administrator,
        request: updatedRequest,
      };
    });

    return NextResponse.json(
      {
        message:
          "Solicitação convertida em administradora com sucesso. Crie o primeiro acesso administrativo com senha segura na tela da administradora.",
        administrator: result.administrator,
        request: result.request,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Erro ao converter solicitação de onboarding:", error);

    return NextResponse.json(
      {
        error: "Não foi possível converter a solicitação em administradora.",
      },
      {
        status: 500,
      },
    );
  }
}
