import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyAgendaItemStatus,
  AssemblyAgendaItemType,
  AssemblyLogAction,
  AssemblyQuorumRuleType,
  AssemblyResultStatus,
  AssemblyStatus,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { notifyAssemblyAudience } from "@/lib/notifications";

/* =========================================================
   ETAPA 51.9 — APURAÇÃO E PUBLICAÇÃO DOS RESULTADOS

   Arquivo:
   src/app/api/admin/assembleias/[id]/apuracao/route.ts

   Métodos:
   - GET: calcula a apuração atual sem alterar registros.
   - POST: publica oficialmente os resultados de assembleia encerrada.

   Segurança:
   - exige perfil ADMINISTRADORA ativo;
   - exige módulo Assembleias;
   - isola a assembleia pela administradora ativa;
   - não altera votos;
   - preserva snapshot resumido por pauta;
   - registra publicação em histórico auditável.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PublishResultsBody = {
  action?: unknown;
  agendaItemId?: unknown;
  deferredReason?: unknown;
  deferredNotes?: unknown;
};

type OptionTally = {
  optionId: string;
  label: string;
  isAbstention: boolean;
  votes: number;
  weight: number;
  weightPctOfParticipation: number;
  weightPctOfValidVotes: number;
};

type AgendaTally = {
  agendaItemId: string;
  order: number;
  title: string;
  type: AssemblyAgendaItemType;
  quorumRuleType: AssemblyQuorumRuleType;
  resultStatus: AssemblyResultStatus;
  resultSummary: string;
  totalEligibleUnits: number;
  totalEligibleWeight: number;
  participatingUnits: number;
  participatingWeight: number;
  participationPct: number;
  abstentionUnits: number;
  abstentionWeight: number;
  validWeight: number;
  approvalPct: number;
  deferredReason?: string | null;
  deferredNotes?: string | null;
  options: OptionTally[];
};

type AssemblyTally = {
  assemblyId: string;
  title: string;
  status: AssemblyStatus;
  resultsPublishedAt: Date | null;
  totalEligibleUnits: number;
  totalEligibleWeight: number;
  deliberativeAgendaItems: number;
  informationalAgendaItems: number;
  agendaItems: AgendaTally[];
  blockingReasons: string[];
  canPublishResults: boolean;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function pct(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return round((part / total) * 100);
}

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeOptionLabel(value?: string | null) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

function normalizeRequiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeRequiredString(value);
  return normalized || null;
}

const DEFERRED_REASON_LABELS: Record<string, string> = {
  TIE: "Empate",
  NO_QUORUM: "Ausência De Quórum",
  BUDGET_REVIEW: "Necessidade De Orçamento",
  MORE_INFORMATION: "Necessidade De Informações Complementares",
  POSTPONE: "Decisão De Adiar A Deliberação",
  OTHER: "Outro Motivo",
};

function formatWeight(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 6,
  }).format(value);
}

function formatPct(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildBaseDecision(params: {
  type: AssemblyAgendaItemType;
  optionTallies: OptionTally[];
  validWeight: number;
}) {
  if (params.validWeight <= 0) {
    return {
      resultStatus: AssemblyResultStatus.NO_QUORUM,
      approvalPct: 0,
      summary: "Nenhum voto válido foi registrado para esta pauta.",
    };
  }

  const nonAbstention = params.optionTallies
    .filter((item) => !item.isAbstention)
    .sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label, "pt-BR"));

  if (nonAbstention.length === 0) {
    return {
      resultStatus: AssemblyResultStatus.NO_QUORUM,
      approvalPct: 0,
      summary: "Nenhuma opção válida foi registrada para esta pauta.",
    };
  }

  const findOptionWeight = (labels: string[]) => {
    const normalized = new Set(labels.map((label) => normalizeOptionLabel(label)));
    return nonAbstention.find((item) => normalized.has(normalizeOptionLabel(item.label)))?.weight ?? 0;
  };

  if (params.type === AssemblyAgendaItemType.APPROVE_REJECT_ABSTAIN) {
    const approvedWeight = findOptionWeight(["aprovar", "aprovado", "aprovação"]);
    const rejectedWeight = findOptionWeight(["rejeitar", "rejeitado", "rejeição"]);
    const approvalPct = pct(approvedWeight, params.validWeight);

    if (approvedWeight > rejectedWeight) {
      return {
        resultStatus: AssemblyResultStatus.APPROVED,
        approvalPct,
        summary: `A pauta foi aprovada com ${formatWeight(approvedWeight)} de peso favorável, equivalente a ${formatPct(approvalPct)}% dos votos válidos.`,
      };
    }

    if (rejectedWeight > approvedWeight) {
      return {
        resultStatus: AssemblyResultStatus.REJECTED,
        approvalPct,
        summary: `A pauta foi rejeitada com ${formatWeight(rejectedWeight)} de peso contrário. A aprovação alcançou ${formatPct(approvalPct)}% dos votos válidos.`,
      };
    }

    return {
      resultStatus: AssemblyResultStatus.MANUAL_REVIEW,
      approvalPct,
      summary: "Houve empate entre aprovação e rejeição. A pauta exige revisão administrativa antes da publicação oficial.",
    };
  }

  if (params.type === AssemblyAgendaItemType.YES_NO_ABSTAIN) {
    const yesWeight = findOptionWeight(["sim"]);
    const noWeight = findOptionWeight(["não", "nao"]);
    const approvalPct = pct(yesWeight, params.validWeight);

    if (yesWeight > noWeight) {
      return {
        resultStatus: AssemblyResultStatus.APPROVED,
        approvalPct,
        summary: `A opção “Sim” prevaleceu com ${formatWeight(yesWeight)} de peso, equivalente a ${formatPct(approvalPct)}% dos votos válidos.`,
      };
    }

    if (noWeight > yesWeight) {
      return {
        resultStatus: AssemblyResultStatus.REJECTED,
        approvalPct,
        summary: `A opção “Não” prevaleceu com ${formatWeight(noWeight)} de peso. A opção “Sim” alcançou ${formatPct(approvalPct)}% dos votos válidos.`,
      };
    }

    return {
      resultStatus: AssemblyResultStatus.MANUAL_REVIEW,
      approvalPct,
      summary: "Houve empate entre “Sim” e “Não”. A pauta exige revisão administrativa antes da publicação oficial.",
    };
  }

  const winner = nonAbstention[0];
  const second = nonAbstention[1];
  const approvalPct = pct(winner.weight, params.validWeight);

  if (second && second.weight === winner.weight) {
    return {
      resultStatus: AssemblyResultStatus.MANUAL_REVIEW,
      approvalPct,
      summary: "Houve empate entre as opções mais votadas. A pauta exige revisão administrativa antes da publicação oficial.",
    };
  }

  if (params.type === AssemblyAgendaItemType.MULTIPLE_CHOICE) {
    return {
      resultStatus: AssemblyResultStatus.APPROVED,
      approvalPct,
      summary: `A opção mais selecionada foi “${winner.label}”, com peso ${formatWeight(winner.weight)}. Consulte o detalhamento para comparar todas as opções.`,
    };
  }

  return {
    resultStatus: AssemblyResultStatus.APPROVED,
    approvalPct,
    summary: `A opção vencedora foi “${winner.label}”, com peso ${formatWeight(winner.weight)}, equivalente a ${formatPct(approvalPct)}% dos votos válidos.`,
  };
}

async function loadAssemblyForTally(params: {
  assemblyId: string;
  administratorId: string;
}) {
  return db.assembly.findFirst({
    where: {
      id: params.assemblyId,
      administratorId: params.administratorId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      resultsPublishedAt: true,
      eligibleUnits: {
        where: {
          status: "ELIGIBLE",
        },
        select: {
          id: true,
          votingWeight: true,
        },
      },
      agendaItems: {
        orderBy: {
          order: "asc",
        },
        select: {
          id: true,
          order: true,
          title: true,
          type: true,
          status: true,
          quorumRuleType: true,
          minimumParticipationPct: true,
          minimumApprovalPct: true,
          customRuleDescription: true,
          resultStatus: true,
          resultSummary: true,
          deferredReason: true,
          deferredNotes: true,
          options: {
            orderBy: {
              order: "asc",
            },
            select: {
              id: true,
              label: true,
              isAbstention: true,
            },
          },
          votes: {
            select: {
              id: true,
              eligibleUnitId: true,
              eligibleUnit: {
                select: {
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
    },
  });
}

function calculateTally(
  assembly: NonNullable<Awaited<ReturnType<typeof loadAssemblyForTally>>>,
): AssemblyTally {
  const totalEligibleUnits = assembly.eligibleUnits.length;
  const totalEligibleWeight = round(
    assembly.eligibleUnits.reduce(
      (sum, unit) => sum + decimalToNumber(unit.votingWeight),
      0,
    ),
  );

  const agendaItems: AgendaTally[] = assembly.agendaItems.map((agendaItem) => {
    if (agendaItem.type === AssemblyAgendaItemType.INFORMATIVE) {
      return {
        agendaItemId: agendaItem.id,
        order: agendaItem.order,
        title: agendaItem.title,
        type: agendaItem.type,
        quorumRuleType: agendaItem.quorumRuleType,
        resultStatus: AssemblyResultStatus.INFORMATIONAL,
        resultSummary: "Pauta informativa. Não há votação ou apuração.",
        totalEligibleUnits,
        totalEligibleWeight,
        participatingUnits: 0,
        participatingWeight: 0,
        participationPct: 0,
        abstentionUnits: 0,
        abstentionWeight: 0,
        validWeight: 0,
        approvalPct: 0,
        deferredReason: agendaItem.deferredReason,
        deferredNotes: agendaItem.deferredNotes,
        options: [],
      };
    }

    const participatingUnitIds = new Set<string>();
    const abstentionUnitIds = new Set<string>();
    const unitWeightByEligibleUnitId = new Map<string, number>();
    const optionMap = new Map<string, OptionTally>();

    for (const option of agendaItem.options) {
      optionMap.set(option.id, {
        optionId: option.id,
        label: option.label,
        isAbstention: option.isAbstention,
        votes: 0,
        weight: 0,
        weightPctOfParticipation: 0,
        weightPctOfValidVotes: 0,
      });
    }

    for (const vote of agendaItem.votes) {
      const weight = decimalToNumber(vote.eligibleUnit.votingWeight);
      participatingUnitIds.add(vote.eligibleUnitId);
      unitWeightByEligibleUnitId.set(vote.eligibleUnitId, weight);

      let voteHasAbstention = false;

      for (const selected of vote.options) {
        const tally = optionMap.get(selected.option.id);
        if (!tally) continue;

        tally.votes += 1;
        tally.weight = round(tally.weight + weight);

        if (selected.option.isAbstention) {
          voteHasAbstention = true;
        }
      }

      if (voteHasAbstention) {
        abstentionUnitIds.add(vote.eligibleUnitId);
      }
    }

    const participatingWeight = round(
      Array.from(participatingUnitIds).reduce(
        (sum, eligibleUnitId) =>
          sum + (unitWeightByEligibleUnitId.get(eligibleUnitId) || 0),
        0,
      ),
    );

    const abstentionWeight = round(
      Array.from(abstentionUnitIds).reduce(
        (sum, eligibleUnitId) =>
          sum + (unitWeightByEligibleUnitId.get(eligibleUnitId) || 0),
        0,
      ),
    );

    const validWeight = round(Math.max(participatingWeight - abstentionWeight, 0));
    const participationPct = pct(participatingWeight, totalEligibleWeight);

    const options = Array.from(optionMap.values()).map((option) => ({
      ...option,
      weightPctOfParticipation: pct(option.weight, participatingWeight),
      weightPctOfValidVotes: option.isAbstention
        ? 0
        : pct(option.weight, validWeight),
    }));

    const baseDecision = buildBaseDecision({
      type: agendaItem.type,
      optionTallies: options,
      validWeight,
    });

    // ETAPA 51.9.5.1 — tipagem explícita para permitir também
    // o status DEFERRED, que não é retornado pelo cálculo base,
    // mas pode vir de uma pauta já encaminhada para nova deliberação.
    let resultStatus: AssemblyResultStatus = baseDecision.resultStatus;
    let resultSummary = baseDecision.summary;

    const minimumParticipationPct = decimalToNumber(
      agendaItem.minimumParticipationPct,
    );

    const minimumApprovalPct = decimalToNumber(agendaItem.minimumApprovalPct);

    if (
      agendaItem.quorumRuleType ===
        AssemblyQuorumRuleType.MINIMUM_PARTICIPATION &&
      participationPct < minimumParticipationPct
    ) {
      resultStatus = AssemblyResultStatus.NO_QUORUM;
      resultSummary = `A pauta não atingiu a participação mínima de ${formatPct(minimumParticipationPct)}%. Participação apurada: ${formatPct(participationPct)}%.`;
    }

    if (
      agendaItem.quorumRuleType === AssemblyQuorumRuleType.MINIMUM_APPROVAL &&
      baseDecision.approvalPct < minimumApprovalPct
    ) {
      resultStatus = AssemblyResultStatus.REJECTED;
      resultSummary = `A pauta não atingiu a aprovação mínima de ${formatPct(minimumApprovalPct)}%. Aprovação apurada: ${formatPct(baseDecision.approvalPct)}%.`;
    }

    if (agendaItem.quorumRuleType === AssemblyQuorumRuleType.CUSTOM) {
      resultStatus = AssemblyResultStatus.MANUAL_REVIEW;
      resultSummary =
        agendaItem.customRuleDescription?.trim() ||
        "A pauta possui regra personalizada e exige revisão administrativa antes da publicação oficial.";
    }

    // ETAPA 51.9.5 — uma pauta encaminhada permanece memorizada como
    // pendência para nova deliberação. A apuração preserva os números
    // históricos, mas deixa de bloquear a publicação da assembleia atual.
    if (agendaItem.resultStatus === AssemblyResultStatus.DEFERRED) {
      resultStatus = AssemblyResultStatus.DEFERRED;
      resultSummary =
        agendaItem.resultSummary?.trim() ||
        "Pauta encaminhada para nova deliberação em assembleia futura.";
    }

    return {
      agendaItemId: agendaItem.id,
      order: agendaItem.order,
      title: agendaItem.title,
      type: agendaItem.type,
      quorumRuleType: agendaItem.quorumRuleType,
      resultStatus,
      resultSummary,
      totalEligibleUnits,
      totalEligibleWeight,
      participatingUnits: participatingUnitIds.size,
      participatingWeight,
      participationPct,
      abstentionUnits: abstentionUnitIds.size,
      abstentionWeight,
      validWeight,
      approvalPct: baseDecision.approvalPct,
      deferredReason: agendaItem.deferredReason,
      deferredNotes: agendaItem.deferredNotes,
      options,
    };
  });

  const blockingReasons: string[] = [];

  // ETAPA 51.9.1 — após a publicação oficial, o status passa para
  // RESULTS_PUBLISHED. Nesse estado não devemos exibir a orientação
  // incorreta para encerrar novamente a assembleia.
  if (assembly.resultsPublishedAt || assembly.status === AssemblyStatus.RESULTS_PUBLISHED) {
    blockingReasons.push("Os resultados desta assembleia já foram publicados.");
  } else if (assembly.status !== AssemblyStatus.CLOSED) {
    blockingReasons.push("Encerre a assembleia antes de publicar os resultados.");
  }

  const manualReviewItems = agendaItems.filter(
    (item) => item.resultStatus === AssemblyResultStatus.MANUAL_REVIEW,
  );

  if (manualReviewItems.length > 0) {
    blockingReasons.push(
      `${manualReviewItems.length} pauta(s) exigem revisão administrativa antes da publicação oficial.`,
    );
  }

  return {
    assemblyId: assembly.id,
    title: assembly.title,
    status: assembly.status,
    resultsPublishedAt: assembly.resultsPublishedAt,
    totalEligibleUnits,
    totalEligibleWeight,
    deliberativeAgendaItems: agendaItems.filter(
      (item) => item.type !== AssemblyAgendaItemType.INFORMATIVE,
    ).length,
    informationalAgendaItems: agendaItems.filter(
      (item) => item.type === AssemblyAgendaItemType.INFORMATIVE,
    ).length,
    agendaItems,
    blockingReasons,
    canPublishResults: blockingReasons.length === 0,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;

    const assembly = await loadAssemblyForTally({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    return NextResponse.json({
      tally: calculateTally(assembly),
    });
  } catch (error) {
    console.error("Erro ao calcular apuração da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível calcular a apuração da assembleia." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as PublishResultsBody;

    if (body.action !== "PUBLISH_RESULTS" && body.action !== "DEFER_AGENDA_ITEM") {
      return badRequest("Informe uma ação válida para a apuração.");
    }

    const assembly = await loadAssemblyForTally({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    const tally = calculateTally(assembly);

    if (body.action === "DEFER_AGENDA_ITEM") {
      if (assembly.resultsPublishedAt || assembly.status === AssemblyStatus.RESULTS_PUBLISHED) {
        return forbidden("A pauta não pode ser encaminhada após a publicação dos resultados.");
      }

      if (assembly.status !== AssemblyStatus.CLOSED) {
        return forbidden("Encerre a assembleia antes de encaminhar uma pauta para nova deliberação.");
      }

      const agendaItemId = normalizeRequiredString(body.agendaItemId);
      const deferredReason = normalizeRequiredString(body.deferredReason);
      const deferredNotes = normalizeNullableString(body.deferredNotes);

      if (!agendaItemId) return badRequest("Selecione a pauta que será encaminhada.");
      if (!DEFERRED_REASON_LABELS[deferredReason]) {
        return badRequest("Selecione um motivo válido para o encaminhamento.");
      }

      const agendaItem = tally.agendaItems.find((item) => item.agendaItemId === agendaItemId);
      if (!agendaItem) return notFound("Pauta não encontrada nesta assembleia.");
      if (agendaItem.type === AssemblyAgendaItemType.INFORMATIVE) {
        return badRequest("Itens informativos não precisam ser encaminhados para nova deliberação.");
      }

      if (
        agendaItem.resultStatus !== AssemblyResultStatus.MANUAL_REVIEW &&
        agendaItem.resultStatus !== AssemblyResultStatus.NO_QUORUM
      ) {
        return forbidden(
          "Somente pautas empatadas, pendentes de revisão ou sem quórum podem ser encaminhadas para uma próxima assembleia.",
        );
      }

      const now = new Date();
      const reasonLabel = DEFERRED_REASON_LABELS[deferredReason];
      const summary = `Pauta pendente para nova deliberação. Motivo: ${reasonLabel}.${deferredNotes ? ` Observação: ${deferredNotes}` : ""}`;

      await db.$transaction(async (tx) => {
        await tx.assemblyAgendaItem.update({
          where: { id: agendaItemId },
          data: {
            status: AssemblyAgendaItemStatus.RESULT_VALIDATED,
            resultStatus: AssemblyResultStatus.DEFERRED,
            resultSummary: summary,
            resultValidatedAt: now,
            deferredAt: now,
            deferredByUserId: auth.authUser.id,
            deferredReason,
            deferredNotes,
          },
        });

        await tx.assemblyLog.create({
          data: {
            assemblyId: assembly.id,
            userId: auth.authUser.id,
            action: AssemblyLogAction.AGENDA_ITEM_DEFERRED,
            message: `Pauta encaminhada para nova deliberação: ${agendaItem.title}.`,
            metadata: {
              agendaItemId,
              title: agendaItem.title,
              deferredAt: now.toISOString(),
              deferredReason,
              deferredReasonLabel: reasonLabel,
              deferredNotes,
            },
          },
        });
      });

      const updatedAssembly = await loadAssemblyForTally({
        assemblyId: assembly.id,
        administratorId: auth.administratorId,
      });

      return NextResponse.json({
        tally: updatedAssembly ? calculateTally(updatedAssembly) : tally,
        message: "Pauta encaminhada para nova deliberação. Ela será sugerida na criação da próxima assembleia deste condomínio.",
      });
    }

    if (!tally.canPublishResults) {
      return forbidden(
        tally.blockingReasons[0] ||
          "Os resultados ainda não podem ser publicados.",
      );
    }

    const now = new Date();

    await db.$transaction(async (tx) => {
      for (const agendaItem of tally.agendaItems) {
        await tx.assemblyAgendaItem.update({
          where: {
            id: agendaItem.agendaItemId,
          },
          data: {
            status: AssemblyAgendaItemStatus.RESULT_VALIDATED,
            resultStatus: agendaItem.resultStatus,
            resultSummary: agendaItem.resultSummary,
            resultValidatedAt: now,
          },
        });
      }

      await tx.assembly.update({
        where: {
          id: assembly.id,
        },
        data: {
          status: AssemblyStatus.RESULTS_PUBLISHED,
          resultsPublishedAt: now,
          resultsPublishedByUserId: auth.authUser.id,
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: assembly.id,
          userId: auth.authUser.id,
          action: AssemblyLogAction.RESULTS_PUBLISHED,
          message: "Resultados oficiais da assembleia publicados pela administradora.",
          metadata: {
            publishedAt: now.toISOString(),
            totalEligibleUnits: tally.totalEligibleUnits,
            totalEligibleWeight: tally.totalEligibleWeight,
            deliberativeAgendaItems: tally.deliberativeAgendaItems,
            informationalAgendaItems: tally.informationalAgendaItems,
            agendaItems: tally.agendaItems.map((item) => ({
              agendaItemId: item.agendaItemId,
              title: item.title,
              resultStatus: item.resultStatus,
              participatingUnits: item.participatingUnits,
              participatingWeight: item.participatingWeight,
              participationPct: item.participationPct,
              abstentionWeight: item.abstentionWeight,
              validWeight: item.validWeight,
              approvalPct: item.approvalPct,
            })),
          },
        },
      });
    });

    let notifiedUsers = 0;

    try {
      const notificationResult = await notifyAssemblyAudience({
        assemblyId: assembly.id,
        mode: "RESULTS",
        actorUser: auth.authUser,
      });

      notifiedUsers = notificationResult.createdNotifications.length;
    } catch (notificationError) {
      console.error(
        "Resultados publicados, mas houve erro ao notificar participantes:",
        notificationError,
      );
    }

    const updatedAssembly = await loadAssemblyForTally({
      assemblyId: assembly.id,
      administratorId: auth.administratorId,
    });

    return NextResponse.json({
      tally: updatedAssembly ? calculateTally(updatedAssembly) : tally,
      notifiedUsers,
      message:
        "Resultados publicados com sucesso. Os participantes internos elegíveis foram avisados.",
    });
  } catch (error) {
    console.error("Erro ao publicar resultados da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível publicar os resultados da assembleia." },
      { status: 500 },
    );
  }
}
