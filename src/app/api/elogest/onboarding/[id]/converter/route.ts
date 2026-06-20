import { NextRequest, NextResponse } from "next/server";
import {
  AdministratorPlanStatus,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { ensureDefaultFinancialCategories } from "@/lib/financial-default-categories";

/* =========================================================
   ELOGEST — ETAPA 56.10.5
   CONVERSÃO CONTROLADA EM ADMINISTRADORA ATIVA OU TRIAL

   Rota:
   POST /api/elogest/onboarding/[id]/converter

   Regras:
   - Apenas solicitação APPROVED.
   - Bloqueia conversão duplicada.
   - Permite conversão ACTIVE ou TRIAL.
   - Trial entre 1 e 90 dias.
   - Usa plano informado/interesse.
   - No trial sem plano: Profissional como fallback; depois Free.
   - Não cria usuário, senha, cobrança ou envio externo.
   ========================================================= */

export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ id: string }>
    | { id: string };
};

type RequestBody = Record<string, unknown>;
type ConversionMode = "ACTIVE" | "TRIAL";

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

function normalizeConversionMode(value: unknown): ConversionMode {
  return normalizeText(value).toUpperCase() === "TRIAL" ? "TRIAL" : "ACTIVE";
}

function normalizeTrialDays(value: unknown) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90) {
    return null;
  }

  return parsed;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

async function getRouteId(context: RouteContext) {
  const params = await Promise.resolve(context.params);
  return params.id;
}

async function findActivePlanBySlug(slug: string) {
  return db.plan.findFirst({
    where: {
      slug,
      status: Status.ACTIVE,
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
    metadata: true,
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
        { error: "Solicitação não identificada." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;

    const cnpj = onlyNumbers(body.cnpj) || null;
    const overridePlanId = normalizeOptional(body.planId);
    const conversionMode = normalizeConversionMode(body.conversionMode);
    const trialDays =
      conversionMode === "TRIAL" ? normalizeTrialDays(body.trialDays) : null;

    if (cnpj && cnpj.length !== 14) {
      return NextResponse.json(
        { error: "Informe um CNPJ válido com 14 dígitos ou deixe em branco." },
        { status: 400 },
      );
    }

    if (conversionMode === "TRIAL" && trialDays === null) {
      return NextResponse.json(
        { error: "Informe uma duração de trial entre 1 e 90 dias." },
        { status: 400 },
      );
    }

    const onboardingRequest = await db.onboardingRequest.findUnique({
      where: { id },
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
        metadata: true,
      },
    });

    if (!onboardingRequest) {
      return NextResponse.json(
        { error: "Solicitação de acesso não encontrada." },
        { status: 404 },
      );
    }

    if (
      onboardingRequest.status === "CONVERTED" ||
      onboardingRequest.convertedAdminId
    ) {
      return NextResponse.json(
        { error: "Esta solicitação já foi convertida em administradora." },
        { status: 409 },
      );
    }

    if (onboardingRequest.status !== "APPROVED") {
      return NextResponse.json(
        {
          error:
            "A solicitação precisa estar aprovada antes de ser convertida.",
        },
        { status: 409 },
      );
    }

    if (!onboardingRequest.administratorName.trim()) {
      return NextResponse.json(
        { error: "A solicitação não possui nome de administradora válido." },
        { status: 400 },
      );
    }

    if (cnpj) {
      const existingAdministrator = await db.administrator.findUnique({
        where: { cnpj },
        select: { id: true },
      });

      if (existingAdministrator) {
        return NextResponse.json(
          { error: "Já existe uma administradora cadastrada com este CNPJ." },
          { status: 409 },
        );
      }
    }

    let planId = overridePlanId || onboardingRequest.interestedPlanId;

    if (planId) {
      const selectedPlan = await db.plan.findUnique({
        where: { id: planId },
        select: { id: true, status: true },
      });

      if (!selectedPlan || selectedPlan.status !== Status.ACTIVE) {
        planId = null;
      }
    }

    if (!planId && conversionMode === "TRIAL") {
      const professionalPlan = await findActivePlanBySlug("profissional");
      planId = professionalPlan?.id ?? null;
    }

    if (!planId) {
      const freePlan = await findActivePlanBySlug("free");

      if (!freePlan) {
        return NextResponse.json(
          {
            error:
              "Plano ativo de fallback não encontrado. Revise os planos antes da conversão.",
          },
          { status: 500 },
        );
      }

      planId = freePlan.id;
    }

    const now = new Date();
    const planExpiresAt =
      conversionMode === "TRIAL" && trialDays
        ? addDays(now, trialDays)
        : null;

    const previousMetadata =
      onboardingRequest.metadata &&
      typeof onboardingRequest.metadata === "object" &&
      !Array.isArray(onboardingRequest.metadata)
        ? onboardingRequest.metadata
        : {};

    const result = await db.$transaction(async (tx) => {
      const administrator = await tx.administrator.create({
        data: {
          name: onboardingRequest.administratorName.trim(),
          cnpj,
          email: onboardingRequest.email.trim().toLowerCase() || null,
          phone: onlyNumbers(onboardingRequest.phone) || null,
          status: Status.ACTIVE,
          planId,
          planStatus:
            conversionMode === "TRIAL"
              ? AdministratorPlanStatus.TRIALING
              : AdministratorPlanStatus.ACTIVE,
          planStartedAt: now,
          planExpiresAt,
          customLimitsEnabled: false,
        },
        select: administratorSelect(),
      });

      await ensureDefaultFinancialCategories(administrator.id, tx);

      const updatedRequest = await tx.onboardingRequest.update({
        where: { id: onboardingRequest.id },
        data: {
          status: "CONVERTED",
          convertedAt: now,
          convertedAdminId: administrator.id,
          reviewedAt: now,
          reviewedByUserId: auth.authUser.id,
          rejectedAt: null,
          rejectionReason: null,
          metadata: {
            ...previousMetadata,
            convertedFromPublicOnboarding: true,
            conversionSource: "ELOGEST_SUPER_ADMIN",
            conversionMode,
            trial:
              conversionMode === "TRIAL"
                ? {
                    enabled: true,
                    days: trialDays,
                    startedAt: now.toISOString(),
                    expiresAt: planExpiresAt?.toISOString() ?? null,
                  }
                : {
                    enabled: false,
                  },
            convertedPlanId: planId,
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
          conversionMode === "TRIAL"
            ? `Solicitação convertida em administradora com trial de ${trialDays} dias. Nenhum acesso foi criado automaticamente.`
            : "Solicitação convertida em administradora ativa. Crie o primeiro acesso administrativo com senha segura.",
        conversionMode,
        trialDays,
        administrator: result.administrator,
        request: result.request,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Erro ao converter solicitação de onboarding:", error);

    return NextResponse.json(
      { error: "Não foi possível converter a solicitação em administradora." },
      { status: 500 },
    );
  }
}
