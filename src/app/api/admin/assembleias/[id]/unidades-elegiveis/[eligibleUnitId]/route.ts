import { NextRequest, NextResponse } from "next/server";
import {
  AssemblyEligibilityStatus,
  AssemblyLogAction,
  AssemblyStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - UNIDADE ELEGÍVEL DA ASSEMBLEIA

   Arquivo:
   src/app/api/admin/assembleias/[id]/unidades-elegiveis/[eligibleUnitId]/route.ts

   ELOGEST — ETAPA 51.6

   Métodos:
   - PATCH: bloqueia, libera ou altera peso da unidade.
   - DELETE: remove unidade da fotografia antes da abertura.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{
    id: string;
    eligibleUnitId: string;
  }>;
};

type UpdateEligibleUnitBody = {
  status?: unknown;
  blockedReason?: unknown;
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

function parseStatus(value: unknown, fallback: AssemblyEligibilityStatus) {
  if (value === null || value === undefined || value === "") {
    return { ok: true as const, value: fallback };
  }

  if (
    value !== AssemblyEligibilityStatus.ELIGIBLE &&
    value !== AssemblyEligibilityStatus.BLOCKED
  ) {
    return {
      ok: false as const,
      message: "Situação de elegibilidade inválida.",
    };
  }

  return {
    ok: true as const,
    value,
  };
}

function parseVotingWeight(value: unknown, fallback: string) {
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

async function findEligibleUnitForAdmin(params: {
  assemblyId: string;
  eligibleUnitId: string;
  administratorId: string;
}) {
  return db.assemblyEligibleUnit.findFirst({
    where: {
      id: params.eligibleUnitId,
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
        },
      },
      unit: {
        select: {
          id: true,
          block: true,
          unitNumber: true,
        },
      },
      _count: {
        select: {
          votes: true,
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
    const { id, eligibleUnitId } = await context.params;
    const body = (await request.json()) as UpdateEligibleUnitBody;

    const current = await findEligibleUnitForAdmin({
      assemblyId: id,
      eligibleUnitId,
      administratorId: auth.administratorId,
    });

    if (!current) {
      return notFound("Unidade elegível não encontrada na assembleia.");
    }

    if (!isEditableStatus(current.assembly.status)) {
      return forbidden(
        "A unidade elegível não pode mais ser alterada após a abertura da assembleia.",
      );
    }

    if (current.assembly.convocationPublishedAt) {
      return forbidden(
        "A unidade elegível não pode mais ser alterada após a publicação da convocação.",
      );
    }

    if (current._count.votes > 0) {
      return forbidden(
        "A unidade não pode ser alterada porque já possui voto registrado.",
      );
    }

    const statusValidation = parseStatus(body.status, current.status);
    if (!statusValidation.ok) return badRequest(statusValidation.message);

    const weightValidation = parseVotingWeight(
      body.votingWeight,
      current.votingWeight.toString(),
    );
    if (!weightValidation.ok) return badRequest(weightValidation.message);

    const blockedReason = normalizeNullableString(body.blockedReason);

    if (statusValidation.value === AssemblyEligibilityStatus.BLOCKED && !blockedReason) {
      return badRequest("Informe o motivo do bloqueio da unidade.");
    }

    const action =
      statusValidation.value === AssemblyEligibilityStatus.BLOCKED
        ? AssemblyLogAction.ELIGIBLE_UNIT_BLOCKED
        : AssemblyLogAction.ELIGIBLE_UNIT_UPDATED;

    const unitLabel = `${current.snapshotBlock ? `${current.snapshotBlock} - ` : ""}${current.snapshotUnitNumber}`;

    await db.$transaction(async (tx) => {
      await tx.assemblyEligibleUnit.update({
        where: {
          id: current.id,
        },
        data: {
          status: statusValidation.value,
          blockedReason:
            statusValidation.value === AssemblyEligibilityStatus.BLOCKED
              ? blockedReason
              : null,
          votingWeight: weightValidation.value,
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: current.assemblyId,
          userId: auth.authUser.id,
          action,
          message:
            statusValidation.value === AssemblyEligibilityStatus.BLOCKED
              ? `Unidade ${unitLabel} bloqueada para votação.`
              : `Unidade ${unitLabel} liberada ou atualizada para votação.`,
          metadata: {
            eligibleUnitId: current.id,
            unitId: current.unitId,
            status: statusValidation.value,
            blockedReason:
              statusValidation.value === AssemblyEligibilityStatus.BLOCKED
                ? blockedReason
                : null,
            votingWeight: weightValidation.value,
          },
        },
      });
    });

    return NextResponse.json({
      message:
        statusValidation.value === AssemblyEligibilityStatus.BLOCKED
          ? "Unidade bloqueada para votação."
          : "Unidade elegível atualizada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar unidade elegível:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a unidade elegível." },
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
    const { id, eligibleUnitId } = await context.params;

    const current = await findEligibleUnitForAdmin({
      assemblyId: id,
      eligibleUnitId,
      administratorId: auth.administratorId,
    });

    if (!current) {
      return notFound("Unidade elegível não encontrada na assembleia.");
    }

    if (!isEditableStatus(current.assembly.status)) {
      return forbidden(
        "A unidade elegível não pode mais ser removida após a abertura da assembleia.",
      );
    }

    if (current.assembly.convocationPublishedAt) {
      return forbidden(
        "A unidade elegível não pode mais ser removida após a publicação da convocação.",
      );
    }

    if (current._count.votes > 0) {
      return forbidden(
        "A unidade não pode ser removida porque já possui voto registrado.",
      );
    }

    const activeRepresentations = await db.assemblyRepresentation.count({
      where: {
        assemblyId: current.assemblyId,
        unitId: current.unitId,
      },
    });

    if (activeRepresentations > 0) {
      return forbidden(
        "A unidade não pode ser removida porque possui procuração ou representação registrada.",
      );
    }

    const unitLabel = `${current.snapshotBlock ? `${current.snapshotBlock} - ` : ""}${current.snapshotUnitNumber}`;

    await db.$transaction(async (tx) => {
      await tx.assemblyEligibleUnit.delete({
        where: {
          id: current.id,
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: current.assemblyId,
          userId: auth.authUser.id,
          action: AssemblyLogAction.ELIGIBLE_UNIT_UPDATED,
          message: `Unidade ${unitLabel} removida manualmente da fotografia de elegibilidade.`,
          metadata: {
            eligibleUnitId: current.id,
            unitId: current.unitId,
            operation: "REMOVED",
          },
        },
      });
    });

    return NextResponse.json({
      message: "Unidade removida da fotografia de elegibilidade.",
    });
  } catch (error) {
    console.error("Erro ao remover unidade elegível:", error);
    return NextResponse.json(
      { error: "Não foi possível remover a unidade elegível." },
      { status: 500 },
    );
  }
}
