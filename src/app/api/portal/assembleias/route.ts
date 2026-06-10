import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyAgendaItemType,
  AssemblyStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  findPortalAssemblyVotingUnits,
  requirePortalAssemblyAccess,
} from "@/lib/portal-assembly-access";

/* =========================================================
   ETAPA 51.8.1 — LISTAGEM DE ASSEMBLEIAS NO PORTAL

   GET /api/portal/assembleias

   Entrega:
   - assembleias publicadas do condomínio ativo;
   - KPIs para o menu lateral;
   - unidades que o usuário pode representar;
   - quantidade de pautas deliberativas pendentes.
   ========================================================= */

function parseLimit(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("limit") || 20);
  if (!Number.isFinite(raw)) return 20;
  return Math.min(100, Math.max(1, Math.floor(raw)));
}

function isVotingWindowOpen(params: {
  status: AssemblyStatus;
  votingStartsAt: Date | null;
  votingEndsAt: Date | null;
  now: Date;
}) {
  if (params.status !== AssemblyStatus.OPEN) return false;
  if (params.votingStartsAt && params.votingStartsAt > params.now) return false;
  if (params.votingEndsAt && params.votingEndsAt < params.now) return false;
  return true;
}

export async function GET(request: NextRequest) {
  const access = await requirePortalAssemblyAccess();
  if ("error" in access) return access.error;

  try {
    const now = new Date();
    const limit = parseLimit(request);

    const assemblies = await db.assembly.findMany({
      where: {
        condominiumId: access.activeAccess.condominiumId!,
        convocationPublishedAt: { not: null },
        status: {
          in: [
            AssemblyStatus.SCHEDULED,
            AssemblyStatus.OPEN,
            AssemblyStatus.CLOSED,
            AssemblyStatus.RESULTS_PUBLISHED,
          ],
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        status: true,
        mode: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        votingStartsAt: true,
        votingEndsAt: true,
        convocationPublishedAt: true,
        condominium: {
          select: {
            id: true,
            name: true,
          },
        },
        agendaItems: {
          where: {
            type: { not: AssemblyAgendaItemType.INFORMATIVE },
          },
          select: {
            id: true,
          },
        },
        votes: {
          where: {
            voterUserId: access.authUser.id,
          },
          select: {
            agendaItemId: true,
            eligibleUnitId: true,
          },
        },
        _count: {
          select: {
            agendaItems: true,
            attachments: true,
          },
        },
      },
      orderBy: [
        { status: "asc" },
        { scheduledStartAt: "desc" },
        { createdAt: "desc" },
      ],
      take: limit,
    });

    const items = await Promise.all(
      assemblies.map(async (assembly) => {
        const votingUnits = await findPortalAssemblyVotingUnits({
          assemblyId: assembly.id,
          condominiumId: access.activeAccess.condominiumId!,
          userId: access.authUser.id,
          votingStartsAt: assembly.votingStartsAt,
          votingEndsAt: assembly.votingEndsAt,
          now,
        });

        const expectedVoteKeys = new Set<string>();
        for (const agendaItem of assembly.agendaItems) {
          for (const unit of votingUnits) {
            expectedVoteKeys.add(`${agendaItem.id}:${unit.eligibleUnitId}`);
          }
        }

        const submittedVoteKeys = new Set(
          assembly.votes.map(
            (vote) => `${vote.agendaItemId}:${vote.eligibleUnitId}`,
          ),
        );

        const pendingVotes = Array.from(expectedVoteKeys).filter(
          (key) => !submittedVoteKeys.has(key),
        ).length;

        const votingOpen = isVotingWindowOpen({
          status: assembly.status,
          votingStartsAt: assembly.votingStartsAt,
          votingEndsAt: assembly.votingEndsAt,
          now,
        });

        return {
          id: assembly.id,
          title: assembly.title,
          description: assembly.description,
          type: assembly.type,
          status: assembly.status,
          mode: assembly.mode,
          scheduledStartAt: assembly.scheduledStartAt,
          scheduledEndAt: assembly.scheduledEndAt,
          votingStartsAt: assembly.votingStartsAt,
          votingEndsAt: assembly.votingEndsAt,
          convocationPublishedAt: assembly.convocationPublishedAt,
          condominium: assembly.condominium,
          votingUnits,
          pendingVotes,
          votingOpen,
          canParticipate: votingUnits.length > 0,
          _count: assembly._count,
        };
      }),
    );

    return NextResponse.json({
      activeAccess: {
        role: access.activeAccess.role,
        label: access.activeAccess.label,
        condominiumId: access.activeAccess.condominiumId,
        unitId: access.activeAccess.unitId,
        canVote: access.activeAccess.canVote ?? null,
      },
      kpis: {
        total: items.length,
        totalPending: items.filter(
          (item) => item.votingOpen && item.pendingVotes > 0,
        ).length,
        open: items.filter((item) => item.status === AssemblyStatus.OPEN).length,
        scheduled: items.filter(
          (item) => item.status === AssemblyStatus.SCHEDULED,
        ).length,
      },
      assemblies: items,
    });
  } catch (error) {
    console.error("Erro ao listar assembleias do portal:", error);
    return NextResponse.json(
      { error: "Não foi possível listar as assembleias do portal." },
      { status: 500 },
    );
  }
}
