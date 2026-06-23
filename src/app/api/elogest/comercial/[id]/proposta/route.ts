import { randomUUID } from "node:crypto";
import {
  CommercialLeadLogAction,
  CommercialLeadStage,
  CommercialProposalEventType,
  CommercialProposalStatus,
  type Prisma,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  snapshot,
  token,
  tokenHash,
  toPrismaJson,
} from "@/lib/commercial-proposal";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const proposalInclude = {
  plan: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  versions: {
    orderBy: {
      version: "desc" as const,
    },
  },
  events: {
    orderBy: {
      createdAt: "desc" as const,
    },
  },
};

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function optionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function optionalJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  return toPrismaJson(value);
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const proposal = await db.commercialProposal.findUnique({
    where: { commercialLeadProfileId: id },
    include: proposalInclude,
  });

  return NextResponse.json({ proposal });
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  const lead = await db.commercialLeadProfile.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!lead) {
    return NextResponse.json(
      { error: "Lead não encontrado." },
      { status: 404 },
    );
  }

  const existingProposal = await db.commercialProposal.findUnique({
    where: { commercialLeadProfileId: id },
    select: { id: true },
  });

  if (existingProposal) {
    return NextResponse.json(
      { error: "Este lead já possui proposta." },
      { status: 409 },
    );
  }

  const title = optionalText(body.title);
  if (!title) {
    return NextResponse.json(
      { error: "Informe o título." },
      { status: 400 },
    );
  }

  const publicToken = token();

  const created = await db.$transaction(async (tx) => {
    const proposal = await tx.commercialProposal.create({
      data: {
        id: randomUUID(),
        commercialLeadProfileId: id,
        planId: optionalText(body.planId),
        title,
        monthlyPriceCents: optionalNumber(body.monthlyPriceCents),
        implementationFeeCents: optionalNumber(
          body.implementationFeeCents,
        ),
        discountCents: optionalNumber(body.discountCents) ?? 0,
        discountPercent: optionalNumber(body.discountPercent),
        validUntil: optionalDate(body.validUntil),
        paymentTerms: optionalText(body.paymentTerms),
        commercialNotes: optionalText(body.commercialNotes),
        modules: stringArray(body.modules),
        limits: optionalJson(body.limits),
        publicTokenHash: tokenHash(publicToken),
        publicTokenExpiresAt: optionalDate(body.publicTokenExpiresAt),
        createdByUserId: auth.authUser.id,
      },
      include: proposalInclude,
    });

    await tx.commercialProposalVersion.create({
      data: {
        id: randomUUID(),
        commercialProposalId: proposal.id,
        version: 1,
        snapshot: snapshot(
          proposal as unknown as Record<string, unknown>,
        ),
        createdByUserId: auth.authUser.id,
      },
    });

    await tx.commercialProposalEvent.create({
      data: {
        id: randomUUID(),
        commercialProposalId: proposal.id,
        type: CommercialProposalEventType.CREATED,
        description: "Proposta comercial criada.",
        createdByUserId: auth.authUser.id,
      },
    });

    await tx.commercialLeadLog.create({
      data: {
        commercialLeadProfileId: id,
        action: CommercialLeadLogAction.NOTE_ADDED,
        description: `Proposta comercial criada: ${title}.`,
        createdByUserId: auth.authUser.id,
      },
    });

    return proposal;
  });

  return NextResponse.json(
    { proposal: created, publicToken },
    { status: 201 },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  const current = await db.commercialProposal.findUnique({
    where: { commercialLeadProfileId: id },
    include: proposalInclude,
  });

  if (!current) {
    return NextResponse.json(
      { error: "Proposta não encontrada." },
      { status: 404 },
    );
  }

  if (current.status === CommercialProposalStatus.ACCEPTED) {
    return NextResponse.json(
      { error: "Proposta aceita não pode ser alterada." },
      { status: 409 },
    );
  }

  const requestedStatus = body.status as CommercialProposalStatus;
  const status = Object.values(CommercialProposalStatus).includes(
    requestedStatus,
  )
    ? requestedStatus
    : current.status;

  const nextVersion = current.currentVersion + 1;

  const updated = await db.$transaction(async (tx) => {
    const proposal = await tx.commercialProposal.update({
      where: { id: current.id },
      data: {
        planId: optionalText(body.planId),
        title: optionalText(body.title) ?? current.title,
        monthlyPriceCents: optionalNumber(body.monthlyPriceCents),
        implementationFeeCents: optionalNumber(
          body.implementationFeeCents,
        ),
        discountCents: optionalNumber(body.discountCents) ?? 0,
        discountPercent: optionalNumber(body.discountPercent),
        validUntil: optionalDate(body.validUntil),
        paymentTerms: optionalText(body.paymentTerms),
        commercialNotes: optionalText(body.commercialNotes),
        modules: stringArray(body.modules),
        limits: optionalJson(body.limits),
        status,
        currentVersion: nextVersion,
        updatedByUserId: auth.authUser.id,
        sentAt:
          status === CommercialProposalStatus.SENT
            ? current.sentAt ?? new Date()
            : current.sentAt,
      },
      include: proposalInclude,
    });

    await tx.commercialProposalVersion.create({
      data: {
        id: randomUUID(),
        commercialProposalId: proposal.id,
        version: nextVersion,
        snapshot: snapshot(
          proposal as unknown as Record<string, unknown>,
        ),
        createdByUserId: auth.authUser.id,
      },
    });

    await tx.commercialProposalEvent.create({
      data: {
        id: randomUUID(),
        commercialProposalId: proposal.id,
        type: CommercialProposalEventType.VERSION_CREATED,
        description: `Versão ${nextVersion} registrada.`,
        createdByUserId: auth.authUser.id,
      },
    });

    if (status !== current.status) {
      await tx.commercialProposalEvent.create({
        data: {
          id: randomUUID(),
          commercialProposalId: proposal.id,
          type:
            status === CommercialProposalStatus.SENT
              ? CommercialProposalEventType.SENT
              : CommercialProposalEventType.UPDATED,
          description: `Status alterado para ${status}.`,
          createdByUserId: auth.authUser.id,
        },
      });

      if (status === CommercialProposalStatus.SENT) {
        await tx.commercialLeadProfile.update({
          where: { id },
          data: {
            stage: CommercialLeadStage.PROPOSAL_SENT,
            lastContactAt: new Date(),
          },
        });
      }
    }

    return proposal;
  });

  return NextResponse.json({ proposal: updated });
}

export async function PUT(
  _request: NextRequest,
  { params }: RouteContext,
) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const current = await db.commercialProposal.findUnique({
    where: { commercialLeadProfileId: id },
    select: { id: true },
  });

  if (!current) {
    return NextResponse.json(
      { error: "Proposta não encontrada." },
      { status: 404 },
    );
  }

  const publicToken = token();
  await db.commercialProposal.update({
    where: { id: current.id },
    data: {
      publicTokenHash: tokenHash(publicToken),
      publicTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      updatedByUserId: auth.authUser.id,
    },
  });

  return NextResponse.json({ publicToken });
}
