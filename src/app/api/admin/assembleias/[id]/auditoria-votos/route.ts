import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyVoteOrigin,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   ETAPA 52.5.1.4 — AUDITORIA ADMINISTRATIVA DE VOTOS

   Arquivo:
   src/app/api/admin/assembleias/[id]/auditoria-votos/route.ts

   Objetivo:
   - disponibilizar trilha interna detalhada dos votos;
   - preservar a separação entre auditoria administrativa e
     divulgação pública da ata/portal;
   - permitir filtros seguros para conferência e contestação;
   - expor histórico de revisões sem alterar votos ou resultados.

   Segurança:
   - exige perfil ADMINISTRADORA ativo;
   - exige módulo comercial Assembleias liberado;
   - isola a assembleia por administratorId;
   - não é utilizada pelo portal público;
   - votações sigilosas permanecem rastreáveis somente nesta área.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function normalizeNullableString(value: string | null) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseVoteOrigin(value: string | null) {
  if (!value) return null;

  return Object.values(AssemblyVoteOrigin).includes(value as AssemblyVoteOrigin)
    ? (value as AssemblyVoteOrigin)
    : null;
}

function originLabel(origin: AssemblyVoteOrigin) {
  const labels: Record<AssemblyVoteOrigin, string> = {
    DIRECT_UNIT_LINK: "Vínculo Direto Com A Unidade",
    PROXY_REPRESENTATION: "Procuração Vigente",
    AUTHORIZED_LINK: "Vínculo Autorizado",
    ADMINISTRATIVE_IMPORT: "Importação Administrativa",
  };

  return labels[origin];
}

function formatUnitLabel(params: {
  block?: string | null;
  unitNumber?: string | null;
}) {
  return params.block
    ? `${params.block} - ${params.unitNumber || "Unidade"}`
    : params.unitNumber || "Unidade";
}

function buildWhere(params: {
  assemblyId: string;
  agendaItemId: string | null;
  origin: AssemblyVoteOrigin | null;
  visibility: string | null;
  changedOnly: boolean;
  query: string | null;
}) {
  const where: Prisma.AssemblyVoteWhereInput = {
    assemblyId: params.assemblyId,
  };

  if (params.agendaItemId) {
    where.agendaItemId = params.agendaItemId;
  }

  if (params.origin) {
    where.origin = params.origin;
  }

  if (
    params.visibility === "CONSOLIDATED" ||
    params.visibility === "NOMINAL_BY_UNIT" ||
    params.visibility === "SECRET"
  ) {
    where.agendaItem = {
      voteVisibility: params.visibility,
    };
  }

  if (params.changedOnly) {
    where.version = { gt: 1 };
  }

  if (params.query) {
    where.OR = [
      {
        voterUser: {
          name: {
            contains: params.query,
            mode: "insensitive",
          },
        },
      },
      {
        voterUser: {
          email: {
            contains: params.query,
            mode: "insensitive",
          },
        },
      },
      {
        eligibleUnit: {
          snapshotBlock: {
            contains: params.query,
            mode: "insensitive",
          },
        },
      },
      {
        eligibleUnit: {
          snapshotUnitNumber: {
            contains: params.query,
            mode: "insensitive",
          },
        },
      },
      {
        representation: {
          representativeUser: {
            name: {
              contains: params.query,
              mode: "insensitive",
            },
          },
        },
      },
      {
        representation: {
          externalRepresentativeName: {
            contains: params.query,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  return where;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);

    const agendaItemId = normalizeNullableString(searchParams.get("agendaItemId"));
    const origin = parseVoteOrigin(searchParams.get("origin"));
    const visibility = normalizeNullableString(searchParams.get("visibility"));
    const query = normalizeNullableString(searchParams.get("q"));
    const changedOnly = searchParams.get("changedOnly") === "true";
    const page = parsePositiveInteger(searchParams.get("page"), 1);
    const requestedPageSize = parsePositiveInteger(
      searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE,
    );
    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

    const assembly = await db.assembly.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        resultsPublishedAt: true,
        agendaItems: {
          orderBy: {
            order: "asc",
          },
          select: {
            id: true,
            order: true,
            title: true,
            voteVisibility: true,
          },
        },
      },
    });

    if (!assembly) {
      return notFound(
        "Assembleia não encontrada na carteira ativa da administradora.",
      );
    }

    const where = buildWhere({
      assemblyId: assembly.id,
      agendaItemId,
      origin,
      visibility,
      changedOnly,
      query,
    });

    const [total, votes] = await Promise.all([
      db.assemblyVote.count({ where }),
      db.assemblyVote.findMany({
        where,
        orderBy: [
          {
            agendaItem: {
              order: "asc",
            },
          },
          {
            eligibleUnit: {
              snapshotBlock: "asc",
            },
          },
          {
            eligibleUnit: {
              snapshotUnitNumber: "asc",
            },
          },
          {
            submittedAt: "asc",
          },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          version: true,
          origin: true,
          submittedAt: true,
          updatedAt: true,
          metadata: true,
          agendaItem: {
            select: {
              id: true,
              order: true,
              title: true,
              voteVisibility: true,
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
            },
          },
          eligibleUnit: {
            select: {
              id: true,
              unitId: true,
              snapshotBlock: true,
              snapshotUnitNumber: true,
              votingWeight: true,
            },
          },
          voterUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          voterAccess: {
            select: {
              id: true,
              role: true,
              label: true,
            },
          },
          unitPersonLink: {
            select: {
              id: true,
              linkType: true,
            },
          },
          representation: {
            select: {
              id: true,
              status: true,
              documentUrl: true,
              documentName: true,
              representativeUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              externalRepresentativeName: true,
              externalRepresentativeEmail: true,
            },
          },
          options: {
            orderBy: {
              createdAt: "asc",
            },
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
          revisions: {
            orderBy: {
              version: "desc",
            },
            select: {
              id: true,
              version: true,
              reason: true,
              snapshot: true,
              metadata: true,
              createdAt: true,
              changedByUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const items = votes.map((vote) => {
      const optionLabelById = new Map(
        vote.agendaItem.options.map((option) => [option.id, option.label]),
      );

      const revisions = vote.revisions.map((revision) => {
        const snapshot =
          revision.snapshot &&
          typeof revision.snapshot === "object" &&
          !Array.isArray(revision.snapshot)
            ? (revision.snapshot as Prisma.JsonObject)
            : {};

        const optionIds = Array.isArray(snapshot.optionIds)
          ? snapshot.optionIds.filter(
              (item): item is string => typeof item === "string",
            )
          : [];

        return {
          ...revision,
          optionIds,
          optionLabels: optionIds.map(
            (optionId) => optionLabelById.get(optionId) || optionId,
          ),
        };
      });

      return {
      id: vote.id,
      agendaItem: {
        id: vote.agendaItem.id,
        order: vote.agendaItem.order,
        title: vote.agendaItem.title,
        voteVisibility: vote.agendaItem.voteVisibility,
      },
      eligibleUnit: {
        id: vote.eligibleUnit.id,
        unitId: vote.eligibleUnit.unitId,
        block: vote.eligibleUnit.snapshotBlock,
        unitNumber: vote.eligibleUnit.snapshotUnitNumber,
        label: formatUnitLabel({
          block: vote.eligibleUnit.snapshotBlock,
          unitNumber: vote.eligibleUnit.snapshotUnitNumber,
        }),
        votingWeight: vote.eligibleUnit.votingWeight,
      },
      voter: vote.voterUser,
      voterAccess: vote.voterAccess,
      unitPersonLink: vote.unitPersonLink,
      representation: vote.representation,
      origin: vote.origin,
      originLabel: originLabel(vote.origin),
      version: vote.version,
      changed: vote.version > 1,
      options: vote.options.map((item) => item.option),
      revisions,
      submittedAt: vote.submittedAt,
      updatedAt: vote.updatedAt,
      metadata: vote.metadata,
    };
    });

    const allAssemblyVotes = await db.assemblyVote.findMany({
      where: {
        assemblyId: assembly.id,
      },
      select: {
        version: true,
        origin: true,
        agendaItem: {
          select: {
            voteVisibility: true,
          },
        },
      },
    });

    const metrics = allAssemblyVotes.reduce(
      (acc, vote) => {
        acc.total += 1;

        if (vote.version > 1) {
          acc.changed += 1;
        }

        if (vote.origin === AssemblyVoteOrigin.PROXY_REPRESENTATION) {
          acc.byRepresentation += 1;
        }

        if (vote.agendaItem.voteVisibility === "SECRET") {
          acc.secret += 1;
        }

        if (vote.agendaItem.voteVisibility === "NOMINAL_BY_UNIT") {
          acc.nominal += 1;
        }

        return acc;
      },
      {
        total: 0,
        changed: 0,
        byRepresentation: 0,
        secret: 0,
        nominal: 0,
      },
    );

    return NextResponse.json({
      assembly: {
        id: assembly.id,
        title: assembly.title,
        status: assembly.status,
        resultsPublishedAt: assembly.resultsPublishedAt,
      },
      agendaItems: assembly.agendaItems,
      metrics,
      filters: {
        agendaItemId,
        origin,
        visibility,
        changedOnly,
        query,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      votes: items,
    });
  } catch (error) {
    console.error("Erro ao consultar auditoria administrativa de votos:", error);

    return NextResponse.json(
      { error: "Não foi possível consultar a auditoria dos votos." },
      { status: 500 },
    );
  }
}
