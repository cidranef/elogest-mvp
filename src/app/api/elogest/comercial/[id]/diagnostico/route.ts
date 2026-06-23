import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import {
  createDiagnosisToken,
  DIAGNOSIS_DEFAULT_VALID_DAYS,
  diagnosisPublicUrl,
  hashDiagnosisToken,
  tokenHint,
} from "@/lib/commercial-diagnosis";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

type ImportResult = {
  qualificationUrl: string;
  created: boolean;
  reopenedForReview: boolean;
  updatedFields: string[];
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}


const SYSTEM_ALIASES: Record<string, string> = {
  "Sistema de gestão condominial": "Sistema Condominial",
  "Sistema financeiro": "Sistema Financeiro",
  "Sistema de chamados": "Sistema De Chamados",
  "Plataforma de assembleias": "Plataforma De Assembleias",
  "Armazenamento em nuvem": "Armazenamento Em Nuvem",
  "Documentos físicos": "Documentos Físicos",
};

const PAIN_ALIASES: Record<string, string> = {
  "Informações dispersas": "Informações Dispersas",
  "Retrabalho da equipe": "Retrabalho",
  "Falta de rastreabilidade": "Falta De Rastreabilidade",
  "Chamados sem acompanhamento": "Chamados Sem Controle",
  "Comunicação sem comprovação": "Comunicação Sem Comprovação",
  "Fornecedores desorganizados": "Fornecedores Desorganizados",
  "Assembleias trabalhosas": "Assembleias Trabalhosas",
  "Produção demorada de atas": "Produção Demorada De Atas",
  "Financeiro fragmentado": "Financeiro Fragmentado",
  "Falta de relatórios": "Falta De Relatórios",
  "Dificuldade para escalar a carteira": "Dificuldade Para Crescer",
  "Baixa participação dos usuários": "Baixa Participação Dos Usuários",
};

const MODULE_ALIASES: Record<string, string> = {
  "Condomínios, unidades e moradores": "Condomínios, Unidades E Moradores",
  "Reuniões de conselho": "Reuniões",
  "Assembleias e votação": "Assembleias",
  "Ata com IA": "Ata Com IA",
  "Relatórios gerenciais": "Relatórios",
  "Portal do síndico e moradores": "Portal",
};

const OBJECTION_ALIASES: Record<string, string> = {
  "Tempo para implantação": "Implantação",
  "Resistência da equipe": "Resistência Da Equipe",
  "Uso pelos moradores": "Uso Pelos Moradores",
  "Migração de dados": "Migração De Dados",
  "Segurança e LGPD": "Segurança/LGPD",
  "Já utiliza outro sistema": "Já Possui Outro Sistema",
};

function canonicalize(values: string[], aliases: Record<string, string>) {
  return uniqueStrings(values.map((value) => aliases[value] ?? value));
}

function formatExternalNote(value: string | null, importedAt: Date) {
  if (!value) return null;

  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(importedAt);

  return `[Diagnóstico Externo Importado Em ${date}]\n${value}`;
}

export async function GET(_request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const lead = await db.commercialLeadProfile.findUnique({
    where: { id },
    select: {
      id: true,
      diagnosisLinks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          tokenHint: true,
          status: true,
          expiresAt: true,
          openedAt: true,
          startedAt: true,
          lastSavedAt: true,
          completedAt: true,
          revokedAt: true,
          respondentName: true,
          respondentEmail: true,
          importedAt: true,
          createdAt: true,
          createdByUser: {
            select: {
              name: true,
              email: true,
            },
          },
          events: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              type: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!lead) {
    return NextResponse.json(
      { error: "Lead comercial não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json({ items: lead.diagnosisLinks });
}

export async function POST(request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    validDays?: unknown;
  } | null;

  const requestedDays = Number(
    body?.validDays ?? DIAGNOSIS_DEFAULT_VALID_DAYS,
  );
  const validDays = Math.min(
    30,
    Math.max(
      1,
      Number.isFinite(requestedDays)
        ? Math.round(requestedDays)
        : DIAGNOSIS_DEFAULT_VALID_DAYS,
    ),
  );

  const lead = await db.commercialLeadProfile.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!lead) {
    return NextResponse.json(
      { error: "Lead comercial não encontrado." },
      { status: 404 },
    );
  }

  const token = createDiagnosisToken();
  const expiresAt = new Date(
    Date.now() + validDays * 24 * 60 * 60 * 1000,
  );

  const item = await db.$transaction(async (tx) => {
    const created = await tx.commercialDiagnosisLink.create({
      data: {
        commercialLeadProfileId: id,
        tokenHash: hashDiagnosisToken(token),
        tokenHint: tokenHint(token),
        expiresAt,
        createdByUserId: auth.authUser.id,
      },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        tokenHint: true,
        createdAt: true,
      },
    });

    await tx.commercialDiagnosisEvent.create({
      data: {
        commercialDiagnosisLinkId: created.id,
        type: "LINK_CREATED",
        metadata: { validDays },
      },
    });

    await tx.commercialLeadLog.create({
      data: {
        commercialLeadProfileId: id,
        action: "PROFILE_UPDATED",
        description: `Link de diagnóstico externo criado com validade de ${validDays} dia(s).`,
        createdByUserId: auth.authUser.id,
      },
    });

    return created;
  });

  return NextResponse.json({
    ok: true,
    item,
    url: diagnosisPublicUrl(token),
  });
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    linkId?: unknown;
    action?: unknown;
  } | null;

  const linkId = typeof body?.linkId === "string" ? body.linkId : "";
  const action = typeof body?.action === "string" ? body.action : "";

  if (!linkId || !["REVOKE", "IMPORT"].includes(action)) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const link = await db.commercialDiagnosisLink.findFirst({
    where: {
      id: linkId,
      commercialLeadProfileId: id,
    },
    select: {
      id: true,
      status: true,
      responses: true,
      importedAt: true,
      completedAt: true,
      respondentName: true,
      respondentEmail: true,
    },
  });

  if (!link) {
    return NextResponse.json(
      { error: "Link de diagnóstico não encontrado." },
      { status: 404 },
    );
  }

  if (action === "REVOKE") {
    if (link.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Um diagnóstico concluído não pode ser revogado." },
        { status: 409 },
      );
    }

    await db.$transaction([
      db.commercialDiagnosisLink.update({
        where: { id: link.id },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
        },
      }),
      db.commercialDiagnosisEvent.create({
        data: {
          commercialDiagnosisLinkId: link.id,
          type: "REVOKED",
        },
      }),
      db.commercialLeadLog.create({
        data: {
          commercialLeadProfileId: id,
          action: "PROFILE_UPDATED",
          description: "Link de diagnóstico externo revogado.",
          createdByUserId: auth.authUser.id,
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  }

  if (link.status !== "COMPLETED" || !link.responses || link.importedAt) {
    return NextResponse.json(
      {
        error:
          "O diagnóstico precisa estar concluído e ainda não importado.",
      },
      { status: 409 },
    );
  }

  const responses = link.responses as Record<string, unknown>;
  const stringList = (key: string) =>
    Array.isArray(responses[key])
      ? (responses[key] as unknown[]).filter(
          (value): value is string => typeof value === "string",
        )
      : [];
  const text = (key: string) =>
    typeof responses[key] === "string"
      ? String(responses[key]).trim() || null
      : null;
  const integer = (key: string) => {
    if (responses[key] === "" || responses[key] == null) return null;
    const value = Number(responses[key]);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  };

  const currentSystems = canonicalize(
    uniqueStrings([
      ...stringList("currentSystems").filter((value) => value !== "Outros"),
      text("currentSystemsOther")
        ? `Outros: ${text("currentSystemsOther")}`
        : null,
    ]),
    SYSTEM_ALIASES,
  );
  const painPoints = canonicalize(
    uniqueStrings([
      ...stringList("painPoints").filter((value) => value !== "Outros"),
      text("painPointsOther")
        ? `Outros: ${text("painPointsOther")}`
        : null,
    ]),
    PAIN_ALIASES,
  );
  const desiredModules = canonicalize(
    stringList("desiredModules"),
    MODULE_ALIASES,
  );
  const objections = canonicalize(
    stringList("objections"),
    OBJECTION_ALIASES,
  );
  const importedAt = new Date();
  const externalNote = formatExternalNote(
    text("additionalNotes"),
    importedAt,
  );

  const answersJson = JSON.parse(
    JSON.stringify({
      ...responses,
      source: "EXTERNAL_DIAGNOSIS",
      diagnosisLinkId: link.id,
      importedAt: importedAt.toISOString(),
      respondentName: link.respondentName,
      respondentEmail: link.respondentEmail,
    }),
  ) as Prisma.InputJsonValue;

  const result = await db.$transaction<ImportResult>(async (tx) => {
    const existing = await tx.commercialLeadQualification.findUnique({
      where: { commercialLeadProfileId: id },
    });

    const notes = uniqueStrings([
      existing?.notes ?? null,
      externalNote,
    ]).join("\n\n") || null;

    const qualification = await tx.commercialLeadQualification.upsert({
      where: { commercialLeadProfileId: id },
      create: {
        commercialLeadProfileId: id,
        status: "DRAFT",
        yearsInMarket: integer("yearsInMarket"),
        condominiumCount: integer("condominiumCount"),
        unitCount: integer("unitCount"),
        teamSize: integer("teamSize"),
        currentSystems,
        painPoints,
        primaryPain: text("primaryPain"),
        desiredModules,
        urgency: text("urgency"),
        decisionRole: text("decisionRole"),
        budgetStatus: text("budgetStatus"),
        pilotReadiness: text("pilotReadiness"),
        competitorName: text("competitorName"),
        objections,
        notes,
        answers: answersJson,
        updatedByUserId: auth.authUser.id,
      },
      update: {
        status: "DRAFT",
        yearsInMarket: integer("yearsInMarket"),
        condominiumCount: integer("condominiumCount"),
        unitCount: integer("unitCount"),
        teamSize: integer("teamSize"),
        currentSystems,
        painPoints,
        primaryPain: text("primaryPain"),
        desiredModules,
        urgency: text("urgency"),
        decisionRole: text("decisionRole"),
        budgetStatus: text("budgetStatus"),
        pilotReadiness: text("pilotReadiness"),
        competitorName: text("competitorName"),
        objections,
        notes,
        answers: answersJson,
        completedAt: null,
        updatedByUserId: auth.authUser.id,
      },
    });

    const revisionCount =
      await tx.commercialLeadQualificationRevision.count({
        where: {
          commercialLeadQualificationId: qualification.id,
        },
      });

    const snapshot = JSON.parse(
      JSON.stringify(qualification),
    ) as Prisma.InputJsonValue;

    await tx.commercialLeadQualificationRevision.create({
      data: {
        commercialLeadQualificationId: qualification.id,
        revisionNumber: revisionCount + 1,
        status: qualification.status,
        classification: qualification.classification,
        totalScore: qualification.totalScore,
        snapshot,
        createdByUserId: auth.authUser.id,
      },
    });

    await tx.commercialDiagnosisLink.update({
      where: { id: link.id },
      data: {
        importedAt,
        importedByUserId: auth.authUser.id,
      },
    });

    await tx.commercialDiagnosisEvent.create({
      data: {
        commercialDiagnosisLinkId: link.id,
        type: "IMPORTED",
        metadata: {
          qualificationId: qualification.id,
          existingQualificationUpdated: Boolean(existing),
          preservedTotalScore: qualification.totalScore,
          preservedClassification: qualification.classification,
        },
      },
    });

    await tx.commercialLeadProfile.update({
      where: { id },
      data: {
        stage: "DIAGNOSIS_RECEIVED",
        lastContactAt: importedAt,
      },
    });

    await tx.commercialLeadLog.create({
      data: {
        commercialLeadProfileId: id,
        action: "PROFILE_UPDATED",
        description: existing
          ? "Diagnóstico externo importado e qualificação existente atualizada para revisão. Notas, pontuação e classificação internas foram preservadas."
          : "Diagnóstico externo importado e qualificação criada para revisão.",
        metadata: {
          qualificationId: qualification.id,
          diagnosisLinkId: link.id,
          existingQualificationUpdated: Boolean(existing),
          importedAt: importedAt.toISOString(),
        },
        createdByUserId: auth.authUser.id,
      },
    });

    return {
      qualificationUrl: `/elogest/comercial/${id}/qualificacao`,
      created: !existing,
      reopenedForReview: Boolean(existing?.status === "COMPLETED"),
      updatedFields: [
        "yearsInMarket",
        "condominiumCount",
        "unitCount",
        "teamSize",
        "currentSystems",
        "painPoints",
        "primaryPain",
        "desiredModules",
        "urgency",
        "decisionRole",
        "budgetStatus",
        "pilotReadiness",
        "competitorName",
        "objections",
        "notes",
        "answers",
      ],
    };
  });

  return NextResponse.json({
    ok: true,
    ...result,
    message: result.created
      ? "Qualificação criada a partir do diagnóstico externo. Revise as informações antes de concluir."
      : "Qualificação existente atualizada. A pontuação, a classificação e as notas internas foram preservadas.",
  });
}
