import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { db } from "@/lib/db";
import {
  getOperationalAiModuleAccess,
  getOperationalAiStatus,
} from "@/lib/ai/operational-ai";

/* =========================================================
   ETAPA 55.8 — AUDITORIA, LOGS E GOVERNANÇA DA IA

   Rota:
   /api/admin/ia/logs

   Objetivo:
   - Listar usos da IA Operacional da administradora ativa.
   - Expor indicadores de sucesso, fallback, erro e ações.
   - Preservar isolamento por administratorId.
   - Não executar nenhuma ação operacional.
   ========================================================= */

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value || "");

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseDateStart(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00.000`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parseDateEnd(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T23:59:59.999`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function buildWhere(params: URLSearchParams, administratorId: string) {
  const module = params.get("module")?.trim() || "";
  const action = params.get("action")?.trim() || "";
  const status = params.get("status")?.trim() || "";
  const q = params.get("q")?.trim() || "";
  const startDate = parseDateStart(params.get("startDate"));
  const endDate = parseDateEnd(params.get("endDate"));

  const where: Prisma.AiOperationLogWhereInput = {
    administratorId,
  };

  if (module && module !== "ALL") {
    where.module = module;
  }

  if (action && action !== "ALL") {
    where.action = action;
  }

  if (status && status !== "ALL") {
    where.status = status;
  }

  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { module: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { outputPreview: { contains: q, mode: "insensitive" } },
      { errorMessage: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

export async function GET(request: Request) {
  const access = await requireActiveAdminApiAccess();

  if ("error" in access) {
    return access.error;
  }

  const { administrator } = access;
  const administratorId = administrator.id;
  const url = new URL(request.url);
  const params = url.searchParams;
  const page = parsePositiveInteger(params.get("page"), 1);
  const pageSize = Math.min(
    parsePositiveInteger(params.get("pageSize"), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const where = buildWhere(params, administratorId);
  const baseWhere: Prisma.AiOperationLogWhereInput = {
    administratorId,
  };
  const moduleAccess = await getOperationalAiModuleAccess(administratorId);
  const aiStatus = getOperationalAiStatus();

  if (!moduleAccess.allowed) {
    return NextResponse.json(
      {
        error:
          moduleAccess.reason ||
          "Módulo IA Operacional indisponível para esta administradora.",
        moduleEnabled: false,
        moduleAccess,
        aiStatus,
      },
      { status: 403 },
    );
  }

  const skip = (page - 1) * pageSize;

  const [logs, total, totalLogs, successLogs, errorLogs, skippedLogs, optionRows] =
    await Promise.all([
      db.aiOperationLog.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: pageSize,
        select: {
          id: true,
          administratorId: true,
          userId: true,
          module: true,
          action: true,
          entityType: true,
          entityId: true,
          promptVersion: true,
          status: true,
          inputHash: true,
          outputHash: true,
          outputPreview: true,
          errorMessage: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      db.aiOperationLog.count({ where }),
      db.aiOperationLog.count({ where: baseWhere }),
      db.aiOperationLog.count({ where: { ...baseWhere, status: "SUCCESS" } }),
      db.aiOperationLog.count({ where: { ...baseWhere, status: "ERROR" } }),
      db.aiOperationLog.count({ where: { ...baseWhere, status: "SKIPPED" } }),
      db.aiOperationLog.findMany({
        where: baseWhere,
        orderBy: {
          createdAt: "desc",
        },
        take: 500,
        select: {
          module: true,
          action: true,
          status: true,
        },
      }),
    ]);

  const modules = Array.from(
    new Set(optionRows.map((item) => item.module).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const actions = Array.from(
    new Set(optionRows.map((item) => item.action).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const statuses = Array.from(
    new Set(optionRows.map((item) => item.status).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    aiStatus,
    moduleEnabled: true,
    moduleAccess,
    logs,
    options: {
      modules,
      actions,
      statuses,
    },
    kpis: {
      totalLogs,
      successLogs,
      errorLogs,
      skippedLogs,
      filteredLogs: total,
    },
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
