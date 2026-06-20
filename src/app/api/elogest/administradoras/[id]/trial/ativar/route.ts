import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { activateAdministratorPlan } from "@/lib/trial-lifecycle";

export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ id: string }>
    | { id: string };
};

type RequestBody = {
  planId?: unknown;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const params = await Promise.resolve(context.params);
    const administratorId = params.id;

    if (!administratorId) {
      return NextResponse.json(
        {
          error: "Administradora não identificada.",
        },
        {
          status: 400,
        },
      );
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const planId =
      typeof body.planId === "string" && body.planId.trim()
        ? body.planId.trim()
        : null;

    const administrator = await activateAdministratorPlan({
      administratorId,
      planId,
    });

    console.info("[EloGest][Trial] Plano ativado pelo Super Admin", {
      administratorId: administrator.id,
      planId: administrator.plan?.id ?? null,
      activatedByUserId: auth.authUser.id,
      activatedAt: administrator.planStartedAt?.toISOString() ?? null,
    });

    return NextResponse.json({
      message: "Plano comercial ativado com sucesso.",
      administrator,
    });
  } catch (error) {
    console.error("[EloGest][Trial] Erro ao ativar plano:", error);

    if (error instanceof Error) {
      if (error.message === "ADMINISTRATOR_NOT_FOUND") {
        return NextResponse.json(
          {
            error: "Administradora não encontrada.",
          },
          {
            status: 404,
          },
        );
      }

      if (error.message === "ACTIVE_PLAN_NOT_FOUND") {
        return NextResponse.json(
          {
            error: "Selecione um plano ativo para concluir a ativação.",
          },
          {
            status: 400,
          },
        );
      }
    }

    return NextResponse.json(
      {
        error: "Não foi possível ativar o plano comercial.",
      },
      {
        status: 500,
      },
    );
  }
}
