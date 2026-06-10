import { NextRequest, NextResponse } from "next/server";
import { AssemblyResultStatus, Status } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   ETAPA 51.9.5 — PAUTAS PENDENTES PARA NOVA DELIBERACAO

   GET /api/admin/assembleias/pautas-pendentes?condominiumId=...

   Retorna somente pautas encaminhadas e ainda não reapresentadas.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

function normalizeRequiredString(value: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const condominiumId = normalizeRequiredString(searchParams.get("condominiumId"));

    if (!condominiumId) {
      return NextResponse.json({ pendingAgendaItems: [] });
    }

    const condominium = await db.condominium.findFirst({
      where: {
        id: condominiumId,
        administratorId: auth.administratorId,
        status: Status.ACTIVE,
      },
      select: { id: true },
    });

    if (!condominium) {
      return NextResponse.json(
        { error: "Condomínio não encontrado na carteira ativa da administradora." },
        { status: 404 },
      );
    }

    const pendingAgendaItems = await db.assemblyAgendaItem.findMany({
      where: {
        resultStatus: AssemblyResultStatus.DEFERRED,
        assembly: {
          administratorId: auth.administratorId,
          condominiumId,
        },
        carriedForwardItems: {
          none: {},
        },
      },
      orderBy: [
        { deferredAt: "desc" },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        quorumRuleType: true,
        minimumParticipationPct: true,
        minimumApprovalPct: true,
        customRuleDescription: true,
        deferredAt: true,
        deferredReason: true,
        deferredNotes: true,
        resultSummary: true,
        assembly: {
          select: {
            id: true,
            title: true,
            scheduledStartAt: true,
            resultsPublishedAt: true,
          },
        },
        options: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            label: true,
            description: true,
            order: true,
            isAbstention: true,
          },
        },
      },
    });

    return NextResponse.json({ pendingAgendaItems });
  } catch (error) {
    console.error("Erro ao listar pautas pendentes:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar as pautas pendentes." },
      { status: 500 },
    );
  }
}
