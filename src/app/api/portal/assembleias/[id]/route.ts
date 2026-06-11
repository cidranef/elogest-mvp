import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyMinuteStatus,
  AssemblyStatus,
  AssemblyVoteVisibility,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  findPortalAssemblyVotingUnits,
  requirePortalAssemblyAccess,
} from "@/lib/portal-assembly-access";

/* =========================================================
   ETAPA 52.5.1.3 — DETALHE DA ASSEMBLEIA NO PORTAL

   GET /api/portal/assembleias/[id]

   Objetivo:
   - Entregar informações públicas da convocação.
   - Preservar votos próprios para preenchimento e alteração autorizada.
   - Exibir resultado consolidado somente após publicação oficial.
   - Respeitar a modalidade de transparência definida em cada pauta.
   - Expor detalhamento nominal somente por unidade, sem divulgar
     o nome da pessoa responsável pelo registro do voto.
   ========================================================= */

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined,
) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPublicUnitLabel(params: {
  block?: string | null;
  unitNumber: string;
}) {
  return params.block
    ? `Bloco ${params.block} — Unidade ${params.unitNumber}`
    : `Unidade ${params.unitNumber}`;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const access = await requirePortalAssemblyAccess();
  if ("error" in access) return access.error;

  try {
    const { id } = await context.params;
    const now = new Date();

    const assembly = await db.assembly.findFirst({
      where: {
        id,
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
        location: true,
        externalMeetingUrl: true,
        accessInstructions: true,
        convocationText: true,
        convocationPublishedAt: true,
        resultsPublishedAt: true,
        allowVoteChange: true,
        minute: {
          select: {
            status: true,
            currentVersion: true,
            publishedAt: true,
            officialPdfName: true,
            officialPdfMimeType: true,
            officialPdfSizeBytes: true,
            officialPdfHash: true,
            officialPdfGeneratedAt: true,
            publishedByUser: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        condominium: {
          select: {
            id: true,
            name: true,
          },
        },
        agendaItems: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            title: true,
            description: true,
            type: true,
            status: true,
            voteVisibility: true,
            quorumRuleType: true,
            customRuleDescription: true,
            minimumParticipationPct: true,
            minimumApprovalPct: true,
            resultStatus: true,
            resultSummary: true,
            resultValidatedAt: true,
            deferredReason: true,
            deferredNotes: true,
            originAgendaItem: {
              select: {
                id: true,
                title: true,
                assembly: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
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
            attachments: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                url: true,
                description: true,
              },
            },
            votes: {
              select: {
                id: true,
                eligibleUnitId: true,
                origin: true,
                submittedAt: true,
                eligibleUnit: {
                  select: {
                    snapshotBlock: true,
                    snapshotUnitNumber: true,
                    votingWeight: true,
                  },
                },
                options: {
                  select: {
                    option: {
                      select: {
                        id: true,
                        label: true,
                        isAbstention: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        attachments: {
          where: {
            agendaItemId: null,
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            scope: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            url: true,
            description: true,
          },
        },
        votes: {
          where: {
            voterUserId: access.authUser.id,
          },
          select: {
            id: true,
            agendaItemId: true,
            eligibleUnitId: true,
            origin: true,
            version: true,
            submittedAt: true,
            options: {
              select: {
                optionId: true,
              },
            },
          },
        },
      },
    });

    if (!assembly) {
      return NextResponse.json(
        { error: "Assembleia não encontrada para o perfil ativo." },
        { status: 404 },
      );
    }

    const votingUnits = await findPortalAssemblyVotingUnits({
      assemblyId: assembly.id,
      condominiumId: access.activeAccess.condominiumId!,
      userId: access.authUser.id,
      votingStartsAt: assembly.votingStartsAt,
      votingEndsAt: assembly.votingEndsAt,
      now,
    });

    const votingOpen = isVotingWindowOpen({
      status: assembly.status,
      votingStartsAt: assembly.votingStartsAt,
      votingEndsAt: assembly.votingEndsAt,
      now,
    });

    const publicMinute =
      assembly.minute?.status === AssemblyMinuteStatus.PUBLISHED &&
      assembly.minute.publishedAt
        ? {
            status: assembly.minute.status,
            currentVersion: assembly.minute.currentVersion,
            publishedAt: assembly.minute.publishedAt,
            officialPdfAvailable: Boolean(assembly.minute.officialPdfName),
            officialPdfName: assembly.minute.officialPdfName,
            officialPdfMimeType: assembly.minute.officialPdfMimeType,
            officialPdfSizeBytes: assembly.minute.officialPdfSizeBytes,
            officialPdfHash: assembly.minute.officialPdfHash,
            officialPdfGeneratedAt: assembly.minute.officialPdfGeneratedAt,
            publishedByLabel:
              assembly.minute.publishedByUser?.name ||
              assembly.minute.publishedByUser?.email ||
              "Responsável identificado no histórico da ata",
          }
        : null;

    const agendaItems = assembly.agendaItems.map((agendaItem) => {
      const { votes: internalVotes, ...publicAgendaItem } = agendaItem;

      if (assembly.status !== AssemblyStatus.RESULTS_PUBLISHED) {
        return {
          ...publicAgendaItem,
          publicResult: null,
        };
      }

      const optionMap = new Map(
        agendaItem.options.map((option) => [
          option.id,
          {
            optionId: option.id,
            label: option.label,
            isAbstention: option.isAbstention,
            votes: 0,
            weight: 0,
          },
        ]),
      );

      const participatingEligibleUnitIds = new Set<string>();
      const abstentionEligibleUnitIds = new Set<string>();
      const unitWeightByEligibleUnitId = new Map<string, number>();

      for (const vote of internalVotes) {
        const votingWeight = decimalToNumber(vote.eligibleUnit.votingWeight);

        participatingEligibleUnitIds.add(vote.eligibleUnitId);
        unitWeightByEligibleUnitId.set(vote.eligibleUnitId, votingWeight);

        for (const selected of vote.options) {
          const tally = optionMap.get(selected.option.id);
          if (!tally) continue;

          tally.votes += 1;
          tally.weight = round(tally.weight + votingWeight);

          if (selected.option.isAbstention) {
            abstentionEligibleUnitIds.add(vote.eligibleUnitId);
          }
        }
      }

      const participatingWeight = round(
        Array.from(participatingEligibleUnitIds).reduce(
          (sum, eligibleUnitId) =>
            sum + (unitWeightByEligibleUnitId.get(eligibleUnitId) || 0),
          0,
        ),
      );

      const abstentionWeight = round(
        Array.from(abstentionEligibleUnitIds).reduce(
          (sum, eligibleUnitId) =>
            sum + (unitWeightByEligibleUnitId.get(eligibleUnitId) || 0),
          0,
        ),
      );

      const nominalVotes =
        agendaItem.voteVisibility === AssemblyVoteVisibility.NOMINAL_BY_UNIT
          ? internalVotes
              .map((vote) => ({
                voteId: vote.id,
                unitLabel: formatPublicUnitLabel({
                  block: vote.eligibleUnit.snapshotBlock,
                  unitNumber: vote.eligibleUnit.snapshotUnitNumber,
                }),
                votingWeight: decimalToNumber(vote.eligibleUnit.votingWeight),
                origin: vote.origin,
                optionLabels: vote.options.map(
                  (selected) => selected.option.label,
                ),
                submittedAt: vote.submittedAt,
              }))
              .sort((left, right) =>
                left.unitLabel.localeCompare(right.unitLabel, "pt-BR"),
              )
          : [];

      return {
        ...publicAgendaItem,
        publicResult: {
          voteVisibility: agendaItem.voteVisibility,
          participatingUnits: participatingEligibleUnitIds.size,
          participatingWeight,
          abstentionUnits: abstentionEligibleUnitIds.size,
          abstentionWeight,
          validWeight: round(participatingWeight - abstentionWeight),
          options: Array.from(optionMap.values()),
          nominalVotes,
        },
      };
    });

    const publicAssembly = {
      ...assembly,
      minute: undefined,
    };

    return NextResponse.json({
      activeAccess: {
        role: access.activeAccess.role,
        label: access.activeAccess.label,
        condominiumId: access.activeAccess.condominiumId,
        unitId: access.activeAccess.unitId,
        canVote: access.activeAccess.canVote ?? null,
      },
      assembly: {
        ...publicAssembly,
        officialMinute: publicMinute,
        agendaItems,
        votingUnits,
        votingOpen,
        canParticipate: votingUnits.length > 0,
      },
    });
  } catch (error) {
    console.error("Erro ao consultar assembleia no portal:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar a assembleia no portal." },
      { status: 500 },
    );
  }
}

/* =========================================================
   ETAPA 52.9.3 — ATA OFICIAL DISPONÍVEL NO PORTAL

   Ajuste:
   - O detalhe público expõe somente metadados da ata publicada.
   - Minutas em revisão, versões internas e auditoria permanecem restritas.
   - O PDF é oferecido somente quando o arquivo oficial já foi gerado.
   ========================================================= */
