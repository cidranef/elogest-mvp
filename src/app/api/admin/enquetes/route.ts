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
   API ADMIN - ENQUETES

   Arquivo:
   src/app/api/admin/enquetes/route.ts

   ETAPA 50 — ENQUETES

   Métodos:
   - GET: lista enquetes da administradora ativa.
   - POST: cria enquete como rascunho ou publicada.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Bloqueia administradora INACTIVE pelo admin-api-guard.
   - Exige módulo comercial Enquetes liberado.
   - Isola dados por administratorId do perfil ativo.
   - Valida se o condomínio pertence à carteira da administradora.
   - SUPER_ADMIN não opera esta API.

   Decisão de produto:
   - Enquete é consulta/opinião operacional.
   - Votação formal de assembleia fica reservada para a etapa própria.
   ========================================================= */

const POLLS_MODULE_SLUG = "enquetes";
const POLLS_MODULE_LABEL = "Enquetes";

async function notifyPollAudienceSafely(
  params: Parameters<typeof notifyPollAudience>[0],
) {
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

type CreatePollBody = {
  title?: unknown;
  description?: unknown;
  condominiumId?: unknown;
  type?: unknown;
  status?: unknown;
  targetScope?: unknown;
  resultVisibility?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
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
  label: string;
  description: string | null;
  order: number;
};

type PollTargetInput = {
  condominiumId: string | null;
  unitId: string | null;
  block: string | null;
  role: AccessRole | null;
  linkType: UnitPersonLinkType | null;
};

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

function parsePollType(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: true as const,
      value: PollType.SINGLE_CHOICE,
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

function parsePollStatusForCreate(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: true as const,
      value: PollStatus.DRAFT,
    };
  }

  if (value !== PollStatus.DRAFT && value !== PollStatus.PUBLISHED) {
    return {
      ok: false as const,
      message: "Crie a enquete como rascunho ou publicada.",
    };
  }

  return {
    ok: true as const,
    value: value as PollStatus,
  };
}

function parsePollTargetScope(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: true as const,
      value: PollTargetScope.CONDOMINIUM,
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

function parsePollResultVisibility(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: true as const,
      value: PollResultVisibility.ADMIN_ONLY,
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
            label: "Sim",
            description: null,
            order: 1,
          },
          {
            label: "Não",
            description: null,
            order: 2,
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
        label,
        description: normalizeNullableString(raw.description),
        order,
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

export async function GET(request: NextRequest) {
  const auth = await requireAdminModuleApiAccess(
    POLLS_MODULE_SLUG,
    POLLS_MODULE_LABEL,
  );

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);

    const search = normalizeNullableString(searchParams.get("q"));
    const condominiumId = normalizeNullableString(
      searchParams.get("condominiumId"),
    );
    const statusParam = normalizeNullableString(searchParams.get("status"));
    const typeParam = normalizeNullableString(searchParams.get("type"));
    const targetScopeParam = normalizeNullableString(
      searchParams.get("targetScope"),
    );
    const pageParam = Number(searchParams.get("page") ?? "1");
    const pageSizeParam = Number(searchParams.get("pageSize") ?? "20");

    const page =
      Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(Math.floor(pageSizeParam), 100)
        : 20;

    const where: Prisma.PollWhereInput = {
      administratorId: auth.administratorId,
      ...(search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                description: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                condominium: {
                  name: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
      ...(condominiumId
        ? {
            condominiumId,
          }
        : {}),
      ...(statusParam && statusParam !== "ALL"
        ? {
            status: statusParam as PollStatus,
          }
        : {}),
      ...(typeParam && typeParam !== "ALL"
        ? {
            type: typeParam as PollType,
          }
        : {}),
      ...(targetScopeParam && targetScopeParam !== "ALL"
        ? {
            targetScope: targetScopeParam as PollTargetScope,
          }
        : {}),
    };

    const [total, polls, kpis, totalResponses] = await Promise.all([
      db.poll.count({ where }),
      db.poll.findMany({
        where,
        orderBy: [
          {
            publishedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
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
          targets: {
            select: {
              id: true,
              condominiumId: true,
              unitId: true,
              block: true,
              role: true,
              linkType: true,
              unit: {
                select: {
                  id: true,
                  block: true,
                  unitNumber: true,
                },
              },
            },
          },
          _count: {
            select: {
              responses: true,
              targets: true,
              logs: true,
            },
          },
        },
      }),
      db.poll.groupBy({
        by: ["status"],
        where: {
          administratorId: auth.administratorId,
        },
        _count: {
          _all: true,
        },
      }),
      db.pollResponse.count({
        where: {
          poll: {
            administratorId: auth.administratorId,
          },
        },
      }),
    ]);

    const statusTotals = kpis.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    return NextResponse.json({
      polls,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
      kpis: {
        totalDraft: statusTotals.DRAFT ?? 0,
        totalPublished: statusTotals.PUBLISHED ?? 0,
        totalClosed: statusTotals.CLOSED ?? 0,
        totalArchived: statusTotals.ARCHIVED ?? 0,
        totalCanceled: statusTotals.CANCELED ?? 0,
        totalResponses,
      },
    });
  } catch (error) {
    console.error("Erro ao listar enquetes:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar as enquetes.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminModuleApiAccess(
    POLLS_MODULE_SLUG,
    POLLS_MODULE_LABEL,
  );

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as CreatePollBody;

    const title = normalizeRequiredString(body.title);
    const description = normalizeNullableString(body.description);
    const condominiumId = normalizeRequiredString(body.condominiumId);
    const unitId = normalizeNullableString(body.unitId);
    const block = normalizeNullableString(body.block);
    const customTargets = normalizeCustomTargets(body.targets);

    if (title.length < 3) {
      return badRequest("Informe um título para a enquete.");
    }

    if (!condominiumId) {
      return badRequest("Informe o condomínio da enquete.");
    }

    const typeValidation = parsePollType(body.type);
    if (!typeValidation.ok) {
      return badRequest(typeValidation.message);
    }

    const statusValidation = parsePollStatusForCreate(body.status);
    if (!statusValidation.ok) {
      return badRequest(statusValidation.message);
    }

    const targetScopeValidation = parsePollTargetScope(body.targetScope);
    if (!targetScopeValidation.ok) {
      return badRequest(targetScopeValidation.message);
    }

    const resultVisibilityValidation = parsePollResultVisibility(
      body.resultVisibility,
    );
    if (!resultVisibilityValidation.ok) {
      return badRequest(resultVisibilityValidation.message);
    }

    const startsAtValidation = parseDateOrNull(body.startsAt);
    if (!startsAtValidation.ok) {
      return badRequest(startsAtValidation.message);
    }

    const endsAtValidation = parseDateOrNull(body.endsAt);
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

    if (
      statusValidation.value === PollStatus.PUBLISHED &&
      endsAtValidation.value &&
      endsAtValidation.value <= new Date()
    ) {
      return badRequest(
        "Não é possível publicar uma enquete com prazo já encerrado.",
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

    const optionsValidation = normalizeOptions(
      body.options,
      typeValidation.value,
    );
    if (!optionsValidation.ok) {
      return badRequest(optionsValidation.message);
    }

    const targetsValidation = await buildPollTargets({
      administratorId: auth.administratorId,
      condominiumId,
      targetScope: targetScopeValidation.value,
      unitId,
      block,
      role: roleValidation.value,
      linkType: linkTypeValidation.value,
      customTargets,
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

    const now = new Date();
    const startsAt =
      statusValidation.value === PollStatus.PUBLISHED
        ? startsAtValidation.value ?? now
        : startsAtValidation.value;
    const publishedAt =
      statusValidation.value === PollStatus.PUBLISHED ? now : null;

    const poll = await db.$transaction(async (tx) => {
      const created = await tx.poll.create({
        data: {
          administratorId: auth.administratorId,
          condominiumId,
          title,
          description,
          type: typeValidation.value,
          status: statusValidation.value,
          targetScope: targetScopeValidation.value,
          resultVisibility: resultVisibilityValidation.value,
          startsAt,
          endsAt: endsAtValidation.value,
          publishedAt,
          allowResponseUpdate: normalizeBoolean(
            body.allowResponseUpdate,
            false,
          ),
          anonymousResults: normalizeBoolean(body.anonymousResults, true),
          requireEligibleVoter: normalizeBoolean(
            body.requireEligibleVoter,
            false,
          ),
          createdByUserId: auth.authUser.id,
          metadata: {
            source: "ADMIN_API",
            createdFrom: "ADMIN_POLLS_CREATE",
          },
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
        },
      });

      if (optionsValidation.value.length > 0) {
        await tx.pollOption.createMany({
          data: optionsValidation.value.map((option) => ({
            pollId: created.id,
            label: option.label,
            description: option.description,
            order: option.order,
            isActive: true,
          })),
        });
      }

      if (targetsValidation.value.length > 0) {
        await tx.pollTarget.createMany({
          data: targetsValidation.value.map((target) => ({
            pollId: created.id,
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
          pollId: created.id,
          userId: auth.authUser.id,
          action: PollLogAction.CREATED,
          message: "Enquete criada pela administradora.",
          metadata: {
            status: statusValidation.value,
            type: typeValidation.value,
            targetScope: targetScopeValidation.value,
            resultVisibility: resultVisibilityValidation.value,
            optionsCount: optionsValidation.value.length,
            targetsCount: targetsValidation.value.length,
          },
        },
      });

      if (statusValidation.value === PollStatus.PUBLISHED) {
        await tx.pollLog.create({
          data: {
            pollId: created.id,
            userId: auth.authUser.id,
            action: PollLogAction.PUBLISHED,
            message: "Enquete publicada pela administradora.",
            metadata: {
              publishedAt: publishedAt?.toISOString() ?? null,
              startsAt: startsAt?.toISOString() ?? null,
              endsAt: endsAtValidation.value?.toISOString() ?? null,
            },
          },
        });
      }

      return created;
    });

    const createdPoll = await db.poll.findUnique({
      where: {
        id: poll.id,
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
        _count: {
          select: {
            responses: true,
            targets: true,
            logs: true,
          },
        },
      },
    });

    if (statusValidation.value === PollStatus.PUBLISHED && createdPoll) {
      await notifyPollAudienceSafely({
        pollId: createdPoll.id,
        actorUser: auth.authUser,
        type: "POLL_PUBLISHED",
        title: "Nova enquete disponível",
        message: `A enquete "${createdPoll.title}" foi publicada no EloGest.`,
        metadata: {
          source: "ADMIN_POLL_CREATE_PUBLISHED",
        },
      });
    }

    return NextResponse.json(
      {
        poll: createdPoll,
        message:
          statusValidation.value === PollStatus.PUBLISHED
            ? "Enquete criada e publicada com sucesso."
            : "Enquete criada com sucesso.",
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Erro ao criar enquete:", error);

    return NextResponse.json(
      {
        error: "Não foi possível criar a enquete.",
      },
      {
        status: 500,
      },
    );
  }
}
