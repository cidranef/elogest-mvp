import {
  AdministratorProviderStatus,
  ProviderEntityType,
  ProviderGlobalStatus,
  ProviderOrigin,
  ProviderVisibility,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import {
  MODULE_SLUGS,
  getPlanErrorPayload,
  isPlanAccessError,
  isPlanLimitError,
  requireModuleAccess,
} from "@/lib/plan-limits";



/* =========================================================
   FORNECEDORES - API ADMINISTRATIVA DE DETALHE/EDIÇÃO

   Arquivo:
   src/app/api/admin/fornecedores/[id]/route.ts

   ETAPA 46 — REDE DE FORNECEDORES ELOGEST
   ETAPA 47 — PLANOS, MÓDULOS E LIMITES

   Objetivo:
   - Consultar e atualizar fornecedor homologado pela administradora.
   - Proteger o acesso por administratorId do perfil ativo.
   - Permitir edição dos dados principais do Provider e das regras
     internas da homologação AdministratorProvider.

   Regra importante:
   - O parâmetro [id] representa o providerId.
   - A rota só retorna/edita se existir AdministratorProvider
     com providerId + administratorId do perfil ativo.
   - Assim, uma administradora não consegue acessar fornecedor
     vinculado apenas a outra carteira.
   - Etapa 47: acesso ao módulo Fornecedores é validado por plano.
   ========================================================= */



interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}



type RequestBody = Record<string, unknown>;


type ProviderDetailItem = Prisma.AdministratorProviderGetPayload<{
  include: {
    provider: {
      include: {
        createdByAdministrator: {
          select: {
            id: true;
            name: true;
          };
        };
        createdByUser: {
          select: {
            id: true;
            name: true;
            email: true;
          };
        };
        _count: {
          select: {
            condominiumProviders: true;
            ratingsReceived: true;
          };
        };
      };
    };
    homologatedByUser: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    condominiumProviders: {
      include: {
        condominium: {
          select: {
            id: true;
            name: true;
            status: true;
          };
        };
      };
      orderBy: {
        createdAt: "desc";
      };
    };
    _count: {
      select: {
        condominiumProviders: true;
      };
    };
  };
}>;



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



function cleanOptionalText(value: unknown) {
  const text = cleanText(value);

  return text || null;
}



function normalizeDocument(value: unknown) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const normalized = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  return normalized || null;
}



function normalizeUf(value: unknown) {
  const uf = cleanText(value).toUpperCase().slice(0, 2);

  return uf || null;
}



function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "sim", "s"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "nao", "não", "n"].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  return fallback;
}



function normalizeProviderEntityType(value: unknown): ProviderEntityType | null {
  const type = cleanText(value).toUpperCase();

  if (
    type === ProviderEntityType.COMPANY ||
    type === ProviderEntityType.INDIVIDUAL ||
    type === ProviderEntityType.PROFESSIONAL ||
    type === ProviderEntityType.OTHER
  ) {
    return type as ProviderEntityType;
  }

  return null;
}



function normalizeProviderGlobalStatus(
  value: unknown
): ProviderGlobalStatus | null {
  const status = cleanText(value).toUpperCase();

  if (
    status === ProviderGlobalStatus.DRAFT ||
    status === ProviderGlobalStatus.ACTIVE ||
    status === ProviderGlobalStatus.IN_REVIEW ||
    status === ProviderGlobalStatus.SUSPENDED ||
    status === ProviderGlobalStatus.BLOCKED ||
    status === ProviderGlobalStatus.INACTIVE
  ) {
    return status as ProviderGlobalStatus;
  }

  return null;
}



function normalizeProviderVisibility(value: unknown): ProviderVisibility | null {
  const visibility = cleanText(value).toUpperCase();

  if (
    visibility === ProviderVisibility.PRIVATE ||
    visibility === ProviderVisibility.ELOGEST_NETWORK ||
    visibility === ProviderVisibility.PUBLIC_FUTURE
  ) {
    return visibility as ProviderVisibility;
  }

  return null;
}



function normalizeProviderOrigin(value: unknown): ProviderOrigin | null {
  const origin = cleanText(value).toUpperCase();

  if (
    origin === ProviderOrigin.ELOGEST ||
    origin === ProviderOrigin.ADMINISTRATOR ||
    origin === ProviderOrigin.INDICATION ||
    origin === ProviderOrigin.IMPORT ||
    origin === ProviderOrigin.OTHER
  ) {
    return origin as ProviderOrigin;
  }

  return null;
}



function normalizeAdministratorProviderStatus(
  value: unknown
): AdministratorProviderStatus | null {
  const status = cleanText(value).toUpperCase();

  if (
    status === AdministratorProviderStatus.IN_REVIEW ||
    status === AdministratorProviderStatus.HOMOLOGATED ||
    status === AdministratorProviderStatus.ACTIVE ||
    status === AdministratorProviderStatus.SUSPENDED ||
    status === AdministratorProviderStatus.BLOCKED ||
    status === AdministratorProviderStatus.INACTIVE
  ) {
    return status as AdministratorProviderStatus;
  }

  return null;
}



function isHomologatedStatus(status: AdministratorProviderStatus) {
  return (
    status === AdministratorProviderStatus.HOMOLOGATED ||
    status === AdministratorProviderStatus.ACTIVE
  );
}



function normalizeOptionalJson(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined || value === "") {
    return Prisma.JsonNull;
  }

  if (typeof value === "object") {
    return value as Prisma.InputJsonValue;
  }

  try {
    return JSON.parse(String(value)) as Prisma.InputJsonValue;
  } catch {
    return Prisma.JsonNull;
  }
}



function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}



function buildProviderDetailResponse(item: ProviderDetailItem) {
  const provider = item.provider;

  return {
    id: provider.id,
    providerId: provider.id,
    administratorProviderId: item.id,

    tradeName: provider.tradeName,
    legalName: provider.legalName,
    document: provider.document,
    documentNormalized: provider.documentNormalized,
    entityType: provider.entityType,

    primaryCategory: provider.primaryCategory,
    categories: provider.categories,
    description: provider.description,
    serviceArea: provider.serviceArea,

    email: provider.email,
    phone: provider.phone,
    whatsapp: provider.whatsapp,
    website: provider.website,

    cep: provider.cep,
    address: provider.address,
    number: provider.number,
    complement: provider.complement,
    district: provider.district,
    city: provider.city,
    state: provider.state,

    globalStatus: provider.globalStatus,
    visibility: provider.visibility,
    isVerified: provider.isVerified,
    isFeatured: provider.isFeatured,
    origin: provider.origin,

    createdByAdministratorId: provider.createdByAdministratorId,
    createdByAdministrator: provider.createdByAdministrator,
    createdByUserId: provider.createdByUserId,
    createdByUser: provider.createdByUser,

    homologation: {
      id: item.id,
      administratorId: item.administratorId,
      status: item.status,
      internalName: item.internalName,
      internalCategory: item.internalCategory,
      notes: item.notes,
      canBeUsedInTickets: item.canBeUsedInTickets,
      visibleToSyndics: item.visibleToSyndics,
      visibleToResidents: item.visibleToResidents,
      homologatedAt: item.homologatedAt,
      homologatedByUserId: item.homologatedByUserId,
      homologatedByUser: item.homologatedByUser,
      metadata: item.metadata,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    },

    condominiumProviders: item.condominiumProviders.map((link) => ({
      id: link.id,
      administratorId: link.administratorId,
      condominiumId: link.condominiumId,
      providerId: link.providerId,
      administratorProviderId: link.administratorProviderId,
      status: link.status,
      linkType: link.linkType,
      category: link.category,
      isPreferred: link.isPreferred,
      startDate: link.startDate,
      endDate: link.endDate,
      notes: link.notes,
      condominium: link.condominium,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    })),

    totalCondominiumLinks: provider._count.condominiumProviders,
    totalRatings: provider._count.ratingsReceived,
    condominiumLinksInThisAdministrator: item._count.condominiumProviders,

    metadata: provider.metadata,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}



function buildProviderUpdateData(body: RequestBody) {
  const data: Prisma.ProviderUncheckedUpdateInput = {};

  if (body.tradeName !== undefined || body.name !== undefined) {
    data.tradeName = cleanText(body.tradeName || body.name);
  }

  if (body.legalName !== undefined) {
    data.legalName = cleanOptionalText(body.legalName);
  }

  if (body.document !== undefined) {
    data.document = cleanOptionalText(body.document);
    data.documentNormalized = normalizeDocument(body.document);
  }

  if (body.entityType !== undefined) {
    const entityType = normalizeProviderEntityType(body.entityType);

    if (entityType) {
      data.entityType = entityType;
    }
  }

  if (body.primaryCategory !== undefined) {
    data.primaryCategory = cleanOptionalText(body.primaryCategory);
  }

  if (body.categories !== undefined) {
    data.categories = normalizeOptionalJson(body.categories);
  }

  if (body.description !== undefined) {
    data.description = cleanOptionalText(body.description);
  }

  if (body.serviceArea !== undefined) {
    data.serviceArea = cleanOptionalText(body.serviceArea);
  }

  if (body.email !== undefined) {
    data.email = cleanOptionalText(body.email);
  }

  if (body.phone !== undefined) {
    data.phone = cleanOptionalText(body.phone);
  }

  if (body.whatsapp !== undefined) {
    data.whatsapp = cleanOptionalText(body.whatsapp);
  }

  if (body.website !== undefined) {
    data.website = cleanOptionalText(body.website);
  }

  if (body.cep !== undefined) {
    data.cep = cleanOptionalText(body.cep);
  }

  if (body.address !== undefined) {
    data.address = cleanOptionalText(body.address);
  }

  if (body.number !== undefined) {
    data.number = cleanOptionalText(body.number);
  }

  if (body.complement !== undefined) {
    data.complement = cleanOptionalText(body.complement);
  }

  if (body.district !== undefined) {
    data.district = cleanOptionalText(body.district);
  }

  if (body.city !== undefined) {
    data.city = cleanOptionalText(body.city);
  }

  if (body.state !== undefined) {
    data.state = normalizeUf(body.state);
  }

  if (body.globalStatus !== undefined) {
    const globalStatus = normalizeProviderGlobalStatus(body.globalStatus);

    if (globalStatus) {
      data.globalStatus = globalStatus;
    }
  }

  if (body.visibility !== undefined) {
    const visibility = normalizeProviderVisibility(body.visibility);

    if (visibility) {
      data.visibility = visibility;
    }
  }

  /* =========================================================
     isVerified e isFeatured ficam reservados para gestão EloGest.
     Nesta rota /admin, a administradora não altera esses campos.
     ========================================================= */

  if (body.origin !== undefined) {
    const origin = normalizeProviderOrigin(body.origin);

    if (origin) {
      data.origin = origin;
    }
  }

  if (body.metadata !== undefined) {
    data.metadata = normalizeOptionalJson(body.metadata);
  }

  return data;
}



function buildAdministratorProviderUpdateData({
  body,
  currentStatus,
  authUserId,
}: {
  body: RequestBody;
  currentStatus: AdministratorProviderStatus;
  authUserId: string;
}) {
  const data: Prisma.AdministratorProviderUncheckedUpdateInput = {};

  if (body.homologationStatus !== undefined || body.status !== undefined) {
    const status = normalizeAdministratorProviderStatus(
      body.homologationStatus || body.status
    );

    if (status) {
      data.status = status;

      if (isHomologatedStatus(status) && !isHomologatedStatus(currentStatus)) {
        data.homologatedAt = new Date();
        data.homologatedByUserId = authUserId;
      }

      if (!isHomologatedStatus(status)) {
        data.homologatedAt = null;
        data.homologatedByUserId = null;
      }
    }
  }

  if (body.internalName !== undefined) {
    data.internalName = cleanOptionalText(body.internalName);
  }

  if (body.internalCategory !== undefined) {
    data.internalCategory = cleanOptionalText(body.internalCategory);
  }

  if (body.notes !== undefined) {
    data.notes = cleanOptionalText(body.notes);
  }

  if (body.canBeUsedInTickets !== undefined) {
    data.canBeUsedInTickets = normalizeBoolean(body.canBeUsedInTickets, true);
  }

  if (body.visibleToSyndics !== undefined) {
    data.visibleToSyndics = normalizeBoolean(body.visibleToSyndics, false);
  }

  if (body.visibleToResidents !== undefined) {
    data.visibleToResidents = normalizeBoolean(body.visibleToResidents, false);
  }

  if (body.homologationMetadata !== undefined) {
    data.metadata = normalizeOptionalJson(body.homologationMetadata);
  }

  return data;
}



async function getAdministratorProviderByContext({
  providerId,
  administratorId,
}: {
  providerId: string;
  administratorId: string;
}) {
  return db.administratorProvider.findFirst({
    where: {
      providerId,
      administratorId,
    },
    include: {
      provider: {
        include: {
          createdByAdministrator: {
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
          _count: {
            select: {
              condominiumProviders: true,
              ratingsReceived: true,
            },
          },
        },
      },
      homologatedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      condominiumProviders: {
        where: {
          administratorId,
        },
        include: {
          condominium: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      _count: {
        select: {
          condominiumProviders: true,
        },
      },
    },
  });
}



/* =========================================================
   GET - DETALHAR FORNECEDOR HOMOLOGADO
   ========================================================= */

export async function GET(_req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    await requireModuleAccess({
      administratorId: adminApiAccess.administratorId,
      moduleSlug: MODULE_SLUGS.FORNECEDORES,
    });

    const { id } = await context.params;
    const providerId = cleanText(id);

    if (!providerId) {
      return NextResponse.json(
        { error: "ID do fornecedor não informado." },
        { status: 400 }
      );
    }

    const item = await getAdministratorProviderByContext({
      providerId,
      administratorId: adminApiAccess.administratorId,
    });

    if (!item) {
      return NextResponse.json(
        { error: "Fornecedor não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    return NextResponse.json(buildProviderDetailResponse(item));
  } catch (error: unknown) {
    console.error("ERRO AO DETALHAR FORNECEDOR:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      { error: "Erro ao detalhar fornecedor." },
      { status: 500 }
    );
  }
}



/* =========================================================
   PATCH - ATUALIZAR FORNECEDOR HOMOLOGADO
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    await requireModuleAccess({
      administratorId: adminApiAccess.administratorId,
      moduleSlug: MODULE_SLUGS.FORNECEDORES,
    });

    const { id } = await context.params;
    const providerId = cleanText(id);
    const body = (await req.json()) as RequestBody;

    if (!providerId) {
      return NextResponse.json(
        { error: "ID do fornecedor não informado." },
        { status: 400 }
      );
    }

    const current = await db.administratorProvider.findFirst({
      where: {
        providerId,
        administratorId: adminApiAccess.administratorId,
      },
      include: {
        provider: true,
      },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Fornecedor não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    if (
      (body.tradeName !== undefined || body.name !== undefined) &&
      !cleanText(body.tradeName || body.name)
    ) {
      return NextResponse.json(
        { error: "Nome do fornecedor é obrigatório." },
        { status: 400 }
      );
    }

    if (
      body.entityType !== undefined &&
      !normalizeProviderEntityType(body.entityType)
    ) {
      return NextResponse.json(
        {
          error:
            "Tipo de fornecedor inválido. Use COMPANY, INDIVIDUAL, PROFESSIONAL ou OTHER.",
        },
        { status: 400 }
      );
    }

    if (
      body.globalStatus !== undefined &&
      !normalizeProviderGlobalStatus(body.globalStatus)
    ) {
      return NextResponse.json(
        {
          error:
            "Status global inválido. Use DRAFT, ACTIVE, IN_REVIEW, SUSPENDED, BLOCKED ou INACTIVE.",
        },
        { status: 400 }
      );
    }

    if (
      body.visibility !== undefined &&
      !normalizeProviderVisibility(body.visibility)
    ) {
      return NextResponse.json(
        {
          error:
            "Visibilidade inválida. Use PRIVATE, ELOGEST_NETWORK ou PUBLIC_FUTURE.",
        },
        { status: 400 }
      );
    }

    if (body.origin !== undefined && !normalizeProviderOrigin(body.origin)) {
      return NextResponse.json(
        {
          error:
            "Origem inválida. Use ELOGEST, ADMINISTRATOR, INDICATION, IMPORT ou OTHER.",
        },
        { status: 400 }
      );
    }

    if (
      (body.homologationStatus !== undefined || body.status !== undefined) &&
      !normalizeAdministratorProviderStatus(
        body.homologationStatus || body.status
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Status de homologação inválido. Use IN_REVIEW, HOMOLOGATED, ACTIVE, SUSPENDED, BLOCKED ou INACTIVE.",
        },
        { status: 400 }
      );
    }

    const newDocumentNormalized =
      body.document !== undefined
        ? normalizeDocument(body.document)
        : current.provider.documentNormalized;

    if (
      newDocumentNormalized &&
      newDocumentNormalized !== current.provider.documentNormalized
    ) {
      const existingProvider = await db.provider.findUnique({
        where: {
          documentNormalized: newDocumentNormalized,
        },
      });

      if (existingProvider && existingProvider.id !== providerId) {
        return NextResponse.json(
          { error: "Já existe outro fornecedor cadastrado com este documento." },
          { status: 409 }
        );
      }
    }

    const providerUpdateData = buildProviderUpdateData(body);
    const homologationUpdateData = buildAdministratorProviderUpdateData({
      body,
      currentStatus: current.status,
      authUserId: adminApiAccess.authUser.id,
    });

    await db.$transaction(async (tx) => {
      if (Object.keys(providerUpdateData).length > 0) {
        await tx.provider.update({
          where: {
            id: current.providerId,
          },
          data: providerUpdateData,
        });
      }

      if (Object.keys(homologationUpdateData).length > 0) {
        await tx.administratorProvider.update({
          where: {
            id: current.id,
          },
          data: homologationUpdateData,
        });
      }
    });

    const updated = await getAdministratorProviderByContext({
      providerId,
      administratorId: adminApiAccess.administratorId,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Fornecedor atualizado, mas não foi possível recarregar os dados." },
        { status: 500 }
      );
    }

    return NextResponse.json(buildProviderDetailResponse(updated));
  } catch (error: unknown) {
    console.error("ERRO AO ATUALIZAR FORNECEDOR:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    if (isPrismaKnownRequestError(error) && error.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe fornecedor cadastrado com este dado único." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao atualizar fornecedor." },
      { status: 500 }
    );
  }
}
