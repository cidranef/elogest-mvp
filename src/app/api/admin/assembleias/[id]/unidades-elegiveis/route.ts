import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyEligibilityStatus,
  AssemblyLogAction,
  AssemblyStatus,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - UNIDADES ELEGÍVEIS DA ASSEMBLEIA

   Arquivo:
   src/app/api/admin/assembleias/[id]/unidades-elegiveis/route.ts

   ELOGEST — ETAPA 51.6

   Métodos:
   - GET: lista snapshot, unidades disponíveis e indicadores.
   - POST: gera/regenera snapshot ou adiciona unidade manualmente.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Exige módulo comercial Assembleias liberado.
   - Isola dados por administratorId do perfil ativo.
   - Só permite alterações estruturais em DRAFT ou SCHEDULED.
   - Bloqueia regeneração quando já existem votos ou procurações.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type EligibilityAction =
  | "GENERATE_SNAPSHOT"
  | "REGENERATE_SNAPSHOT"
  | "ADD_UNIT";

type EligibilityBody = {
  action?: unknown;
  unitId?: unknown;
  votingWeight?: unknown;
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

function parseAction(value: unknown): EligibilityAction | null {
  const normalized = normalizeNullableString(value)?.toUpperCase();

  if (
    normalized === "GENERATE_SNAPSHOT" ||
    normalized === "REGENERATE_SNAPSHOT" ||
    normalized === "ADD_UNIT"
  ) {
    return normalized;
  }

  return null;
}

function parseVotingWeight(value: unknown, fallback = "1.000000") {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: fallback };
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return {
      ok: false as const,
      message: "Informe um peso de voto maior que zero.",
    };
  }

  if (numericValue > 999999) {
    return {
      ok: false as const,
      message: "O peso de voto informado é muito alto.",
    };
  }

  return {
    ok: true as const,
    value: numericValue.toFixed(6),
  };
}

function isEditableStatus(status: AssemblyStatus) {
  return status === AssemblyStatus.DRAFT || status === AssemblyStatus.SCHEDULED;
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
      _count: {
        select: {
          eligibleUnits: true,
          votes: true,
          representations: true,
        },
      },
    },
  });
}

async function loadEligibilityPayload(params: {
  assemblyId: string;
  condominiumId: string;
}) {
  const [eligibleUnits, activeUnits] = await Promise.all([
    db.assemblyEligibleUnit.findMany({
      where: {
        assemblyId: params.assemblyId,
      },
      include: {
        unit: {
          select: {
            id: true,
            block: true,
            unitNumber: true,
            unitType: true,
            status: true,
          },
        },
      },
      orderBy: [
        { snapshotBlock: "asc" },
        { snapshotUnitNumber: "asc" },
      ],
    }),
    db.unit.findMany({
      where: {
        condominiumId: params.condominiumId,
        status: Status.ACTIVE,
      },
      select: {
        id: true,
        block: true,
        unitNumber: true,
        unitType: true,
        status: true,
      },
      orderBy: [
        { block: "asc" },
        { unitNumber: "asc" },
      ],
    }),
  ]);

  const includedUnitIds = new Set(eligibleUnits.map((item) => item.unitId));
  const availableUnits = activeUnits.filter((item) => !includedUnitIds.has(item.id));

  const metrics = eligibleUnits.reduce(
    (acc, item) => {
      const numericWeight = Number(item.votingWeight.toString());
      const weight = Number.isFinite(numericWeight) ? numericWeight : 0;

      acc.total += 1;
      acc.totalWeight += weight;

      if (item.status === AssemblyEligibilityStatus.ELIGIBLE) {
        acc.eligible += 1;
        acc.eligibleWeight += weight;
      } else {
        acc.blocked += 1;
      }

      return acc;
    },
    {
      total: 0,
      eligible: 0,
      blocked: 0,
      totalWeight: 0,
      eligibleWeight: 0,
    },
  );

  return {
    eligibleUnits,
    availableUnits,
    metrics,
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

    const assembly = await findAssemblyForAdmin({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    const payload = await loadEligibilityPayload({
      assemblyId: assembly.id,
      condominiumId: assembly.condominiumId,
    });

    return NextResponse.json({
      ...payload,
      snapshotAt: assembly.eligibilitySnapshotAt,
      canEdit: isEditableStatus(assembly.status),
    });
  } catch (error) {
    console.error("Erro ao consultar unidades elegíveis da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar as unidades elegíveis." },
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
    const body = (await request.json()) as EligibilityBody;
    const action = parseAction(body.action);

    if (!action) {
      return badRequest("Informe uma ação válida para as unidades elegíveis.");
    }

    const assembly = await findAssemblyForAdmin({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    if (!isEditableStatus(assembly.status)) {
      return forbidden(
        "As unidades elegíveis não podem mais ser alteradas após a abertura da assembleia.",
      );
    }

    if (assembly.convocationPublishedAt) {
      return forbidden(
        "As unidades elegíveis não podem mais ser alteradas após a publicação da convocação.",
      );
    }

    if (action === "GENERATE_SNAPSHOT" || action === "REGENERATE_SNAPSHOT") {
      if (assembly._count.votes > 0 || assembly._count.representations > 0) {
        return forbidden(
          "A fotografia das unidades não pode ser regenerada após o registro de votos ou procurações.",
        );
      }

      if (action === "GENERATE_SNAPSHOT" && assembly._count.eligibleUnits > 0) {
        return badRequest(
          "A fotografia já foi criada. Use a opção de regenerar para substituir a lista atual.",
        );
      }

      const units = await db.unit.findMany({
        where: {
          condominiumId: assembly.condominiumId,
          status: Status.ACTIVE,
        },
        select: {
          id: true,
          block: true,
          unitNumber: true,
        },
      });

      if (units.length === 0) {
        return badRequest(
          "O condomínio não possui unidades ativas para gerar a fotografia de elegibilidade.",
        );
      }

      const snapshotAt = new Date();

      await db.$transaction(async (tx) => {
        if (action === "REGENERATE_SNAPSHOT") {
          await tx.assemblyEligibleUnit.deleteMany({
            where: {
              assemblyId: assembly.id,
            },
          });
        }

        await tx.assemblyEligibleUnit.createMany({
          data: units.map((unit) => ({
            assemblyId: assembly.id,
            unitId: unit.id,
            snapshotBlock: unit.block,
            snapshotUnitNumber: unit.unitNumber,
            status: AssemblyEligibilityStatus.ELIGIBLE,
            votingWeight: "1.000000",
          })),
          skipDuplicates: true,
        });

        await tx.assembly.update({
          where: {
            id: assembly.id,
          },
          data: {
            eligibilitySnapshotAt: snapshotAt,
          },
        });

        await tx.assemblyLog.create({
          data: {
            assemblyId: assembly.id,
            userId: auth.authUser.id,
            action: AssemblyLogAction.ELIGIBILITY_SNAPSHOT_CREATED,
            message:
              action === "REGENERATE_SNAPSHOT"
                ? `Fotografia de elegibilidade regenerada com ${units.length} unidade(s) ativa(s).`
                : `Fotografia de elegibilidade criada com ${units.length} unidade(s) ativa(s).`,
            metadata: {
              action,
              totalUnits: units.length,
              snapshotAt: snapshotAt.toISOString(),
            },
          },
        });
      });

      const payload = await loadEligibilityPayload({
        assemblyId: assembly.id,
        condominiumId: assembly.condominiumId,
      });

      return NextResponse.json({
        ...payload,
        snapshotAt,
        canEdit: true,
        message:
          action === "REGENERATE_SNAPSHOT"
            ? "Fotografia das unidades elegíveis regenerada com sucesso."
            : "Fotografia das unidades elegíveis gerada com sucesso.",
      });
    }

    const unitId = normalizeNullableString(body.unitId);

    if (!unitId) {
      return badRequest("Selecione a unidade que deseja adicionar.");
    }

    const weightValidation = parseVotingWeight(body.votingWeight);
    if (!weightValidation.ok) return badRequest(weightValidation.message);

    const unit = await db.unit.findFirst({
      where: {
        id: unitId,
        condominiumId: assembly.condominiumId,
        status: Status.ACTIVE,
      },
      select: {
        id: true,
        block: true,
        unitNumber: true,
      },
    });

    if (!unit) {
      return notFound("Unidade ativa não encontrada no condomínio da assembleia.");
    }

    const existing = await db.assemblyEligibleUnit.findUnique({
      where: {
        assemblyId_unitId: {
          assemblyId: assembly.id,
          unitId: unit.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return badRequest("Esta unidade já faz parte da fotografia de elegibilidade.");
    }

    const snapshotAt = assembly.eligibilitySnapshotAt ?? new Date();

    await db.$transaction(async (tx) => {
      await tx.assemblyEligibleUnit.create({
        data: {
          assemblyId: assembly.id,
          unitId: unit.id,
          snapshotBlock: unit.block,
          snapshotUnitNumber: unit.unitNumber,
          status: AssemblyEligibilityStatus.ELIGIBLE,
          votingWeight: weightValidation.value,
        },
      });

      if (!assembly.eligibilitySnapshotAt) {
        await tx.assembly.update({
          where: {
            id: assembly.id,
          },
          data: {
            eligibilitySnapshotAt: snapshotAt,
          },
        });
      }

      await tx.assemblyLog.create({
        data: {
          assemblyId: assembly.id,
          userId: auth.authUser.id,
          action: AssemblyLogAction.ELIGIBLE_UNIT_ADDED,
          message: `Unidade ${unit.block ? `${unit.block} - ` : ""}${unit.unitNumber} adicionada manualmente à fotografia de elegibilidade.`,
          metadata: {
            unitId: unit.id,
            block: unit.block,
            unitNumber: unit.unitNumber,
            votingWeight: weightValidation.value,
          },
        },
      });
    });

    const payload = await loadEligibilityPayload({
      assemblyId: assembly.id,
      condominiumId: assembly.condominiumId,
    });

    return NextResponse.json({
      ...payload,
      snapshotAt,
      canEdit: true,
      message: "Unidade adicionada à fotografia de elegibilidade.",
    });
  } catch (error) {
    console.error("Erro ao atualizar unidades elegíveis da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar as unidades elegíveis." },
      { status: 500 },
    );
  }
}
