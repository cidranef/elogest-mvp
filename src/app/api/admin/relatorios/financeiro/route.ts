import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   ETAPA 54.3.1 — RELATÓRIO FINANCEIRO GERENCIAL

   API:
   /api/admin/relatorios/financeiro

   Ajuste:
   - Consulta alinhada ao schema real da Etapa 53:
     FinancialEntry, FinancialCategory, FinancialSettlement.
   - Considera valores em centavos: valueCents e amountCents.
   - Considera baixas financeiras por settlements.
   - Considera estornos por reversedAt ou settlement type REVERSAL.
   ========================================================= */

type FinancialKind = "REVENUE" | "EXPENSE" | "OTHER";

type FinancialStatus =
  | "PAID"
  | "OPEN"
  | "OVERDUE"
  | "CANCELED"
  | "REVERSED"
  | "OTHER";

type FinancialReportEntry = {
  id: string;
  type: FinancialKind;
  status: FinancialStatus;
  title: string;
  condominiumName: string;
  unitLabel: string;
  categoryName: string;
  competence: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
  amount: number;
  paidAmount: number;
  openAmount: number;
  source: string;
};

type FinancialReportResponse = {
  generatedAt: string;
  filters: {
    condominiumId: string;
    period: string;
    competence: string;
    status: string;
    category: string;
    type: string;
  };
  summary: {
    totalRevenue: number;
    paidRevenue: number;
    openRevenue: number;
    overdueRevenue: number;
    totalExpense: number;
    paidExpense: number;
    openExpense: number;
    overdueExpense: number;
    balance: number;
    totalEntries: number;
    paidEntries: number;
    openEntries: number;
    overdueEntries: number;
    reversedEntries: number;
  };
  entries: FinancialReportEntry[];
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

function centsToCurrency(valueCents: number | null | undefined) {
  return Number(valueCents || 0) / 100;
}

function toIsoString(value?: Date | string | null) {
  if (!value) return null;

  if (value instanceof Date) return value.toISOString();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatCompetence(value?: Date | string | null) {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function getUnitLabel(unit?: { block: string | null; unitNumber: string } | null) {
  if (!unit) return "-";

  return `${unit.block ? `${unit.block} - ` : ""}${unit.unitNumber}`;
}

function normalizeType(type: string): FinancialKind {
  if (type === "REVENUE") return "REVENUE";
  if (type === "EXPENSE") return "EXPENSE";

  return "OTHER";
}

function deriveStatus({
  status,
  dueDate,
  hasReversal,
}: {
  status: string;
  dueDate: Date;
  hasReversal: boolean;
}): FinancialStatus {
  if (status === "CANCELED") return "CANCELED";

  if (hasReversal) return "REVERSED";

  if (status === "PAID") return "PAID";

  if (status === "OVERDUE") return "OVERDUE";

  if (status === "OPEN" || status === "PARTIALLY_PAID") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    if (due < today) return "OVERDUE";

    return "OPEN";
  }

  return "OTHER";
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
  entries: FinancialReportEntry[],
  filters: FinancialReportResponse["filters"]
) {
  return entries.filter((entry) => {
    if (filters.type !== "ALL" && entry.type !== filters.type) return false;

    if (filters.status !== "ALL" && entry.status !== filters.status) {
      return false;
    }

    if (filters.category !== "ALL" && entry.categoryName !== filters.category) {
      return false;
    }

    if (filters.competence !== "ALL" && entry.competence !== filters.competence) {
      return false;
    }

    return true;
  });
}

function buildSummary(entries: FinancialReportEntry[]) {
  const activeEntries = entries.filter(
    (entry) => entry.status !== "CANCELED" && entry.status !== "REVERSED"
  );

  const revenues = activeEntries.filter((entry) => entry.type === "REVENUE");
  const expenses = activeEntries.filter((entry) => entry.type === "EXPENSE");

  const totalRevenue = revenues.reduce((sum, entry) => sum + entry.amount, 0);
  const paidRevenue = revenues.reduce((sum, entry) => sum + entry.paidAmount, 0);
  const openRevenue = revenues.reduce((sum, entry) => sum + entry.openAmount, 0);
  const overdueRevenue = revenues
    .filter((entry) => entry.status === "OVERDUE")
    .reduce((sum, entry) => sum + entry.openAmount, 0);

  const totalExpense = expenses.reduce((sum, entry) => sum + entry.amount, 0);
  const paidExpense = expenses.reduce((sum, entry) => sum + entry.paidAmount, 0);
  const openExpense = expenses.reduce((sum, entry) => sum + entry.openAmount, 0);
  const overdueExpense = expenses
    .filter((entry) => entry.status === "OVERDUE")
    .reduce((sum, entry) => sum + entry.openAmount, 0);

  return {
    totalRevenue,
    paidRevenue,
    openRevenue,
    overdueRevenue,
    totalExpense,
    paidExpense,
    openExpense,
    overdueExpense,
    balance: paidRevenue - paidExpense,
    totalEntries: entries.length,
    paidEntries: entries.filter((entry) => entry.status === "PAID").length,
    openEntries: entries.filter((entry) => entry.status === "OPEN").length,
    overdueEntries: entries.filter((entry) => entry.status === "OVERDUE").length,
    reversedEntries: entries.filter((entry) => entry.status === "REVERSED").length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { errorResponse, administratorId } = await getAdminContext();

    if (errorResponse) return errorResponse;

    const searchParams = request.nextUrl.searchParams;

    const filters: FinancialReportResponse["filters"] = {
      condominiumId: normalizeFilter(searchParams.get("condominiumId")),
      period: normalizeFilter(searchParams.get("period"), "30D"),
      competence: normalizeFilter(searchParams.get("competence")),
      status: normalizeFilter(searchParams.get("status")),
      category: normalizeFilter(searchParams.get("category")),
      type: normalizeFilter(searchParams.get("type")),
    };

    const createdAtStart = periodStart(filters.period);

    const rows = await db.financialEntry.findMany({
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
        unit: {
          select: {
            id: true,
            block: true,
            unitNumber: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        settlements: {
          select: {
            id: true,
            type: true,
            paidAt: true,
            amountCents: true,
            reversedAt: true,
          },
          orderBy: {
            paidAt: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 1000,
    });

    const entries = rows.map((entry): FinancialReportEntry => {
      const hasReversal = entry.settlements.some(
        (settlement) => settlement.type === "REVERSAL" || !!settlement.reversedAt
      );

      const status = deriveStatus({
        status: entry.status,
        dueDate: entry.dueDate,
        hasReversal,
      });

      const paidSettlements = entry.settlements.filter(
        (settlement) => settlement.type === "PAYMENT" && !settlement.reversedAt
      );

      const paidAmount = centsToCurrency(
        paidSettlements.reduce(
          (sum, settlement) => sum + settlement.amountCents,
          0
        )
      );

      const paidAt = paidSettlements[0]?.paidAt || null;
      const amount = centsToCurrency(entry.valueCents);

      const openAmount =
        status === "PAID" || status === "CANCELED" || status === "REVERSED"
          ? 0
          : Math.max(0, amount - paidAmount);

      return {
        id: entry.id,
        type: normalizeType(entry.type),
        status,
        title: entry.description,
        condominiumName: entry.condominium?.name || "Não informado",
        unitLabel: getUnitLabel(entry.unit),
        categoryName: entry.category?.name || "Sem categoria",
        competence: formatCompetence(entry.competence),
        dueDate: toIsoString(entry.dueDate),
        paidAt: toIsoString(paidAt),
        createdAt: toIsoString(entry.createdAt),
        amount,
        paidAmount,
        openAmount,
        source:
          entry.origin === "UNIT_CHARGE_BATCH" ||
          entry.origin === "UNIT_CHARGE_ADJUSTMENT"
            ? "Mensalidade"
            : "Lançamento",
      };
    });

    const filteredEntries = applyReportFilters(entries, filters);

    const response: FinancialReportResponse = {
      generatedAt: new Date().toISOString(),
      filters,
      summary: buildSummary(filteredEntries),
      entries: filteredEntries,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[GET /api/admin/relatorios/financeiro]", error);

    return NextResponse.json(
      { error: "Erro ao carregar relatório financeiro." },
      { status: 500 }
    );
  }
}
