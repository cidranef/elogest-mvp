import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim().toUpperCase();

    const requests = await db.onboardingRequest.findMany({
      where: status ? { status: status as never } : {},
      select: {
        id: true,
        administratorName: true,
        responsibleName: true,
        email: true,
        phone: true,
        city: true,
        state: true,
        condominiumEstimate: true,
        unitEstimate: true,
        message: true,
        status: true,
        metadata: true,
        rejectionReason: true,
        reviewedAt: true,
        convertedAt: true,
        rejectedAt: true,
        createdAt: true,
        updatedAt: true,
        interestedPlan: {
          select: { id: true, name: true, slug: true },
        },
        reviewedByUser: {
          select: { id: true, name: true, email: true },
        },
        convertedAdmin: {
          select: { id: true, name: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const total = await db.onboardingRequest.count();
    const converted = await db.onboardingRequest.count({
      where: { status: "CONVERTED" },
    });

    return NextResponse.json({
      requests,
      summary: {
        total,
        converted,
        conversionRate:
          total > 0 ? Math.round((converted / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("Erro ao listar leads de onboarding:", error);

    return NextResponse.json(
      { error: "Não foi possível listar os leads." },
      { status: 500 },
    );
  }
}
