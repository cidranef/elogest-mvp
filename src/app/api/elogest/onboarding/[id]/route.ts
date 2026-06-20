import { NextRequest, NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

type RequestBody = Record<string, unknown>;

const ACTION_STATUS_MAP = {
  markInContact: "IN_CONTACT",
  approve: "APPROVED",
  reject: "REJECTED",
} as const;

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const STAGES = [
  "NOVO",
  "QUALIFICACAO",
  "CONTATO",
  "PROPOSTA",
  "NEGOCIACAO",
  "GANHO",
  "PERDIDO",
] as const;

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeOptional(value: unknown) {
  const valueText = normalizeText(value);
  return valueText || null;
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, Prisma.JsonValue>;
  }

  return value as Record<string, Prisma.JsonValue>;
}

async function getRouteId(context: RouteContext) {
  const params = await Promise.resolve(context.params);
  return params.id;
}

function requestSelect() {
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
    metadata: true,
    createdAt: true,
    updatedAt: true,
    interestedPlan: {
      select: { id: true, name: true, slug: true },
    },
    reviewedByUser: {
      select: { id: true, name: true, email: true },
    },
    convertedAdmin: {
      select: { id: true, name: true, status: true },
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
    const body = (await request.json()) as RequestBody;
    const action = normalizeText(body.action);

    const current = await db.onboardingRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        convertedAdminId: true,
        metadata: true,
      },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Solicitação de acesso não encontrada." },
        { status: 404 },
      );
    }

    if (action === "updateLead") {
      const priority = normalizeText(body.priority).toUpperCase();
      const stage = normalizeText(body.stage).toUpperCase();
      const channel = normalizeOptional(body.channel);
      const source = normalizeOptional(body.source);
      const nextAction = normalizeOptional(body.nextAction);
      const internalNotes = normalizeOptional(body.internalNotes);
      const nextActionAt = normalizeDate(body.nextActionAt);
      const firstContactAt = normalizeDate(body.firstContactAt);
      const commercialOwnerId = normalizeOptional(body.commercialOwnerId);

      if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
        return NextResponse.json(
          { error: "Prioridade comercial inválida." },
          { status: 400 },
        );
      }

      if (!STAGES.includes(stage as (typeof STAGES)[number])) {
        return NextResponse.json(
          { error: "Estágio comercial inválido." },
          { status: 400 },
        );
      }

      let commercialOwner: {
        id: string;
        name: string;
        email: string;
      } | null = null;

      if (commercialOwnerId) {
        commercialOwner = await db.user.findFirst({
          where: {
            id: commercialOwnerId,
            role: Role.SUPER_ADMIN,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        });

        if (!commercialOwner) {
          return NextResponse.json(
            { error: "Responsável comercial inválido ou inativo." },
            { status: 400 },
          );
        }
      }

      const metadata = asObject(current.metadata);
      const previousLead = asObject(metadata.lead as Prisma.JsonValue | null);

      const updated = await db.onboardingRequest.update({
        where: { id },
        data: {
          metadata: {
            ...metadata,
            lead: {
              ...previousLead,
              priority,
              stage,
              channel,
              source,
              firstContactAt: firstContactAt?.toISOString() ?? null,
              nextActionAt: nextActionAt?.toISOString() ?? null,
              nextAction,
              internalNotes,
              commercialOwner,
              updatedAt: new Date().toISOString(),
              updatedByUserId: auth.authUser.id,
            },
          },
        },
        select: requestSelect(),
      });

      return NextResponse.json({
        message: "Informações comerciais atualizadas.",
        request: updated,
      });
    }

    const targetStatus =
      ACTION_STATUS_MAP[action as keyof typeof ACTION_STATUS_MAP];

    if (!targetStatus) {
      return NextResponse.json(
        { error: "Ação inválida para a solicitação de acesso." },
        { status: 400 },
      );
    }

    if (current.status === "CONVERTED" || current.convertedAdminId) {
      return NextResponse.json(
        {
          error:
            "Esta solicitação já foi convertida em administradora e não pode mais ter o status alterado.",
        },
        { status: 409 },
      );
    }

    const rejectionReason = normalizeText(body.rejectionReason);

    if (targetStatus === "REJECTED" && rejectionReason.length < 5) {
      return NextResponse.json(
        { error: "Informe um motivo para rejeitar a solicitação." },
        { status: 400 },
      );
    }

    const now = new Date();
    const metadata = asObject(current.metadata);
    const previousLead = asObject(metadata.lead as Prisma.JsonValue | null);

    const stageByStatus = {
      IN_CONTACT: "CONTATO",
      APPROVED: "NEGOCIACAO",
      REJECTED: "PERDIDO",
    } as const;

    const updated = await db.onboardingRequest.update({
      where: { id },
      data: {
        status: targetStatus,
        reviewedAt: now,
        reviewedByUserId: auth.authUser.id,
        rejectedAt: targetStatus === "REJECTED" ? now : null,
        rejectionReason: targetStatus === "REJECTED" ? rejectionReason : null,
        metadata: {
          ...metadata,
          lead: {
            ...previousLead,
            stage: stageByStatus[targetStatus],
            firstContactAt:
              targetStatus === "IN_CONTACT"
                ? previousLead.firstContactAt || now.toISOString()
                : previousLead.firstContactAt || null,
            updatedAt: now.toISOString(),
            updatedByUserId: auth.authUser.id,
          },
        },
      },
      select: requestSelect(),
    });

    const messages = {
      IN_CONTACT: "Solicitação marcada como em contato.",
      APPROVED: "Solicitação aprovada para conversão.",
      REJECTED: "Solicitação rejeitada com motivo registrado.",
    } as const;

    return NextResponse.json({
      message: messages[targetStatus],
      request: updated,
    });
  } catch (error) {
    console.error("Erro ao atualizar solicitação de onboarding:", error);

    return NextResponse.json(
      { error: "Não foi possível atualizar a solicitação de acesso." },
      { status: 500 },
    );
  }
}
