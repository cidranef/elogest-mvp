import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { clampQualificationScore, qualificationClassification, stringArray, QUALIFICATION_CRITERIA } from "@/lib/commercial-qualification";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const lead = await db.commercialLeadProfile.findUnique({ where: { id }, select: { id: true } });
  if (!lead) return NextResponse.json({ error: "Lead comercial não encontrado." }, { status: 404 });
  const item = await db.commercialLeadQualification.findUnique({
    where: { commercialLeadProfileId: id },
    include: { revisions: { orderBy: { createdAt: "desc" }, take: 20, include: { createdByUser: { select: { name: true, email: true } } } } },
  });
  return NextResponse.json({ item });
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const lead = await db.commercialLeadProfile.findUnique({ where: { id }, select: { id: true, stage: true } });
  if (!lead) return NextResponse.json({ error: "Lead comercial não encontrado." }, { status: 404 });

  const scores = Object.fromEntries(QUALIFICATION_CRITERIA.map(([key]) => [key, clampQualificationScore(body[key])])) as Record<string, number>;
  const totalScore = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const classification = qualificationClassification(totalScore);
  const completed = Boolean(body.completed);
  const scalar = (key: string) => typeof body[key] === "string" ? String(body[key]).trim() || null : null;
  const integer = (key: string) => body[key] === "" || body[key] == null ? null : Math.max(0, Math.round(Number(body[key]) || 0));

  const data = {
    status: completed ? "COMPLETED" as const : "DRAFT" as const,
    classification,
    totalScore,
    yearsInMarket: integer("yearsInMarket"), condominiumCount: integer("condominiumCount"), unitCount: integer("unitCount"), teamSize: integer("teamSize"),
    currentSystems: stringArray(body.currentSystems), painPoints: stringArray(body.painPoints), primaryPain: scalar("primaryPain"), painFrequency: scalar("painFrequency"), painSeverity: scalar("painSeverity"),
    desiredModules: stringArray(body.desiredModules), urgency: scalar("urgency"), decisionRole: scalar("decisionRole"), budgetStatus: scalar("budgetStatus"), pilotReadiness: scalar("pilotReadiness"), competitorName: scalar("competitorName"), objections: stringArray(body.objections), notes: scalar("notes"),
    ...scores,
    answers: typeof body.answers === "object" ? body.answers as object : undefined,
    completedAt: completed ? new Date() : null,
    updatedByUserId: auth.authUser.id,
  };

  const item = await db.$transaction(async (tx) => {
    const qualification = await tx.commercialLeadQualification.upsert({
      where: { commercialLeadProfileId: id },
      create: { commercialLeadProfileId: id, ...data },
      update: data,
    });
    const count = await tx.commercialLeadQualificationRevision.count({ where: { commercialLeadQualificationId: qualification.id } });
    await tx.commercialLeadQualificationRevision.create({
      data: { commercialLeadQualificationId: qualification.id, revisionNumber: count + 1, status: qualification.status, classification, totalScore, snapshot: qualification, createdByUserId: auth.authUser.id },
    });
    await tx.commercialLeadProfile.update({
      where: { id },
      data: { score: totalScore, priority: classification === "STRATEGIC" ? "STRATEGIC" : classification === "HIGH_PRIORITY" ? "HIGH" : undefined, qualifiedAt: completed && totalScore >= 26 ? new Date() : undefined },
    });
    await tx.commercialLeadLog.create({ data: { commercialLeadProfileId: id, action: "SCORE_RECALCULATED", score: totalScore, description: completed ? "Qualificação comercial concluída." : "Qualificação comercial salva como rascunho.", createdByUserId: auth.authUser.id } });
    return qualification;
  });
  return NextResponse.json({ ok: true, item });
}
