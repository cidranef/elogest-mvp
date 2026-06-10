import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyLogAction,
  AssemblyStatus,
  AssemblyType,
  MeetingMode,
  Status,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - ASSEMBLEIAS

   Arquivo:
   src/app/api/admin/assembleias/route.ts

   ELOGEST — ETAPA 51.2

   Métodos:
   - GET: lista assembleias da administradora ativa.
   - POST: cria assembleia como rascunho ou agendada.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Bloqueia administradora INACTIVE pelo admin-api-guard.
   - Exige módulo comercial Assembleias liberado.
   - Isola dados por administratorId do perfil ativo.
   - Valida se o condomínio pertence à carteira ativa.
   - SUPER_ADMIN não opera esta API.

   Decisão de produto:
   - Esta rota cria a base administrativa da assembleia.
   - Fotografia das unidades elegíveis, pautas, procurações,
     votação e notificações serão adicionadas nos próximos blocos.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type CreateAssemblyBody = {
  title?: unknown;
  description?: unknown;
  condominiumId?: unknown;
  type?: unknown;
  mode?: unknown;
  status?: unknown;
  scheduledStartAt?: unknown;
  scheduledEndAt?: unknown;
  votingStartsAt?: unknown;
  votingEndsAt?: unknown;
  location?: unknown;
  externalMeetingUrl?: unknown;
  accessInstructions?: unknown;
  convocationText?: unknown;
  internalNotes?: unknown;
  allowVoteChange?: unknown;
  pendingAgendaItemIds?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown) {
  return normalizeNullableString(value) ?? "";
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

function parseAssemblyType(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: true as const, value: AssemblyType.ORDINARY };
  }

  if (!Object.values(AssemblyType).includes(value as AssemblyType)) {
    return { ok: false as const, message: "Tipo de assembleia inválido." };
  }

  return { ok: true as const, value: value as AssemblyType };
}

function parseMeetingMode(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: true as const, value: MeetingMode.HYBRID };
  }

  if (!Object.values(MeetingMode).includes(value as MeetingMode)) {
    return { ok: false as const, message: "Modalidade da assembleia inválida." };
  }

  return { ok: true as const, value: value as MeetingMode };
}

function parseAssemblyStatusForCreate(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: true as const, value: AssemblyStatus.DRAFT };
  }

  if (value !== AssemblyStatus.DRAFT && value !== AssemblyStatus.SCHEDULED) {
    return {
      ok: false as const,
      message: "Crie a assembleia como rascunho ou agendada.",
    };
  }

  return { ok: true as const, value: value as AssemblyStatus };
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
      message: "Condomínio não encontrado na carteira ativa da administradora.",
    };
  }

  return { ok: true as const, value: condominium };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const search = normalizeNullableString(searchParams.get("q"));
    const condominiumId = normalizeNullableString(searchParams.get("condominiumId"));
    const statusParam = normalizeNullableString(searchParams.get("status"));
    const typeParam = normalizeNullableString(searchParams.get("type"));
    const modeParam = normalizeNullableString(searchParams.get("mode"));
    const pageParam = Number(searchParams.get("page") ?? "1");
    const pageSizeParam = Number(searchParams.get("pageSize") ?? "20");

    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const pageSize =
      Number.isFinite(pageSizeParam) && pageSizeParam > 0
        ? Math.min(Math.floor(pageSizeParam), 100)
        : 20;

    const where: Prisma.AssemblyWhereInput = {
      administratorId: auth.administratorId,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
              { convocationText: { contains: search, mode: "insensitive" as const } },
              { condominium: { name: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
      ...(condominiumId ? { condominiumId } : {}),
      ...(statusParam && statusParam !== "ALL" ? { status: statusParam as AssemblyStatus } : {}),
      ...(typeParam && typeParam !== "ALL" ? { type: typeParam as AssemblyType } : {}),
      ...(modeParam && modeParam !== "ALL" ? { mode: modeParam as MeetingMode } : {}),
    };

    const [total, assemblies, kpis, totalVotes] = await Promise.all([
      db.assembly.count({ where }),
      db.assembly.findMany({
        where,
        orderBy: [
          { scheduledStartAt: "desc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          condominium: { select: { id: true, name: true } },
          createdByUser: { select: { id: true, name: true, email: true } },
          _count: {
            select: {
              agendaItems: true,
              eligibleUnits: true,
              votes: true,
              attachments: true,
              representations: true,
              logs: true,
            },
          },
        },
      }),
      db.assembly.groupBy({
        by: ["status"],
        where: { administratorId: auth.administratorId },
        _count: { _all: true },
      }),
      db.assemblyVote.count({
        where: { assembly: { administratorId: auth.administratorId } },
      }),
    ]);

    const statusTotals = kpis.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    return NextResponse.json({
      assemblies,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
      kpis: {
        totalDraft: statusTotals.DRAFT ?? 0,
        totalScheduled: statusTotals.SCHEDULED ?? 0,
        totalOpen: statusTotals.OPEN ?? 0,
        totalClosed: statusTotals.CLOSED ?? 0,
        totalResultsPublished: statusTotals.RESULTS_PUBLISHED ?? 0,
        totalCanceled: statusTotals.CANCELED ?? 0,
        totalArchived: statusTotals.ARCHIVED ?? 0,
        totalVotes,
      },
    });
  } catch (error) {
    console.error("Erro ao listar assembleias:", error);
    return NextResponse.json(
      { error: "Não foi possível listar as assembleias." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as CreateAssemblyBody;
    const title = normalizeRequiredString(body.title);
    const description = normalizeNullableString(body.description);
    const condominiumId = normalizeRequiredString(body.condominiumId);
    const pendingAgendaItemIds = normalizeStringArray(body.pendingAgendaItemIds);

    if (title.length < 3) return badRequest("Informe um título para a assembleia.");
    if (!condominiumId) return badRequest("Informe o condomínio da assembleia.");

    const condominiumValidation = await validateCondominium({
      administratorId: auth.administratorId,
      condominiumId,
    });
    if (!condominiumValidation.ok) return badRequest(condominiumValidation.message);

    const typeValidation = parseAssemblyType(body.type);
    if (!typeValidation.ok) return badRequest(typeValidation.message);

    const modeValidation = parseMeetingMode(body.mode);
    if (!modeValidation.ok) return badRequest(modeValidation.message);

    const statusValidation = parseAssemblyStatusForCreate(body.status);
    if (!statusValidation.ok) return badRequest(statusValidation.message);

    const scheduledStartAtValidation = parseDateOrNull(body.scheduledStartAt);
    if (!scheduledStartAtValidation.ok) return badRequest(scheduledStartAtValidation.message);

    const scheduledEndAtValidation = parseDateOrNull(body.scheduledEndAt);
    if (!scheduledEndAtValidation.ok) return badRequest(scheduledEndAtValidation.message);

    const votingStartsAtValidation = parseDateOrNull(body.votingStartsAt);
    if (!votingStartsAtValidation.ok) return badRequest(votingStartsAtValidation.message);

    const votingEndsAtValidation = parseDateOrNull(body.votingEndsAt);
    if (!votingEndsAtValidation.ok) return badRequest(votingEndsAtValidation.message);

    const scheduledStartAt = scheduledStartAtValidation.value;
    const scheduledEndAt = scheduledEndAtValidation.value;
    const votingStartsAt = votingStartsAtValidation.value;
    const votingEndsAt = votingEndsAtValidation.value;

    if (scheduledStartAt && scheduledEndAt && scheduledEndAt <= scheduledStartAt) {
      return badRequest("O encerramento previsto deve ser posterior ao início da assembleia.");
    }

    if (votingStartsAt && votingEndsAt && votingEndsAt <= votingStartsAt) {
      return badRequest("O prazo final da votação deve ser posterior ao início da votação.");
    }

    if (statusValidation.value === AssemblyStatus.SCHEDULED) {
      if (!scheduledStartAt) return badRequest("Informe o início previsto para agendar a assembleia.");
      if (!votingStartsAt) return badRequest("Informe quando a votação será iniciada.");
      if (!votingEndsAt) return badRequest("Informe o prazo final da votação.");
      if (votingEndsAt <= new Date()) return badRequest("O prazo final da votação deve ser futuro.");
    }

    const assembly = await db.$transaction(async (tx) => {
      const pendingAgendaItems = pendingAgendaItemIds.length > 0
        ? await tx.assemblyAgendaItem.findMany({
            where: {
              id: { in: pendingAgendaItemIds },
              resultStatus: "DEFERRED",
              assembly: {
                administratorId: auth.administratorId,
                condominiumId,
              },
              carriedForwardItems: {
                none: {},
              },
            },
            orderBy: [{ deferredAt: "asc" }, { createdAt: "asc" }],
            include: {
              options: {
                orderBy: { order: "asc" },
              },
              assembly: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          })
        : [];

      if (pendingAgendaItems.length !== pendingAgendaItemIds.length) {
        throw new Error("Uma ou mais pautas pendentes não estão mais disponíveis para importação.");
      }

      const created = await tx.assembly.create({
        data: {
          administratorId: auth.administratorId,
          condominiumId,
          title,
          description,
          type: typeValidation.value,
          mode: modeValidation.value,
          status: statusValidation.value,
          scheduledStartAt,
          scheduledEndAt,
          votingStartsAt,
          votingEndsAt,
          location: normalizeNullableString(body.location),
          externalMeetingUrl: normalizeNullableString(body.externalMeetingUrl),
          accessInstructions: normalizeNullableString(body.accessInstructions),
          convocationText: normalizeNullableString(body.convocationText),
          internalNotes: normalizeNullableString(body.internalNotes),
          allowVoteChange: normalizeBoolean(body.allowVoteChange, false),
          createdByUserId: auth.authUser.id,
          metadata: {
            source: "ADMIN_API",
            createdFrom: "ADMIN_ASSEMBLIES_CREATE",
          },
        },
        include: {
          condominium: { select: { id: true, name: true } },
          createdByUser: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: created.id,
          userId: auth.authUser.id,
          action: AssemblyLogAction.CREATED,
          message: "Assembleia criada pela administradora.",
          metadata: {
            status: statusValidation.value,
            type: typeValidation.value,
            mode: modeValidation.value,
          },
        },
      });

      for (const [index, sourceItem] of pendingAgendaItems.entries()) {
        const imported = await tx.assemblyAgendaItem.create({
          data: {
            assemblyId: created.id,
            originAgendaItemId: sourceItem.id,
            order: index + 1,
            title: sourceItem.title,
            description: sourceItem.description,
            type: sourceItem.type,
            quorumRuleType: sourceItem.quorumRuleType,
            minimumParticipationPct: sourceItem.minimumParticipationPct,
            minimumApprovalPct: sourceItem.minimumApprovalPct,
            customRuleDescription: sourceItem.customRuleDescription,
            votingStartsAt: null,
            votingEndsAt: null,
            metadata: {
              importedFromDeferredAgendaItemId: sourceItem.id,
              importedFromAssemblyId: sourceItem.assembly.id,
              importedFromAssemblyTitle: sourceItem.assembly.title,
            },
            options: {
              create: sourceItem.options.map((option) => ({
                label: option.label,
                description: option.description,
                order: option.order,
                isAbstention: option.isAbstention,
              })),
            },
          },
        });

        await tx.assemblyLog.create({
          data: {
            assemblyId: created.id,
            userId: auth.authUser.id,
            action: AssemblyLogAction.AGENDA_ITEM_IMPORTED,
            message: `Pauta retomada de assembleia anterior: ${sourceItem.title}.`,
            metadata: {
              importedAgendaItemId: imported.id,
              originAgendaItemId: sourceItem.id,
              originAssemblyId: sourceItem.assembly.id,
              originAssemblyTitle: sourceItem.assembly.title,
            },
          },
        });
      }

      if (statusValidation.value === AssemblyStatus.SCHEDULED) {
        await tx.assemblyLog.create({
          data: {
            assemblyId: created.id,
            userId: auth.authUser.id,
            action: AssemblyLogAction.SCHEDULED,
            message: "Assembleia agendada pela administradora.",
            metadata: {
              scheduledStartAt: scheduledStartAt?.toISOString() ?? null,
              scheduledEndAt: scheduledEndAt?.toISOString() ?? null,
              votingStartsAt: votingStartsAt?.toISOString() ?? null,
              votingEndsAt: votingEndsAt?.toISOString() ?? null,
            },
          },
        });
      }

      return created;
    });

    return NextResponse.json(
      {
        assembly,
        message:
          statusValidation.value === AssemblyStatus.SCHEDULED
            ? `Assembleia criada e agendada com sucesso.${pendingAgendaItemIds.length > 0 ? ` ${pendingAgendaItemIds.length} pauta(s) pendente(s) foram retomadas.` : ""}`
            : `Assembleia criada como rascunho com sucesso.${pendingAgendaItemIds.length > 0 ? ` ${pendingAgendaItemIds.length} pauta(s) pendente(s) foram retomadas.` : ""}`,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Erro ao criar assembleia:", error);
    const message = error instanceof Error && error.message.includes("pautas pendentes")
      ? error.message
      : "Não foi possível criar a assembleia.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
