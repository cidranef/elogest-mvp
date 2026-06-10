import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyAgendaItemStatus,
  AssemblyAgendaItemType,
  AssemblyLogAction,
  AssemblyQuorumRuleType,
  AssemblyResultStatus,
  AssemblyStatus,
  AssemblyVoteVisibility,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - ITEM DE PAUTA DA ASSEMBLEIA

   Arquivo:
   src/app/api/admin/assembleias/[id]/pautas/[agendaItemId]/route.ts

   ELOGEST — ETAPA 52.5.1

   Métodos:
   - PATCH: atualiza uma pauta e suas opções antes da abertura.
   - DELETE: remove uma pauta ainda não utilizada.

   Segurança:
   - Exige módulo Assembleias e perfil administrativo ativo.
   - Isola assembleia por administratorId.
   - Bloqueia alterações estruturais após votos registrados.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{
    id: string;
    agendaItemId: string;
  }>;
};

type UpdateAgendaItemBody = {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  quorumRuleType?: unknown;
  voteVisibility?: unknown;
  minimumParticipationPct?: unknown;
  minimumApprovalPct?: unknown;
  customRuleDescription?: unknown;
  votingStartsAt?: unknown;
  votingEndsAt?: unknown;
  allowAbstention?: unknown;
  options?: unknown;
};

type AgendaOptionInput = {
  id: string | null;
  label: string;
  description: string | null;
  order: number;
  isAbstention: boolean;
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

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown) {
  return normalizeNullableString(value) ?? "";
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return fallback;
}

function parseDateOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: null };
  }

  if (typeof value !== "string" && !(value instanceof Date)) {
    return { ok: false as const, message: "Informe uma data válida." };
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false as const, message: "Informe uma data válida." };
  }

  return { ok: true as const, value: date };
}

function parsePercentageOrNull(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: null };
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) {
    return {
      ok: false as const,
      message: `${label} deve estar entre 0 e 100%.`,
    };
  }

  return {
    ok: true as const,
    value: new Prisma.Decimal(numberValue.toFixed(4)),
  };
}

function parseAgendaItemType(value: unknown, fallback: AssemblyAgendaItemType) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: fallback };
  }

  if (typeof value !== "string") {
    return { ok: false as const, message: "Tipo de pauta inválido." };
  }

  if (!Object.values(AssemblyAgendaItemType).includes(value as AssemblyAgendaItemType)) {
    return { ok: false as const, message: "Tipo de pauta inválido." };
  }

  return { ok: true as const, value: value as AssemblyAgendaItemType };
}

function parseQuorumRuleType(value: unknown, fallback: AssemblyQuorumRuleType) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: fallback };
  }

  if (typeof value !== "string") {
    return { ok: false as const, message: "Regra de quórum inválida." };
  }

  if (!Object.values(AssemblyQuorumRuleType).includes(value as AssemblyQuorumRuleType)) {
    return { ok: false as const, message: "Regra de quórum inválida." };
  }

  return { ok: true as const, value: value as AssemblyQuorumRuleType };
}

/* =========================================================
   ETAPA 52.5.1 — TRANSPARÊNCIA DA VOTAÇÃO

   A modalidade controla apenas a exposição pública do voto.
   A auditoria administrativa continua preservando os registros
   completos para conferência, independentemente desta escolha.
   ========================================================= */
function parseVoteVisibility(
  value: unknown,
  fallback: AssemblyVoteVisibility,
) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: fallback };
  }

  if (typeof value !== "string") {
    return {
      ok: false as const,
      message: "Modalidade de transparência da votação inválida.",
    };
  }

  if (!Object.values(AssemblyVoteVisibility).includes(value as AssemblyVoteVisibility)) {
    return {
      ok: false as const,
      message: "Modalidade de transparência da votação inválida.",
    };
  }

  return {
    ok: true as const,
    value: value as AssemblyVoteVisibility,
  };
}

function normalizeCustomOptions(value: unknown): AgendaOptionInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .map<AgendaOptionInput | null>((item, index) => {
      if (!item || typeof item !== "object") return null;

      const raw = item as Record<string, unknown>;
      const label = normalizeRequiredString(raw.label);
      if (!label) return null;

      const parsedOrder = Number(raw.order ?? index + 1);
      const order = Number.isFinite(parsedOrder)
        ? Math.max(Math.floor(parsedOrder), 1)
        : index + 1;

      return {
        id: normalizeNullableString(raw.id),
        label,
        description: normalizeNullableString(raw.description),
        order,
        // ETAPA 51.9.2 — alternativas customizadas não controlam
        // diretamente a abstenção. A opção fixa “Abster-se” é incluída
        // apenas pelo campo allowAbstention.
        isAbstention: false,
      } satisfies AgendaOptionInput;
    })
    .filter((item): item is AgendaOptionInput => item !== null);
}

function validateNoDuplicatedOptions(options: AgendaOptionInput[]) {
  const labels = new Set<string>();

  for (const option of options) {
    const normalized = option.label.trim().toLowerCase();
    if (labels.has(normalized)) return false;
    labels.add(normalized);
  }

  return true;
}

function buildAgendaOptions(params: {
  type: AssemblyAgendaItemType;
  rawOptions: unknown;
  allowAbstention: boolean;
}) {
  const { type, rawOptions, allowAbstention } = params;

  if (type === AssemblyAgendaItemType.INFORMATIVE) {
    return { ok: true as const, value: [] as AgendaOptionInput[] };
  }

  if (type === AssemblyAgendaItemType.APPROVE_REJECT_ABSTAIN) {
    return {
      ok: true as const,
      value: [
        { id: null, label: "Aprovar", description: null, order: 1, isAbstention: false },
        { id: null, label: "Rejeitar", description: null, order: 2, isAbstention: false },
        { id: null, label: "Abster-se", description: null, order: 3, isAbstention: true },
      ] satisfies AgendaOptionInput[],
    };
  }

  if (type === AssemblyAgendaItemType.YES_NO_ABSTAIN) {
    return {
      ok: true as const,
      value: [
        { id: null, label: "Sim", description: null, order: 1, isAbstention: false },
        { id: null, label: "Não", description: null, order: 2, isAbstention: false },
        { id: null, label: "Abster-se", description: null, order: 3, isAbstention: true },
      ] satisfies AgendaOptionInput[],
    };
  }

  const options = normalizeCustomOptions(rawOptions);

  if (options.length < 2) {
    return {
      ok: false as const,
      message: "Informe pelo menos duas opções para a pauta.",
    };
  }

  const maximumCustomOptions = allowAbstention ? 19 : 20;

  if (options.length > maximumCustomOptions) {
    return {
      ok: false as const,
      message: allowAbstention
        ? "A pauta pode ter no máximo 19 alternativas próprias quando a opção de abstenção estiver habilitada."
        : "A pauta pode ter no máximo 20 opções.",
    };
  }

  if (!validateNoDuplicatedOptions(options)) {
    return {
      ok: false as const,
      message: "Não repita opções com o mesmo texto.",
    };
  }

  const hasReservedAbstentionLabel = options.some(
    (option) => option.label.trim().toLowerCase() === "abster-se",
  );

  if (hasReservedAbstentionLabel) {
    return {
      ok: false as const,
      message: "Não cadastre manualmente a alternativa Abster-se. Utilize a opção Permitir Opção De Abstenção.",
    };
  }

  return {
    ok: true as const,
    value: allowAbstention
      ? [
          ...options,
          {
            id: null,
            label: "Abster-se",
            description: null,
            order: options.length + 1,
            isAbstention: true,
          },
        ]
      : options,
  };
}

async function findAgendaItemForAdmin(params: {
  assemblyId: string;
  agendaItemId: string;
  administratorId: string;
}) {
  return db.assemblyAgendaItem.findFirst({
    where: {
      id: params.agendaItemId,
      assemblyId: params.assemblyId,
      assembly: {
        administratorId: params.administratorId,
      },
    },
    include: {
      assembly: {
        select: {
          id: true,
          status: true,
          convocationPublishedAt: true,
          votingStartsAt: true,
          votingEndsAt: true,
        },
      },
      options: {
        orderBy: {
          order: "asc",
        },
      },
      _count: {
        select: {
          votes: true,
          attachments: true,
        },
      },
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id, agendaItemId } = await context.params;
    const body = (await request.json()) as UpdateAgendaItemBody;

    const current = await findAgendaItemForAdmin({
      assemblyId: id,
      agendaItemId,
      administratorId: auth.administratorId,
    });

    if (!current) {
      return notFound("Pauta não encontrada nesta assembleia.");
    }

    const editableStatuses: AssemblyStatus[] = [
      AssemblyStatus.DRAFT,
      AssemblyStatus.SCHEDULED,
    ];

    if (!editableStatuses.includes(current.assembly.status)) {
      return forbidden("A pauta não pode ser alterada após a abertura da assembleia.");
    }

    if (current.assembly.convocationPublishedAt) {
      return forbidden("A pauta não pode ser alterada após a publicação da convocação.");
    }

    if (current._count.votes > 0) {
      return forbidden("A pauta não pode ser alterada porque já possui votos registrados.");
    }

    const title = normalizeRequiredString(body.title);
    if (title.length < 3) {
      return badRequest("Informe um título para a pauta.");
    }

    const typeValidation = parseAgendaItemType(body.type, current.type);
    if (!typeValidation.ok) return badRequest(typeValidation.message);

    const quorumValidation = parseQuorumRuleType(
      body.quorumRuleType,
      current.quorumRuleType,
    );
    if (!quorumValidation.ok) return badRequest(quorumValidation.message);

    const visibilityValidation = parseVoteVisibility(
      body.voteVisibility,
      current.voteVisibility,
    );
    if (!visibilityValidation.ok) return badRequest(visibilityValidation.message);

    const participationValidation = parsePercentageOrNull(
      body.minimumParticipationPct,
      "A participação mínima",
    );
    if (!participationValidation.ok) return badRequest(participationValidation.message);

    const approvalValidation = parsePercentageOrNull(
      body.minimumApprovalPct,
      "A aprovação mínima",
    );
    if (!approvalValidation.ok) return badRequest(approvalValidation.message);

    const customRuleDescription = normalizeNullableString(body.customRuleDescription);

    if (
      quorumValidation.value === AssemblyQuorumRuleType.MINIMUM_PARTICIPATION &&
      participationValidation.value === null
    ) {
      return badRequest("Informe o percentual mínimo de participação.");
    }

    if (
      quorumValidation.value === AssemblyQuorumRuleType.MINIMUM_APPROVAL &&
      approvalValidation.value === null
    ) {
      return badRequest("Informe o percentual mínimo de aprovação.");
    }

    if (
      quorumValidation.value === AssemblyQuorumRuleType.CUSTOM &&
      !customRuleDescription
    ) {
      return badRequest("Descreva a regra personalizada de aprovação e quórum.");
    }

    const votingStartsAtValidation = parseDateOrNull(body.votingStartsAt);
    if (!votingStartsAtValidation.ok) return badRequest(votingStartsAtValidation.message);

    const votingEndsAtValidation = parseDateOrNull(body.votingEndsAt);
    if (!votingEndsAtValidation.ok) return badRequest(votingEndsAtValidation.message);

    /*
       ETAPA 51.8.2.3 — HERANÇA DO PRAZO GERAL

       null + null significa que a pauta acompanha automaticamente
       a janela geral da assembleia. Uma janela específica só é aceita
       quando início e fim são informados juntos.
    */
    const votingStartsAt = votingStartsAtValidation.value;
    const votingEndsAt = votingEndsAtValidation.value;

    if ((votingStartsAt && !votingEndsAt) || (!votingStartsAt && votingEndsAt)) {
      return badRequest(
        "Informe o início e o fim da votação da pauta ou deixe os dois campos vazios para usar o prazo geral da assembleia.",
      );
    }

    const effectiveVotingStartsAt =
      votingStartsAt ?? current.assembly.votingStartsAt;
    const effectiveVotingEndsAt =
      votingEndsAt ?? current.assembly.votingEndsAt;

    if (
      effectiveVotingStartsAt &&
      effectiveVotingEndsAt &&
      effectiveVotingEndsAt <= effectiveVotingStartsAt
    ) {
      return badRequest("O fim da votação da pauta deve ser posterior ao início.");
    }

    const allowAbstention = normalizeBoolean(body.allowAbstention, false);

    const optionsValidation = buildAgendaOptions({
      type: typeValidation.value,
      rawOptions: body.options,
      allowAbstention,
    });
    if (!optionsValidation.ok) return badRequest(optionsValidation.message);

    const agendaItem = await db.$transaction(async (tx) => {
      await tx.assemblyAgendaOption.deleteMany({
        where: {
          agendaItemId: current.id,
        },
      });

      const updated = await tx.assemblyAgendaItem.update({
        where: {
          id: current.id,
        },
        data: {
          title,
          description: normalizeNullableString(body.description),
          type: typeValidation.value,
          status: AssemblyAgendaItemStatus.DRAFT,
          quorumRuleType: quorumValidation.value,
          voteVisibility: visibilityValidation.value,
          minimumParticipationPct: participationValidation.value,
          minimumApprovalPct: approvalValidation.value,
          customRuleDescription,
          votingStartsAt,
          votingEndsAt,
          resultStatus:
            typeValidation.value === AssemblyAgendaItemType.INFORMATIVE
              ? AssemblyResultStatus.INFORMATIONAL
              : AssemblyResultStatus.PENDING,
          resultSummary: null,
          resultValidatedAt: null,
          options: {
            create: optionsValidation.value.map((option) => ({
              label: option.label,
              description: option.description,
              order: option.order,
              isAbstention: option.isAbstention,
            })),
          },
        },
        include: {
          options: {
            orderBy: {
              order: "asc",
            },
          },
          _count: {
            select: {
              votes: true,
              attachments: true,
            },
          },
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: current.assemblyId,
          userId: auth.authUser.id,
          action: AssemblyLogAction.AGENDA_ITEM_UPDATED,
          message: `Pauta atualizada: ${title}.`,
          metadata: {
            agendaItemId: current.id,
            type: typeValidation.value,
            quorumRuleType: quorumValidation.value,
            voteVisibility: visibilityValidation.value,
            allowAbstention,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({
      agendaItem,
      message: "Pauta atualizada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar pauta da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a pauta." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id, agendaItemId } = await context.params;

    const current = await findAgendaItemForAdmin({
      assemblyId: id,
      agendaItemId,
      administratorId: auth.administratorId,
    });

    if (!current) {
      return notFound("Pauta não encontrada nesta assembleia.");
    }

    const editableStatuses: AssemblyStatus[] = [
      AssemblyStatus.DRAFT,
      AssemblyStatus.SCHEDULED,
    ];

    if (!editableStatuses.includes(current.assembly.status)) {
      return forbidden("A pauta não pode ser removida após a abertura da assembleia.");
    }

    if (current.assembly.convocationPublishedAt) {
      return forbidden("A pauta não pode ser removida após a publicação da convocação.");
    }

    if (current._count.votes > 0) {
      return forbidden("A pauta não pode ser removida porque já possui votos registrados.");
    }

    if (current._count.attachments > 0) {
      return forbidden("Remova os anexos vinculados à pauta antes de excluí-la.");
    }

    await db.$transaction(async (tx) => {
      await tx.assemblyAgendaItem.delete({
        where: {
          id: current.id,
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: current.assemblyId,
          userId: auth.authUser.id,
          action: AssemblyLogAction.AGENDA_ITEM_REMOVED,
          message: `Pauta removida: ${current.title}.`,
          metadata: {
            agendaItemId: current.id,
          },
        },
      });
    });

    return NextResponse.json({
      message: "Pauta removida com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao remover pauta da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível remover a pauta." },
      { status: 500 },
    );
  }
}
