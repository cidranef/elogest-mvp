import { NextResponse } from "next/server";
import type { CommercialMaterialCategory, CommercialMaterialStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { slugifyMaterial } from "@/lib/commercial-materials";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  const category = url.searchParams.get("category") as CommercialMaterialCategory | null;
  const status = url.searchParams.get("status") as CommercialMaterialStatus | null;
  const where: Prisma.CommercialMaterialWhereInput = {
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const items = await db.commercialMaterial.findMany({
    where,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      createdByUser: { select: { name: true } },
      updatedByUser: { select: { name: true } },
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      _count: { select: { versions: true, downloads: true } },
    },
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim() || null;
  const category = String(body.category || "OTHER") as CommercialMaterialCategory;
  const status = String(body.status || "DRAFT") as CommercialMaterialStatus;
  if (!title) return NextResponse.json({ error: "Informe o título." }, { status: 400 });
  const base = slugifyMaterial(title) || `material-${Date.now()}`;
  let slug = base;
  let sequence = 2;
  while (await db.commercialMaterial.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${sequence++}`;
  }
  const item = await db.commercialMaterial.create({ data: {
    title, description, category, status,
    slug,
    createdByUserId: auth.authUser.id,
    updatedByUserId: auth.authUser.id,
    approvedByUserId: status === "APPROVED" ? auth.authUser.id : null,
    approvedAt: status === "APPROVED" ? new Date() : null,
  }});
  return NextResponse.json({ ok: true, item }, { status: 201 });
}
