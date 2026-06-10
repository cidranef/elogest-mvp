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
  requireAdministratorLimit,
  requireModuleAccess,
} from "@/lib/plan-limits";



/* =========================================================
   FORNECEDORES - API ADMINISTRATIVA

   Arquivo:
   src/app/api/admin/fornecedores/route.ts

   ETAPA 46 — REDE DE FORNECEDORES ELOGEST
   ETAPA 47 — PLANOS, MÓDULOS E LIMITES

   Objetivo:
   - Criar a base operacional da Rede de Fornecedores EloGest.
   - Tratar Provider como cadastro global da plataforma.
   - Criar automaticamente a homologação AdministratorProvider
     para a administradora do perfil ativo.
   - Permitir que a administradora cadastre, consulte e organize
     fornecedores/prestadores da própria carteira.

   Regras consolidadas:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por esta rota; deve usar /elogest futuramente.
   - Administradora INACTIVE é bloqueada pelo requireActiveAdminApiAccess().
   - Etapa 47: acesso ao módulo Fornecedores é validado por plano.
   - Etapa 47: criação de nova homologação respeita maxProviders.
   - administratorId sempre vem do perfil ativo validado pelo guard.
   - administratorId enviado no body é ignorado por segurança.
   - Fornecedor pode existir globalmente, mas só aparece para a
     administradora quando houver vínculo AdministratorProvider.
   - Se o documento já existir na base global, a rota não duplica
     Provider; apenas cria a homologação para a administradora atual.
   ========================================================= */



/* =========================================================
   TYPES
   ========================================================= */

type RequestBody = Record<string, unknown>;


type ProviderListItem = Prisma.AdministratorProviderGetPayload<{
  include: {
    provider: {
      include: {
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



function normalizeProviderEntityType(value: unknown): ProviderEntityType {
  const type = cleanText(value || ProviderEntityType.COMPANY).toUpperCase();

  if (
    type === ProviderEntityType.COMPANY ||
    type === ProviderEntityType.INDIVIDUAL ||
    type === ProviderEntityType.PROFESSIONAL ||
    type === ProviderEntityType.OTHER
  ) {
    return type as ProviderEntityType;
  }

  return ProviderEntityType.COMPANY;
}



function normalizeProviderGlobalStatus(value: unknown): ProviderGlobalStatus {
  const status = cleanText(value || ProviderGlobalStatus.ACTIVE).toUpperCase();

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

  return ProviderGlobalStatus.ACTIVE;
}



function normalizeProviderVisibility(value: unknown): ProviderVisibility {
  const visibility = cleanText(value || ProviderVisibility.PRIVATE).toUpperCase();

  if (
    visibility === ProviderVisibility.PRIVATE ||
    visibility === ProviderVisibility.ELOGEST_NETWORK ||
    visibility === ProviderVisibility.PUBLIC_FUTURE
  ) {
    return visibility as ProviderVisibility;
  }

  return ProviderVisibility.PRIVATE;
}



function normalizeProviderOrigin(value: unknown): ProviderOrigin {
  const origin = cleanText(value || ProviderOrigin.ADMINISTRATOR).toUpperCase();

  if (
    origin === ProviderOrigin.ELOGEST ||
    origin === ProviderOrigin.ADMINISTRATOR ||
    origin === ProviderOrigin.INDICATION ||
    origin === ProviderOrigin.IMPORT ||
    origin === ProviderOrigin.OTHER
  ) {
    return origin as ProviderOrigin;
  }

  return ProviderOrigin.ADMINISTRATOR;
}



function normalizeAdministratorProviderStatus(
  value: unknown,
  fallback: AdministratorProviderStatus = AdministratorProviderStatus.IN_REVIEW
): AdministratorProviderStatus {
  const status = cleanText(value || fallback).toUpperCase();

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

  return fallback;
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



function normalizeSearchParams(req: Request) {
  const url = new URL(req.url);

  return {
    search: cleanText(url.searchParams.get("search")),
    status: cleanText(url.searchParams.get("status")).toUpperCase(),
    category: cleanText(url.searchParams.get("category")),
    city: cleanText(url.searchParams.get("city")),
    state: cleanText(url.searchParams.get("state")).toUpperCase().slice(0, 2),
    visibility: cleanText(url.searchParams.get("visibility")).toUpperCase(),
  };
}



function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}



function buildProviderListResponse(item: ProviderListItem) {
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
    createdByUserId: provider.createdByUserId,

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
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    },

    totalCondominiumLinks: provider._count.condominiumProviders,
    totalRatings: provider._count.ratingsReceived,
    condominiumLinksInThisAdministrator: item._count.condominiumProviders,

    metadata: provider.metadata,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}



function buildProviderWhereBySearch({
  administratorId,
  search,
  status,
  category,
  city,
  state,
  visibility,
}: {
  administratorId: string;
  search: string;
  status: string;
  category: string;
  city: string;
  state: string;
  visibility: string;
}): Prisma.AdministratorProviderWhereInput {
  const where: Prisma.AdministratorProviderWhereInput = {
    administratorId,
  };

  if (status) {
    where.status = normalizeAdministratorProviderStatus(
      status,
      AdministratorProviderStatus.IN_REVIEW
    );
  }

  if (category) {
    where.OR = [
      {
        internalCategory: {
          contains: category,
          mode: "insensitive",
        },
      },
      {
        provider: {
          primaryCategory: {
            contains: category,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  const providerFilters: Prisma.ProviderWhereInput[] = [];

  if (search) {
    providerFilters.push({
      OR: [
        {
          tradeName: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          legalName: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          document: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          documentNormalized: {
            contains: normalizeDocument(search) || search,
            mode: "insensitive",
          },
        },
        {
          primaryCategory: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          city: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          state: {
            contains: search.toUpperCase().slice(0, 2),
            mode: "insensitive",
          },
        },
      ],
    });
  }

  if (city) {
    providerFilters.push({
      city: {
        contains: city,
        mode: "insensitive",
      },
    });
  }

  if (state) {
    providerFilters.push({
      state,
    });
  }

  if (
    visibility === ProviderVisibility.PRIVATE ||
    visibility === ProviderVisibility.ELOGEST_NETWORK ||
    visibility === ProviderVisibility.PUBLIC_FUTURE
  ) {
    providerFilters.push({
      visibility: visibility as ProviderVisibility,
    });
  }

  if (providerFilters.length > 0) {
    where.provider = {
      AND: providerFilters,
    };
  }

  return where;
}



/* =========================================================
   GET - LISTAR FORNECEDORES HOMOLOGADOS DA ADMINISTRADORA
   ========================================================= */

export async function GET(req: Request) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const { administratorId } = adminApiAccess;

    await requireModuleAccess({
      administratorId,
      moduleSlug: MODULE_SLUGS.FORNECEDORES,
    });

    const filters = normalizeSearchParams(req);

    const fornecedores = await db.administratorProvider.findMany({
      where: buildProviderWhereBySearch({
        administratorId,
        search: filters.search,
        status: filters.status,
        category: filters.category,
        city: filters.city,
        state: filters.state,
        visibility: filters.visibility,
      }),
      include: {
        provider: {
          include: {
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
        _count: {
          select: {
            condominiumProviders: true,
          },
        },
      },
      orderBy: [
        {
          provider: {
            isFeatured: "desc",
          },
        },
        {
          provider: {
            isVerified: "desc",
          },
        },
        {
          status: "asc",
        },
        {
          provider: {
            tradeName: "asc",
          },
        },
      ],
    });

    return NextResponse.json(fornecedores.map(buildProviderListResponse));
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR FORNECEDORES:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      { error: "Erro ao listar fornecedores." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - CRIAR FORNECEDOR E HOMOLOGAÇÃO DA ADMINISTRADORA
   ========================================================= */

export async function POST(req: Request) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const { administratorId, authUser } = adminApiAccess;

    await requireModuleAccess({
      administratorId,
      moduleSlug: MODULE_SLUGS.FORNECEDORES,
    });

    const body = (await req.json()) as RequestBody;

    const tradeName = cleanText(body.tradeName || body.name);

    if (!tradeName) {
      return NextResponse.json(
        { error: "Nome do fornecedor é obrigatório." },
        { status: 400 }
      );
    }

    const document = cleanOptionalText(body.document);
    const documentNormalized = normalizeDocument(body.document);
    const homologationStatus = normalizeAdministratorProviderStatus(
      body.homologationStatus || body.status,
      AdministratorProviderStatus.IN_REVIEW
    );



    /* =========================================================
       ETAPA 47 — LIMITE DE FORNECEDORES

       Regra:
       - Se a administradora já tiver homologação para o fornecedor,
         não consome novo limite.
       - Se for nova homologação, valida maxProviders do plano.
       - Plano Free: 3 fornecedores.
       - Plano Essencial: 10 fornecedores.
       ========================================================= */

    const existingProviderForLimit = documentNormalized
      ? await db.provider.findUnique({
          where: {
            documentNormalized,
          },
          select: {
            id: true,
          },
        })
      : null;

    const existingHomologationForLimit = existingProviderForLimit
      ? await db.administratorProvider.findUnique({
          where: {
            administratorId_providerId: {
              administratorId,
              providerId: existingProviderForLimit.id,
            },
          },
          select: {
            id: true,
          },
        })
      : null;

    if (!existingHomologationForLimit) {
      await requireAdministratorLimit({
        administratorId,
        limitKey: "maxProviders",
      });
    }

    const provider = await db.$transaction(async (tx) => {
      const existingProvider = documentNormalized
        ? await tx.provider.findUnique({
            where: {
              documentNormalized,
            },
          })
        : null;

      const savedProvider = existingProvider
        ? existingProvider
        : await tx.provider.create({
            data: {
              tradeName,
              legalName: cleanOptionalText(body.legalName),
              document,
              documentNormalized,
              entityType: normalizeProviderEntityType(body.entityType),
              primaryCategory: cleanOptionalText(body.primaryCategory),
              categories: normalizeOptionalJson(body.categories),
              description: cleanOptionalText(body.description),
              serviceArea: cleanOptionalText(body.serviceArea),
              email: cleanOptionalText(body.email),
              phone: cleanOptionalText(body.phone),
              whatsapp: cleanOptionalText(body.whatsapp),
              website: cleanOptionalText(body.website),
              cep: cleanOptionalText(body.cep),
              address: cleanOptionalText(body.address),
              number: cleanOptionalText(body.number),
              complement: cleanOptionalText(body.complement),
              district: cleanOptionalText(body.district),
              city: cleanOptionalText(body.city),
              state: normalizeUf(body.state),
              globalStatus: normalizeProviderGlobalStatus(body.globalStatus),
              visibility: normalizeProviderVisibility(body.visibility),
              isVerified: false,
              isFeatured: false,
              origin: normalizeProviderOrigin(body.origin),
              createdByAdministratorId: administratorId,
              createdByUserId: authUser.id,
              metadata: normalizeOptionalJson(body.metadata),
            },
          });

      const existingHomologation = await tx.administratorProvider.findUnique({
        where: {
          administratorId_providerId: {
            administratorId,
            providerId: savedProvider.id,
          },
        },
      });

      if (existingHomologation) {
        return tx.administratorProvider.findUniqueOrThrow({
          where: {
            id: existingHomologation.id,
          },
          include: {
            provider: {
              include: {
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
            _count: {
              select: {
                condominiumProviders: true,
              },
            },
          },
        });
      }

      return tx.administratorProvider.create({
        data: {
          administratorId,
          providerId: savedProvider.id,
          status: homologationStatus,
          internalName: cleanOptionalText(body.internalName),
          internalCategory: cleanOptionalText(body.internalCategory),
          notes: cleanOptionalText(body.notes),
          canBeUsedInTickets: normalizeBoolean(body.canBeUsedInTickets, true),
          visibleToSyndics: normalizeBoolean(body.visibleToSyndics, false),
          visibleToResidents: normalizeBoolean(body.visibleToResidents, false),
          homologatedAt: isHomologatedStatus(homologationStatus)
            ? new Date()
            : null,
          homologatedByUserId: isHomologatedStatus(homologationStatus)
            ? authUser.id
            : null,
          metadata: normalizeOptionalJson(body.homologationMetadata),
        },
        include: {
          provider: {
            include: {
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
          _count: {
            select: {
              condominiumProviders: true,
            },
          },
        },
      });
    });

    return NextResponse.json(buildProviderListResponse(provider), {
      status: 201,
    });
  } catch (error: unknown) {
    console.error("ERRO AO CRIAR FORNECEDOR:", error);

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
      { error: "Erro ao criar fornecedor." },
      { status: 500 }
    );
  }
}
