import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   ETAPA 54.6 — RELATÓRIO DE ENQUETES

   API:
   /api/admin/relatorios/enquetes

   Objetivo:
   - Consolidar enquetes da Etapa 50.
   - Exibir abertura, encerramento, respostas, participação,
     resultados publicados e opções mais votadas.
   - Respeitar isolamento por administratorId.
   - Consultar de forma defensiva os models:
     Poll, PollTarget, PollOption, PollResponse e PollResponseOption.
   ========================================================= */

type PollReportEntry = {
  id: string;
  title: string;
  type: string;
  status: string;
  condominiumName: string;
  targetScope: string;
  targetCount: number;
  optionCount: number;
  responseCount: number;
  openAnswerCount: number;
  participationRate: number;
  topOptionLabel: string;
  topOptionVotes: number;
  resultsPublished: boolean;
  allowResponseChange: boolean;
  startsAt: string | null;
  endsAt: string | null;
  closedAt: string | null;
  resultsPublishedAt: string | null;
  createdAt: string;
};

type PollReportResponse = {
  generatedAt: string;
  filters: {
    condominiumId: string;
    period: string;
    status: string;
    type: string;
    participation: string;
  };
  summary: {
    total: number;
    draft: number;
    scheduled: number;
    open: number;
    closed: number;
    archived: number;
    resultsPublished: number;
    totalTargets: number;
    totalResponses: number;
    totalOpenAnswers: number;
    averageParticipationRate: number;
    withoutParticipation: number;
  };
  entries: PollReportEntry[];
};

type AdminAccessResult = {
  administratorId?: string;
  activeAccess?: {
    administratorId?: string | null;
  } | null;
  user?: {
    activeAccess?: {
      administratorId?: string | null;
    } | null;
  } | null;
  error?: string;
  status?: number;
};

type UnknownRecord = Record<string, unknown>;

type PrismaDelegate = {
  findMany?: (args?: UnknownRecord) => Promise<UnknownRecord[]>;
};

function toIsoString(value: unknown) {
  if (!value) return null;

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  return null;
}

function toText(value: unknown, fallback = "-") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);

  return fallback;
}

function toBoolean(value: unknown) {
  return value === true;
}

function asArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? (value as UnknownRecord[]) : [];
}

function periodStart(period: string) {
  if (period === "ALL") return null;

  const days = period === "7D" ? 7 : period === "90D" ? 90 : 30;
  const date = new Date();

  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);

  return date;
}

function normalizeFilter(value: string | null, fallback = "ALL") {
  const text = String(value || "").trim();
  return text || fallback;
}

function percentage(part: number, total: number) {
  if (total <= 0) return part > 0 ? 100 : 0;
  return Math.round((part / total) * 100);
}

async function safeFindMany(model: unknown, args?: UnknownRecord) {
  try {
    const delegate = model as PrismaDelegate;

    if (!delegate?.findMany) return [];

    return await delegate.findMany(args);
  } catch (error) {
    console.warn("[relatorios/enquetes] Falha ao consultar model:", error);
    return [];
  }
}

async function getAdminContext() {
  const access = (await requireActiveAdminApiAccess()) as AdminAccessResult;

  if (access?.error) {
    return {
      errorResponse: NextResponse.json(
        { error: access.error },
        { status: access.status || 403 }
      ),
      administratorId: null,
    };
  }

  const administratorId =
    access?.administratorId ||
    access?.activeAccess?.administratorId ||
    access?.user?.activeAccess?.administratorId ||
    null;

  if (!administratorId) {
    return {
      errorResponse: NextResponse.json(
        { error: "Administradora não identificada para gerar o relatório." },
        { status: 403 }
      ),
      administratorId: null,
    };
  }

  return {
    errorResponse: null,
    administratorId,
  };
}

function getCondominiumName(poll: UnknownRecord) {
  const condominium = poll.condominium;

  if (condominium && typeof condominium === "object") {
    return toText((condominium as UnknownRecord).name, "Não informado");
  }

  return toText(poll.condominiumName, "Não informado");
}

function getOptionLabel(option: UnknownRecord) {
  return toText(
    option.label ?? option.title ?? option.text ?? option.value ?? option.name,
    "Opção"
  );
}

function getOptionVoteCount(option: UnknownRecord, optionResponses: UnknownRecord[]) {
  const explicitCount = option.responseCount ?? option.votesCount ?? option.count;

  if (typeof explicitCount === "number") return explicitCount;

  const optionId = toText(option.id, "");

  if (!optionId) return 0;

  return optionResponses.filter((responseOption) => {
    return (
      toText(responseOption.optionId, "") === optionId ||
      toText(responseOption.pollOptionId, "") === optionId
    );
  }).length;
}

function getTopOption(
  options: UnknownRecord[],
  responseOptions: UnknownRecord[]
) {
  if (options.length === 0) {
    return {
      label: "-",
      votes: 0,
    };
  }

  const ranked = options
    .map((option) => ({
      label: getOptionLabel(option),
      votes: getOptionVoteCount(option, responseOptions),
    }))
    .sort((a, b) => b.votes - a.votes);

  return ranked[0] || { label: "-", votes: 0 };
}

function isOpenAnswerResponse(response: UnknownRecord) {
  return !!(
    response.openAnswer ||
    response.answer ||
    response.textAnswer ||
    response.freeText ||
    response.comment
  );
}

function normalizeEntry(
  poll: UnknownRecord,
  responseOptions: UnknownRecord[]
): PollReportEntry {
  const targets = asArray(poll.targets);
  const options = asArray(poll.options);
  const responses = asArray(poll.responses);
  const targetCount =
    targets.length ||
    Number(poll.targetCount || poll.targetsCount || poll.eligibleCount || 0);

  const responseCount =
    responses.length ||
    Number(poll.responseCount || poll.responsesCount || poll.totalResponses || 0);

  const topOption = getTopOption(options, responseOptions);
  const resultsPublishedAt = toIsoString(
    poll.resultsPublishedAt ?? poll.resultPublishedAt ?? poll.publishedResultsAt
  );

  return {
    id: toText(poll.id, crypto.randomUUID()),
    title: toText(poll.title ?? poll.name ?? poll.question, "Enquete"),
    type: toText(poll.type, "OTHER"),
    status: toText(poll.status, "DRAFT"),
    condominiumName: getCondominiumName(poll),
    targetScope: toText(poll.targetScope ?? poll.targetMode ?? poll.scope, "Não informado"),
    targetCount,
    optionCount: options.length,
    responseCount,
    openAnswerCount: responses.filter(isOpenAnswerResponse).length,
    participationRate: percentage(responseCount, targetCount),
    topOptionLabel: topOption.label,
    topOptionVotes: topOption.votes,
    resultsPublished: !!resultsPublishedAt || toBoolean(poll.resultsPublished),
    allowResponseChange: toBoolean(
      poll.allowResponseChange ?? poll.allowChange ?? poll.canChangeResponse
    ),
    startsAt: toIsoString(poll.startsAt ?? poll.startAt ?? poll.openAt),
    endsAt: toIsoString(poll.endsAt ?? poll.endAt ?? poll.deadlineAt),
    closedAt: toIsoString(poll.closedAt),
    resultsPublishedAt,
    createdAt: toIsoString(poll.createdAt) || new Date().toISOString(),
  };
}

function applyReportFilters(
  entries: PollReportEntry[],
  filters: PollReportResponse["filters"]
) {
  return entries.filter((entry) => {
    if (filters.status !== "ALL" && entry.status !== filters.status) return false;
    if (filters.type !== "ALL" && entry.type !== filters.type) return false;

    if (filters.participation === "WITH_RESPONSES" && entry.responseCount <= 0) {
      return false;
    }

    if (filters.participation === "WITHOUT_RESPONSES" && entry.responseCount > 0) {
      return false;
    }

    if (filters.participation === "LOW" && entry.participationRate >= 50) {
      return false;
    }

    if (filters.participation === "HIGH" && entry.participationRate < 50) {
      return false;
    }

    return true;
  });
}

function buildSummary(entries: PollReportEntry[]) {
  const totalTargets = entries.reduce((sum, entry) => sum + entry.targetCount, 0);
  const totalResponses = entries.reduce(
    (sum, entry) => sum + entry.responseCount,
    0
  );

  return {
    total: entries.length,
    draft: entries.filter((entry) => entry.status === "DRAFT").length,
    scheduled: entries.filter((entry) => entry.status === "SCHEDULED").length,
    open: entries.filter((entry) => entry.status === "OPEN").length,
    closed: entries.filter((entry) => entry.status === "CLOSED").length,
    archived: entries.filter((entry) => entry.status === "ARCHIVED").length,
    resultsPublished: entries.filter((entry) => entry.resultsPublished).length,
    totalTargets,
    totalResponses,
    totalOpenAnswers: entries.reduce(
      (sum, entry) => sum + entry.openAnswerCount,
      0
    ),
    averageParticipationRate:
      entries.length > 0
        ? Math.round(
            entries.reduce((sum, entry) => sum + entry.participationRate, 0) /
              entries.length
          )
        : 0,
    withoutParticipation: entries.filter((entry) => entry.responseCount === 0)
      .length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { errorResponse, administratorId } = await getAdminContext();

    if (errorResponse) return errorResponse;

    const searchParams = request.nextUrl.searchParams;

    const filters: PollReportResponse["filters"] = {
      condominiumId: normalizeFilter(searchParams.get("condominiumId")),
      period: normalizeFilter(searchParams.get("period"), "30D"),
      status: normalizeFilter(searchParams.get("status")),
      type: normalizeFilter(searchParams.get("type")),
      participation: normalizeFilter(searchParams.get("participation")),
    };

    const createdAtStart = periodStart(filters.period);

    const database = db as unknown as {
      poll?: unknown;
      pollResponseOption?: unknown;
    };

    const polls = await safeFindMany(database.poll, {
      where: {
        administratorId,
        ...(filters.condominiumId !== "ALL"
          ? { condominiumId: filters.condominiumId }
          : {}),
        ...(createdAtStart
          ? {
              createdAt: {
                gte: createdAtStart,
              },
            }
          : {}),
      },
      include: {
        condominium: {
          select: {
            id: true,
            name: true,
          },
        },
        targets: true,
        options: true,
        responses: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 1000,
    });

    const pollIds = polls.map((poll) => toText(poll.id, "")).filter(Boolean);

    const responseOptions =
      pollIds.length > 0
        ? await safeFindMany(database.pollResponseOption, {
            where: {
              response: {
                pollId: {
                  in: pollIds,
                },
              },
            },
            select: {
              id: true,
              optionId: true,
              pollOptionId: true,
              responseId: true,
              response: {
                select: {
                  pollId: true,
                },
              },
            },
            take: 10000,
          })
        : [];

    const entries = polls.map((poll) => {
      const pollId = toText(poll.id, "");

      const relatedResponseOptions = responseOptions.filter((responseOption) => {
        const response = responseOption.response;

        return (
          response &&
          typeof response === "object" &&
          toText((response as UnknownRecord).pollId, "") === pollId
        );
      });

      return normalizeEntry(poll, relatedResponseOptions);
    });

    const filteredEntries = applyReportFilters(entries, filters);

    const response: PollReportResponse = {
      generatedAt: new Date().toISOString(),
      filters,
      summary: buildSummary(filteredEntries),
      entries: filteredEntries,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[GET /api/admin/relatorios/enquetes]", error);

    return NextResponse.json(
      { error: "Erro ao carregar relatório de enquetes." },
      { status: 500 }
    );
  }
}
