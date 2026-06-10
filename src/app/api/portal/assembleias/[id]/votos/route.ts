import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyAgendaItemStatus,
  AssemblyAgendaItemType,
  AssemblyEligibilityStatus,
  AssemblyLogAction,
  AssemblyRepresentationStatus,
  AssemblyStatus,
  AssemblyVoteOrigin,
  Status,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requirePortalAssemblyAccess } from "@/lib/portal-assembly-access";

/* =========================================================
   ETAPA 51.8.2 — VOTAÇÃO PELO CELULAR

   POST /api/portal/assembleias/[id]/votos

   Objetivo:
   - registrar um conjunto completo de respostas por unidade;
   - validar novamente todos os direitos no momento do envio;
   - impedir voto fora da janela;
   - preservar alteração auditável em AssemblyVoteRevision;
   - manter um único voto vigente por unidade e pauta.
   ========================================================= */

type RouteContext = {
  params: Promise<{ id: string }>;
};

type VoteAnswerInput = {
  agendaItemId?: unknown;
  optionIds?: unknown;
};

type SubmitVotesBody = {
  eligibleUnitId?: unknown;
  answers?: unknown;
  changeReason?: unknown;
};

type ValidatedAnswer = {
  agendaItemId: string;
  optionIds: string[];
};

type VoteRight = {
  origin: AssemblyVoteOrigin;
  representationId: string | null;
  unitPersonLinkId: string | null;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function normalizeRequiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeRequiredString(value);
  return normalized || null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function parseAnswers(value: unknown): VoteAnswerInput[] {
  return Array.isArray(value) ? (value as VoteAnswerInput[]) : [];
}

function isVotingWindowOpen(params: {
  status: AssemblyStatus;
  votingStartsAt: Date | null;
  votingEndsAt: Date | null;
  now: Date;
}) {
  if (params.status !== AssemblyStatus.OPEN) return false;
  if (!params.votingStartsAt || params.votingStartsAt > params.now) return false;
  if (!params.votingEndsAt || params.votingEndsAt < params.now) return false;
  return true;
}

/*
   ETAPA 51.8.2.3 — PRAZO EFETIVO DA PAUTA

   null na pauta significa herdar a janela geral da assembleia.
   Pautas com prazo específico continuam respeitando sua própria
   janela. A validação ocorre novamente no instante do voto.
*/
function isAgendaWindowOpen(params: {
  votingStartsAt: Date | null;
  votingEndsAt: Date | null;
  assemblyVotingStartsAt: Date | null;
  assemblyVotingEndsAt: Date | null;
  now: Date;
}) {
  const startsAt = params.votingStartsAt || params.assemblyVotingStartsAt;
  const endsAt = params.votingEndsAt || params.assemblyVotingEndsAt;

  if (!startsAt || startsAt > params.now) return false;
  if (!endsAt || endsAt < params.now) return false;

  return true;
}

function validateOptionQuantity(params: {
  type: AssemblyAgendaItemType;
  optionIds: string[];
}) {
  if (params.type === AssemblyAgendaItemType.MULTIPLE_CHOICE) {
    return params.optionIds.length > 0;
  }

  return params.optionIds.length === 1;
}

function buildVoteSnapshot(params: {
  voteId?: string | null;
  version: number;
  agendaItemId: string;
  eligibleUnitId: string;
  unitId: string;
  voterUserId: string;
  voterAccessId: string | null;
  unitPersonLinkId: string | null;
  representationId: string | null;
  origin: AssemblyVoteOrigin;
  optionIds: string[];
  submittedAt: Date;
}) {
  return {
    voteId: params.voteId || null,
    version: params.version,
    agendaItemId: params.agendaItemId,
    eligibleUnitId: params.eligibleUnitId,
    unitId: params.unitId,
    voterUserId: params.voterUserId,
    voterAccessId: params.voterAccessId,
    unitPersonLinkId: params.unitPersonLinkId,
    representationId: params.representationId,
    origin: params.origin,
    optionIds: params.optionIds,
    submittedAt: params.submittedAt.toISOString(),
  } satisfies Prisma.InputJsonObject;
}

async function resolveVoteRight(params: {
  assemblyId: string;
  condominiumId: string;
  unitId: string;
  userId: string;
  now: Date;
}): Promise<VoteRight | null> {
  const directLink = await db.unitPersonLink.findFirst({
    where: {
      userId: params.userId,
      condominiumId: params.condominiumId,
      unitId: params.unitId,
      status: Status.ACTIVE,
      canVote: true,
      AND: [
        {
          OR: [{ startsAt: null }, { startsAt: { lte: params.now } }],
        },
        {
          OR: [{ endsAt: null }, { endsAt: { gte: params.now } }],
        },
      ],
    },
    select: {
      id: true,
    },
  });

  if (directLink) {
    return {
      origin: AssemblyVoteOrigin.DIRECT_UNIT_LINK,
      representationId: null,
      unitPersonLinkId: directLink.id,
    };
  }

  const representation = await db.assemblyRepresentation.findFirst({
    where: {
      assemblyId: params.assemblyId,
      unitId: params.unitId,
      representativeUserId: params.userId,
      status: AssemblyRepresentationStatus.ACTIVE,
      AND: [
        {
          OR: [{ validFrom: null }, { validFrom: { lte: params.now } }],
        },
        {
          OR: [{ validUntil: null }, { validUntil: { gte: params.now } }],
        },
      ],
    },
    select: {
      id: true,
    },
  });

  if (!representation) {
    return null;
  }

  return {
    origin: AssemblyVoteOrigin.PROXY_REPRESENTATION,
    representationId: representation.id,
    unitPersonLinkId: null,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  const access = await requirePortalAssemblyAccess();
  if ("error" in access) return access.error;

  try {
    const { id: assemblyId } = await context.params;
    const body = (await request.json()) as SubmitVotesBody;
    const eligibleUnitId = normalizeRequiredString(body.eligibleUnitId);
    const answersInput = parseAnswers(body.answers);
    const changeReason = normalizeNullableString(body.changeReason);
    const now = new Date();

    if (!eligibleUnitId) {
      return badRequest("Selecione a unidade que será representada.");
    }

    if (answersInput.length === 0) {
      return badRequest("Informe pelo menos uma resposta para registrar o voto.");
    }

    const assembly = await db.assembly.findFirst({
      where: {
        id: assemblyId,
        condominiumId: access.activeAccess.condominiumId!,
        convocationPublishedAt: { not: null },
      },
      select: {
        id: true,
        condominiumId: true,
        status: true,
        votingStartsAt: true,
        votingEndsAt: true,
        allowVoteChange: true,
        eligibleUnits: {
          where: {
            id: eligibleUnitId,
            status: AssemblyEligibilityStatus.ELIGIBLE,
          },
          select: {
            id: true,
            unitId: true,
            snapshotBlock: true,
            snapshotUnitNumber: true,
            votingWeight: true,
          },
        },
      },
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada para o perfil ativo.");
    }

    if (
      !isVotingWindowOpen({
        status: assembly.status,
        votingStartsAt: assembly.votingStartsAt,
        votingEndsAt: assembly.votingEndsAt,
        now,
      })
    ) {
      return forbidden("A votação não está aberta neste momento.");
    }

    const eligibleUnit = assembly.eligibleUnits[0];

    if (!eligibleUnit) {
      return badRequest("A unidade selecionada não está apta para votar nesta assembleia.");
    }

    const voteRight = await resolveVoteRight({
      assemblyId: assembly.id,
      condominiumId: assembly.condominiumId,
      unitId: eligibleUnit.unitId,
      userId: access.authUser.id,
      now,
    });

    if (!voteRight) {
      return forbidden(
        "Seu vínculo ou procuração não autoriza voto por esta unidade neste momento.",
      );
    }

    const agendaItemIds = Array.from(
      new Set(
        answersInput
          .map((item) => normalizeRequiredString(item.agendaItemId))
          .filter(Boolean),
      ),
    );

    if (agendaItemIds.length !== answersInput.length) {
      return badRequest("Cada pauta deve ser enviada uma única vez.");
    }

    const agendaItems = await db.assemblyAgendaItem.findMany({
      where: {
        assemblyId: assembly.id,
        id: { in: agendaItemIds },
      },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        votingStartsAt: true,
        votingEndsAt: true,
        options: {
          select: {
            id: true,
            isAbstention: true,
          },
        },
      },
    });

    if (agendaItems.length !== agendaItemIds.length) {
      return badRequest("Uma ou mais pautas informadas não pertencem à assembleia.");
    }

    const agendaById = new Map(agendaItems.map((item) => [item.id, item]));
    const validatedAnswers: ValidatedAnswer[] = [];

    for (const input of answersInput) {
      const agendaItemId = normalizeRequiredString(input.agendaItemId);
      const optionIds = normalizeStringArray(input.optionIds);
      const agendaItem = agendaById.get(agendaItemId);

      if (!agendaItem) {
        return badRequest("Pauta não encontrada.");
      }

      if (agendaItem.type === AssemblyAgendaItemType.INFORMATIVE) {
        return badRequest(`A pauta "${agendaItem.title}" é somente informativa.`);
      }

      if (agendaItem.status === AssemblyAgendaItemStatus.CANCELED) {
        return badRequest(`A pauta "${agendaItem.title}" foi cancelada.`);
      }

      if (
        !isAgendaWindowOpen({
          votingStartsAt: agendaItem.votingStartsAt,
          votingEndsAt: agendaItem.votingEndsAt,
          assemblyVotingStartsAt: assembly.votingStartsAt,
          assemblyVotingEndsAt: assembly.votingEndsAt,
          now,
        })
      ) {
        return forbidden(`A pauta "${agendaItem.title}" não está aberta para votação.`);
      }

      if (!validateOptionQuantity({ type: agendaItem.type, optionIds })) {
        return badRequest(
          agendaItem.type === AssemblyAgendaItemType.MULTIPLE_CHOICE
            ? `Selecione ao menos uma opção na pauta "${agendaItem.title}".`
            : `Selecione exatamente uma opção na pauta "${agendaItem.title}".`,
        );
      }

      const allowedOptionIds = new Set(agendaItem.options.map((option) => option.id));

      if (optionIds.some((optionId) => !allowedOptionIds.has(optionId))) {
        return badRequest(`Uma opção inválida foi enviada para a pauta "${agendaItem.title}".`);
      }

      const selectedOptions = agendaItem.options.filter((option) =>
        optionIds.includes(option.id),
      );
      const selectedAbstention = selectedOptions.some(
        (option) => option.isAbstention,
      );

      if (selectedAbstention && optionIds.length > 1) {
        return badRequest(
          `A opção Abster-se não pode ser combinada com outras alternativas na pauta "${agendaItem.title}".`,
        );
      }

      validatedAnswers.push({
        agendaItemId,
        optionIds,
      });
    }

    const voterAccessId =
      access.activeAccess.source === "USER_ACCESS"
        ? access.activeAccess.accessId || null
        : null;

    const existingVotes = await db.assemblyVote.findMany({
      where: {
        eligibleUnitId,
        agendaItemId: { in: validatedAnswers.map((item) => item.agendaItemId) },
      },
      include: {
        options: {
          select: {
            optionId: true,
          },
        },
      },
    });

    if (existingVotes.length > 0 && !assembly.allowVoteChange) {
      return conflict(
        "Já existe voto registrado para esta unidade e a assembleia não permite alteração.",
      );
    }

    if (existingVotes.length > 0 && !changeReason) {
      return badRequest("Informe o motivo da alteração do voto.");
    }

    const existingVoteByAgenda = new Map(
      existingVotes.map((vote) => [vote.agendaItemId, vote]),
    );

    const result = await db.$transaction(async (tx) => {
      const registeredVoteIds: string[] = [];
      const updatedVoteIds: string[] = [];

      for (const answer of validatedAnswers) {
        const existingVote = existingVoteByAgenda.get(answer.agendaItemId);

        if (!existingVote) {
          const created = await tx.assemblyVote.create({
            data: {
              assemblyId: assembly.id,
              agendaItemId: answer.agendaItemId,
              eligibleUnitId,
              unitId: eligibleUnit.unitId,
              voterUserId: access.authUser.id,
              voterAccessId,
              unitPersonLinkId: voteRight.unitPersonLinkId,
              representationId: voteRight.representationId,
              origin: voteRight.origin,
              version: 1,
              submittedAt: now,
              options: {
                create: answer.optionIds.map((optionId) => ({ optionId })),
              },
            },
          });

          await tx.assemblyVoteRevision.create({
            data: {
              voteId: created.id,
              version: 1,
              changedByUserId: access.authUser.id,
              reason: "Registro inicial do voto.",
              snapshot: buildVoteSnapshot({
                voteId: created.id,
                version: 1,
                agendaItemId: answer.agendaItemId,
                eligibleUnitId,
                unitId: eligibleUnit.unitId,
                voterUserId: access.authUser.id,
                voterAccessId,
                unitPersonLinkId: voteRight.unitPersonLinkId,
                representationId: voteRight.representationId,
                origin: voteRight.origin,
                optionIds: answer.optionIds,
                submittedAt: now,
              }),
            },
          });

          registeredVoteIds.push(created.id);
          continue;
        }

        const previousOptionIds = existingVote.options
          .map((item) => item.optionId)
          .sort();

        const nextOptionIds = [...answer.optionIds].sort();

        if (JSON.stringify(previousOptionIds) === JSON.stringify(nextOptionIds)) {
          continue;
        }

        const nextVersion = existingVote.version + 1;

        await tx.assemblyVoteOption.deleteMany({
          where: {
            voteId: existingVote.id,
          },
        });

        await tx.assemblyVote.update({
          where: {
            id: existingVote.id,
          },
          data: {
            voterUserId: access.authUser.id,
            voterAccessId,
            unitPersonLinkId: voteRight.unitPersonLinkId,
            representationId: voteRight.representationId,
            origin: voteRight.origin,
            version: nextVersion,
            submittedAt: now,
            options: {
              create: answer.optionIds.map((optionId) => ({ optionId })),
            },
          },
        });

        await tx.assemblyVoteRevision.create({
          data: {
            voteId: existingVote.id,
            version: nextVersion,
            changedByUserId: access.authUser.id,
            reason: changeReason,
            snapshot: buildVoteSnapshot({
              voteId: existingVote.id,
              version: nextVersion,
              agendaItemId: answer.agendaItemId,
              eligibleUnitId,
              unitId: eligibleUnit.unitId,
              voterUserId: access.authUser.id,
              voterAccessId,
              unitPersonLinkId: voteRight.unitPersonLinkId,
              representationId: voteRight.representationId,
              origin: voteRight.origin,
              optionIds: answer.optionIds,
              submittedAt: now,
            }),
          },
        });

        updatedVoteIds.push(existingVote.id);
      }

      const unitLabel = `${
        eligibleUnit.snapshotBlock ? `${eligibleUnit.snapshotBlock} - ` : ""
      }${eligibleUnit.snapshotUnitNumber}`;

      if (registeredVoteIds.length > 0) {
        await tx.assemblyLog.create({
          data: {
            assemblyId: assembly.id,
            userId: access.authUser.id,
            action: AssemblyLogAction.VOTE_REGISTERED,
            message: `Voto registrado para a unidade ${unitLabel}.`,
            metadata: {
              eligibleUnitId,
              unitId: eligibleUnit.unitId,
              voteIds: registeredVoteIds,
              origin: voteRight.origin,
              representationId: voteRight.representationId,
            },
          },
        });
      }

      if (updatedVoteIds.length > 0) {
        await tx.assemblyLog.create({
          data: {
            assemblyId: assembly.id,
            userId: access.authUser.id,
            action: AssemblyLogAction.VOTE_UPDATED,
            message: `Voto atualizado para a unidade ${unitLabel}.`,
            metadata: {
              eligibleUnitId,
              unitId: eligibleUnit.unitId,
              voteIds: updatedVoteIds,
              origin: voteRight.origin,
              representationId: voteRight.representationId,
              reason: changeReason,
            },
          },
        });
      }

      return {
        registered: registeredVoteIds.length,
        updated: updatedVoteIds.length,
      };
    });

    return NextResponse.json({
      message:
        result.updated > 0
          ? "Voto atualizado com sucesso. O histórico anterior foi preservado."
          : "Voto registrado com sucesso.",
      result,
    });
  } catch (error) {
    console.error("Erro ao registrar voto da assembleia:", error);

    return NextResponse.json(
      { error: "Não foi possível registrar o voto da assembleia." },
      { status: 500 },
    );
  }
}
