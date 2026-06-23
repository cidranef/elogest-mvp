import { NextResponse } from "next/server";
import type { CommercialMaterialCategory, CommercialMaterialStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const item = await db.commercialMaterial.findUnique({
    where: { id },
    include: {
      createdByUser: { select: { name: true, email: true } },
      updatedByUser: { select: { name: true, email: true } },
      approvedByUser: { select: { name: true, email: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { createdByUser: { select: { name: true, email: true } }, _count: { select: { downloads: true } } },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "Material não encontrado." }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const current = await db.commercialMaterial.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Material não encontrado." }, { status: 404 });
  const status = String(body.status || current.status) as CommercialMaterialStatus;
  const item = await db.commercialMaterial.update({ where: { id }, data: {
    title: typeof body.title === "string" ? body.title.trim() || current.title : current.title,
    description: typeof body.description === "string" ? body.description.trim() || null : current.description,
    category: String(body.category || current.category) as CommercialMaterialCategory,
    status,
    updatedByUserId: auth.authUser.id,
    approvedAt: status === "APPROVED" ? current.approvedAt ?? new Date() : null,
    approvedByUserId: status === "APPROVED" ? auth.authUser.id : null,
  }});
  return NextResponse.json({ ok: true, item });
}
