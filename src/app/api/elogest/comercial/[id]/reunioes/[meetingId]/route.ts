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

type RouteContext = {
  params: Promise<{ id: string; meetingId: string }>;
};

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

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id, meetingId } = await params;
  const current = await db.commercialMeeting.findFirst({
    where: { id: meetingId, commercialLeadProfileId: id },
  });
  if (!current) {
    return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const interestLevel = optionalNumber(body.interestLevel);
  if (interestLevel !== null && (interestLevel < 0 || interestLevel > 5)) {
    return NextResponse.json(
      { error: "O nível de interesse deve ficar entre 0 e 5." },
      { status: 400 },
    );
  }

  const type = Object.values(CommercialMeetingType).includes(
    body.type as CommercialMeetingType,
  )
    ? (body.type as CommercialMeetingType)
    : current.type;
  const status = Object.values(CommercialMeetingStatus).includes(
    body.status as CommercialMeetingStatus,
  )
    ? (body.status as CommercialMeetingStatus)
    : current.status;

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

  const updated = await db.$transaction(async (tx) => {
    const meeting = await tx.commercialMeeting.update({
      where: { id: meetingId },
      data: {
        type,
        status,
        title: optionalText(body.title) ?? current.title,
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
        ownerUserId: optionalText(body.ownerUserId),
        updatedByUserId: auth.authUser.id,
      },
    });

    await tx.commercialLeadProfile.update({
      where: { id },
      data: {
        lastContactAt:
          status === CommercialMeetingStatus.COMPLETED ? new Date() : undefined,
        nextFollowUpAt: meeting.followUpAt ?? undefined,
      },
    });

    await tx.commercialLeadLog.create({
      data: {
        commercialLeadProfileId: id,
        action: CommercialLeadLogAction.NOTE_ADDED,
        description: `Reunião comercial atualizada: ${meeting.title}.`,
        metadata: {
          meetingId: meeting.id,
          meetingStatus: meeting.status,
          followUpAt: meeting.followUpAt?.toISOString() ?? null,
        },
        createdByUserId: auth.authUser.id,
      },
    });

    return meeting;
  });

  return NextResponse.json({ meeting: updated });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id, meetingId } = await params;
  const current = await db.commercialMeeting.findFirst({
    where: { id: meetingId, commercialLeadProfileId: id },
    select: { id: true, title: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
  }

  await db.$transaction([
    db.commercialMeeting.delete({ where: { id: meetingId } }),
    db.commercialLeadLog.create({
      data: {
        commercialLeadProfileId: id,
        action: CommercialLeadLogAction.NOTE_ADDED,
        description: `Reunião comercial removida: ${current.title}.`,
        metadata: { meetingId },
        createdByUserId: auth.authUser.id,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
