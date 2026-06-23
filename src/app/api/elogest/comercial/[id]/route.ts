import { NextResponse } from "next/server";
import type {
  CommercialLeadPriority,
  CommercialLeadStage,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;

  const item = await db.commercialLeadProfile.findUnique({
    where: { id },
    select: {
      id: true,
      stage: true,
      priority: true,
      score: true,
      ownerUserId: true,
      nextFollowUpAt: true,
      lastContactAt: true,
      qualifiedAt: true,
      lostAt: true,
      lostReason: true,
      strategicPotential: true,
      investorInterest: true,
      notes: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      onboardingRequest: {
        select: {
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
          createdAt: true,
          updatedAt: true,
          interestedPlan: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          convertedAdmin: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      },
      ownerUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      logs: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          action: true,
          fromStage: true,
          toStage: true,
          score: true,
          description: true,
          metadata: true,
          createdByUserId: true,
          createdAt: true,
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!item) {
    return NextResponse.json(
      { error: "Lead comercial não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json(item);
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!body) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const current = await db.commercialLeadProfile.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json(
      { error: "Lead comercial não encontrado." },
      { status: 404 },
    );
  }

  const stage = String(body.stage || current.stage) as CommercialLeadStage;
  const priority = String(
    body.priority || current.priority,
  ) as CommercialLeadPriority;
  const ownerUserId =
    typeof body.ownerUserId === "string" && body.ownerUserId
      ? body.ownerUserId
      : null;
  const notes =
    typeof body.notes === "string" ? body.notes.trim() || null : current.notes;
  const lostReason =
    typeof body.lostReason === "string"
      ? body.lostReason.trim() || null
      : current.lostReason;
  const strategicPotential = Boolean(body.strategicPotential);
  const investorInterest = Boolean(body.investorInterest);
  const nextFollowUpAt =
    typeof body.nextFollowUpAt === "string" && body.nextFollowUpAt
      ? new Date(body.nextFollowUpAt)
      : null;

  const changedStage = stage !== current.stage;
  const changedOwner = ownerUserId !== current.ownerUserId;

  const updated = await db.$transaction(async (tx) => {
    const profile = await tx.commercialLeadProfile.update({
      where: { id },
      data: {
        stage,
        priority,
        ownerUserId,
        nextFollowUpAt,
        notes,
        lostReason: stage === "LOST" ? lostReason : null,
        lostAt: stage === "LOST" ? current.lostAt ?? new Date() : null,
        qualifiedAt:
          stage === "QUALIFIED"
            ? current.qualifiedAt ?? new Date()
            : current.qualifiedAt,
        strategicPotential,
        investorInterest,
        lastContactAt:
          changedStage && stage === "CONTACTED"
            ? new Date()
            : current.lastContactAt,
      },
    });

    const logs = [];

    if (changedStage) {
      logs.push({
        commercialLeadProfileId: id,
        action: "STAGE_CHANGED" as const,
        fromStage: current.stage,
        toStage: stage,
        description: "Estágio comercial atualizado.",
        createdByUserId: auth.authUser.id,
      });
    }

    if (changedOwner) {
      logs.push({
        commercialLeadProfileId: id,
        action: "OWNER_ASSIGNED" as const,
        description: ownerUserId
          ? "Responsável comercial atualizado."
          : "Responsável comercial removido.",
        createdByUserId: auth.authUser.id,
      });
    }

    if (logs.length === 0) {
      logs.push({
        commercialLeadProfileId: id,
        action: "PROFILE_UPDATED" as const,
        description: "Perfil comercial atualizado.",
        createdByUserId: auth.authUser.id,
      });
    }

    await tx.commercialLeadLog.createMany({ data: logs });

    return profile;
  });

  return NextResponse.json({ ok: true, item: updated });
}
