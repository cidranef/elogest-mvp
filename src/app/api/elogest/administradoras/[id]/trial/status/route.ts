import { NextResponse } from "next/server";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { synchronizeAdministratorTrial } from "@/lib/trial-lifecycle";

export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{ id: string }>
    | { id: string };
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const params = await Promise.resolve(context.params);

    const result = await synchronizeAdministratorTrial(params.id);

    if (!result) {
      return NextResponse.json(
        {
          error: "Administradora não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      administrator: result.administrator,
      lifecycle: result.lifecycle,
      statusChanged: result.changed,
    });
  } catch (error) {
    console.error("[EloGest][Trial] Erro ao consultar status:", error);

    return NextResponse.json(
      {
        error: "Não foi possível consultar o status do trial.",
      },
      {
        status: 500,
      },
    );
  }
}
