import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  AssemblyEligibilityStatus,
  AssemblyLogAction,
  AssemblyRepresentationStatus,
  AssemblyStatus,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - PROCURAÇÃO INDIVIDUAL DA ASSEMBLEIA

   Arquivo:
   src/app/api/admin/assembleias/[id]/procuracoes/[representationId]/route.ts

   ELOGEST — ETAPA 51.6

   Ajustes desta revisão:
   - Edição compatível com representante interno ou externo.
   - Concedente interno validado exclusivamente pela unidade.
   - Perfil do representante é opcional e serve como apoio.
   - Revogação e reativação preservam histórico formal.
   - Alterações continuam disponíveis enquanto a votação estiver vigente,
     inclusive após a publicação da convocação.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{
    id: string;
    representationId: string;
  }>;
};

type RepresentationType = "PROXY" | "AUTHORIZATION" | "OTHER";
type RepresentativeMode = "INTERNAL" | "EXTERNAL";
type GrantorMode = "INTERNAL" | "DOCUMENT_ONLY";
type RepresentationAction = "UPDATE" | "REVOKE" | "REACTIVATE";

type UpdateRepresentationBody = {
  action?: unknown;
  eligibleUnitId?: unknown;
  grantorMode?: unknown;
  grantorUserId?: unknown;
  externalGrantorName?: unknown;
  representativeMode?: unknown;
  representativeUserId?: unknown;
  representativeAccessId?: unknown;
  externalRepresentativeName?: unknown;
  externalRepresentativeEmail?: unknown;
  externalRepresentativePhone?: unknown;
  externalRepresentativeDocument?: unknown;
  representationType?: unknown;
  validFrom?: unknown;
  validUntil?: unknown;
  documentUrl?: unknown;
  documentName?: unknown;
  notes?: unknown;
  revokedReason?: unknown;
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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function parseRepresentationType(value: unknown): RepresentationType {
  if (value === "AUTHORIZATION" || value === "OTHER") return value;
  return "PROXY";
}

function parseRepresentativeMode(value: unknown): RepresentativeMode {
  return value === "EXTERNAL" ? "EXTERNAL" : "INTERNAL";
}

function parseGrantorMode(value: unknown): GrantorMode {
  return value === "DOCUMENT_ONLY" ? "DOCUMENT_ONLY" : "INTERNAL";
}

function parseAction(value: unknown): RepresentationAction {
  const normalized = normalizeNullableString(value)?.toUpperCase();

  if (normalized === "REVOKE" || normalized === "REACTIVATE") {
    return normalized;
  }

  return "UPDATE";
}

function canManageRepresentation(assembly: {
  status: AssemblyStatus;
  votingEndsAt: Date | null;
}) {
  const statusAllowsManagement =
    assembly.status === AssemblyStatus.DRAFT ||
    assembly.status === AssemblyStatus.SCHEDULED ||
    assembly.status === AssemblyStatus.OPEN;

  if (!statusAllowsManagement) return false;

  return !assembly.votingEndsAt || assembly.votingEndsAt > new Date();
}

function getMetadata(metadata: unknown) {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }

  return {};
}

function getMetadataRepresentationType(metadata: unknown): RepresentationType {
  return parseRepresentationType(getMetadata(metadata).representationType);
}

function getMetadataRepresentativeMode(metadata: unknown): RepresentativeMode {
  return parseRepresentativeMode(getMetadata(metadata).representativeMode);
}

function getMetadataGrantorMode(metadata: unknown): GrantorMode {
  return parseGrantorMode(getMetadata(metadata).grantorMode);
}

function getMetadataExternalGrantorName(metadata: unknown) {
  return normalizeNullableString(getMetadata(metadata).externalGrantorName);
}

function buildRepresentationMetadata(params: {
  representationType: RepresentationType;
  representativeMode: RepresentativeMode;
  grantorMode: GrantorMode;
  externalGrantorName: string | null;
}) {
  return {
    representationType: params.representationType,
    representativeMode: params.representativeMode,
    grantorMode: params.grantorMode,
    externalGrantorName: params.externalGrantorName,
  };
}

function validateRepresentationWindow(params: {
  validFrom: Date | null;
  validUntil: Date | null;
  votingStartsAt: Date | null;
  votingEndsAt: Date | null;
}) {
  const { validFrom, validUntil, votingStartsAt, votingEndsAt } = params;

  if (validFrom && validUntil && validUntil < validFrom) {
    return "O fim da vigência deve ser posterior ao início da vigência.";
  }

  if (validFrom && votingStartsAt && validFrom > votingStartsAt) {
    return "A vigência da procuração deve começar antes do início da votação.";
  }

  if (validUntil && votingEndsAt && validUntil < votingEndsAt) {
    return "A vigência da procuração deve cobrir o prazo final da votação.";
  }

  return "";
}

async function findRepresentationForAdmin(params: {
  assemblyId: string;
  representationId: string;
  administratorId: string;
}) {
  return db.assemblyRepresentation.findFirst({
    where: {
      id: params.representationId,
      assemblyId: params.assemblyId,
      assembly: {
        administratorId: params.administratorId,
      },
    },
    include: {
      assembly: {
        select: {
          id: true,
          condominiumId: true,
          status: true,
          convocationPublishedAt: true,
          votingStartsAt: true,
          votingEndsAt: true,
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

async function findEligibleUnit(params: {
  assemblyId: string;
  eligibleUnitId: string;
}) {
  return db.assemblyEligibleUnit.findFirst({
    where: {
      id: params.eligibleUnitId,
      assemblyId: params.assemblyId,
      status: AssemblyEligibilityStatus.ELIGIBLE,
    },
    select: {
      id: true,
      unitId: true,
      snapshotBlock: true,
      snapshotUnitNumber: true,
    },
  });
}

async function validateInternalRepresentative(userId: string) {
  return db.user.findFirst({
    where: {
      id: userId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });
}

async function validateInternalGrantor(params: {
  userId: string;
  condominiumId: string;
  unitId: string;
}) {
  return db.user.findFirst({
    where: {
      id: params.userId,
      isActive: true,
      OR: [
        {
          // ETAPA 51.5.2 — vínculo formal já normalizado.
          unitPersonLinks: {
            some: {
              condominiumId: params.condominiumId,
              unitId: params.unitId,
              status: Status.ACTIVE,
              canVote: true,
            },
          },
        },
        {
          // ETAPA 51.5.2 — compatibilidade com cadastros anteriores.
          // O perfil PROPRIETARIO ativo na unidade também comprova
          // legitimidade enquanto os vínculos formais são consolidados.
          accesses: {
            some: {
              condominiumId: params.condominiumId,
              unitId: params.unitId,
              isActive: true,
              role: AccessRole.PROPRIETARIO,
            },
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });
}

async function validateRepresentativeAccess(params: {
  accessId: string;
  userId: string;
}) {
  return db.userAccess.findFirst({
    where: {
      id: params.accessId,
      userId: params.userId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });
}

async function ensureNoConflictingActiveRepresentation(params: {
  assemblyId: string;
  unitId: string;
  excludeRepresentationId: string;
}) {
  return db.assemblyRepresentation.findFirst({
    where: {
      assemblyId: params.assemblyId,
      unitId: params.unitId,
      status: AssemblyRepresentationStatus.ACTIVE,
      NOT: {
        id: params.excludeRepresentationId,
      },
    },
    select: {
      id: true,
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
    const { id, representationId } = await context.params;
    const body = (await request.json()) as UpdateRepresentationBody;
    const current = await findRepresentationForAdmin({
      assemblyId: id,
      representationId,
      administratorId: auth.administratorId,
    });

    if (!current) {
      return notFound("Procuração não encontrada nesta assembleia.");
    }

    if (!canManageRepresentation(current.assembly)) {
      return forbidden(
        "Procurações não podem ser alteradas após o encerramento da votação.",
      );
    }

    const action = parseAction(body.action);

    if (action === "REVOKE") {
      if (current.status !== AssemblyRepresentationStatus.ACTIVE) {
        return badRequest("Somente procurações ativas podem ser revogadas.");
      }

      if (current._count.votes > 0) {
        return badRequest(
          "A procuração já possui voto vinculado e não pode ser revogada nesta etapa.",
        );
      }

      const revokedReason = normalizeRequiredString(body.revokedReason);
      if (revokedReason.length < 3) {
        return badRequest("Informe o motivo da revogação.");
      }

      await db.$transaction(async (tx) => {
        await tx.assemblyRepresentation.update({
          where: {
            id: current.id,
          },
          data: {
            status: AssemblyRepresentationStatus.REVOKED,
            revokedAt: new Date(),
            revokedByUserId: auth.authUser.id,
            revokedReason,
          },
        });

        await tx.assemblyLog.create({
          data: {
            assemblyId: current.assembly.id,
            userId: auth.authUser.id,
            action: AssemblyLogAction.REPRESENTATION_REVOKED,
            message: `Procuração revogada para a unidade ${
              current.unit.block ? `${current.unit.block} - ` : ""
            }${current.unit.unitNumber}.`,
            metadata: {
              representationId: current.id,
              unitId: current.unitId,
              revokedReason,
            },
          },
        });
      });

      return NextResponse.json({
        message: "Procuração revogada com sucesso.",
      });
    }

    if (action === "REACTIVATE") {
      if (current.status === AssemblyRepresentationStatus.ACTIVE) {
        return badRequest("A procuração já está ativa.");
      }

      if (current._count.votes > 0) {
        return badRequest(
          "A procuração já possui voto vinculado e não pode ser reativada nesta etapa.",
        );
      }

      const conflictingRepresentation = await ensureNoConflictingActiveRepresentation({
        assemblyId: current.assembly.id,
        unitId: current.unitId,
        excludeRepresentationId: current.id,
      });

      if (conflictingRepresentation) {
        return badRequest("A unidade já possui outra procuração ativa nesta assembleia.");
      }

      const windowMessage = validateRepresentationWindow({
        validFrom: current.validFrom,
        validUntil: current.validUntil,
        votingStartsAt: current.assembly.votingStartsAt,
        votingEndsAt: current.assembly.votingEndsAt,
      });

      if (windowMessage) return badRequest(windowMessage);

      await db.$transaction(async (tx) => {
        await tx.assemblyRepresentation.update({
          where: {
            id: current.id,
          },
          data: {
            status: AssemblyRepresentationStatus.ACTIVE,
            revokedAt: null,
            revokedByUserId: null,
            revokedReason: null,
          },
        });

        await tx.assemblyLog.create({
          data: {
            assemblyId: current.assembly.id,
            userId: auth.authUser.id,
            action: AssemblyLogAction.REPRESENTATION_UPDATED,
            message: `Procuração reativada para a unidade ${
              current.unit.block ? `${current.unit.block} - ` : ""
            }${current.unit.unitNumber}.`,
            metadata: {
              representationId: current.id,
              unitId: current.unitId,
              action: "REACTIVATE",
            },
          },
        });
      });

      return NextResponse.json({
        message: "Procuração reativada com sucesso.",
      });
    }

    if (current.status !== AssemblyRepresentationStatus.ACTIVE) {
      return badRequest("Somente procurações ativas podem ser editadas.");
    }

    if (current._count.votes > 0) {
      return badRequest("A procuração já possui voto vinculado e não pode ser editada.");
    }

    const eligibleUnitId = normalizeRequiredString(body.eligibleUnitId);
    const representativeMode = parseRepresentativeMode(
      body.representativeMode ?? getMetadataRepresentativeMode(current.metadata),
    );
    const grantorMode = parseGrantorMode(
      body.grantorMode ?? getMetadataGrantorMode(current.metadata),
    );
    const representationType = parseRepresentationType(
      body.representationType ?? getMetadataRepresentationType(current.metadata),
    );

    if (!eligibleUnitId) return badRequest("Selecione a unidade representada.");

    const eligibleUnit = await findEligibleUnit({
      assemblyId: current.assembly.id,
      eligibleUnitId,
    });

    if (!eligibleUnit) {
      return badRequest("Selecione uma unidade apta na fotografia de elegibilidade.");
    }

    let grantorUserId: string | null = null;
    let externalGrantorName: string | null = null;

    if (grantorMode === "INTERNAL") {
      grantorUserId = normalizeRequiredString(body.grantorUserId);
      if (!grantorUserId) {
        return badRequest("Selecione o concedente vinculado à unidade representada.");
      }

      const grantor = await validateInternalGrantor({
        userId: grantorUserId,
        condominiumId: current.assembly.condominiumId,
        unitId: eligibleUnit.unitId,
      });

      if (!grantor) {
        return badRequest(
          "O concedente informado não possui vínculo ativo e apto para voto com a unidade representada.",
        );
      }
    } else {
      externalGrantorName = normalizeRequiredString(
        body.externalGrantorName ?? getMetadataExternalGrantorName(current.metadata),
      );

      if (externalGrantorName.length < 3) {
        return badRequest("Informe o nome do concedente descrito no documento comprobatório.");
      }
    }

    let representativeUserId: string | null = null;
    let representativeAccessId: string | null = null;
    let externalRepresentativeName: string | null = null;
    let externalRepresentativeEmail: string | null = null;
    let externalRepresentativePhone: string | null = null;
    let externalRepresentativeDocument: string | null = null;

    if (representativeMode === "INTERNAL") {
      representativeUserId = normalizeRequiredString(body.representativeUserId);
      representativeAccessId = normalizeNullableString(body.representativeAccessId);

      if (!representativeUserId) {
        return badRequest("Pesquise e selecione o representante autorizado.");
      }

      const representative = await validateInternalRepresentative(representativeUserId);
      if (!representative) {
        return badRequest("O representante selecionado não está ativo no EloGest.");
      }

      if (representativeAccessId) {
        const representativeAccess = await validateRepresentativeAccess({
          accessId: representativeAccessId,
          userId: representativeUserId,
        });

        if (!representativeAccess) {
          return badRequest("O perfil selecionado não pertence ao representante informado.");
        }
      }
    } else {
      externalRepresentativeName = normalizeRequiredString(body.externalRepresentativeName);
      externalRepresentativeEmail = normalizeRequiredString(body.externalRepresentativeEmail).toLowerCase();
      externalRepresentativePhone = normalizeNullableString(body.externalRepresentativePhone);
      externalRepresentativeDocument = normalizeNullableString(body.externalRepresentativeDocument);

      if (externalRepresentativeName.length < 3) {
        return badRequest("Informe o nome completo do representante externo.");
      }

      if (!externalRepresentativeEmail || !isValidEmail(externalRepresentativeEmail)) {
        return badRequest("Informe um e-mail válido para o representante externo.");
      }
    }

    if (
      grantorMode === "INTERNAL" &&
      representativeMode === "INTERNAL" &&
      grantorUserId === representativeUserId
    ) {
      return badRequest("Concedente e representante devem ser pessoas diferentes.");
    }

    const validFromValidation = parseDateOrNull(body.validFrom);
    if (!validFromValidation.ok) return badRequest(validFromValidation.message);

    const validUntilValidation = parseDateOrNull(body.validUntil);
    if (!validUntilValidation.ok) return badRequest(validUntilValidation.message);

    const windowMessage = validateRepresentationWindow({
      validFrom: validFromValidation.value,
      validUntil: validUntilValidation.value,
      votingStartsAt: current.assembly.votingStartsAt,
      votingEndsAt: current.assembly.votingEndsAt,
    });

    if (windowMessage) return badRequest(windowMessage);

    const conflictingRepresentation = await ensureNoConflictingActiveRepresentation({
      assemblyId: current.assembly.id,
      unitId: eligibleUnit.unitId,
      excludeRepresentationId: current.id,
    });

    if (conflictingRepresentation) {
      return badRequest("Esta unidade já possui outra procuração ativa nesta assembleia.");
    }

    await db.$transaction(async (tx) => {
      await tx.assemblyRepresentation.update({
        where: {
          id: current.id,
        },
        data: {
          unitId: eligibleUnit.unitId,
          grantorUserId,
          representativeUserId,
          representativeAccessId,
          externalRepresentativeName,
          externalRepresentativeEmail,
          externalRepresentativePhone,
          externalRepresentativeDocument,
          validFrom: validFromValidation.value,
          validUntil: validUntilValidation.value,
          documentUrl: normalizeNullableString(body.documentUrl),
          documentName: normalizeNullableString(body.documentName),
          notes: normalizeNullableString(body.notes),
          metadata: buildRepresentationMetadata({
            representationType,
            representativeMode,
            grantorMode,
            externalGrantorName,
          }),
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: current.assembly.id,
          userId: auth.authUser.id,
          action: AssemblyLogAction.REPRESENTATION_UPDATED,
          message: `Procuração atualizada para a unidade ${
            eligibleUnit.snapshotBlock ? `${eligibleUnit.snapshotBlock} - ` : ""
          }${eligibleUnit.snapshotUnitNumber}.`,
          metadata: {
            representationId: current.id,
            eligibleUnitId: eligibleUnit.id,
            unitId: eligibleUnit.unitId,
            grantorMode,
            grantorUserId,
            externalGrantorName,
            representativeMode,
            representativeUserId,
            representativeAccessId,
            externalRepresentativeName,
            externalRepresentativeEmail,
            representationType,
          },
        },
      });
    });

    return NextResponse.json({
      message: "Procuração atualizada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar procuração da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a procuração." },
      { status: 500 },
    );
  }
}
