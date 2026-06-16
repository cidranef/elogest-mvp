import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   ETAPA 54.5 — RELATÓRIO DE ASSEMBLEIAS

   API:
   /api/admin/relatorios/assembleias

   Objetivo:
   - Consolidar assembleias da Etapa 51 e atas da Etapa 52.
   - Exibir participação, unidades aptas, votos, abstenções e
     resultados de pautas.
   - Respeitar isolamento por administratorId.
   ========================================================= */

type AssemblyReportEntry = {
  id: string;
  title: string;
  type: string;
  status: string;
  mode: string;
  condominiumName: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  votingStartsAt: string | null;
  votingEndsAt: string | null;
  openedAt: string | null;
  closedAt: string | null;
  resultsPublishedAt: string | null;
  convocationPublishedAt: string | null;
  createdAt: string;
  eligibleUnits: number;
  blockedUnits: number;
  activeRepresentations: number;
  revokedRepresentations: number;
  votes: number;
  directVotes: number;
  proxyVotes: number;
  abstentions: number;
  agendaItems: number;
  deliberativeAgendaItems: number;
  informativeAgendaItems: number;
  approvedAgendaItems: number;
  rejectedAgendaItems: number;
  noQuorumAgendaItems: number;
  manualReviewAgendaItems: number;
  deferredAgendaItems: number;
  canceledAgendaItems: number;
  participationRate: number;
  minuteStatus: string | null;
};

type AssemblyReportResponse = {
  generatedAt: string;
  filters: {
    condominiumId: string;
    period: string;
    status: string;
    type: string;
    agendaResult: string;
  };
  summary: {
    total: number;
    draft: number;
    scheduled: number;
    open: number;
    closed: number;
    resultsPublished: number;
    canceled: number;
    archived: number;
    eligibleUnits: number;
    votes: number;
    abstentions: number;
    activeRepresentations: number;
    agendaItems: number;
    approvedAgendaItems: number;
    rejectedAgendaItems: number;
    pendingAgendaItems: number;
    deferredAgendaItems: number;
    averageParticipationRate: number;
    minutesPublished: number;
  };
  entries: AssemblyReportEntry[];
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

function toIsoString(value?: Date | string | null) {
  if (!value) return null;

  if (value instanceof Date) return value.toISOString();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
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

function applyReportFilters(
  entries: AssemblyReportEntry[],
  filters: AssemblyReportResponse["filters"]
) {
  return entries.filter((entry) => {
    if (filters.status !== "ALL" && entry.status !== filters.status) {
      return false;
    }

    if (filters.type !== "ALL" && entry.type !== filters.type) {
      return false;
    }

    if (filters.agendaResult === "APPROVED" && entry.approvedAgendaItems <= 0) {
      return false;
    }

    if (filters.agendaResult === "REJECTED" && entry.rejectedAgendaItems <= 0) {
      return false;
    }

    if (
      filters.agendaResult === "PENDING" &&
      entry.manualReviewAgendaItems <= 0 &&
      entry.noQuorumAgendaItems <= 0
    ) {
      return false;
    }

    if (filters.agendaResult === "DEFERRED" && entry.deferredAgendaItems <= 0) {
      return false;
    }

    return true;
  });
}

function buildSummary(entries: AssemblyReportEntry[]) {
  const totalParticipation = entries.reduce(
    (sum, entry) => sum + entry.participationRate,
    0
  );

  const approvedAgendaItems = entries.reduce(
    (sum, entry) => sum + entry.approvedAgendaItems,
    0
  );

  const rejectedAgendaItems = entries.reduce(
    (sum, entry) => sum + entry.rejectedAgendaItems,
    0
  );

  const pendingAgendaItems = entries.reduce(
    (sum, entry) =>
      sum + entry.manualReviewAgendaItems + entry.noQuorumAgendaItems,
    0
  );

  return {
    total: entries.length,
    draft: entries.filter((entry) => entry.status === "DRAFT").length,
    scheduled: entries.filter((entry) => entry.status === "SCHEDULED").length,
    open: entries.filter((entry) => entry.status === "OPEN").length,
    closed: entries.filter((entry) => entry.status === "CLOSED").length,
    resultsPublished: entries.filter(
      (entry) => entry.status === "RESULTS_PUBLISHED"
    ).length,
    canceled: entries.filter((entry) => entry.status === "CANCELED").length,
    archived: entries.filter((entry) => entry.status === "ARCHIVED").length,
    eligibleUnits: entries.reduce((sum, entry) => sum + entry.eligibleUnits, 0),
    votes: entries.reduce((sum, entry) => sum + entry.votes, 0),
    abstentions: entries.reduce((sum, entry) => sum + entry.abstentions, 0),
    activeRepresentations: entries.reduce(
      (sum, entry) => sum + entry.activeRepresentations,
      0
    ),
    agendaItems: entries.reduce((sum, entry) => sum + entry.agendaItems, 0),
    approvedAgendaItems,
    rejectedAgendaItems,
    pendingAgendaItems,
    deferredAgendaItems: entries.reduce(
      (sum, entry) => sum + entry.deferredAgendaItems,
      0
    ),
    averageParticipationRate:
      entries.length > 0 ? Math.round(totalParticipation / entries.length) : 0,
    minutesPublished: entries.filter((entry) => entry.minuteStatus === "PUBLISHED")
      .length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { errorResponse, administratorId } = await getAdminContext();

    if (errorResponse) return errorResponse;

    const searchParams = request.nextUrl.searchParams;

    const filters: AssemblyReportResponse["filters"] = {
      condominiumId: normalizeFilter(searchParams.get("condominiumId")),
      period: normalizeFilter(searchParams.get("period"), "30D"),
      status: normalizeFilter(searchParams.get("status")),
      type: normalizeFilter(searchParams.get("type")),
      agendaResult: normalizeFilter(searchParams.get("agendaResult")),
    };

    const createdAtStart = periodStart(filters.period);

    const assemblies = await db.assembly.findMany({
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
        eligibleUnits: {
          select: {
            id: true,
            status: true,
          },
        },
        representations: {
          select: {
            id: true,
            status: true,
          },
        },
        agendaItems: {
          select: {
            id: true,
            type: true,
            status: true,
            resultStatus: true,
            votes: {
              select: {
                id: true,
              },
            },
          },
        },
        votes: {
          select: {
            id: true,
            origin: true,
            options: {
              select: {
                option: {
                  select: {
                    isAbstention: true,
                  },
                },
              },
            },
          },
        },
        minute: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 1000,
    });

    const entries = assemblies.map((assembly): AssemblyReportEntry => {
      const eligibleUnits = assembly.eligibleUnits.filter(
        (unit) => unit.status === "ELIGIBLE"
      ).length;

      const blockedUnits = assembly.eligibleUnits.filter(
        (unit) => unit.status === "BLOCKED"
      ).length;

      const activeRepresentations = assembly.representations.filter(
        (representation) => representation.status === "ACTIVE"
      ).length;

      const revokedRepresentations = assembly.representations.filter(
        (representation) => representation.status === "REVOKED"
      ).length;

      const votes = assembly.votes.length;

      const abstentions = assembly.votes.filter((vote) =>
        vote.options.some((voteOption) => voteOption.option.isAbstention)
      ).length;

      const directVotes = assembly.votes.filter(
        (vote) => vote.origin === "DIRECT_UNIT_LINK" || vote.origin === "AUTHORIZED_LINK"
      ).length;

      const proxyVotes = assembly.votes.filter(
        (vote) => vote.origin === "PROXY_REPRESENTATION"
      ).length;

      const deliberativeAgendaItems = assembly.agendaItems.filter(
        (item) => item.type !== "INFORMATIVE"
      ).length;

      const informativeAgendaItems = assembly.agendaItems.filter(
        (item) => item.type === "INFORMATIVE"
      ).length;

      return {
        id: assembly.id,
        title: assembly.title,
        type: assembly.type,
        status: assembly.status,
        mode: assembly.mode,
        condominiumName: assembly.condominium?.name || "Não informado",
        scheduledStartAt: toIsoString(assembly.scheduledStartAt),
        scheduledEndAt: toIsoString(assembly.scheduledEndAt),
        votingStartsAt: toIsoString(assembly.votingStartsAt),
        votingEndsAt: toIsoString(assembly.votingEndsAt),
        openedAt: toIsoString(assembly.openedAt),
        closedAt: toIsoString(assembly.closedAt),
        resultsPublishedAt: toIsoString(assembly.resultsPublishedAt),
        convocationPublishedAt: toIsoString(assembly.convocationPublishedAt),
        createdAt: toIsoString(assembly.createdAt) || new Date().toISOString(),
        eligibleUnits,
        blockedUnits,
        activeRepresentations,
        revokedRepresentations,
        votes,
        directVotes,
        proxyVotes,
        abstentions,
        agendaItems: assembly.agendaItems.length,
        deliberativeAgendaItems,
        informativeAgendaItems,
        approvedAgendaItems: assembly.agendaItems.filter(
          (item) => item.resultStatus === "APPROVED"
        ).length,
        rejectedAgendaItems: assembly.agendaItems.filter(
          (item) => item.resultStatus === "REJECTED"
        ).length,
        noQuorumAgendaItems: assembly.agendaItems.filter(
          (item) => item.resultStatus === "NO_QUORUM"
        ).length,
        manualReviewAgendaItems: assembly.agendaItems.filter(
          (item) => item.resultStatus === "MANUAL_REVIEW" || item.resultStatus === "PENDING"
        ).length,
        deferredAgendaItems: assembly.agendaItems.filter(
          (item) => item.resultStatus === "DEFERRED"
        ).length,
        canceledAgendaItems: assembly.agendaItems.filter(
          (item) => item.resultStatus === "CANCELED"
        ).length,
        participationRate: percentage(votes, eligibleUnits),
        minuteStatus: assembly.minute?.status || null,
      };
    });

    const filteredEntries = applyReportFilters(entries, filters);

    const response: AssemblyReportResponse = {
      generatedAt: new Date().toISOString(),
      filters,
      summary: buildSummary(filteredEntries),
      entries: filteredEntries,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[GET /api/admin/relatorios/assembleias]", error);

    return NextResponse.json(
      { error: "Erro ao carregar relatório de assembleias." },
      { status: 500 }
    );
  }
}
