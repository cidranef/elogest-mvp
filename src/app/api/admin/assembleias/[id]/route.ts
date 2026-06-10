import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyAgendaItemType,
  AssemblyEligibilityStatus,
  AssemblyLogAction,
  AssemblyStatus,
  AssemblyType,
  MeetingMode,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { notifyAssemblyAudience } from "@/lib/notifications";

/* =========================================================
   API ADMIN - DETALHE DA ASSEMBLEIA

   Arquivo:
   src/app/api/admin/assembleias/[id]/route.ts

   ELOGEST — ETAPA 51.6

   Métodos:
   - GET: consulta dados gerais, pautas, opções, contadores e histórico.
   - PATCH: atualiza os dados gerais enquanto a assembleia ainda
     estiver em preparação.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Bloqueia administradora INACTIVE pelo admin-api-guard.
   - Exige módulo comercial Assembleias liberado.
   - Isola dados por administratorId do perfil ativo.
   - SUPER_ADMIN não opera esta API.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AssemblyOperationalAction =
  | "OPEN"
  | "CLOSE"
  | "EXTEND_VOTING"
  | "REOPEN_VOTING";

type AssemblyOperationalActionBody = {
  action?: unknown;
  newVotingEndsAt?: unknown;
  reason?: unknown;
  notifyParticipants?: unknown;
  extendSpecificAgendaItems?: unknown;
};

type UpdateAssemblyBody = {
  title?: unknown;
  description?: unknown;
  condominiumId?: unknown;
  type?: unknown;
  mode?: unknown;
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

function parseAssemblyType(value: unknown, fallback: AssemblyType) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: fallback };
  }

  if (typeof value !== "string") {
    return { ok: false as const, message: "Tipo de assembleia inválido." };
  }

  if (!Object.values(AssemblyType).includes(value as AssemblyType)) {
    return { ok: false as const, message: "Tipo de assembleia inválido." };
  }

  return { ok: true as const, value: value as AssemblyType };
}

function parseMeetingMode(value: unknown, fallback: MeetingMode) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: fallback };
  }

  if (typeof value !== "string") {
    return { ok: false as const, message: "Modalidade da assembleia inválida." };
  }

  if (!Object.values(MeetingMode).includes(value as MeetingMode)) {
    return { ok: false as const, message: "Modalidade da assembleia inválida." };
  }

  return { ok: true as const, value: value as MeetingMode };
}

async function findAssemblyForAdmin(params: {
  assemblyId: string;
  administratorId: string;
}) {
  return db.assembly.findFirst({
    where: {
      id: params.assemblyId,
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
      convocationPublishedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      agendaItems: {
        orderBy: {
          order: "asc",
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
      },
      logs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 120,
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
          agendaItems: true,
          eligibleUnits: true,
          votes: true,
          attachments: true,
          representations: true,
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
      message: "Condomínio não encontrado na carteira ativa da administradora.",
    };
  }

  return { ok: true as const, value: condominium };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;

    const assembly = await findAssemblyForAdmin({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    return NextResponse.json({ assembly });
  } catch (error) {
    console.error("Erro ao consultar detalhe da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar a assembleia." },
      { status: 500 },
    );
  }
}


function parseOperationalAction(value: unknown): AssemblyOperationalAction | null {
  if (
    value === "OPEN" ||
    value === "CLOSE" ||
    value === "EXTEND_VOTING" ||
    value === "REOPEN_VOTING"
  ) {
    return value;
  }

  return null;
}

function datesAreEqual(left?: Date | null, right?: Date | null) {
  if (!left || !right) return false;
  return left.getTime() === right.getTime();
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as AssemblyOperationalActionBody;
    const action = parseOperationalAction(body.action);

    if (!action) {
      return badRequest("Informe uma ação operacional válida para a assembleia.");
    }

    const current = await db.assembly.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        status: true,
        title: true,
        convocationPublishedAt: true,
        votingStartsAt: true,
        votingEndsAt: true,
        resultsPublishedAt: true,
      },
    });

    if (!current) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    const now = new Date();

    if (action === "OPEN") {
      if (current.status !== AssemblyStatus.SCHEDULED) {
        return forbidden("Somente assembleias agendadas podem ser abertas.");
      }

      if (!current.convocationPublishedAt) {
        return badRequest("Publique a convocação antes de abrir a assembleia.");
      }

      if (!current.votingStartsAt || !current.votingEndsAt) {
        return badRequest("Defina a janela de votação antes de abrir a assembleia.");
      }

      if (current.votingEndsAt <= now) {
        return badRequest(
          "O prazo final da votação já encerrou. Ajuste a programação antes de abrir a assembleia.",
        );
      }

      const [deliberativeAgendaItems, eligibleUnits] = await Promise.all([
        db.assemblyAgendaItem.count({
          where: {
            assemblyId: current.id,
            type: {
              not: AssemblyAgendaItemType.INFORMATIVE,
            },
          },
        }),
        db.assemblyEligibleUnit.count({
          where: {
            assemblyId: current.id,
            status: AssemblyEligibilityStatus.ELIGIBLE,
          },
        }),
      ]);

      if (deliberativeAgendaItems === 0) {
        return badRequest(
          "Cadastre pelo menos uma pauta deliberativa antes de abrir a assembleia.",
        );
      }

      if (eligibleUnits === 0) {
        return badRequest(
          "Mantenha pelo menos uma unidade apta antes de abrir a assembleia.",
        );
      }

      await db.$transaction(async (tx) => {
        await tx.assembly.update({
          where: {
            id: current.id,
          },
          data: {
            status: AssemblyStatus.OPEN,
            openedAt: now,
            closedAt: null,
          },
        });

        await tx.assemblyLog.create({
          data: {
            assemblyId: current.id,
            userId: auth.authUser.id,
            action: AssemblyLogAction.OPENED,
            message: "Assembleia aberta pela administradora.",
            metadata: {
              openedAt: now.toISOString(),
              votingStartsAt: current.votingStartsAt?.toISOString() || null,
              votingEndsAt: current.votingEndsAt?.toISOString() || null,
            },
          },
        });
      });

      const assembly = await findAssemblyForAdmin({
        assemblyId: current.id,
        administratorId: auth.administratorId,
      });

      const votingAlreadyAvailable = current.votingStartsAt <= now;

      return NextResponse.json({
        assembly,
        message: votingAlreadyAvailable
          ? "Assembleia aberta com sucesso. A votação já está disponível no portal."
          : "Assembleia aberta com sucesso. A votação será liberada automaticamente no horário programado.",
      });
    }

    if (action === "EXTEND_VOTING" || action === "REOPEN_VOTING") {
      const reopening = action === "REOPEN_VOTING";

      if (!current.convocationPublishedAt) {
        return badRequest("Publique a convocação antes de prorrogar a votação.");
      }

      if (current.resultsPublishedAt) {
        return forbidden("O prazo não pode ser alterado após a publicação dos resultados.");
      }

      if (reopening) {
        if (current.status !== AssemblyStatus.CLOSED) {
          return forbidden("Somente assembleias encerradas podem ser reabertas com prorrogação.");
        }
      } else if (
        current.status !== AssemblyStatus.SCHEDULED &&
        current.status !== AssemblyStatus.OPEN
      ) {
        return forbidden("Somente assembleias agendadas ou em andamento podem ter a votação prorrogada.");
      }

      if (!current.votingEndsAt) {
        return badRequest("Defina o prazo atual da votação antes de prorrogá-lo.");
      }

      // ETAPA 51.8.2.2.1 — Preserva o narrowing do TypeScript também
      // dentro do callback transacional e das chamadas assíncronas abaixo.
      const previousVotingEndsAt = current.votingEndsAt;

      const newVotingEndsAtValidation = parseDateOrNull(body.newVotingEndsAt);
      if (!newVotingEndsAtValidation.ok || !newVotingEndsAtValidation.value) {
        return badRequest("Informe o novo prazo final da votação.");
      }

      const newVotingEndsAt = newVotingEndsAtValidation.value;
      const reason = normalizeRequiredString(body.reason);
      const notifyParticipants = normalizeBoolean(body.notifyParticipants, true);
      const extendSpecificAgendaItems = normalizeBoolean(
        body.extendSpecificAgendaItems,
        false,
      );

      if (newVotingEndsAt <= previousVotingEndsAt) {
        return badRequest("O novo prazo final deve ser posterior ao prazo atual da votação.");
      }

      if (newVotingEndsAt <= now) {
        return badRequest("O novo prazo final da votação deve ser futuro.");
      }

      if (reason.length < 3) {
        return badRequest("Informe o motivo da prorrogação com pelo menos 3 caracteres.");
      }

      const [representationsWithInsufficientValidity, agendaItems] = await Promise.all([
        db.assemblyRepresentation.count({
          where: {
            assemblyId: current.id,
            status: "ACTIVE",
            validUntil: {
              not: null,
              lt: newVotingEndsAt,
            },
          },
        }),
        db.assemblyAgendaItem.findMany({
          where: {
            assemblyId: current.id,
            type: {
              not: AssemblyAgendaItemType.INFORMATIVE,
            },
          },
          select: {
            id: true,
            votingStartsAt: true,
            votingEndsAt: true,
          },
        }),
      ]);

      /*
         ETAPA 51.8.2.3 — HERANÇA DO PRAZO GERAL

         Novas pautas que usam o prazo geral mantêm votingStartsAt e
         votingEndsAt como null. Assim, elas acompanham automaticamente
         qualquer prorrogação da assembleia.

         Compatibilidade com registros anteriores:
         - pautas antigas que armazenaram exatamente a mesma janela geral
           são convertidas para null na primeira prorrogação;
         - pautas com janela realmente específica são preservadas;
         - a administradora pode optar por ampliá-las explicitamente.
      */
      const inheritedAgendaItemIds = agendaItems
        .filter((item) => !item.votingStartsAt && !item.votingEndsAt)
        .map((item) => item.id);

      const legacyInheritedAgendaItemIds = agendaItems
        .filter(
          (item) =>
            datesAreEqual(item.votingStartsAt, current.votingStartsAt) &&
            datesAreEqual(item.votingEndsAt, previousVotingEndsAt),
        )
        .map((item) => item.id);

      const legacyInheritedAgendaItemIdSet = new Set(legacyInheritedAgendaItemIds);

      const specificAgendaItems = agendaItems.filter(
        (item) =>
          !inheritedAgendaItemIds.includes(item.id) &&
          !legacyInheritedAgendaItemIdSet.has(item.id),
      );

      const specificAgendaItemIdsToExtend = extendSpecificAgendaItems
        ? specificAgendaItems
            .filter(
              (item) =>
                item.votingEndsAt &&
                item.votingEndsAt < newVotingEndsAt,
            )
            .map((item) => item.id)
        : [];

      const agendaItemsWithSpecificDeadline = specificAgendaItems.length;

      await db.$transaction(async (tx) => {
        await tx.assembly.update({
          where: {
            id: current.id,
          },
          data: {
            votingEndsAt: newVotingEndsAt,
            ...(reopening
              ? {
                  status: AssemblyStatus.OPEN,
                  closedAt: null,
                }
              : {}),
          },
        });

        if (legacyInheritedAgendaItemIds.length > 0) {
          await tx.assemblyAgendaItem.updateMany({
            where: {
              id: { in: legacyInheritedAgendaItemIds },
            },
            data: {
              votingStartsAt: null,
              votingEndsAt: null,
            },
          });
        }

        if (specificAgendaItemIdsToExtend.length > 0) {
          await tx.assemblyAgendaItem.updateMany({
            where: {
              id: { in: specificAgendaItemIdsToExtend },
            },
            data: {
              votingEndsAt: newVotingEndsAt,
            },
          });
        }

        await tx.assemblyLog.create({
          data: {
            assemblyId: current.id,
            userId: auth.authUser.id,
            action: reopening
              ? AssemblyLogAction.VOTING_REOPENED
              : AssemblyLogAction.VOTING_DEADLINE_EXTENDED,
            message: reopening
              ? "Votação reaberta com novo prazo final pela administradora."
              : "Prazo final da votação prorrogado pela administradora.",
            metadata: {
              previousVotingEndsAt: previousVotingEndsAt.toISOString(),
              newVotingEndsAt: newVotingEndsAt.toISOString(),
              reason,
              notifyParticipants,
              extendSpecificAgendaItems,
              inheritedAgendaItems: inheritedAgendaItemIds.length,
              normalizedLegacyAgendaItems: legacyInheritedAgendaItemIds.length,
              extendedSpecificAgendaItems: specificAgendaItemIdsToExtend.length,
              agendaItemsWithSpecificDeadline,
              representationsWithInsufficientValidity,
            },
          },
        });
      });

      let notifiedUsers = 0;

      if (notifyParticipants) {
        try {
          const notificationResult = await notifyAssemblyAudience({
            assemblyId: current.id,
            mode: "EXTENSION",
            actorUser: auth.authUser,
            context: {
              previousVotingEndsAt,
              extensionReason: reason,
              reopened: reopening,
            },
          });

          notifiedUsers = notificationResult.createdNotifications.length;
        } catch (notificationError) {
          console.error(
            "Erro ao notificar participantes sobre a prorrogação da assembleia:",
            notificationError,
          );
        }
      }

      const assembly = await findAssemblyForAdmin({
        assemblyId: current.id,
        administratorId: auth.administratorId,
      });

      const warnings: string[] = [];

      if (representationsWithInsufficientValidity > 0) {
        warnings.push(
          `${representationsWithInsufficientValidity} procuração(ões) ativa(s) não cobrem integralmente o novo prazo. Revise os documentos quando necessário.`,
        );
      }

      if (agendaItemsWithSpecificDeadline > 0 && !extendSpecificAgendaItems) {
        warnings.push(
          `${agendaItemsWithSpecificDeadline} pauta(s) possuem prazo próprio e foram preservadas. Marque a opção de ampliar pautas específicas quando desejar prorrogá-las também.`,
        );
      }

      if (specificAgendaItemIdsToExtend.length > 0) {
        warnings.push(
          `${specificAgendaItemIdsToExtend.length} pauta(s) com prazo específico também foram prorrogadas.`,
        );
      }

      if (legacyInheritedAgendaItemIds.length > 0) {
        warnings.push(
          `${legacyInheritedAgendaItemIds.length} pauta(s) antigas foram normalizadas para acompanhar automaticamente o prazo geral nas próximas prorrogações.`,
        );
      }

      return NextResponse.json({
        assembly,
        notifiedUsers,
        representationsWithInsufficientValidity,
        agendaItemsWithSpecificDeadline,
        warnings,
        message: reopening
          ? "Votação reaberta com novo prazo final. Os votos anteriores foram preservados."
          : "Prazo da votação prorrogado com sucesso.",
      });
    }

    if (current.status !== AssemblyStatus.OPEN) {
      return forbidden("Somente assembleias em andamento podem ser encerradas.");
    }

    await db.$transaction(async (tx) => {
      await tx.assembly.update({
        where: {
          id: current.id,
        },
        data: {
          status: AssemblyStatus.CLOSED,
          closedAt: now,
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: current.id,
          userId: auth.authUser.id,
          action: AssemblyLogAction.CLOSED,
          message: "Assembleia encerrada pela administradora. Novos votos foram bloqueados.",
          metadata: {
            closedAt: now.toISOString(),
          },
        },
      });
    });

    const assembly = await findAssemblyForAdmin({
      assemblyId: current.id,
      administratorId: auth.administratorId,
    });

    return NextResponse.json({
      assembly,
      message: "Assembleia encerrada com sucesso. Novos votos estão bloqueados.",
    });
  } catch (error) {
    console.error("Erro ao executar ação operacional da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível executar a ação operacional da assembleia." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateAssemblyBody;

    const current = await db.assembly.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      include: {
        _count: {
          select: {
            agendaItems: true,
            eligibleUnits: true,
            votes: true,
            representations: true,
          },
        },
      },
    });

    if (!current) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    const editableStatuses: AssemblyStatus[] = [
      AssemblyStatus.DRAFT,
      AssemblyStatus.SCHEDULED,
    ];

    if (!editableStatuses.includes(current.status)) {
      return forbidden(
        "Os dados gerais não podem mais ser alterados após a abertura da assembleia.",
      );
    }

    if (current.convocationPublishedAt) {
      return forbidden(
        "Os dados gerais não podem mais ser alterados após a publicação da convocação.",
      );
    }

    const title = normalizeRequiredString(body.title);
    const condominiumId = normalizeRequiredString(body.condominiumId);

    if (title.length < 3) {
      return badRequest("Informe um título para a assembleia.");
    }

    if (!condominiumId) {
      return badRequest("Informe o condomínio da assembleia.");
    }

    const condominiumValidation = await validateCondominium({
      administratorId: auth.administratorId,
      condominiumId,
    });

    if (!condominiumValidation.ok) {
      return badRequest(condominiumValidation.message);
    }

    const hasDependentRecords =
      current._count.agendaItems > 0 ||
      current._count.eligibleUnits > 0 ||
      current._count.votes > 0 ||
      current._count.representations > 0;

    if (current.condominiumId !== condominiumId && hasDependentRecords) {
      return badRequest(
        "O condomínio não pode ser alterado após a inclusão de pautas, unidades elegíveis, procurações ou votos.",
      );
    }

    const typeValidation = parseAssemblyType(body.type, current.type);
    if (!typeValidation.ok) return badRequest(typeValidation.message);

    const modeValidation = parseMeetingMode(body.mode, current.mode);
    if (!modeValidation.ok) return badRequest(modeValidation.message);

    const scheduledStartAtValidation = parseDateOrNull(body.scheduledStartAt);
    if (!scheduledStartAtValidation.ok) {
      return badRequest(scheduledStartAtValidation.message);
    }

    const scheduledEndAtValidation = parseDateOrNull(body.scheduledEndAt);
    if (!scheduledEndAtValidation.ok) {
      return badRequest(scheduledEndAtValidation.message);
    }

    const votingStartsAtValidation = parseDateOrNull(body.votingStartsAt);
    if (!votingStartsAtValidation.ok) {
      return badRequest(votingStartsAtValidation.message);
    }

    const votingEndsAtValidation = parseDateOrNull(body.votingEndsAt);
    if (!votingEndsAtValidation.ok) {
      return badRequest(votingEndsAtValidation.message);
    }

    const scheduledStartAt = scheduledStartAtValidation.value;
    const scheduledEndAt = scheduledEndAtValidation.value;
    const votingStartsAt = votingStartsAtValidation.value;
    const votingEndsAt = votingEndsAtValidation.value;

    if (scheduledStartAt && scheduledEndAt && scheduledEndAt <= scheduledStartAt) {
      return badRequest(
        "O encerramento previsto deve ser posterior ao início da assembleia.",
      );
    }

    if (votingStartsAt && votingEndsAt && votingEndsAt <= votingStartsAt) {
      return badRequest(
        "O prazo final da votação deve ser posterior ao início da votação.",
      );
    }

    if (current.status === AssemblyStatus.SCHEDULED) {
      if (!scheduledStartAt) {
        return badRequest("Informe o início previsto para manter a assembleia agendada.");
      }

      if (!votingStartsAt) {
        return badRequest("Informe quando a votação será iniciada.");
      }

      if (!votingEndsAt) {
        return badRequest("Informe o prazo final da votação.");
      }

      if (votingEndsAt <= new Date()) {
        return badRequest("O prazo final da votação deve ser futuro.");
      }
    }

    await db.$transaction(async (tx) => {
      await tx.assembly.update({
        where: {
          id: current.id,
        },
        data: {
          condominiumId,
          title,
          description: normalizeNullableString(body.description),
          type: typeValidation.value,
          mode: modeValidation.value,
          scheduledStartAt,
          scheduledEndAt,
          votingStartsAt,
          votingEndsAt,
          location: normalizeNullableString(body.location),
          externalMeetingUrl: normalizeNullableString(body.externalMeetingUrl),
          accessInstructions: normalizeNullableString(body.accessInstructions),
          convocationText: normalizeNullableString(body.convocationText),
          internalNotes: normalizeNullableString(body.internalNotes),
          allowVoteChange: normalizeBoolean(body.allowVoteChange, current.allowVoteChange),
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: current.id,
          userId: auth.authUser.id,
          action: AssemblyLogAction.UPDATED,
          message: "Dados gerais da assembleia atualizados pela administradora.",
          metadata: {
            condominiumId,
            title,
            type: typeValidation.value,
            mode: modeValidation.value,
          },
        },
      });
    });

    const assembly = await findAssemblyForAdmin({
      assemblyId: current.id,
      administratorId: auth.administratorId,
    });

    return NextResponse.json({
      assembly,
      message: "Dados gerais da assembleia atualizados com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a assembleia." },
      { status: 500 },
    );
  }
}
