import { NextResponse } from "next/server";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { getCommercialExecutiveDashboard } from "@/lib/commercial-dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  try {
    const dashboard = await getCommercialExecutiveDashboard();
    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[commercial-indicators]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os indicadores comerciais." },
      { status: 500 },
    );
  }
}
