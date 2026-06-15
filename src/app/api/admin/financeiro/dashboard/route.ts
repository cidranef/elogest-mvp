import { NextRequest, NextResponse } from "next/server";
import {
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialSettlementType,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireFinancialAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   ELOGEST — ETAPA 53.5
   API ADMIN — DASHBOARD FINANCEIRO

   Arquivo:
   src/app/api/admin/financeiro/dashboard/route.ts

   Objetivo:
   - Consolidar a visão gerencial inicial do Financeiro.
   - Calcular previsto, realizado, aberto e atrasado.
   - Resumir valores por condomínio.
   - Aplicar filtros por condomínio, competência, vencimento e status.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Exige módulo Financeiro liberado por plano ou override.
   - Isola tudo por administratorId do perfil ativo.
   ========================================================= */

type FinancialEntryDateFilter = Exclude<
  NonNullable<Prisma.FinancialEntryWhereInput["dueDate"]>,
  Date | string
>;

type DashboardEntry = {
  id: string;
  condominiumId: string;
  type: FinancialEntryType;
  status: FinancialEntryStatus;
  dueDate: Date;
  valueCents: number;
  condominium: {
    id: string;
    name: string;
  };
  settlements: {
    amountCents: number;
    interestCents: number;
    fineCents: number;
    discountCents: number;
  }[];
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanOptionalText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function parseDateFilter(value: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getTodayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return today;
}

function getEffectiveStatus(entry: {
  status: FinancialEntryStatus;
  dueDate: Date;
}) {
  if (
    entry.status === FinancialEntryStatus.OPEN ||
    entry.status === FinancialEntryStatus.PARTIALLY_PAID
  ) {
    const dueDate = new Date(entry.dueDate);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < getTodayStart()) {
      return FinancialEntryStatus.OVERDUE;
    }
  }

  return entry.status;
}

function parseParams(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  return {
    condominiumId: cleanOptionalText(searchParams.get("condominiumId")),
    status: cleanOptionalText(searchParams.get("status")),
    competenceFrom: cleanOptionalText(searchParams.get("competenceFrom")),
    competenceTo: cleanOptionalText(searchParams.get("competenceTo")),
    dueFrom: cleanOptionalText(searchParams.get("dueFrom")),
    dueTo: cleanOptionalText(searchParams.get("dueTo")),
  };
}

function buildWhere(params: ReturnType<typeof parseParams> & { administratorId: string }) {
  const where: Prisma.FinancialEntryWhereInput = {
    administratorId: params.administratorId,
  };

  if (params.condominiumId) {
    where.condominiumId = params.condominiumId;
  }

  if (params.status) {
    const status = params.status.toUpperCase();

    if (status === FinancialEntryStatus.OVERDUE) {
      where.status = {
        in: [FinancialEntryStatus.OPEN, FinancialEntryStatus.PARTIALLY_PAID],
      };
      where.dueDate = {
        lt: getTodayStart(),
      };
    } else if (Object.values(FinancialEntryStatus).includes(status as FinancialEntryStatus)) {
      where.status = status as FinancialEntryStatus;
    }
  }

  const competenceFrom = parseDateFilter(params.competenceFrom);
  const competenceTo = parseDateFilter(params.competenceTo);

  if (competenceFrom || competenceTo) {
    const competence: FinancialEntryDateFilter = {};
    if (competenceFrom) competence.gte = competenceFrom;
    if (competenceTo) competence.lte = competenceTo;
    where.competence = competence;
  }

  const dueFrom = parseDateFilter(params.dueFrom);
  const dueTo = parseDateFilter(params.dueTo);

  if (dueFrom || dueTo) {
    const existingDueDate =
      typeof where.dueDate === "object" &&
      where.dueDate !== null &&
      !(where.dueDate instanceof Date)
        ? (where.dueDate as FinancialEntryDateFilter)
        : {};

    const dueDate: FinancialEntryDateFilter = {
      ...existingDueDate,
    };

    if (dueFrom) dueDate.gte = dueFrom;
    if (dueTo) dueDate.lte = dueTo;

    where.dueDate = dueDate;
  }

  return where;
}

function buildSettlementSummary(entry: DashboardEntry) {
  const paidPrincipalCents = entry.settlements.reduce(
    (sum, settlement) => sum + settlement.amountCents,
    0,
  );
  const interestCents = entry.settlements.reduce(
    (sum, settlement) => sum + settlement.interestCents,
    0,
  );
  const fineCents = entry.settlements.reduce(
    (sum, settlement) => sum + settlement.fineCents,
    0,
  );
  const discountCents = entry.settlements.reduce(
    (sum, settlement) => sum + settlement.discountCents,
    0,
  );
  const netPaidCents = paidPrincipalCents + interestCents + fineCents - discountCents;
  const remainingPrincipalCents = Math.max(entry.valueCents - paidPrincipalCents, 0);

  return {
    paidPrincipalCents,
    interestCents,
    fineCents,
    discountCents,
    netPaidCents,
    remainingPrincipalCents,
  };
}

function emptyCondominiumSummary(condominium: DashboardEntry["condominium"]) {
  return {
    condominiumId: condominium.id,
    condominiumName: condominium.name,
    revenuePlannedCents: 0,
    revenueReceivedCents: 0,
    expensePlannedCents: 0,
    expensePaidCents: 0,
    openCents: 0,
    overdueCents: 0,
    entriesCount: 0,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const params = parseParams(request);
    const where = buildWhere({
      ...params,
      administratorId: auth.administratorId,
    });

    const entries = await db.financialEntry.findMany({
      where,
      include: {
        condominium: {
          select: {
            id: true,
            name: true,
          },
        },
        settlements: {
          where: {
            reversedAt: null,
            type: FinancialSettlementType.PAYMENT,
          },
          select: {
            amountCents: true,
            interestCents: true,
            fineCents: true,
            discountCents: true,
          },
        },
      },
      orderBy: [
        {
          condominium: {
            name: "asc",
          },
        },
        {
          dueDate: "asc",
        },
      ],
    });

    const byCondominium = new Map<string, ReturnType<typeof emptyCondominiumSummary>>();

    const kpis = {
      revenuePlannedCents: 0,
      revenueReceivedCents: 0,
      expensePlannedCents: 0,
      expensePaidCents: 0,
      plannedBalanceCents: 0,
      realizedBalanceCents: 0,
      openCents: 0,
      overdueCents: 0,
      totalEntries: entries.length,
      openEntries: 0,
      overdueEntries: 0,
      paidEntries: 0,
      partiallyPaidEntries: 0,
      canceledEntries: 0,
    };

    for (const entry of entries) {
      const summary = buildSettlementSummary(entry);
      const effectiveStatus = getEffectiveStatus(entry);

      if (!byCondominium.has(entry.condominiumId)) {
        byCondominium.set(entry.condominiumId, emptyCondominiumSummary(entry.condominium));
      }

      const condominiumSummary = byCondominium.get(entry.condominiumId)!;
      condominiumSummary.entriesCount += 1;

      if (entry.status === FinancialEntryStatus.CANCELED) {
        kpis.canceledEntries += 1;
        continue;
      }

      if (entry.status === FinancialEntryStatus.PAID) {
        kpis.paidEntries += 1;
      }

      if (entry.status === FinancialEntryStatus.PARTIALLY_PAID) {
        kpis.partiallyPaidEntries += 1;
      }

      if (effectiveStatus === FinancialEntryStatus.OVERDUE) {
        kpis.overdueEntries += 1;
      }

      if (
        entry.status === FinancialEntryStatus.OPEN ||
        entry.status === FinancialEntryStatus.PARTIALLY_PAID
      ) {
        kpis.openEntries += 1;
      }

      if (entry.type === FinancialEntryType.REVENUE) {
        kpis.revenuePlannedCents += entry.valueCents;
        kpis.revenueReceivedCents += summary.netPaidCents;
        condominiumSummary.revenuePlannedCents += entry.valueCents;
        condominiumSummary.revenueReceivedCents += summary.netPaidCents;
      }

      if (entry.type === FinancialEntryType.EXPENSE) {
        kpis.expensePlannedCents += entry.valueCents;
        kpis.expensePaidCents += summary.netPaidCents;
        condominiumSummary.expensePlannedCents += entry.valueCents;
        condominiumSummary.expensePaidCents += summary.netPaidCents;
      }

      kpis.openCents += summary.remainingPrincipalCents;
      condominiumSummary.openCents += summary.remainingPrincipalCents;

      if (effectiveStatus === FinancialEntryStatus.OVERDUE) {
        kpis.overdueCents += summary.remainingPrincipalCents;
        condominiumSummary.overdueCents += summary.remainingPrincipalCents;
      }
    }

    kpis.plannedBalanceCents = kpis.revenuePlannedCents - kpis.expensePlannedCents;
    kpis.realizedBalanceCents = kpis.revenueReceivedCents - kpis.expensePaidCents;

    return NextResponse.json({
      kpis,
      byCondominium: Array.from(byCondominium.values())
        .map((item) => ({
          ...item,
          plannedBalanceCents: item.revenuePlannedCents - item.expensePlannedCents,
          realizedBalanceCents: item.revenueReceivedCents - item.expensePaidCents,
        }))
        .sort((a, b) => a.condominiumName.localeCompare(b.condominiumName)),
      filters: params,
    });
  } catch (error) {
    console.error("Erro ao carregar dashboard financeiro:", error);

    return NextResponse.json(
      {
        error: "Erro ao carregar dashboard financeiro.",
      },
      {
        status: 500,
      },
    );
  }
}
