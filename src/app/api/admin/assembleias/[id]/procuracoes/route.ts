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
   API ADMIN - PROCURAÇÕES DA ASSEMBLEIA

   Arquivo:
   src/app/api/admin/assembleias/[id]/procuracoes/route.ts

   ELOGEST — ETAPA 51.6

   Ajustes desta revisão:
   - Concedente interno validado exclusivamente pela unidade.
   - Representante interno pode ser pesquisado entre usuários ativos
     da plataforma, mesmo sem vínculo prévio com o condomínio.
   - Representante externo pode ser registrado sem criar usuário
     artificialmente no EloGest.
   - Perfil do representante interno é apenas apoio de identificação.
   - A procuração continua vinculada diretamente à assembleia e unidade.

   ETAPA 51.7.1:
   - Mantém unidades aptas disponíveis para consulta após a convocação.
   - Permite cadastrar procurações enquanto a votação estiver vigente.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type RepresentationType = "PROXY" | "AUTHORIZATION" | "OTHER";
type RepresentativeMode = "INTERNAL" | "EXTERNAL";
type GrantorMode = "INTERNAL" | "DOCUMENT_ONLY";

type CreateRepresentationBody = {
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

function canRegisterRepresentation(assembly: {
  status: AssemblyStatus;
  votingEndsAt: Date | null;
}) {
  const statusAllowsRegistration =
    assembly.status === AssemblyStatus.DRAFT ||
    assembly.status === AssemblyStatus.SCHEDULED ||
    assembly.status === AssemblyStatus.OPEN;

  if (!statusAllowsRegistration) return false;

  return !assembly.votingEndsAt || assembly.votingEndsAt > new Date();
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

async function findAssemblyForAdmin(params: {
  assemblyId: string;
  administratorId: string;
}) {
  return db.assembly.findFirst({
    where: {
      id: params.assemblyId,
      administratorId: params.administratorId,
    },
    select: {
      id: true,
      condominiumId: true,
      status: true,
      convocationPublishedAt: true,
      votingStartsAt: true,
      votingEndsAt: true,
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
      name: true,
      email: true,
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
      name: true,
      email: true,
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

async function listRepresentations(assemblyId: string) {
  const [representations, eligibleUnits] = await Promise.all([
    db.assemblyRepresentation.findMany({
      where: {
        assemblyId,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        unit: {
          select: {
            id: true,
            block: true,
            unitNumber: true,
          },
        },
        grantorUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        representativeUser: {
          select: {
            id: true,
            name: true,
            email: true,
            accesses: {
              where: {
                isActive: true,
              },
              orderBy: {
                label: "asc",
              },
              select: {
                id: true,
                role: true,
                label: true,
                condominiumId: true,
                unitId: true,
              },
            },
          },
        },
        representativeAccess: {
          select: {
            id: true,
            role: true,
            label: true,
            condominiumId: true,
            unitId: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        revokedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            votes: true,
          },
        },
      },
    }),
    db.assemblyEligibleUnit.findMany({
      where: {
        assemblyId,
        status: AssemblyEligibilityStatus.ELIGIBLE,
      },
      orderBy: [{ snapshotBlock: "asc" }, { snapshotUnitNumber: "asc" }],
      select: {
        id: true,
        unitId: true,
        snapshotBlock: true,
        snapshotUnitNumber: true,
        status: true,
        votingWeight: true,
      },
    }),
  ]);

  const now = new Date();
  const metrics = representations.reduce(
    (acc, item) => {
      acc.total += 1;

      const expiredByDate =
        item.status === AssemblyRepresentationStatus.ACTIVE &&
        item.validUntil !== null &&
        item.validUntil < now;

      if (item.status === AssemblyRepresentationStatus.REVOKED) {
        acc.revoked += 1;
      } else if (
        item.status === AssemblyRepresentationStatus.EXPIRED ||
        expiredByDate
      ) {
        acc.expired += 1;
      } else {
        acc.active += 1;
      }

      return acc;
    },
    {
      total: 0,
      active: 0,
      revoked: 0,
      expired: 0,
    },
  );

  return {
    representations,
    eligibleUnits,
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

    const data = await listRepresentations(assembly.id);

    return NextResponse.json({
      ...data,
      canEdit: canRegisterRepresentation(assembly),
    });
  } catch (error) {
    console.error("Erro ao listar procurações da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível listar as procurações da assembleia." },
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
    const body = (await request.json()) as CreateRepresentationBody;
    const assembly = await findAssemblyForAdmin({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    if (!canRegisterRepresentation(assembly)) {
      return forbidden(
        "Procurações não podem ser cadastradas após o encerramento da votação.",
      );
    }

    const eligibleUnitId = normalizeRequiredString(body.eligibleUnitId);
    const representativeMode = parseRepresentativeMode(body.representativeMode);
    const grantorMode = parseGrantorMode(body.grantorMode);
    const representationType = parseRepresentationType(body.representationType);

    if (!eligibleUnitId) return badRequest("Selecione a unidade representada.");

    const eligibleUnit = await findEligibleUnit({
      assemblyId: assembly.id,
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
        condominiumId: assembly.condominiumId,
        unitId: eligibleUnit.unitId,
      });

      if (!grantor) {
        return badRequest(
          "O concedente informado não possui vínculo ativo e apto para voto com a unidade representada.",
        );
      }
    } else {
      externalGrantorName = normalizeRequiredString(body.externalGrantorName);
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
      votingStartsAt: assembly.votingStartsAt,
      votingEndsAt: assembly.votingEndsAt,
    });

    if (windowMessage) return badRequest(windowMessage);

    const conflictingRepresentation = await db.assemblyRepresentation.findFirst({
      where: {
        assemblyId: assembly.id,
        unitId: eligibleUnit.unitId,
        status: AssemblyRepresentationStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (conflictingRepresentation) {
      return badRequest("Esta unidade já possui uma procuração ativa nesta assembleia.");
    }

    const representation = await db.$transaction(async (tx) => {
      const created = await tx.assemblyRepresentation.create({
        data: {
          assemblyId: assembly.id,
          unitId: eligibleUnit.unitId,
          grantorUserId,
          representativeUserId,
          representativeAccessId,
          externalRepresentativeName,
          externalRepresentativeEmail,
          externalRepresentativePhone,
          externalRepresentativeDocument,
          status: AssemblyRepresentationStatus.ACTIVE,
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
          createdByUserId: auth.authUser.id,
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: assembly.id,
          userId: auth.authUser.id,
          action: AssemblyLogAction.REPRESENTATION_ADDED,
          message: `Procuração cadastrada para a unidade ${
            eligibleUnit.snapshotBlock ? `${eligibleUnit.snapshotBlock} - ` : ""
          }${eligibleUnit.snapshotUnitNumber}.`,
          metadata: {
            representationId: created.id,
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

      return created;
    });

    return NextResponse.json(
      {
        representation,
        message: "Procuração cadastrada com sucesso.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Erro ao cadastrar procuração da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível cadastrar a procuração." },
      { status: 500 },
    );
  }
}
