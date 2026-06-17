import crypto from "crypto";

import { db } from "@/lib/db";

export const OPERATIONAL_AI_MODULE_SLUG = "ia_operacional";

export type OperationalAiProvider = "openai" | "none";

export type OperationalAiStatus = {
  enabled: boolean;
  provider: OperationalAiProvider;
  reason?: string;
};

export type OperationalAiLogStatus = "SUCCESS" | "ERROR" | "SKIPPED";

export type OperationalAiLogInput = {
  administratorId: string;
  userId?: string | null;
  module: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  promptVersion?: string | null;
  status: OperationalAiLogStatus;
  input?: unknown;
  output?: string | null;
  errorMessage?: string | null;
};

export type OperationalAiModuleAccess = {
  allowed: boolean;
  source: "override" | "plan" | "none";
  reason?: string;
};

export function getOperationalAiStatus(): OperationalAiStatus {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

  if (!hasApiKey) {
    return {
      enabled: false,
      provider: "none",
      reason: "IA não configurada no ambiente.",
    };
  }

  return {
    enabled: true,
    provider: "openai",
  };
}

export function hashAiPayload(payload: unknown): string | null {
  if (payload === null || payload === undefined) {
    return null;
  }

  const serialized =
    typeof payload === "string" ? payload : JSON.stringify(payload);

  if (!serialized) {
    return null;
  }

  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export function buildOutputPreview(output?: string | null): string | null {
  if (!output) {
    return null;
  }

  const normalized = output.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 500);
}

export async function logOperationalAiUsage(input: OperationalAiLogInput) {
  return db.aiOperationLog.create({
    data: {
      administratorId: input.administratorId,
      userId: input.userId ?? null,
      module: input.module,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      promptVersion: input.promptVersion ?? null,
      status: input.status,
      inputHash: hashAiPayload(input.input),
      outputHash: hashAiPayload(input.output),
      outputPreview: buildOutputPreview(input.output),
      errorMessage: input.errorMessage ?? null,
    },
  });
}

export async function getOperationalAiModuleAccess(
  administratorId: string,
): Promise<OperationalAiModuleAccess> {
  const now = new Date();

  const administrator = await db.administrator.findUnique({
    where: {
      id: administratorId,
    },
    select: {
      id: true,
      planId: true,
      planStatus: true,
      moduleOverrides: {
        where: {
          module: {
            slug: OPERATIONAL_AI_MODULE_SLUG,
          },
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
        },
        select: {
          enabled: true,
        },
        take: 1,
      },
      plan: {
        select: {
          status: true,
          modules: {
            where: {
              module: {
                slug: OPERATIONAL_AI_MODULE_SLUG,
                status: "ACTIVE",
              },
            },
            select: {
              enabled: true,
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!administrator) {
    return {
      allowed: false,
      source: "none",
      reason: "Administradora não encontrada.",
    };
  }

  const commercialStatusAllowed = ["ACTIVE", "TRIALING"].includes(
    administrator.planStatus,
  );

  if (!commercialStatusAllowed) {
    return {
      allowed: false,
      source: "none",
      reason: "Plano da administradora não está ativo para uso da IA Operacional.",
    };
  }

  const override = administrator.moduleOverrides[0];

  if (override) {
    return {
      allowed: override.enabled,
      source: "override",
      reason: override.enabled
        ? undefined
        : "O módulo IA Operacional está bloqueado por configuração específica da administradora.",
    };
  }

  if (!administrator.plan || administrator.plan.status !== "ACTIVE") {
    return {
      allowed: false,
      source: "none",
      reason: "Plano da administradora não encontrado ou inativo.",
    };
  }

  const planModule = administrator.plan.modules[0];

  if (!planModule?.enabled) {
    return {
      allowed: false,
      source: "plan",
      reason: "O módulo IA Operacional não está disponível no plano atual.",
    };
  }

  return {
    allowed: true,
    source: "plan",
  };
}
