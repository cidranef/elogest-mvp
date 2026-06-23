import { randomUUID } from "node:crypto";
import {
  CommercialLeadLogAction,
  CommercialMeetingStatus,
  CommercialMeetingType,
  Prisma,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { db } from "@/lib/db";
import { normalizeStringArray } from "@/lib/commercial-meeting";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function optionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function optionalNumber(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const lead = await db.commercialLeadProfile.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead comercial não encontrado." }, { status: 404 });
  }

  const meetings = await db.commercialMeeting.findMany({
    where: { commercialLeadProfileId: id },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ meetings });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  const lead = await db.commercialLeadProfile.findUnique({
    where: { id },
    select: { id: true, ownerUserId: true },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead comercial não encontrado." }, { status: 404 });
  }

  const title = optionalText(body.title);
  if (!title) {
    return NextResponse.json({ error: "Informe o título da reunião." }, { status: 400 });
  }

  const type = Object.values(CommercialMeetingType).includes(
    body.type as CommercialMeetingType,
  )
    ? (body.type as CommercialMeetingType)
    : CommercialMeetingType.DISCOVERY;

  const status = Object.values(CommercialMeetingStatus).includes(
    body.status as CommercialMeetingStatus,
  )
    ? (body.status as CommercialMeetingStatus)
    : CommercialMeetingStatus.SCHEDULED;

  const interestLevel = optionalNumber(body.interestLevel);
  if (interestLevel !== null && (interestLevel < 0 || interestLevel > 5)) {
    return NextResponse.json(
      { error: "O nível de interesse deve ficar entre 0 e 5." },
      { status: 400 },
    );
  }

  const participants = Array.isArray(body.participants)
    ? body.participants
        .map((participant) => {
          if (!participant || typeof participant !== "object") return null;
          const item = participant as Record<string, unknown>;
          const name = optionalText(item.name);
          if (!name) return null;
          return {
            name,
            role: optionalText(item.role),
            email: optionalText(item.email),
          };
        })
        .filter(Boolean)
    : [];

  const meeting = await db.$transaction(async (tx) => {
    const created = await tx.commercialMeeting.create({
      data: {
        id: randomUUID(),
        commercialLeadProfileId: id,
        type,
        status,
        title,
        scheduledAt: optionalDate(body.scheduledAt),
        startedAt: optionalDate(body.startedAt),
        endedAt: optionalDate(body.endedAt),
        durationMinutes: optionalNumber(body.durationMinutes),
        participants: JSON.parse(JSON.stringify(participants)) as Prisma.InputJsonValue,
        scriptUsed: optionalText(body.scriptUsed),
        modulesPresented: normalizeStringArray(body.modulesPresented),
        painsIdentified: normalizeStringArray(body.painsIdentified),
        objections: normalizeStringArray(body.objections),
        interestLevel,
        summary: optionalText(body.summary),
        nextStep: optionalText(body.nextStep),
        followUpAt: optionalDate(body.followUpAt),
        ownerUserId: optionalText(body.ownerUserId) ?? lead.ownerUserId,
        createdByUserId: auth.authUser.id,
        metadata: Prisma.JsonNull,
      },
    });

    await tx.commercialLeadProfile.update({
      where: { id },
      data: {
        lastContactAt:
          status === CommercialMeetingStatus.COMPLETED ? new Date() : undefined,
        nextFollowUpAt: created.followUpAt ?? undefined,
      },
    });

    await tx.commercialLeadLog.create({
      data: {
        commercialLeadProfileId: id,
        action: CommercialLeadLogAction.NOTE_ADDED,
        description:
          status === CommercialMeetingStatus.COMPLETED
            ? `Reunião comercial registrada: ${title}.`
            : `Reunião comercial agendada: ${title}.`,
        metadata: {
          meetingId: created.id,
          meetingType: created.type,
          meetingStatus: created.status,
          followUpAt: created.followUpAt?.toISOString() ?? null,
        },
        createdByUserId: auth.authUser.id,
      },
    });

    return created;
  });

  return NextResponse.json({ meeting }, { status: 201 });
}
