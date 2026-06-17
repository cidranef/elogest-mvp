import { NextResponse } from "next/server";

import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import {
  getOperationalAiStatus,
  logOperationalAiUsage,
} from "@/lib/ai/operational-ai";
import { db } from "@/lib/db";

const MODULE_SLUG = "ia_operacional";

async function getOperationalAiModuleAccess(administratorId: string) {
  const administrator = await db.administrator.findUnique({
    where: {
      id: administratorId,
    },
    select: {
      id: true,
      planId: true,
      plan: {
        select: {
          id: true,
          modules: {
            where: {
              module: {
                slug: MODULE_SLUG,
              },
            },
            select: {
              enabled: true,
              module: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
      },
      moduleOverrides: {
        where: {
          module: {
            slug: MODULE_SLUG,
          },
        },
        select: {
          enabled: true,
          module: {
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!administrator) {
    return {
      allowed: false,
      source: "none" as const,
    };
  }

  const override = administrator.moduleOverrides[0];

  if (override) {
    return {
      allowed: override.enabled && override.module.status === "ACTIVE",
      source: "override" as const,
    };
  }

  const planModule = administrator.plan?.modules[0];

  if (!planModule) {
    return {
      allowed: false,
      source: "plan" as const,
    };
  }

  return {
    allowed: planModule.enabled && planModule.module.status === "ACTIVE",
    source: "plan" as const,
  };
}

export async function GET() {
  const access = await requireActiveAdminApiAccess();

  if ("error" in access) {
    return access.error;
  }

  const { administrator } = access;

  const moduleAccess = await getOperationalAiModuleAccess(administrator.id);

  if (!moduleAccess.allowed) {
    await logOperationalAiUsage({
      administratorId: administrator.id,
      userId: null,
      module: MODULE_SLUG,
      action: "STATUS_CHECK",
      status: "SKIPPED",
      output: "O módulo IA Operacional não está disponível no plano atual.",
    });

    return NextResponse.json(
      {
        ok: false,
        moduleEnabled: false,
        aiEnabled: false,
        provider: "none",
        message: "O módulo IA Operacional não está disponível no plano atual.",
      },
      {
        status: 403,
      },
    );
  }

  const status = getOperationalAiStatus();

  await logOperationalAiUsage({
    administratorId: administrator.id,
    userId: null,
    module: MODULE_SLUG,
    action: "STATUS_CHECK",
    status: status.enabled ? "SUCCESS" : "SKIPPED",
    output: status.enabled
      ? "IA Operacional configurada."
      : status.reason ?? "IA não configurada no ambiente.",
  });

  return NextResponse.json({
    ok: true,
    moduleEnabled: true,
    aiEnabled: status.enabled,
    provider: status.provider,
    message: status.enabled
      ? "IA Operacional disponível."
      : status.reason ?? "IA não configurada no ambiente.",
  });
}