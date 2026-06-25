import { NextResponse } from "next/server";

import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAdministratorSubscriptionView } from "@/lib/billing/admin";

export async function GET() {
  const auth = await requireActiveAdminApiAccess({
    allowSuspendedSubscription: true,
  });

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const view = await getAdministratorSubscriptionView(
      auth.administratorId,
    );

    if (!view) {
      return NextResponse.json(
        {
          error: "Administradora não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json(view);
  } catch (error) {
    console.error(
      "Erro ao carregar assinatura da administradora:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível carregar os dados da assinatura.",
      },
      {
        status: 500,
      },
    );
  }
}
