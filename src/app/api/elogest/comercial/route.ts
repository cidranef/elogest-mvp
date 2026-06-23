import { NextResponse } from "next/server";
import type { CommercialLeadPriority, CommercialLeadStage, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";

export const dynamic = "force-dynamic";

function normalize(value: string | null) {
  return value?.trim() || undefined;
}

export async function GET(request: Request) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const search = normalize(url.searchParams.get("search"));
  const stage = normalize(url.searchParams.get("stage")) as CommercialLeadStage | undefined;
  const priority = normalize(url.searchParams.get("priority")) as CommercialLeadPriority | undefined;
  const ownerUserId = normalize(url.searchParams.get("ownerUserId"));

  const onboardingRequests = await db.onboardingRequest.findMany({
    select: { id: true },
  });

  if (onboardingRequests.length > 0) {
    await db.commercialLeadProfile.createMany({
      data: onboardingRequests.map((item) => ({ onboardingRequestId: item.id })),
      skipDuplicates: true,
    });
  }

  const where: Prisma.CommercialLeadProfileWhereInput = {
    ...(stage ? { stage } : {}),
    ...(priority ? { priority } : {}),
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(search
      ? {
          onboardingRequest: {
            OR: [
              { administratorName: { contains: search, mode: "insensitive" } },
              { responsibleName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [items, total, owners] = await Promise.all([
    db.commercialLeadProfile.findMany({
      where,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      include: {
        onboardingRequest: {
          include: { interestedPlan: { select: { id: true, name: true, slug: true } } },
        },
        ownerUser: { select: { id: true, name: true, email: true } },
      },
    }),
    db.commercialLeadProfile.count({ where }),
    db.user.findMany({
      where: { role: "SUPER_ADMIN" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  return NextResponse.json({ items, total, owners });
}
