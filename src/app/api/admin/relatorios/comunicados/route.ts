import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   ETAPA 54.4 — RELATÓRIO DE COMUNICADOS

   API:
   /api/admin/relatorios/comunicados

   Objetivo:
   - Consolidar comunicados da Etapa 48.
   - Exibir publicações, arquivamentos, leituras e pendências.
   - Respeitar isolamento por administratorId.
   - Usar models reais:
     Announcement, AnnouncementTarget, AnnouncementReading.
   ========================================================= */

type AnnouncementReportStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
type AnnouncementReportPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

type AnnouncementReportEntry = {
  id: string;
  title: string;
  type: string;
  status: AnnouncementReportStatus;
  priority: AnnouncementReportPriority;
  targetScope: string;
  condominiumName: string;
  blocks: string[];
  targetCount: number;
  readingCount: number;
  pendingCount: number;
  readingRate: number;
  requireReadingConfirmation: boolean;
  publishAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  eventStartAt: string | null;
  eventEndAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type AnnouncementReportResponse = {
  generatedAt: string;
  filters: {
    condominiumId: string;
    period: string;
    status: string;
    block: string;
    type: string;
    priority: string;
  };
  summary: {
    total: number;
    drafts: number;
    scheduled: number;
    published: number;
    archived: number;
    requireConfirmation: number;
    totalTargets: number;
    totalReadings: number;
    totalPending: number;
    readingRate: number;
    urgent: number;
  };
  entries: AnnouncementReportEntry[];
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

function normalizeRate(readingCount: number, targetCount: number) {
  if (targetCount <= 0) return readingCount > 0 ? 100 : 0;
  return Math.round((readingCount / targetCount) * 100);
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
  entries: AnnouncementReportEntry[],
  filters: AnnouncementReportResponse["filters"]
) {
  return entries.filter((entry) => {
    if (filters.status !== "ALL" && entry.status !== filters.status) {
      return false;
    }

    if (filters.type !== "ALL" && entry.type !== filters.type) {
      return false;
    }

    if (filters.priority !== "ALL" && entry.priority !== filters.priority) {
      return false;
    }

    if (
      filters.block !== "ALL" &&
      !entry.blocks.some((block) => block === filters.block)
    ) {
      return false;
    }

    return true;
  });
}

function buildSummary(entries: AnnouncementReportEntry[]) {
  const totalTargets = entries.reduce((sum, entry) => sum + entry.targetCount, 0);
  const totalReadings = entries.reduce((sum, entry) => sum + entry.readingCount, 0);
  const totalPending = entries.reduce((sum, entry) => sum + entry.pendingCount, 0);

  return {
    total: entries.length,
    drafts: entries.filter((entry) => entry.status === "DRAFT").length,
    scheduled: entries.filter((entry) => entry.status === "SCHEDULED").length,
    published: entries.filter((entry) => entry.status === "PUBLISHED").length,
    archived: entries.filter((entry) => entry.status === "ARCHIVED").length,
    requireConfirmation: entries.filter((entry) => entry.requireReadingConfirmation)
      .length,
    totalTargets,
    totalReadings,
    totalPending,
    readingRate: normalizeRate(totalReadings, totalTargets),
    urgent: entries.filter((entry) => entry.priority === "URGENT").length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { errorResponse, administratorId } = await getAdminContext();

    if (errorResponse) return errorResponse;

    const searchParams = request.nextUrl.searchParams;

    const filters: AnnouncementReportResponse["filters"] = {
      condominiumId: normalizeFilter(searchParams.get("condominiumId")),
      period: normalizeFilter(searchParams.get("period"), "30D"),
      status: normalizeFilter(searchParams.get("status")),
      block: normalizeFilter(searchParams.get("block")),
      type: normalizeFilter(searchParams.get("type")),
      priority: normalizeFilter(searchParams.get("priority")),
    };

    const createdAtStart = periodStart(filters.period);

    const announcements = await db.announcement.findMany({
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
        targets: {
          select: {
            id: true,
            block: true,
            condominiumId: true,
            unitId: true,
            role: true,
            linkType: true,
          },
        },
        readings: {
          select: {
            id: true,
            readAt: true,
          },
        },
        logs: {
          where: {
            action: "ARCHIVED",
          },
          select: {
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 1000,
    });

    const entries = announcements.map((announcement): AnnouncementReportEntry => {
      const targetCount = announcement.targets.length;
      const readingCount = announcement.readings.length;
      const requireConfirmation = announcement.requireReadingConfirmation;
      const pendingCount = requireConfirmation
        ? Math.max(0, targetCount - readingCount)
        : 0;

      const blocks = Array.from(
        new Set(
          announcement.targets
            .map((target) => target.block)
            .filter((block): block is string => !!block)
        )
      ).sort((a, b) => a.localeCompare(b, "pt-BR"));

      return {
        id: announcement.id,
        title: announcement.title,
        type: announcement.type,
        status: announcement.status,
        priority: announcement.priority,
        targetScope: announcement.targetScope,
        condominiumName: announcement.condominium?.name || "Todos os condomínios",
        blocks,
        targetCount,
        readingCount,
        pendingCount,
        readingRate: normalizeRate(readingCount, targetCount),
        requireReadingConfirmation: requireConfirmation,
        publishAt: toIsoString(announcement.publishAt),
        publishedAt: toIsoString(announcement.publishedAt),
        archivedAt: toIsoString(announcement.logs[0]?.createdAt || null),
        eventStartAt: toIsoString(announcement.eventStartAt),
        eventEndAt: toIsoString(announcement.eventEndAt),
        expiresAt: toIsoString(announcement.expiresAt),
        createdAt: toIsoString(announcement.createdAt) || new Date().toISOString(),
      };
    });

    const filteredEntries = applyReportFilters(entries, filters);

    const response: AnnouncementReportResponse = {
      generatedAt: new Date().toISOString(),
      filters,
      summary: buildSummary(filteredEntries),
      entries: filteredEntries,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[GET /api/admin/relatorios/comunicados]", error);

    return NextResponse.json(
      { error: "Erro ao carregar relatório de comunicados." },
      { status: 500 }
    );
  }
}
