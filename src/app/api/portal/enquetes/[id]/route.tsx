import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  PollLogAction,
  PollResultVisibility,
  PollStatus,
  PollTargetScope,
  PollType,
  Status,
  type Prisma,
} from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasModuleAccess } from "@/lib/plan-limits";

/* =========================================================
   API PORTAL - DETALHE E RESPOSTA DE ENQUETE

   Arquivo:
   src/app/api/portal/enquetes/[id]/route.ts

   ETAPA 50 — ENQUETES

   Métodos:
   - GET: consulta detalhe da enquete disponível ao perfil ativo.
   - POST: registra ou atualiza a resposta do perfil ativo.

   Segurança:
   - Usa o perfil ativo do usuário via UserAccess.
   - Bloqueia usuário, condomínio, unidade, vínculo ou administradora
     inativos.
   - Exige módulo comercial Enquetes liberado.
   - Valida público-alvo antes de exibir detalhe e antes de responder.
   - Bloqueia resposta duplicada quando allowResponseUpdate=false.
   - Bloqueia resposta em enquete encerrada, cancelada, arquivada ou
     fora do período de disponibilidade.
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type SessionUserShape = {
  id?: string;
  activeAccessId?: string | null;
  accessId?: string | null;
  userAccessId?: string | null;
};

type PollAnswerBody = {
  optionId?: unknown;
  optionIds?: unknown;
  textAnswer?: unknown;
};

type PortalPollAccess = {
  authUser: {
    id: string;
    name: string | null;
    email: string;
  };
  accessId: string;
  accessLabel: string | null;
  role: AccessRole;
  administratorId: string;
  condominiumId: string;
  unitId: string | null;
  residentId: string | null;
  block: string | null;
  linkType: string | null;
  canVote: boolean;
  isGovernanceProfile: boolean;
};

type PollDetail = Prisma.PollGetPayload<{
  include: {
    condominium: {
      select: {
        id: true;
        name: true;
      };
    };
    targets: true;
    options: {
      orderBy: {
        order: "asc";
      };
      select: {
        id: true;
        label: true;
        description: true;
        order: true;
        isActive: true;
      };
    };
    responses: {
      where: {
        userId: string;
        accessId: string;
      };
      include: {
        selectedOption: {
          select: {
            id: true;
            label: true;
          };
        };
        selectedOptions: {
          include: {
            option: {
              select: {
                id: true;
                label: true;
              };
            };
          };
        };
      };
      take: 1;
    };
    _count: {
      select: {
        responses: true;
        options: true;
        targets: true;
      };
    };
  };
}>;

type PollResultRow = {
  optionId: string;
  label: string;
  total: number;
};

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();

    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function badRequest(message: string) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 400,
    },
  );
}

function getSessionUserId(sessionUser: SessionUserShape | undefined) {
  if (!sessionUser?.id) {
    return null;
  }

  return sessionUser.id;
}

function getSessionAccessId(sessionUser: SessionUserShape | undefined) {
  return (
    sessionUser?.activeAccessId ||
    sessionUser?.accessId ||
    sessionUser?.userAccessId ||
    null
  );
}

function isGovernanceRole(role: AccessRole) {
  const governanceRoles: AccessRole[] = [
    AccessRole.SINDICO,
    AccessRole.CONSELHEIRO,
  ];

  return governanceRoles.includes(role);
}

function isPollCurrentlyOpen(poll: {
  status: PollStatus;
  startsAt: Date | null;
  endsAt: Date | null;
}) {
  const now = new Date();

  if (poll.status !== PollStatus.PUBLISHED) {
    return false;
  }

  if (poll.startsAt && poll.startsAt > now) {
    return false;
  }

  if (poll.endsAt && poll.endsAt < now) {
    return false;
  }

  return true;
}

function canTargetMatchAccess(
  target: {
    condominiumId: string | null;
    unitId: string | null;
    block: string | null;
    role: AccessRole | null;
    linkType: string | null;
  },
  access: PortalPollAccess,
) {
  if (target.condominiumId && target.condominiumId !== access.condominiumId) {
    return false;
  }

  if (target.unitId && target.unitId !== access.unitId) {
    return false;
  }

  if (target.block && target.block !== access.block) {
    return false;
  }

  if (target.role && target.role !== access.role) {
    return false;
  }

  if (target.linkType && target.linkType !== access.linkType) {
    return false;
  }

  return true;
}

function isPollEligibleForAccess(poll: PollDetail, access: PortalPollAccess) {
  if (poll.administratorId !== access.administratorId) {
    return false;
  }

  if (poll.condominiumId && poll.condominiumId !== access.condominiumId) {
    return false;
  }

  if (poll.requireEligibleVoter && !access.canVote) {
    return false;
  }

  if (poll.targetScope === PollTargetScope.CONDOMINIUM) {
    return poll.condominiumId === access.condominiumId;
  }

  if (poll.targetScope === PollTargetScope.GOVERNANCE) {
    return access.isGovernanceProfile;
  }

  if (poll.targetScope === PollTargetScope.BLOCK) {
    return poll.targets.some((target) => {
      return Boolean(access.block) && canTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === PollTargetScope.UNIT) {
    return poll.targets.some((target) => {
      return Boolean(access.unitId) && canTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === PollTargetScope.ROLE) {
    return poll.targets.some((target) => {
      return target.role === access.role && canTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === PollTargetScope.LINK_TYPE) {
    return poll.targets.some((target) => {
      return Boolean(access.linkType) && canTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === PollTargetScope.CUSTOM) {
    return poll.targets.some((target) => canTargetMatchAccess(target, access));
  }

  return false;
}

function canParticipantSeeResults(params: {
  poll: PollDetail;
  hasResponded: boolean;
}) {
  const { poll, hasResponded } = params;

  // ETAPA 50 — USABILIDADE:
  // mesmo quando a regra de visibilidade permitir, o portal somente
  // exibe resultados após a publicação oficial pela administradora.
  if (!poll.resultsPublishedAt) {
    return false;
  }

  if (poll.resultVisibility === PollResultVisibility.PUBLIC_TO_TARGET) {
    return true;
  }

  if (
    poll.resultVisibility === PollResultVisibility.PARTICIPANTS_AFTER_RESPONSE &&
    hasResponded
  ) {
    return true;
  }

  if (
    poll.resultVisibility === PollResultVisibility.PARTICIPANTS_AFTER_CLOSED &&
    poll.status === PollStatus.CLOSED
  ) {
    return true;
  }

  return false;
}

async function requirePortalPollAccess(): Promise<
  PortalPollAccess | { error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUserShape | undefined;
  const userId = getSessionUserId(sessionUser);

  if (!userId) {
    return {
      error: NextResponse.json(
        {
          error: "Sessão expirada. Faça login novamente.",
        },
        {
          status: 401,
        },
      ),
    };
  }

  const activeAccessId = getSessionAccessId(sessionUser);

  const access = await db.userAccess.findFirst({
    where: {
      userId,
      isActive: true,
      ...(activeAccessId
        ? {
            id: activeAccessId,
          }
        : {}),
    },
    orderBy: activeAccessId
      ? undefined
      : [
          {
            isDefault: "desc",
          },
          {
            lastUsedAt: "desc",
          },
          {
            createdAt: "asc",
          },
        ],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
        },
      },
      unit: {
        select: {
          id: true,
          block: true,
          status: true,
        },
      },
      unitPersonLink: {
        select: {
          linkType: true,
          canVote: true,
          status: true,
        },
      },
      condominium: {
        select: {
          id: true,
          name: true,
          status: true,
          administratorId: true,
          administrator: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!access || !access.user.isActive) {
    return {
      error: NextResponse.json(
        {
          error: "Perfil ativo não encontrado ou usuário inativo.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (!access.condominiumId || !access.condominium) {
    return {
      error: NextResponse.json(
        {
          error: "Selecione um perfil vinculado a um condomínio para acessar enquetes.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (access.condominium.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        {
          error: "Este condomínio está inativo. O acesso às enquetes está bloqueado.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (access.condominium.administrator.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        {
          error: "A administradora deste condomínio está inativa. O acesso às enquetes está bloqueado.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (access.unit && access.unit.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        {
          error: "A unidade vinculada ao perfil ativo está inativa. O acesso às enquetes está bloqueado.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (
    access.unitPersonLink &&
    access.unitPersonLink.status !== Status.ACTIVE
  ) {
    return {
      error: NextResponse.json(
        {
          error: "O vínculo do perfil ativo está inativo. O acesso às enquetes está bloqueado.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  const moduleAccess = await hasModuleAccess({
    administratorId: access.condominium.administratorId,
    moduleSlug: "enquetes",
  });

  if (!moduleAccess.allowed) {
    return {
      error: NextResponse.json(
        {
          error: moduleAccess.message,
          code: "MODULE_ACCESS_DENIED",
          details: moduleAccess,
        },
        {
          status: 403,
        },
      ),
    };
  }

  return {
    authUser: {
      id: access.user.id,
      name: access.user.name,
      email: access.user.email,
    },
    accessId: access.id,
    accessLabel: access.label,
    role: access.role,
    administratorId: access.condominium.administratorId,
    condominiumId: access.condominiumId,
    unitId: access.unitId,
    residentId: access.residentId,
    block: access.unit?.block ?? null,
    linkType: access.unitPersonLink?.linkType ?? null,
    canVote: Boolean(access.unitPersonLink?.canVote),
    isGovernanceProfile: isGovernanceRole(access.role),
  };
}

async function findPollForPortal(params: {
  pollId: string;
  access: PortalPollAccess;
}) {
  const { pollId, access } = params;

  return db.poll.findFirst({
    where: {
      id: pollId,
      administratorId: access.administratorId,
      condominiumId: access.condominiumId,
      status: {
        in: [PollStatus.PUBLISHED, PollStatus.CLOSED],
      },
    },
    include: {
      condominium: {
        select: {
          id: true,
          name: true,
        },
      },
      targets: true,
      options: {
        orderBy: {
          order: "asc",
        },
        select: {
          id: true,
          label: true,
          description: true,
          order: true,
          isActive: true,
        },
      },
      responses: {
        where: {
          userId: access.authUser.id,
          accessId: access.accessId,
        },
        include: {
          selectedOption: {
            select: {
              id: true,
              label: true,
            },
          },
          selectedOptions: {
            include: {
              option: {
                select: {
                  id: true,
                  label: true,
                },
              },
            },
          },
        },
        take: 1,
      },
      _count: {
        select: {
          responses: true,
          options: true,
          targets: true,
        },
      },
    },
  });
}

async function buildResults(pollId: string): Promise<{
  totalResponses: number;
  options: PollResultRow[];
  textAnswersCount: number;
}> {
  const [pollOptions, responses] = await Promise.all([
    db.pollOption.findMany({
      where: {
        pollId,
        isActive: true,
      },
      orderBy: {
        order: "asc",
      },
      select: {
        id: true,
        label: true,
      },
    }),
    db.pollResponse.findMany({
      where: {
        pollId,
      },
      select: {
        selectedOptionId: true,
        textAnswer: true,
        selectedOptions: {
          select: {
            optionId: true,
          },
        },
      },
    }),
  ]);

  const countMap = new Map<string, number>();
  let textAnswersCount = 0;

  for (const response of responses) {
    if (response.selectedOptionId) {
      countMap.set(
        response.selectedOptionId,
        (countMap.get(response.selectedOptionId) ?? 0) + 1,
      );
    }

    if (response.textAnswer) {
      textAnswersCount += 1;
    }

    for (const selected of response.selectedOptions) {
      countMap.set(
        selected.optionId,
        (countMap.get(selected.optionId) ?? 0) + 1,
      );
    }
  }

  return {
    totalResponses: responses.length,
    options: pollOptions.map((option) => ({
      optionId: option.id,
      label: option.label,
      total: countMap.get(option.id) ?? 0,
    })),
    textAnswersCount,
  };
}

function serializePortalResults(
  results: Awaited<ReturnType<typeof buildResults>> | null,
) {
  if (!results) {
    return [];
  }

  return results.options.map((option, index) => ({
    ...option,
    order: index + 1,
    percentage:
      results.totalResponses > 0
        ? Math.round((option.total / results.totalResponses) * 100)
        : 0,
  }));
}

function serializePortalResponse(
  response:
    | {
        id: string;
        submittedAt: Date;
        updatedAt: Date;
        textAnswer: string | null;
        selectedOption?: { id: string; label: string } | null;
        selectedOptions?: {
          option: { id: string; label: string };
        }[];
      }
    | null,
) {
  if (!response) {
    return null;
  }

  return {
    ...response,
    createdAt: response.submittedAt,
    options: (response.selectedOptions ?? []).map((selected, index) => ({
      id: `${response.id}:${selected.option.id}`,
      option: {
        id: selected.option.id,
        label: selected.option.label,
        order: index + 1,
      },
    })),
  };
}

async function validateAnswer(params: {
  poll: PollDetail;
  body: PollAnswerBody;
}) {
  const { poll, body } = params;
  const activeOptionIds = new Set(
    poll.options.filter((option) => option.isActive).map((option) => option.id),
  );

  if (poll.type === PollType.TEXT) {
    const textAnswer = normalizeNullableString(body.textAnswer);

    if (!textAnswer || textAnswer.length < 2) {
      return {
        ok: false as const,
        message: "Informe uma resposta para a enquete.",
      };
    }

    if (textAnswer.length > 2000) {
      return {
        ok: false as const,
        message: "A resposta deve ter no máximo 2.000 caracteres.",
      };
    }

    return {
      ok: true as const,
      value: {
        selectedOptionId: null,
        selectedOptionIds: [] as string[],
        textAnswer,
      },
    };
  }

  if (poll.type === PollType.MULTIPLE_CHOICE) {
    const optionIds = normalizeStringArray(body.optionIds).filter((optionId) =>
      activeOptionIds.has(optionId),
    );

    if (optionIds.length === 0) {
      return {
        ok: false as const,
        message: "Selecione ao menos uma opção da enquete.",
      };
    }

    return {
      ok: true as const,
      value: {
        selectedOptionId: null,
        selectedOptionIds: optionIds,
        textAnswer: null,
      },
    };
  }

  const optionId = normalizeNullableString(body.optionId);

  if (!optionId || !activeOptionIds.has(optionId)) {
    return {
      ok: false as const,
      message: "Selecione uma opção válida da enquete.",
    };
  }

  return {
    ok: true as const,
    value: {
      selectedOptionId: optionId,
      selectedOptionIds: [] as string[],
      textAnswer: null,
    },
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const access = await requirePortalPollAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const { id } = await context.params;

    const poll = await findPollForPortal({
      pollId: id,
      access,
    });

    if (!poll || !isPollEligibleForAccess(poll, access)) {
      return NextResponse.json(
        {
          error: "Enquete não encontrada para o perfil ativo.",
        },
        {
          status: 404,
        },
      );
    }

    const myResponse = poll.responses[0] ?? null;
    const hasResponded = Boolean(myResponse);
    const canSeeResults = canParticipantSeeResults({
      poll,
      hasResponded,
    });

    const results = canSeeResults ? await buildResults(poll.id) : null;
    const serializedResponse = serializePortalResponse(myResponse);
    const serializedResults = serializePortalResults(results);
    const canRespond =
      isPollCurrentlyOpen(poll) && (!hasResponded || poll.allowResponseUpdate);

    return NextResponse.json({
      poll: {
        ...poll,
        responses: undefined,
        myResponse,
        userResponse: serializedResponse,
        hasResponded,
        responseStatus: hasResponded ? "RESPONDED" : "PENDING",
        canRespond,
        isOpen: isPollCurrentlyOpen(poll),
        canSeeResults,
        canViewResults: canSeeResults,
        results: serializedResults,
        totalResponses: results?.totalResponses ?? poll._count.responses,
      },
      userResponse: serializedResponse,
      canRespond,
      canViewResults: canSeeResults,
      results: serializedResults,
      totalResponses: results?.totalResponses ?? poll._count.responses,
      activeAccess: {
        id: access.accessId,
        role: access.role,
        label: access.accessLabel,
        condominiumId: access.condominiumId,
        unitId: access.unitId,
        residentId: access.residentId,
        block: access.block,
        linkType: access.linkType,
        canVote: access.canVote,
        isGovernanceProfile: access.isGovernanceProfile,
      },
    });
  } catch (error) {
    console.error("Erro ao consultar enquete do portal:", error);

    return NextResponse.json(
      {
        error: "Não foi possível consultar a enquete.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const access = await requirePortalPollAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as PollAnswerBody;

    const poll = await findPollForPortal({
      pollId: id,
      access,
    });

    if (!poll || !isPollEligibleForAccess(poll, access)) {
      return NextResponse.json(
        {
          error: "Enquete não encontrada para o perfil ativo.",
        },
        {
          status: 404,
        },
      );
    }

    if (!isPollCurrentlyOpen(poll)) {
      return badRequest("Esta enquete não está aberta para resposta.");
    }

    const existingResponse = poll.responses[0] ?? null;

    if (existingResponse && !poll.allowResponseUpdate) {
      return badRequest("Este perfil já respondeu esta enquete.");
    }

    const answerValidation = await validateAnswer({
      poll,
      body,
    });

    if (!answerValidation.ok) {
      return badRequest(answerValidation.message);
    }

    const savedResponse = await db.$transaction(async (tx) => {
      if (existingResponse && poll.allowResponseUpdate) {
        await tx.pollResponseOption.deleteMany({
          where: {
            pollResponseId: existingResponse.id,
          },
        });

        const updated = await tx.pollResponse.update({
          where: {
            id: existingResponse.id,
          },
          data: {
            selectedOptionId: answerValidation.value.selectedOptionId,
            textAnswer: answerValidation.value.textAnswer,
            metadata: {
              source: "PORTAL",
              updatedFrom: "PORTAL_POLL_RESPONSE",
            },
          },
        });

        if (answerValidation.value.selectedOptionIds.length > 0) {
          await tx.pollResponseOption.createMany({
            data: answerValidation.value.selectedOptionIds.map((optionId) => ({
              pollResponseId: updated.id,
              optionId,
            })),
            skipDuplicates: true,
          });
        }

        await tx.pollLog.create({
          data: {
            pollId: poll.id,
            userId: access.authUser.id,
            action: PollLogAction.RESPONSE_UPDATED,
            message: "Resposta da enquete atualizada pelo portal.",
            metadata: {
              accessId: access.accessId,
              role: access.role,
              source: "PORTAL",
            },
          },
        });

        return updated;
      }

      const created = await tx.pollResponse.create({
        data: {
          pollId: poll.id,
          userId: access.authUser.id,
          accessId: access.accessId,
          condominiumId: access.condominiumId,
          unitId: access.unitId,
          residentId: access.residentId,
          selectedOptionId: answerValidation.value.selectedOptionId,
          textAnswer: answerValidation.value.textAnswer,
          metadata: {
            source: "PORTAL",
            createdFrom: "PORTAL_POLL_RESPONSE",
            role: access.role,
            linkType: access.linkType,
          },
        },
      });

      if (answerValidation.value.selectedOptionIds.length > 0) {
        await tx.pollResponseOption.createMany({
          data: answerValidation.value.selectedOptionIds.map((optionId) => ({
            pollResponseId: created.id,
            optionId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.pollLog.create({
        data: {
          pollId: poll.id,
          userId: access.authUser.id,
          action: PollLogAction.RESPONSE_REGISTERED,
          message: "Resposta da enquete registrada pelo portal.",
          metadata: {
            accessId: access.accessId,
            role: access.role,
            source: "PORTAL",
          },
        },
      });

      return created;
    });

    const canSeeResults = canParticipantSeeResults({
      poll,
      hasResponded: true,
    });

    const results = canSeeResults ? await buildResults(poll.id) : null;
    const serializedResults = serializePortalResults(results);

    const refreshedResponse = await db.pollResponse.findUnique({
      where: {
        id: savedResponse.id,
      },
      include: {
        selectedOption: {
          select: {
            id: true,
            label: true,
          },
        },
        selectedOptions: {
          include: {
            option: {
              select: {
                id: true,
                label: true,
              },
            },
          },
        },
      },
    });

    const serializedResponse = serializePortalResponse(refreshedResponse);

    return NextResponse.json(
      {
        response: savedResponse,
        userResponse: serializedResponse,
        canRespond: poll.allowResponseUpdate && isPollCurrentlyOpen(poll),
        canViewResults: canSeeResults,
        results: serializedResults,
        totalResponses: results?.totalResponses ?? 0,
        message: existingResponse
          ? "Resposta atualizada com sucesso."
          : "Resposta registrada com sucesso.",
      },
      {
        status: existingResponse ? 200 : 201,
      },
    );
  } catch (error) {
    console.error("Erro ao responder enquete do portal:", error);

    return NextResponse.json(
      {
        error: "Não foi possível registrar a resposta da enquete.",
      },
      {
        status: 500,
      },
    );
  }
}
