import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/* =========================================================
   API PÚBLICA — ONBOARDING ELOGEST

   Rota:
   POST /api/public/onboarding

   ETAPA 56.2 — PÁGINA COMERCIAL E ONBOARDING PÚBLICO

   Objetivo:
   - Receber solicitações públicas de acesso ao EloGest.
   - Registrar interesse comercial sem criar administradora ativa.
   - Permitir análise posterior pelo Super Admin.

   Segurança:
   - Não cria Administrator automaticamente.
   - Não cria usuário automaticamente.
   - Não envia WhatsApp real.
   - Não envia e-mail externo.
   - Bloqueia duplicidade recente por e-mail.
   ========================================================= */

export const dynamic = "force-dynamic";

type RequestBody = Record<string, unknown>;

const DUPLICATE_WINDOW_DAYS = 7;
const DEFAULT_STATUS = "PENDING_REVIEW" as const;

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeOptional(value: unknown) {
  const normalized = normalizeText(value);

  return normalized || null;
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function onlyNumbers(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value: unknown) {
  const phone = onlyNumbers(value);

  return phone || null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeState(value: unknown) {
  const normalized = normalizeText(value).toUpperCase();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 2);
}

function normalizePositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const integer = Math.floor(parsed);

  if (integer < 0) {
    return null;
  }

  return integer;
}

function normalizeBoolean(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeVersion(value: unknown, fallback: string) {
  const normalized = normalizeText(value);

  return normalized || fallback;
}

function getRequestContext(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const requestIp = forwardedFor?.split(",")[0]?.trim() || null;

  return {
    ip: requestIp,
    userAgent: request.headers.get("user-agent"),
    referer: request.headers.get("referer"),
    language: request.headers.get("accept-language"),
  };
}

function pickFirst(body: RequestBody, keys: string[]) {
  for (const key of keys) {
    const value = body[key];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return undefined;
}

function getDuplicateWindowStart() {
  const date = new Date();
  date.setDate(date.getDate() - DUPLICATE_WINDOW_DAYS);

  return date;
}

async function resolveInterestedPlanId(params: {
  interestedPlanId: string | null;
  interestedPlanSlug: string | null;
}) {
  const { interestedPlanId, interestedPlanSlug } = params;

  if (!interestedPlanId && !interestedPlanSlug) {
    return null;
  }

  const plan = await db.plan.findFirst({
    where: interestedPlanId
      ? {
          id: interestedPlanId,
        }
      : {
          slug: interestedPlanSlug || undefined,
        },
    select: {
      id: true,
      status: true,
    },
  });

  if (!plan) {
    return {
      error: NextResponse.json(
        {
          error: "O plano de interesse informado não foi encontrado.",
        },
        {
          status: 404,
        },
      ),
    };
  }

  if (plan.status !== "ACTIVE") {
    return {
      error: NextResponse.json(
        {
          error: "O plano de interesse informado não está disponível no momento.",
        },
        {
          status: 400,
        },
      ),
    };
  }

  return {
    planId: plan.id,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    const administratorName = normalizeText(
      pickFirst(body, ["administratorName", "name", "companyName"]),
    );

    const responsibleName = normalizeText(
      pickFirst(body, ["responsibleName", "contactName", "userName"]),
    );

    const email = normalizeEmail(
      pickFirst(body, ["email", "responsibleEmail", "contactEmail"]),
    );

    const phone = normalizePhone(
      pickFirst(body, ["phone", "whatsapp", "responsiblePhone", "contactPhone"]),
    );

    const city = normalizeOptional(pickFirst(body, ["city", "cidade"]));
    const state = normalizeState(pickFirst(body, ["state", "uf", "estado"]));

    const condominiumEstimate = normalizePositiveInteger(
      pickFirst(body, [
        "condominiumEstimate",
        "condominiumsEstimate",
        "condominiums",
        "estimatedCondominiums",
      ]),
    );

    const unitEstimate = normalizePositiveInteger(
      pickFirst(body, ["unitEstimate", "unitsEstimate", "units", "estimatedUnits"]),
    );

    const interestedPlanId = normalizeOptional(
      pickFirst(body, ["interestedPlanId", "planId"]),
    );

    const interestedPlanSlug =
      normalizeOptional(
        pickFirst(body, ["interestedPlanSlug", "planSlug", "plan"]),
      )?.toLowerCase() ?? null;

    const message = normalizeOptional(
      pickFirst(body, ["message", "notes", "observations"]),
    );

    const termsAccepted = normalizeBoolean(body.termsAccepted);
    const privacyAcknowledged = normalizeBoolean(body.privacyAcknowledged);
    const termsVersion = normalizeVersion(body.termsVersion, "2026-06-20");
    const privacyVersion = normalizeVersion(body.privacyVersion, "2026-06-20");

    const rawAttribution =
      body.attribution &&
      typeof body.attribution === "object" &&
      !Array.isArray(body.attribution)
        ? (body.attribution as Record<string, unknown>)
        : {};

    const attribution = {
      source: normalizeOptional(rawAttribution.source) || "DIRECT",
      medium: normalizeOptional(rawAttribution.medium),
      campaign: normalizeOptional(rawAttribution.campaign),
      term: normalizeOptional(rawAttribution.term),
      content: normalizeOptional(rawAttribution.content),
      referrer: normalizeOptional(rawAttribution.referrer),
      landingPath: normalizeOptional(rawAttribution.landingPath),
      capturedAt: new Date().toISOString(),
    };

    if (!administratorName) {
      return NextResponse.json(
        {
          error: "Informe o nome da administradora.",
        },
        {
          status: 400,
        },
      );
    }

    if (!responsibleName) {
      return NextResponse.json(
        {
          error: "Informe o nome do responsável pelo contato.",
        },
        {
          status: 400,
        },
      );
    }

    if (!email) {
      return NextResponse.json(
        {
          error: "Informe o e-mail do responsável pelo contato.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          error: "Informe um e-mail válido para contato.",
        },
        {
          status: 400,
        },
      );
    }

    if (!termsAccepted) {
      return NextResponse.json(
        {
          error: "É necessário aceitar os Termos De Uso.",
        },
        {
          status: 400,
        },
      );
    }

    if (!privacyAcknowledged) {
      return NextResponse.json(
        {
          error: "É necessário confirmar a ciência da Política De Privacidade.",
        },
        {
          status: 400,
        },
      );
    }

    if (state && state.length !== 2) {
      return NextResponse.json(
        {
          error: "Informe o estado usando a sigla com 2 letras.",
        },
        {
          status: 400,
        },
      );
    }

    const planResult = await resolveInterestedPlanId({
      interestedPlanId,
      interestedPlanSlug,
    });

    if (planResult?.error) {
      return planResult.error;
    }

    const duplicateWindowStart = getDuplicateWindowStart();

    const recentDuplicatedRequest = await db.onboardingRequest.findFirst({
      where: {
        email,
        createdAt: {
          gte: duplicateWindowStart,
        },
        status: {
          in: ["PENDING_REVIEW", "IN_CONTACT", "APPROVED"],
        },
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (recentDuplicatedRequest) {
      return NextResponse.json(
        {
          error:
            "Já recebemos uma solicitação recente com este e-mail. Nossa equipe analisará as informações e entrará em contato.",
        },
        {
          status: 409,
        },
      );
    }

    const acceptedAt = new Date();
    const requestContext = getRequestContext(request);

    const onboardingRequest = await db.onboardingRequest.create({
      data: {
        administratorName,
        responsibleName,
        email,
        phone,
        city,
        state,
        condominiumEstimate,
        unitEstimate,
        interestedPlanId: planResult?.planId ?? null,
        message,
        status: DEFAULT_STATUS,
        metadata: {
          source: "PUBLIC_ONBOARDING_FORM",
          etapa: "56.10.4",
          consent: {
            terms: {
              accepted: true,
              acceptedAt: acceptedAt.toISOString(),
              version: termsVersion,
            },
            privacy: {
              acknowledged: true,
              acknowledgedAt: acceptedAt.toISOString(),
              version: privacyVersion,
            },
          },
          requestContext,
          lead: {
            channel: attribution.medium || "SITE_PUBLICO",
            source: attribution.source,
            priority: "NORMAL",
            stage: "NOVO",
            firstContactAt: null,
            nextActionAt: null,
            nextAction: null,
            internalNotes: null,
            commercialOwner: null,
          },
          attribution,
        },
      },
      select: {
        id: true,
        administratorName: true,
        responsibleName: true,
        email: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message:
          "Recebemos sua solicitação. Nossa equipe analisará as informações e entrará em contato.",
        onboardingRequest,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Erro ao criar solicitação pública de onboarding:", error);

    return NextResponse.json(
      {
        error: "Não foi possível enviar a solicitação neste momento.",
      },
      {
        status: 500,
      },
    );
  }
}
