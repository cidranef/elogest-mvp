import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashDiagnosisToken,
  requestIp,
  safeInteger,
  safeText,
  stringArray,
} from "@/lib/commercial-diagnosis";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ token: string }>;
};

async function resolveLink(token: string) {
  return db.commercialDiagnosisLink.findUnique({
    where: { tokenHash: hashDiagnosisToken(token) },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      openedAt: true,
      startedAt: true,
      completedAt: true,
      responses: true,
      respondentName: true,
      respondentEmail: true,
      respondentPhone: true,
      consentAcceptedAt: true,
      privacyAcknowledgedAt: true,
      commercialLeadProfile: {
        select: {
          onboardingRequest: {
            select: {
              administratorName: true,
              responsibleName: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

function normalizedStatus(
  status: "ACTIVE" | "COMPLETED" | "EXPIRED" | "REVOKED",
  expiresAt: Date,
) {
  if (status === "ACTIVE" && expiresAt.getTime() < Date.now()) {
    return "EXPIRED" as const;
  }

  return status;
}

export async function GET(request: Request, context: Context) {
  const { token } = await context.params;
  const item = await resolveLink(token);

  if (!item) {
    return NextResponse.json(
      { error: "Link inválido ou não encontrado." },
      { status: 404 },
    );
  }

  const status = normalizedStatus(item.status, item.expiresAt);

  if (status === "EXPIRED" && item.status === "ACTIVE") {
    await db.commercialDiagnosisLink.update({
      where: { id: item.id },
      data: { status: "EXPIRED" },
    });
  }

  if (status === "ACTIVE" && !item.openedAt) {
    await db.$transaction([
      db.commercialDiagnosisLink.update({
        where: { id: item.id },
        data: { openedAt: new Date() },
      }),
      db.commercialDiagnosisEvent.create({
        data: {
          commercialDiagnosisLinkId: item.id,
          type: "OPENED",
          ipAddress: requestIp(request),
          userAgent: request.headers.get("user-agent"),
        },
      }),
    ]);
  }

  return NextResponse.json({
    item: {
      status,
      expiresAt: item.expiresAt,
      completedAt: item.completedAt,
      administratorName:
        item.commercialLeadProfile.onboardingRequest.administratorName,
      contactName:
        item.commercialLeadProfile.onboardingRequest.responsibleName,
      contactEmail: item.commercialLeadProfile.onboardingRequest.email,
      respondentName: item.respondentName,
      respondentEmail: item.respondentEmail,
      respondentPhone: item.respondentPhone,
      consentAccepted: Boolean(item.consentAcceptedAt),
      privacyAcknowledged: Boolean(item.privacyAcknowledgedAt),
      responses: item.responses,
    },
  });
}

export async function PATCH(request: Request, context: Context) {
  const { token } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!body) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const item = await resolveLink(token);

  if (!item) {
    return NextResponse.json(
      { error: "Link inválido ou não encontrado." },
      { status: 404 },
    );
  }

  const status = normalizedStatus(item.status, item.expiresAt);

  if (status !== "ACTIVE") {
    return NextResponse.json(
      {
        error:
          status === "COMPLETED"
            ? "Este diagnóstico já foi enviado."
            : "Este link não está mais disponível.",
      },
      { status: 409 },
    );
  }

  const completed = Boolean(body.completed);
  const consentAccepted = body.consentAccepted === true;
  const privacyAcknowledged = body.privacyAcknowledged === true;
  const respondentName = safeText(body.respondentName, 200);
  const respondentEmail = safeText(body.respondentEmail, 320)?.toLowerCase();
  const primaryPain = safeText(body.primaryPain, 2000);

  if (completed && !respondentName) {
    return NextResponse.json(
      { error: "Informe o nome do responsável pelo preenchimento." },
      { status: 400 },
    );
  }

  if (completed && !respondentEmail) {
    return NextResponse.json(
      { error: "Informe um e-mail para contato." },
      { status: 400 },
    );
  }

  if (completed && !primaryPain) {
    return NextResponse.json(
      {
        error:
          "Descreva qual problema mais impacta a operação atualmente.",
      },
      { status: 400 },
    );
  }

  if (completed && (!consentAccepted || !privacyAcknowledged)) {
    return NextResponse.json(
      {
        error:
          "É necessário aceitar o tratamento das informações e declarar ciência da Política de Privacidade.",
      },
      { status: 400 },
    );
  }

  const responses = {
    yearsInMarket: safeInteger(body.yearsInMarket),
    condominiumCount: safeInteger(body.condominiumCount),
    unitCount: safeInteger(body.unitCount),
    teamSize: safeInteger(body.teamSize),
    currentSystems: stringArray(body.currentSystems),
    currentSystemsOther: safeText(body.currentSystemsOther, 500),
    painPoints: stringArray(body.painPoints),
    painPointsOther: safeText(body.painPointsOther, 500),
    primaryPain,
    desiredModules: stringArray(body.desiredModules),
    urgency: safeText(body.urgency, 200),
    decisionRole: safeText(body.decisionRole, 200),
    budgetStatus: safeText(body.budgetStatus, 200),
    pilotReadiness: safeText(body.pilotReadiness, 200),
    competitorName: safeText(body.competitorName, 300),
    objections: stringArray(body.objections),
    additionalNotes: safeText(body.additionalNotes, 4000),
  };

  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.commercialDiagnosisLink.update({
      where: { id: item.id },
      data: {
        respondentName,
        respondentEmail: respondentEmail ?? null,
        respondentPhone: safeText(body.respondentPhone, 60),
        responses,
        startedAt: item.startedAt ?? now,
        lastSavedAt: now,
        status: completed ? "COMPLETED" : "ACTIVE",
        completedAt: completed ? now : null,
        consentAcceptedAt: consentAccepted
          ? item.consentAcceptedAt ?? now
          : null,
        privacyAcknowledgedAt: privacyAcknowledged
          ? item.privacyAcknowledgedAt ?? now
          : null,
      },
    });

    await tx.commercialDiagnosisEvent.create({
      data: {
        commercialDiagnosisLinkId: item.id,
        type: completed
          ? "COMPLETED"
          : item.startedAt
            ? "DRAFT_SAVED"
            : "STARTED",
        ipAddress: requestIp(request),
        userAgent: request.headers.get("user-agent"),
      },
    });
  });

  return NextResponse.json({ ok: true, completed });
}
