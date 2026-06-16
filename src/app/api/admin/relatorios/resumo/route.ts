import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   ETAPA 54.1 — RELATÓRIOS GERENCIAIS
   API de resumo geral dos relatórios administrativos.

   Objetivo:
   - Consolidar indicadores iniciais para a nova página
     /admin/relatorios.
   - Manter isolamento por administradora.
   - Preservar bloqueio de administradora inativa via guard.
   - Evitar acoplamento da página principal ao relatório antigo
     de chamados.
   ========================================================= */

type ReportSummarySection = {
  total: number;
  primary: number;
  secondary: number;
  alert: number;
};

type ReportSummaryResponse = {
  generatedAt: string;
  chamados: ReportSummarySection;
  financeiro: ReportSummarySection;
  comunicados: ReportSummarySection;
  assembleias: ReportSummarySection;
  enquetes: ReportSummarySection;
  fornecedores: ReportSummarySection;
};

function getDateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function safeCount(
  model: unknown,
  where?: Record<string, unknown>
): Promise<number> {
  try {
    const delegate = model as {
      count?: (args?: { where?: Record<string, unknown> }) => Promise<number>;
    };

    if (!delegate?.count) return 0;

    return await delegate.count(where ? { where } : undefined);
  } catch (error) {
    console.warn("[relatorios/resumo] Falha ao contar indicador:", error);
    return 0;
  }
}

async function getAdminContext() {
  const access = (await requireActiveAdminApiAccess()) as {
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
        { error: "Administradora não identificada para gerar relatórios." },
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

export async function GET() {
  try {
    const { errorResponse, administratorId } = await getAdminContext();

    if (errorResponse) return errorResponse;

    const adminWhere = {
      administratorId,
    };

    const last30Days = getDateDaysAgo(30);

    const database = db as unknown as {
      ticket?: unknown;
      communication?: unknown;
      assembly?: unknown;
      poll?: unknown;
      provider?: unknown;
      administratorProvider?: unknown;
      financialEntry?: unknown;
      financialTransaction?: unknown;
      financialLaunch?: unknown;
      monthlyFee?: unknown;
    };

    const financialModel =
      database.financialEntry ||
      database.financialTransaction ||
      database.financialLaunch;

    const [
      chamadosTotal,
      chamadosAbertos,
      chamadosResolvidos,
      chamadosVencidos,

      comunicadosTotal,
      comunicadosPublicados,
      comunicadosArquivados,

      assembleiasTotal,
      assembleiasEncerradas,
      assembleiasPublicadas,

      enquetesTotal,
      enquetesAbertas,
      enquetesEncerradas,

      fornecedoresHomologados,
      fornecedoresBloqueados,

      financeiroLancamentos,
      financeiroReceitas,
      financeiroDespesas,
      mensalidadesTotal,
    ] = await Promise.all([
      safeCount(database.ticket, adminWhere),
      safeCount(database.ticket, {
        ...adminWhere,
        status: "OPEN",
      }),
      safeCount(database.ticket, {
        ...adminWhere,
        status: "RESOLVED",
      }),
      safeCount(database.ticket, {
        ...adminWhere,
        status: {
          in: ["OPEN", "IN_PROGRESS"],
        },
        createdAt: {
          lt: last30Days,
        },
      }),

      safeCount(database.communication, adminWhere),
      safeCount(database.communication, {
        ...adminWhere,
        status: "PUBLISHED",
      }),
      safeCount(database.communication, {
        ...adminWhere,
        status: "ARCHIVED",
      }),

      safeCount(database.assembly, adminWhere),
      safeCount(database.assembly, {
        ...adminWhere,
        status: {
          in: ["CLOSED", "FINISHED", "ENDED"],
        },
      }),
      safeCount(database.assembly, {
        ...adminWhere,
        status: {
          in: ["PUBLISHED", "OPEN", "VOTING"],
        },
      }),

      safeCount(database.poll, adminWhere),
      safeCount(database.poll, {
        ...adminWhere,
        status: "OPEN",
      }),
      safeCount(database.poll, {
        ...adminWhere,
        status: {
          in: ["CLOSED", "ENDED"],
        },
      }),

      safeCount(database.administratorProvider, {
        ...adminWhere,
        status: {
          in: ["APPROVED", "HOMOLOGATED", "ACTIVE"],
        },
      }),
      safeCount(database.administratorProvider, {
        ...adminWhere,
        status: {
          in: ["BLOCKED", "INACTIVE"],
        },
      }),

      safeCount(financialModel, adminWhere),
      safeCount(financialModel, {
        ...adminWhere,
        type: "REVENUE",
      }),
      safeCount(financialModel, {
        ...adminWhere,
        type: "EXPENSE",
      }),
      safeCount(database.monthlyFee, adminWhere),
    ]);

    const response: ReportSummaryResponse = {
      generatedAt: new Date().toISOString(),

      chamados: {
        total: chamadosTotal,
        primary: chamadosAbertos,
        secondary: chamadosResolvidos,
        alert: chamadosVencidos,
      },

      financeiro: {
        total: financeiroLancamentos + mensalidadesTotal,
        primary: financeiroReceitas,
        secondary: financeiroDespesas,
        alert: mensalidadesTotal,
      },

      comunicados: {
        total: comunicadosTotal,
        primary: comunicadosPublicados,
        secondary: comunicadosArquivados,
        alert: Math.max(
          0,
          comunicadosTotal - comunicadosPublicados - comunicadosArquivados
        ),
      },

      assembleias: {
        total: assembleiasTotal,
        primary: assembleiasPublicadas,
        secondary: assembleiasEncerradas,
        alert: Math.max(0, assembleiasTotal - assembleiasEncerradas),
      },

      enquetes: {
        total: enquetesTotal,
        primary: enquetesAbertas,
        secondary: enquetesEncerradas,
        alert: Math.max(0, enquetesTotal - enquetesEncerradas),
      },

      fornecedores: {
        total: fornecedoresHomologados + fornecedoresBloqueados,
        primary: fornecedoresHomologados,
        secondary: fornecedoresBloqueados,
        alert: fornecedoresBloqueados,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[GET /api/admin/relatorios/resumo]", error);

    return NextResponse.json(
      { error: "Erro ao carregar resumo dos relatórios." },
      { status: 500 }
    );
  }
}