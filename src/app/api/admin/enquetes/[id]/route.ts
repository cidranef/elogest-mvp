import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  PollLogAction,
  PollResultVisibility,
  PollStatus,
  PollTargetScope,
  PollType,
  Status,
  UnitPersonLinkType,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { notifyPollAudience } from "@/lib/notifications";

/* =========================================================
   API ADMIN - DETALHE DA ENQUETE

   Arquivo:
   src/app/api/admin/enquetes/[id]/route.ts

   ETAPA 50 — ENQUETES

   Métodos:
   - GET: consulta detalhe, resultados, respostas e histórico da enquete.
   - PATCH: edita rascunho ou executa ações de status/usabilidade.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Bloqueia administradora INACTIVE pelo admin-api-guard.
   - Exige módulo comercial Enquetes liberado.
   - Isola dados por administratorId do perfil ativo.
   - Valida se o condomínio pertence à carteira da administradora.
   - SUPER_ADMIN não opera esta API.

   Regras principais:
   - Enquete com respostas não pode ser editada estruturalmente.
   - Publicação só é permitida para rascunhos.
   - Encerramento só é permitido para enquetes publicadas.
   - Arquivamento preserva histórico e respostas.
   - Cancelamento preserva histórico e bloqueia novas respostas.
   - Prorrogação exige novo prazo futuro e posterior ao prazo atual.
   - Publicação de resultados é uma ação explícita após encerramento.
   - Prorrogação, publicação e reabertura limpam o lembrete de vencimento,
     permitindo novo aviso operacional quando o novo prazo se esgotar.
   ========================================================= */

const POLLS_MODULE_SLUG = "enquetes";
const POLLS_MODULE_LABEL = "Enquetes";

async function notifyPollAudienceSafely(params: Parameters<typeof notifyPollAudience>[0]) {
  try {
    await notifyPollAudience(params);
  } catch (error) {
    console.error("Erro ao criar notificações da enquete:", {
      pollId: params.pollId,
      type: params.type,
      error,
    });
  }
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdatePollBody = {
  action?: unknown;
  title?: unknown;
  description?: unknown;
  condominiumId?: unknown;
  type?: unknown;
  targetScope?: unknown;
  resultVisibility?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  newEndsAt?: unknown;
  allowResponseUpdate?: unknown;
  anonymousResults?: unknown;
  requireEligibleVoter?: unknown;
  unitId?: unknown;
  block?: unknown;
  role?: unknown;
  linkType?: unknown;
  options?: unknown;
  targets?: unknown;
};

type PollOptionInput = {
  id: string | null;
  label: string;
  description: string | null;
  order: number;
  isActive: boolean;
};

type PollTargetInput = {
  condominiumId: string | null;
  unitId: string | null;
  block: string | null;
  role: AccessRole | null;
  linkType: UnitPersonLinkType | null;
};

type PollAction =
  | "PUBLISH"
  | "CLOSE"
  | "ARCHIVE"
  | "CANCEL"
  | "REOPEN"
  | "EXTEND"
  | "PUBLISH_RESULTS";

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

function forbidden(message: string) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 403,
    },
  );
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown) {
  return normalizeNullableString(value) ?? "";
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "sim"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "nao", "não"].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function parseDateOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  if (typeof value !== "string" && !(value instanceof Date)) {
    return {
      ok: false as const,
      message: "Informe uma data válida.",
    };
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false as const,
      message: "Informe uma data válida.",
    };
  }

  return {
    ok: true as const,
    value: date,
  };
}

function parsePollAction(value: unknown) {
  const action = normalizeNullableString(value)?.toUpperCase();

  if (!action) {
    return {
      ok: true as const,
      value: null,
    };
  }

  const allowedActions: PollAction[] = [
    "PUBLISH",
    "CLOSE",
    "ARCHIVE",
    "CANCEL",
    "REOPEN",
    "EXTEND",
    "PUBLISH_RESULTS",
  ];

  if (!allowedActions.includes(action as PollAction)) {
    return {
      ok: false as const,
      message: "Ação da enquete inválida.",
    };
  }

  return {
    ok: true as const,
    value: action as PollAction,
  };
}

function parsePollType(value: unknown, fallback: PollType) {
  if (value === undefined || value === null || value === "") {
    return {
      ok: true as const,
      value: fallback,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false as const,
      message: "Tipo de enquete inválido.",
    };
  }

  if (!Object.values(PollType).includes(value as PollType)) {
    return {
      ok: false as const,
      message: "Tipo de enquete inválido.",
    };
  }

  return {
    ok: true as const,
    value: value as PollType,
  };
}

function parsePollTargetScope(value: unknown, fallback: PollTargetScope) {
  if (value === undefined || value === null || value === "") {
    return {
      ok: true as const,
      value: fallback,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false as const,
      message: "Público-alvo da enquete inválido.",
    };
  }

  if (!Object.values(PollTargetScope).includes(value as PollTargetScope)) {
    return {
      ok: false as const,
      message: "Público-alvo da enquete inválido.",
    };
  }

  return {
    ok: true as const,
    value: value as PollTargetScope,
  };
}

function parsePollResultVisibility(
  value: unknown,
  fallback: PollResultVisibility,
) {
  if (value === undefined || value === null || value === "") {
    return {
      ok: true as const,
      value: fallback,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false as const,
      message: "Visibilidade dos resultados inválida.",
    };
  }

  if (
    !Object.values(PollResultVisibility).includes(
      value as PollResultVisibility,
    )
  ) {
    return {
      ok: false as const,
      message: "Visibilidade dos resultados inválida.",
    };
  }

  return {
    ok: true as const,
    value: value as PollResultVisibility,
  };
}

function parseAccessRoleOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false as const,
      message: "Perfil informado inválido.",
    };
  }

  if (!Object.values(AccessRole).includes(value as AccessRole)) {
    return {
      ok: false as const,
      message: "Perfil informado inválido.",
    };
  }

  const role = value as AccessRole;

  const allowedPollTargetRoles: AccessRole[] = [
    AccessRole.SINDICO,
    AccessRole.CONSELHEIRO,
    AccessRole.MORADOR,
    AccessRole.PROPRIETARIO,
  ];

  if (!allowedPollTargetRoles.includes(role)) {
    return {
      ok: false as const,
      message:
        "A enquete por perfil deve ser direcionada a síndico, conselheiro, morador ou proprietário.",
    };
  }

  return {
    ok: true as const,
    value: role,
  };
}

function parseUnitPersonLinkTypeOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false as const,
      message: "Tipo de vínculo informado inválido.",
    };
  }

  if (!Object.values(UnitPersonLinkType).includes(value as UnitPersonLinkType)) {
    return {
      ok: false as const,
      message: "Tipo de vínculo informado inválido.",
    };
  }

  return {
    ok: true as const,
    value: value as UnitPersonLinkType,
  };
}

function normalizeOptions(value: unknown, pollType: PollType) {
  if (pollType === PollType.TEXT) {
    return {
      ok: true as const,
      value: [] as PollOptionInput[],
    };
  }

  if (pollType === PollType.YES_NO) {
    if (!Array.isArray(value) || value.length === 0) {
      return {
        ok: true as const,
        value: [
          {
            id: null,
            label: "Sim",
            description: null,
            order: 1,
            isActive: true,
          },
          {
            id: null,
            label: "Não",
            description: null,
            order: 2,
            isActive: true,
          },
        ] satisfies PollOptionInput[],
      };
    }
  }

  if (!Array.isArray(value)) {
    return {
      ok: false as const,
      message: "Informe as opções da enquete.",
    };
  }

  const options = value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const label = normalizeRequiredString(raw.label);

      if (label.length < 1) {
        return null;
      }

      const orderParam = Number(raw.order ?? index + 1);
      const order = Number.isFinite(orderParam)
        ? Math.max(Math.floor(orderParam), 1)
        : index + 1;

      return {
        id: normalizeNullableString(raw.id),
        label,
        description: normalizeNullableString(raw.description),
        order,
        isActive: normalizeBoolean(raw.isActive, true),
      } satisfies PollOptionInput;
    })
    .filter((item): item is PollOptionInput => Boolean(item));

  if (pollType === PollType.YES_NO && options.length !== 2) {
    return {
      ok: false as const,
      message: "Enquetes do tipo Sim/Não devem ter exatamente duas opções.",
    };
  }

  if (
    (pollType === PollType.SINGLE_CHOICE ||
      pollType === PollType.MULTIPLE_CHOICE) &&
    options.length < 2
  ) {
    return {
      ok: false as const,
      message: "Informe pelo menos duas opções para a enquete.",
    };
  }

  if (options.length > 20) {
    return {
      ok: false as const,
      message: "A enquete pode ter no máximo 20 opções.",
    };
  }

  const duplicated = new Set<string>();

  for (const option of options) {
    const key = option.label.trim().toLowerCase();

    if (duplicated.has(key)) {
      return {
        ok: false as const,
        message: "Não repita opções com o mesmo texto.",
      };
    }

    duplicated.add(key);
  }

  return {
    ok: true as const,
    value: options,
  };
}

function normalizeCustomTargets(value: unknown): PollTargetInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const rawTarget = item as Record<string, unknown>;
      const roleValidation = parseAccessRoleOrNull(rawTarget.role);
      const linkTypeValidation = parseUnitPersonLinkTypeOrNull(
        rawTarget.linkType,
      );

      return {
        condominiumId: normalizeNullableString(rawTarget.condominiumId),
        unitId: normalizeNullableString(rawTarget.unitId),
        block: normalizeNullableString(rawTarget.block),
        role: roleValidation.ok ? roleValidation.value : null,
        linkType: linkTypeValidation.ok ? linkTypeValidation.value : null,
      } satisfies PollTargetInput;
    })
    .filter((item): item is PollTargetInput => Boolean(item));
}

async function findPollForAdmin(params: {
  pollId: string;
  administratorId: string;
}) {
  return db.poll.findFirst({
    where: {
      id: params.pollId,
      administratorId: params.administratorId,
    },
    include: {
      condominium: {
        select: {
          id: true,
          name: true,
        },
      },
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      resultsPublishedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      options: {
        orderBy: {
          order: "asc",
        },
      },
      targets: {
        include: {
          unit: {
            select: {
              id: true,
              block: true,
              unitNumber: true,
            },
          },
        },
      },
      responses: {
        orderBy: {
          submittedAt: "desc",
        },
        take: 50,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          userAccess: {
            select: {
              id: true,
              role: true,
              label: true,
              condominiumId: true,
              unitId: true,
              residentId: true,
            },
          },
          selectedOption: {
            select: {
              id: true,
              label: true,
              order: true,
            },
          },
          selectedOptions: {
            include: {
              option: {
                select: {
                  id: true,
                  label: true,
                  order: true,
                },
              },
            },
            orderBy: {
              option: {
                order: "asc",
              },
            },
          },
        },
      },
      logs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 80,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      _count: {
        select: {
          responses: true,
          targets: true,
          logs: true,
          notifications: true,
        },
      },
    },
  });
}

async function validateCondominium(params: {
  administratorId: string;
  condominiumId: string;
}) {
  const condominium = await db.condominium.findFirst({
    where: {
      id: params.condominiumId,
      administratorId: params.administratorId,
      status: Status.ACTIVE,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!condominium) {
    return {
      ok: false as const,
      status: 404,
      message: "Condomínio não encontrado na carteira ativa da administradora.",
    };
  }

  return {
    ok: true as const,
    value: condominium,
  };
}

async function validateUnit(params: {
  condominiumId: string;
  unitId: string;
}) {
  const unit = await db.unit.findFirst({
    where: {
      id: params.unitId,
      condominiumId: params.condominiumId,
      status: Status.ACTIVE,
    },
    select: {
      id: true,
      condominiumId: true,
      block: true,
      unitNumber: true,
    },
  });

  if (!unit) {
    return {
      ok: false as const,
      status: 404,
      message: "Unidade não encontrada no condomínio informado.",
    };
  }

  return {
    ok: true as const,
    value: unit,
  };
}

async function validateBlock(params: {
  condominiumId: string;
  block: string;
}) {
  const totalUnits = await db.unit.count({
    where: {
      condominiumId: params.condominiumId,
      block: params.block,
      status: Status.ACTIVE,
    },
  });

  if (totalUnits === 0) {
    return {
      ok: false as const,
      status: 404,
      message: "Bloco não encontrado entre as unidades ativas do condomínio.",
    };
  }

  return {
    ok: true as const,
  };
}

async function buildPollTargets(params: {
  administratorId: string;
  condominiumId: string;
  targetScope: PollTargetScope;
  unitId: string | null;
  block: string | null;
  role: AccessRole | null;
  linkType: UnitPersonLinkType | null;
  customTargets: PollTargetInput[] | null;
}) {
  const {
    administratorId,
    condominiumId,
    targetScope,
    unitId,
    block,
    role,
    linkType,
    customTargets,
  } = params;

  const condominiumValidation = await validateCondominium({
    administratorId,
    condominiumId,
  });

  if (!condominiumValidation.ok) {
    return condominiumValidation;
  }

  if (targetScope === PollTargetScope.CONDOMINIUM) {
    return {
      ok: true as const,
      value: [
        {
          condominiumId,
          unitId: null,
          block: null,
          role: null,
          linkType: null,
        },
      ] satisfies PollTargetInput[],
    };
  }

  if (targetScope === PollTargetScope.BLOCK) {
    if (!block) {
      return {
        ok: false as const,
        status: 400,
        message: "Informe o bloco da enquete.",
      };
    }

    const blockValidation = await validateBlock({
      condominiumId,
      block,
    });

    if (!blockValidation.ok) {
      return blockValidation;
    }

    return {
      ok: true as const,
      value: [
        {
          condominiumId,
          unitId: null,
          block,
          role: null,
          linkType: null,
        },
      ] satisfies PollTargetInput[],
    };
  }

  if (targetScope === PollTargetScope.UNIT) {
    if (!unitId) {
      return {
        ok: false as const,
        status: 400,
        message: "Informe a unidade da enquete.",
      };
    }

    const unitValidation = await validateUnit({
      condominiumId,
      unitId,
    });

    if (!unitValidation.ok) {
      return unitValidation;
    }

    return {
      ok: true as const,
      value: [
        {
          condominiumId,
          unitId,
          block: null,
          role: null,
          linkType: null,
        },
      ] satisfies PollTargetInput[],
    };
  }

  if (targetScope === PollTargetScope.ROLE) {
    if (!role) {
      return {
        ok: false as const,
        status: 400,
        message: "Informe o perfil que poderá responder à enquete.",
      };
    }

    return {
      ok: true as const,
      value: [
        {
          condominiumId,
          unitId: null,
          block: null,
          role,
          linkType: null,
        },
      ] satisfies PollTargetInput[],
    };
  }

  if (targetScope === PollTargetScope.LINK_TYPE) {
    if (!linkType) {
      return {
        ok: false as const,
        status: 400,
        message: "Informe o tipo de vínculo que poderá responder à enquete.",
      };
    }

    return {
      ok: true as const,
      value: [
        {
          condominiumId,
          unitId: null,
          block: null,
          role: null,
          linkType,
        },
      ] satisfies PollTargetInput[],
    };
  }

  if (targetScope === PollTargetScope.GOVERNANCE) {
    return {
      ok: true as const,
      value: [
        {
          condominiumId,
          unitId: null,
          block: null,
          role: AccessRole.SINDICO,
          linkType: null,
        },
        {
          condominiumId,
          unitId: null,
          block: null,
          role: AccessRole.CONSELHEIRO,
          linkType: null,
        },
      ] satisfies PollTargetInput[],
    };
  }

  if (targetScope === PollTargetScope.CUSTOM) {
    if (!customTargets || customTargets.length === 0) {
      return {
        ok: false as const,
        status: 400,
        message: "Informe pelo menos um público personalizado.",
      };
    }

    if (customTargets.length > 30) {
      return {
        ok: false as const,
        status: 400,
        message: "A enquete pode ter no máximo 30 públicos personalizados.",
      };
    }

    const normalizedTargets: PollTargetInput[] = [];

    for (const customTarget of customTargets) {
      const targetCondominiumId = customTarget.condominiumId ?? condominiumId;

      if (targetCondominiumId !== condominiumId) {
        return {
          ok: false as const,
          status: 400,
          message:
            "Nesta etapa, os públicos personalizados devem pertencer ao mesmo condomínio da enquete.",
        };
      }

      if (customTarget.unitId) {
        const unitValidation = await validateUnit({
          condominiumId,
          unitId: customTarget.unitId,
        });

        if (!unitValidation.ok) {
          return unitValidation;
        }
      }

      if (customTarget.block) {
        const blockValidation = await validateBlock({
          condominiumId,
          block: customTarget.block,
        });

        if (!blockValidation.ok) {
          return blockValidation;
        }
      }

      const hasTargetDetail =
        Boolean(customTarget.unitId) ||
        Boolean(customTarget.block) ||
        Boolean(customTarget.role) ||
        Boolean(customTarget.linkType);

      if (!hasTargetDetail) {
        return {
          ok: false as const,
          status: 400,
          message:
            "Cada público personalizado deve informar unidade, bloco, perfil ou tipo de vínculo.",
        };
      }

      normalizedTargets.push({
        condominiumId,
        unitId: customTarget.unitId,
        block: customTarget.block,
        role: customTarget.role,
        linkType: customTarget.linkType,
      });
    }

    return {
      ok: true as const,
      value: normalizedTargets,
    };
  }

  return {
    ok: false as const,
    status: 400,
    message: "Público-alvo da enquete inválido.",
  };
}

async function buildPollResults(pollId: string) {
  const [singleChoiceCounts, multipleChoiceCounts, totalResponses] =
    await Promise.all([
      db.pollResponse.groupBy({
        by: ["selectedOptionId"],
        where: {
          pollId,
          selectedOptionId: {
            not: null,
          },
        },
        _count: {
          _all: true,
        },
      }),
      db.pollResponseOption.groupBy({
        by: ["optionId"],
        where: {
          pollResponse: {
            pollId,
          },
        },
        _count: {
          _all: true,
        },
      }),
      db.pollResponse.count({
        where: {
          pollId,
        },
      }),
    ]);

  const optionCounts = new Map<string, number>();

  for (const item of singleChoiceCounts) {
    if (!item.selectedOptionId) {
      continue;
    }

    optionCounts.set(
      item.selectedOptionId,
      (optionCounts.get(item.selectedOptionId) ?? 0) + item._count._all,
    );
  }

  for (const item of multipleChoiceCounts) {
    optionCounts.set(
      item.optionId,
      (optionCounts.get(item.optionId) ?? 0) + item._count._all,
    );
  }

  return {
    totalResponses,
    optionCounts: Array.from(optionCounts.entries()).map(
      ([optionId, total]) => ({
        optionId,
        total,
      }),
    ),
  };
}

function resolvePollLogActionForStatus(status: PollStatus) {
  if (status === PollStatus.PUBLISHED) return PollLogAction.PUBLISHED;
  if (status === PollStatus.CLOSED) return PollLogAction.CLOSED;
  if (status === PollStatus.ARCHIVED) return PollLogAction.ARCHIVED;
  if (status === PollStatus.CANCELED) return PollLogAction.CANCELED;

  return PollLogAction.UPDATED;
}

function resolvePollMessageForStatus(status: PollStatus) {
  if (status === PollStatus.PUBLISHED) return "Enquete publicada.";
  if (status === PollStatus.CLOSED) return "Enquete encerrada.";
  if (status === PollStatus.ARCHIVED) return "Enquete arquivada.";
  if (status === PollStatus.CANCELED) return "Enquete cancelada.";

  return "Enquete atualizada.";
}

function validateStatusAction(params: {
  action: PollAction;
  currentStatus: PollStatus;
  endsAt: Date | null;
  resultsPublishedAt: Date | null;
}) {
  const { action, currentStatus, endsAt, resultsPublishedAt } = params;
  const now = new Date();

  if (action === "PUBLISH") {
    if (currentStatus !== PollStatus.DRAFT) {
      return {
        ok: false as const,
        message: "Somente enquetes em rascunho podem ser publicadas.",
      };
    }

    if (endsAt && endsAt <= now) {
      return {
        ok: false as const,
        message: "Não é possível publicar uma enquete com prazo já encerrado.",
      };
    }
  }

  if (action === "CLOSE") {
    if (currentStatus !== PollStatus.PUBLISHED) {
      return {
        ok: false as const,
        message: "Somente enquetes publicadas podem ser encerradas.",
      };
    }
  }

  if (action === "ARCHIVE") {
    if (
      currentStatus !== PollStatus.CLOSED &&
      currentStatus !== PollStatus.CANCELED
    ) {
      return {
        ok: false as const,
        message: "Somente enquetes encerradas ou canceladas podem ser arquivadas.",
      };
    }
  }

  if (action === "CANCEL") {
    if (
      currentStatus === PollStatus.CLOSED ||
      currentStatus === PollStatus.ARCHIVED ||
      currentStatus === PollStatus.CANCELED
    ) {
      return {
        ok: false as const,
        message:
          "Somente enquetes em rascunho ou publicadas podem ser canceladas.",
      };
    }
  }

  if (action === "REOPEN") {
    if (currentStatus !== PollStatus.CLOSED) {
      return {
        ok: false as const,
        message: "Somente enquetes encerradas podem ser reabertas.",
      };
    }

    if (endsAt && endsAt <= now) {
      return {
        ok: false as const,
        message:
          "Atualize o prazo final antes de reabrir uma enquete já vencida.",
      };
    }
  }

  if (action === "EXTEND") {
    if (
      currentStatus !== PollStatus.PUBLISHED &&
      currentStatus !== PollStatus.CLOSED
    ) {
      return {
        ok: false as const,
        message:
          "Somente enquetes publicadas ou encerradas podem ter o prazo prorrogado.",
      };
    }
  }

  if (action === "PUBLISH_RESULTS") {
    if (currentStatus !== PollStatus.CLOSED) {
      return {
        ok: false as const,
        message:
          "Encerre a enquete antes de publicar oficialmente os resultados.",
      };
    }

    if (resultsPublishedAt) {
      return {
        ok: false as const,
        message: "Os resultados desta enquete já foram publicados.",
      };
    }
  }

  return {
    ok: true as const,
  };
}

function resolveStatusFromAction(action: PollAction) {
  if (action === "PUBLISH") return PollStatus.PUBLISHED;
  if (action === "CLOSE") return PollStatus.CLOSED;
  if (action === "ARCHIVE") return PollStatus.ARCHIVED;
  if (action === "CANCEL") return PollStatus.CANCELED;
  if (action === "REOPEN") return PollStatus.PUBLISHED;
  if (action === "EXTEND") return PollStatus.PUBLISHED;

  return PollStatus.DRAFT;
}

function buildStatusDateUpdate(action: PollAction, now: Date) {
  if (action === "PUBLISH") {
    return {
      startsAt: now,
      publishedAt: now,
      adminExpiryReminderSentAt: null,
    } satisfies Prisma.PollUpdateInput;
  }

  if (action === "CLOSE") {
    return {
      closedAt: now,
    } satisfies Prisma.PollUpdateInput;
  }

  if (action === "ARCHIVE") {
    return {
      archivedAt: now,
    } satisfies Prisma.PollUpdateInput;
  }

  if (action === "CANCEL") {
    return {
      canceledAt: now,
    } satisfies Prisma.PollUpdateInput;
  }

  if (action === "REOPEN") {
    return {
      closedAt: null,
      adminExpiryReminderSentAt: null,
    } satisfies Prisma.PollUpdateInput;
  }

  return {} satisfies Prisma.PollUpdateInput;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    POLLS_MODULE_SLUG,
    POLLS_MODULE_LABEL,
  );

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;

    const poll = await findPollForAdmin({
      pollId: id,
      administratorId: auth.administratorId,
    });

    if (!poll) {
      return NextResponse.json(
        {
          error: "Enquete não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    const results = await buildPollResults(poll.id);

    return NextResponse.json({
      poll,
      results,
    });
  } catch (error) {
    console.error("Erro ao consultar enquete:", error);

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    POLLS_MODULE_SLUG,
    POLLS_MODULE_LABEL,
  );

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdatePollBody;

    const currentPoll = await db.poll.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      include: {
        options: true,
        targets: true,
        _count: {
          select: {
            responses: true,
          },
        },
      },
    });

    if (!currentPoll) {
      return NextResponse.json(
        {
          error: "Enquete não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    const actionValidation = parsePollAction(body.action);
    if (!actionValidation.ok) {
      return badRequest(actionValidation.message);
    }

    if (actionValidation.value) {
      const statusActionValidation = validateStatusAction({
        action: actionValidation.value,
        currentStatus: currentPoll.status,
        endsAt: currentPoll.endsAt,
        resultsPublishedAt: currentPoll.resultsPublishedAt,
      });

      if (!statusActionValidation.ok) {
        return badRequest(statusActionValidation.message);
      }

      const now = new Date();

      if (actionValidation.value === "EXTEND") {
        const newEndsAtValidation = parseDateOrNull(body.newEndsAt ?? body.endsAt);

        if (!newEndsAtValidation.ok || !newEndsAtValidation.value) {
          return badRequest("Informe o novo prazo final da enquete.");
        }

        if (newEndsAtValidation.value <= now) {
          return badRequest("O novo prazo final deve ser posterior ao horário atual.");
        }

        if (
          currentPoll.endsAt &&
          newEndsAtValidation.value <= currentPoll.endsAt
        ) {
          return badRequest("O novo prazo final deve ser posterior ao prazo atual da enquete.");
        }

        const reopened = currentPoll.status === PollStatus.CLOSED;

        await db.$transaction(async (tx) => {
          await tx.poll.update({
            where: {
              id: currentPoll.id,
            },
            data: {
              status: PollStatus.PUBLISHED,
              endsAt: newEndsAtValidation.value,
              closedAt: reopened ? null : currentPoll.closedAt,
              adminExpiryReminderSentAt: null,
            },
          });

          await tx.pollLog.create({
            data: {
              pollId: currentPoll.id,
              userId: auth.authUser.id,
              action: PollLogAction.EXTENDED,
              message: reopened
                ? "Prazo da enquete prorrogado e enquete reaberta."
                : "Prazo da enquete prorrogado.",
              fromValue: currentPoll.endsAt?.toISOString() ?? null,
              toValue: newEndsAtValidation.value.toISOString(),
              metadata: {
                action: actionValidation.value,
                previousEndsAt: currentPoll.endsAt?.toISOString() ?? null,
                newEndsAt: newEndsAtValidation.value.toISOString(),
                reopened,
                changedAt: now.toISOString(),
              },
            },
          });
        });

        await notifyPollAudienceSafely({
          pollId: currentPoll.id,
          actorUser: auth.authUser,
          type: "POLL_EXTENDED",
          title: reopened
            ? "Enquete reaberta com novo prazo"
            : "Prazo de enquete prorrogado",
          message: reopened
            ? `A enquete "${currentPoll.title}" foi reaberta com um novo prazo para participação.`
            : `O prazo da enquete "${currentPoll.title}" foi prorrogado.`,
          metadata: {
            source: "ADMIN_POLL_EXTEND",
            previousEndsAt: currentPoll.endsAt?.toISOString() ?? null,
            newEndsAt: newEndsAtValidation.value.toISOString(),
            reopened,
          },
        });

        const updatedPoll = await findPollForAdmin({
          pollId: currentPoll.id,
          administratorId: auth.administratorId,
        });

        return NextResponse.json({
          poll: updatedPoll,
          message: reopened
            ? "Prazo prorrogado e enquete reaberta com sucesso."
            : "Prazo da enquete prorrogado com sucesso.",
        });
      }

      if (actionValidation.value === "PUBLISH_RESULTS") {
        const resultVisibilityValidation = parsePollResultVisibility(
          body.resultVisibility,
          currentPoll.resultVisibility,
        );

        if (!resultVisibilityValidation.ok) {
          return badRequest(resultVisibilityValidation.message);
        }

        if (resultVisibilityValidation.value === PollResultVisibility.ADMIN_ONLY) {
          return badRequest(
            "Selecione uma visibilidade destinada aos participantes antes de publicar os resultados.",
          );
        }

        await db.$transaction(async (tx) => {
          await tx.poll.update({
            where: {
              id: currentPoll.id,
            },
            data: {
              resultVisibility: resultVisibilityValidation.value,
              resultsPublishedAt: now,
              resultsPublishedByUserId: auth.authUser.id,
            },
          });

          await tx.pollLog.create({
            data: {
              pollId: currentPoll.id,
              userId: auth.authUser.id,
              action: PollLogAction.RESULTS_PUBLISHED,
              message: "Resultados da enquete publicados oficialmente.",
              fromValue: currentPoll.resultVisibility,
              toValue: resultVisibilityValidation.value,
              metadata: {
                action: actionValidation.value,
                resultVisibility: resultVisibilityValidation.value,
                publishedAt: now.toISOString(),
              },
            },
          });
        });

        await notifyPollAudienceSafely({
          pollId: currentPoll.id,
          actorUser: auth.authUser,
          type: "POLL_RESULTS_PUBLISHED",
          title: "Resultado de enquete disponível",
          message: `Os resultados da enquete "${currentPoll.title}" foram publicados no EloGest.`,
          metadata: {
            source: "ADMIN_POLL_RESULTS_PUBLISH",
            resultVisibility: resultVisibilityValidation.value,
            resultsPublishedAt: now.toISOString(),
          },
        });

        const updatedPoll = await findPollForAdmin({
          pollId: currentPoll.id,
          administratorId: auth.administratorId,
        });

        return NextResponse.json({
          poll: updatedPoll,
          message: "Resultados da enquete publicados com sucesso.",
        });
      }

      const nextStatus = resolveStatusFromAction(actionValidation.value);
      const statusDateUpdate = buildStatusDateUpdate(actionValidation.value, now);

      await db.$transaction(async (tx) => {
        await tx.poll.update({
          where: {
            id: currentPoll.id,
          },
          data: {
            status: nextStatus,
            ...statusDateUpdate,
          },
        });

        await tx.pollLog.create({
          data: {
            pollId: currentPoll.id,
            userId: auth.authUser.id,
            action: resolvePollLogActionForStatus(nextStatus),
            message: resolvePollMessageForStatus(nextStatus),
            fromValue: currentPoll.status,
            toValue: nextStatus,
            metadata: {
              action: actionValidation.value,
              changedAt: now.toISOString(),
            },
          },
        });
      });

      if (actionValidation.value === "PUBLISH") {
        await notifyPollAudienceSafely({
          pollId: currentPoll.id,
          actorUser: auth.authUser,
          type: "POLL_PUBLISHED",
          title: "Nova enquete disponível",
          message: `A enquete "${currentPoll.title}" está disponível para participação no EloGest.`,
          metadata: {
            source: "ADMIN_POLL_PUBLISH",
            publishedAt: now.toISOString(),
            endsAt: currentPoll.endsAt?.toISOString() ?? null,
          },
        });
      }

      const updatedPoll = await findPollForAdmin({
        pollId: currentPoll.id,
        administratorId: auth.administratorId,
      });

      return NextResponse.json({
        poll: updatedPoll,
        message: resolvePollMessageForStatus(nextStatus),
      });
    }

    if (currentPoll.status !== PollStatus.DRAFT) {
      return badRequest(
        "Somente enquetes em rascunho podem ser editadas estruturalmente. Para enquetes publicadas ou encerradas, use as ações disponíveis.",
      );
    }

    if (currentPoll._count.responses > 0) {
      return forbidden(
        "Esta enquete já possui respostas e não pode mais ser editada.",
      );
    }

    const title =
      body.title === undefined
        ? currentPoll.title
        : normalizeRequiredString(body.title);
    const description =
      body.description === undefined
        ? currentPoll.description
        : normalizeNullableString(body.description);
    const condominiumId =
      body.condominiumId === undefined
        ? currentPoll.condominiumId
        : normalizeRequiredString(body.condominiumId);

    if (title.length < 3) {
      return badRequest("Informe um título para a enquete.");
    }

    if (!condominiumId) {
      return badRequest("Informe o condomínio da enquete.");
    }

    const typeValidation = parsePollType(body.type, currentPoll.type);
    if (!typeValidation.ok) {
      return badRequest(typeValidation.message);
    }

    const targetScopeValidation = parsePollTargetScope(
      body.targetScope,
      currentPoll.targetScope,
    );
    if (!targetScopeValidation.ok) {
      return badRequest(targetScopeValidation.message);
    }

    const resultVisibilityValidation = parsePollResultVisibility(
      body.resultVisibility,
      currentPoll.resultVisibility,
    );
    if (!resultVisibilityValidation.ok) {
      return badRequest(resultVisibilityValidation.message);
    }

    const startsAtValidation =
      body.startsAt === undefined
        ? {
            ok: true as const,
            value: currentPoll.startsAt,
          }
        : parseDateOrNull(body.startsAt);
    if (!startsAtValidation.ok) {
      return badRequest(startsAtValidation.message);
    }

    const endsAtValidation =
      body.endsAt === undefined
        ? {
            ok: true as const,
            value: currentPoll.endsAt,
          }
        : parseDateOrNull(body.endsAt);
    if (!endsAtValidation.ok) {
      return badRequest(endsAtValidation.message);
    }

    if (
      startsAtValidation.value &&
      endsAtValidation.value &&
      endsAtValidation.value <= startsAtValidation.value
    ) {
      return badRequest(
        "O prazo final da enquete deve ser posterior ao início.",
      );
    }

    const roleValidation = parseAccessRoleOrNull(body.role);
    if (!roleValidation.ok) {
      return badRequest(roleValidation.message);
    }

    const linkTypeValidation = parseUnitPersonLinkTypeOrNull(body.linkType);
    if (!linkTypeValidation.ok) {
      return badRequest(linkTypeValidation.message);
    }

    const optionsValidation =
      body.options === undefined
        ? normalizeOptions(
            currentPoll.options.map((option) => ({
              id: option.id,
              label: option.label,
              description: option.description,
              order: option.order,
              isActive: option.isActive,
            })),
            typeValidation.value,
          )
        : normalizeOptions(body.options, typeValidation.value);
    if (!optionsValidation.ok) {
      return badRequest(optionsValidation.message);
    }

    const customTargets = normalizeCustomTargets(body.targets);
    const unitId =
      body.unitId === undefined
        ? currentPoll.targets[0]?.unitId ?? null
        : normalizeNullableString(body.unitId);
    const block =
      body.block === undefined
        ? currentPoll.targets[0]?.block ?? null
        : normalizeNullableString(body.block);
    const role =
      body.role === undefined ? currentPoll.targets[0]?.role ?? null : roleValidation.value;
    const linkType =
      body.linkType === undefined
        ? currentPoll.targets[0]?.linkType ?? null
        : linkTypeValidation.value;

    const targetsValidation = await buildPollTargets({
      administratorId: auth.administratorId,
      condominiumId,
      targetScope: targetScopeValidation.value,
      unitId,
      block,
      role,
      linkType,
      customTargets:
        body.targets === undefined
          ? currentPoll.targets.map((target) => ({
              condominiumId: target.condominiumId,
              unitId: target.unitId,
              block: target.block,
              role: target.role,
              linkType: target.linkType,
            }))
          : customTargets,
    });

    if (!targetsValidation.ok) {
      return NextResponse.json(
        {
          error: targetsValidation.message,
        },
        {
          status: targetsValidation.status ?? 400,
        },
      );
    }

    const updatedPoll = await db.$transaction(async (tx) => {
      await tx.poll.update({
        where: {
          id: currentPoll.id,
        },
        data: {
          condominiumId,
          title,
          description,
          type: typeValidation.value,
          targetScope: targetScopeValidation.value,
          resultVisibility: resultVisibilityValidation.value,
          startsAt: startsAtValidation.value,
          endsAt: endsAtValidation.value,
          allowResponseUpdate: normalizeBoolean(
            body.allowResponseUpdate,
            currentPoll.allowResponseUpdate,
          ),
          anonymousResults: normalizeBoolean(
            body.anonymousResults,
            currentPoll.anonymousResults,
          ),
          requireEligibleVoter: normalizeBoolean(
            body.requireEligibleVoter,
            currentPoll.requireEligibleVoter,
          ),
          metadata: {
            ...(currentPoll.metadata && typeof currentPoll.metadata === "object"
              ? currentPoll.metadata
              : {}),
            lastUpdatedFrom: "ADMIN_POLLS_DETAIL_PATCH",
          },
        },
      });

      await tx.pollOption.deleteMany({
        where: {
          pollId: currentPoll.id,
        },
      });

      if (optionsValidation.value.length > 0) {
        await tx.pollOption.createMany({
          data: optionsValidation.value.map((option) => ({
            pollId: currentPoll.id,
            label: option.label,
            description: option.description,
            order: option.order,
            isActive: option.isActive,
          })),
        });
      }

      await tx.pollTarget.deleteMany({
        where: {
          pollId: currentPoll.id,
        },
      });

      if (targetsValidation.value.length > 0) {
        await tx.pollTarget.createMany({
          data: targetsValidation.value.map((target) => ({
            pollId: currentPoll.id,
            condominiumId: target.condominiumId,
            unitId: target.unitId,
            block: target.block,
            role: target.role,
            linkType: target.linkType,
          })),
        });
      }

      await tx.pollLog.create({
        data: {
          pollId: currentPoll.id,
          userId: auth.authUser.id,
          action: PollLogAction.UPDATED,
          message: "Enquete atualizada pela administradora.",
          metadata: {
            type: typeValidation.value,
            targetScope: targetScopeValidation.value,
            resultVisibility: resultVisibilityValidation.value,
            optionsCount: optionsValidation.value.length,
            targetsCount: targetsValidation.value.length,
          },
        },
      });

      return tx.poll.findUnique({
        where: {
          id: currentPoll.id,
        },
      });
    });

    const fullPoll = await findPollForAdmin({
      pollId: updatedPoll?.id ?? currentPoll.id,
      administratorId: auth.administratorId,
    });

    return NextResponse.json({
      poll: fullPoll,
      message: "Enquete atualizada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar enquete:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar a enquete.",
      },
      {
        status: 500,
      },
    );
  }
}
