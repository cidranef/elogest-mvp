import {
  AdministratorProviderStatus,
  CondominiumProviderStatus,
  ProviderGlobalStatus,
  Prisma,
  Status,
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
   FORNECEDORES - DISPONÍVEIS PARA CHAMADOS

   Arquivo:
   src/app/api/admin/fornecedores/para-chamados/route.ts

   ETAPA 46 — REDE DE FORNECEDORES ELOGEST
   ETAPA 47 — PLANOS, MÓDULOS E LIMITES

   Objetivo:
   - Preparar a integração futura entre chamados e fornecedores.
   - Retornar apenas fornecedores seguros para uso operacional.
   - Priorizar fornecedores vinculados ao condomínio do chamado.
   - Respeitar sempre a carteira da administradora ativa.

   Regras:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por /api/admin/*.
   - Administradora INACTIVE é bloqueada pelo requireActiveAdminApiAccess().
   - administratorId sempre vem do perfil ativo validado pelo guard.
   - Etapa 47: acesso ao módulo Fornecedores é validado por plano.
   - Retorna somente fornecedores:
     1. homologados/ativos na administradora;
     2. liberados para uso em chamados;
     3. com cadastro global ativo;
     4. dentro do escopo da administradora;
     5. vinculados ao condomínio quando condominiumId for informado.

   Parâmetros aceitos:
   - condominiumId: filtra fornecedores vinculados ao condomínio.
   - category: filtra/prioriza por categoria do chamado.
   - search: busca por nome, documento, categoria, cidade ou UF.
   - preferredOnly=true: retorna apenas vínculos preferenciais.
   ========================================================= */



/* =========================================================
   TYPES
   ========================================================= */

type ProviderForTicketsItem = Prisma.AdministratorProviderGetPayload<{
  include: {
    provider: {
      include: {
        _count: {
          select: {
            ratingsReceived: true;
          };
        };
      };
    };
    condominiumProviders: {
      include: {
        condominium: {
          select: {
            id: true;
            name: true;
            status: true;
            city: true;
            state: true;
          };
        };
      };
    };
  };
}>;



type NormalizedFilters = {
  condominiumId: string | null;
  category: string;
  search: string;
  preferredOnly: boolean;
};



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
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}



function normalizeDocument(value: unknown) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  return text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}



function normalizeSearchParams(req: Request): NormalizedFilters {
  const url = new URL(req.url);

  return {
    condominiumId: cleanOptionalText(url.searchParams.get("condominiumId")),
    category: cleanText(url.searchParams.get("category")),
    search: cleanText(url.searchParams.get("search")),
    preferredOnly: normalizeBoolean(
      url.searchParams.get("preferredOnly"),
      false
    ),
  };
}



function textIncludes(value: unknown, term: string) {
  if (!term) {
    return true;
  }

  return String(value || "").toLowerCase().includes(term.toLowerCase());
}



function categoryMatches({
  item,
  linkCategory,
  category,
}: {
  item: ProviderForTicketsItem;
  linkCategory?: string | null;
  category: string;
}) {
  if (!category) {
    return true;
  }

  const provider = item.provider;

  const categories = provider.categories;

  const candidates = [
    item.internalCategory,
    provider.primaryCategory,
    linkCategory,
    provider.serviceArea,
  ];

  if (Array.isArray(categories)) {
    candidates.push(...categories.map((categoryItem) => String(categoryItem)));
  }

  if (typeof categories === "string") {
    candidates.push(categories);
  }

  return candidates.some((candidate) => textIncludes(candidate, category));
}



function searchMatches({
  item,
  search,
}: {
  item: ProviderForTicketsItem;
  search: string;
}) {
  if (!search) {
    return true;
  }

  const provider = item.provider;
  const normalizedSearch = normalizeDocument(search);

  const candidates = [
    item.internalName,
    item.internalCategory,
    provider.tradeName,
    provider.legalName,
    provider.document,
    provider.documentNormalized,
    provider.primaryCategory,
    provider.description,
    provider.serviceArea,
    provider.email,
    provider.phone,
    provider.whatsapp,
    provider.city,
    provider.state,
  ];

  const textMatch = candidates.some((candidate) => textIncludes(candidate, search));

  if (textMatch) {
    return true;
  }

  if (normalizedSearch) {
    return [provider.document, provider.documentNormalized].some(
      (candidate) => normalizeDocument(candidate).includes(normalizedSearch)
    );
  }

  return false;
}



function getBestCondominiumLink({
  item,
  category,
}: {
  item: ProviderForTicketsItem;
  category: string;
}) {
  const links = item.condominiumProviders.filter(
    (link) => link.status === CondominiumProviderStatus.ACTIVE
  );

  if (links.length === 0) {
    return null;
  }

  const categoryLinks = category
    ? links.filter((link) =>
        categoryMatches({
          item,
          linkCategory: link.category,
          category,
        })
      )
    : links;

  const candidates = categoryLinks.length > 0 ? categoryLinks : links;

  const preferred = candidates.find((link) => link.isPreferred);

  return preferred || candidates[0] || null;
}



function getProviderPriorityScore({
  item,
  category,
}: {
  item: ProviderForTicketsItem;
  category: string;
}) {
  const bestLink = getBestCondominiumLink({
    item,
    category,
  });

  let score = 0;

  if (bestLink) {
    score += 100;
  }

  if (bestLink?.isPreferred) {
    score += 50;
  }

  if (
    category &&
    categoryMatches({
      item,
      linkCategory: bestLink?.category,
      category,
    })
  ) {
    score += 20;
  }

  if (item.status === AdministratorProviderStatus.ACTIVE) {
    score += 8;
  }

  if (item.status === AdministratorProviderStatus.HOMOLOGATED) {
    score += 6;
  }

  if (item.provider.isVerified) {
    score += 5;
  }

  if (item.provider.isFeatured) {
    score += 3;
  }

  return score;
}



function buildProviderForTicketsResponse({
  item,
  category,
}: {
  item: ProviderForTicketsItem;
  category: string;
}) {
  const provider = item.provider;
  const bestLink = getBestCondominiumLink({
    item,
    category,
  });

  return {
    id: provider.id,
    providerId: provider.id,
    administratorProviderId: item.id,

    tradeName: provider.tradeName,
    legalName: provider.legalName,
    document: provider.document,
    entityType: provider.entityType,

    primaryCategory: provider.primaryCategory,
    internalCategory: item.internalCategory,
    categories: provider.categories,
    serviceArea: provider.serviceArea,
    description: provider.description,

    email: provider.email,
    phone: provider.phone,
    whatsapp: provider.whatsapp,
    website: provider.website,

    city: provider.city,
    state: provider.state,

    isVerified: provider.isVerified,
    isFeatured: provider.isFeatured,
    totalRatings: provider._count.ratingsReceived,

    homologation: {
      id: item.id,
      status: item.status,
      canBeUsedInTickets: item.canBeUsedInTickets,
      visibleToSyndics: item.visibleToSyndics,
      visibleToResidents: item.visibleToResidents,
      homologatedAt: item.homologatedAt,
    },

    condominiumLink: bestLink
      ? {
          id: bestLink.id,
          condominiumId: bestLink.condominiumId,
          condominium: bestLink.condominium,
          status: bestLink.status,
          linkType: bestLink.linkType,
          category: bestLink.category,
          isPreferred: bestLink.isPreferred,
          startDate: bestLink.startDate,
          endDate: bestLink.endDate,
        }
      : null,

    priorityScore: getProviderPriorityScore({
      item,
      category,
    }),

    recommendationLabel: bestLink?.isPreferred
      ? "Fornecedor Preferencial Do Condomínio"
      : bestLink
        ? "Fornecedor Vinculado Ao Condomínio"
        : "Fornecedor Homologado Da Carteira",
  };
}



function buildProviderWhere({
  administratorId,
  condominiumId,
  preferredOnly,
}: {
  administratorId: string;
  condominiumId: string | null;
  preferredOnly: boolean;
}): Prisma.AdministratorProviderWhereInput {
  const where: Prisma.AdministratorProviderWhereInput = {
    administratorId,
    canBeUsedInTickets: true,
    status: {
      in: [
        AdministratorProviderStatus.HOMOLOGATED,
        AdministratorProviderStatus.ACTIVE,
      ],
    },
    provider: {
      globalStatus: ProviderGlobalStatus.ACTIVE,
    },
  };

  if (condominiumId) {
    where.condominiumProviders = {
      some: {
        administratorId,
        condominiumId,
        status: CondominiumProviderStatus.ACTIVE,
        ...(preferredOnly ? { isPreferred: true } : {}),
      },
    };
  }

  return where;
}



/* =========================================================
   GET - FORNECEDORES DISPONÍVEIS PARA CHAMADOS
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



    /* =======================================================
       VALIDA CONDOMÍNIO, QUANDO INFORMADO

       Se o chamado tiver condomínio, a API só retorna fornecedores
       com vínculo ativo naquele condomínio.
       ======================================================= */

    if (filters.condominiumId) {
      const condominium = await db.condominium.findFirst({
        where: {
          id: filters.condominiumId,
          administratorId,
          status: Status.ACTIVE,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!condominium) {
        return NextResponse.json(
          { error: "Condomínio não encontrado, inativo ou fora da carteira." },
          { status: 404 }
        );
      }
    }



    const fornecedores = await db.administratorProvider.findMany({
      where: buildProviderWhere({
        administratorId,
        condominiumId: filters.condominiumId,
        preferredOnly: filters.preferredOnly,
      }),
      include: {
        provider: {
          include: {
            _count: {
              select: {
                ratingsReceived: true,
              },
            },
          },
        },
        condominiumProviders: {
          where: {
            administratorId,
            status: CondominiumProviderStatus.ACTIVE,
            ...(filters.condominiumId
              ? {
                  condominiumId: filters.condominiumId,
                }
              : {}),
            ...(filters.preferredOnly
              ? {
                  isPreferred: true,
                }
              : {}),
          },
          include: {
            condominium: {
              select: {
                id: true,
                name: true,
                status: true,
                city: true,
                state: true,
              },
            },
          },
          orderBy: [
            {
              isPreferred: "desc",
            },
            {
              createdAt: "desc",
            },
          ],
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
          provider: {
            tradeName: "asc",
          },
        },
      ],
    });



    /* =======================================================
       FILTROS COMPLEMENTARES EM MEMÓRIA

       Mantemos parte do filtro em memória para considerar:
       - categoria do vínculo CondominiumProvider;
       - categories em JSON;
       - busca normalizada por documento.
       ======================================================= */

    const filtered = fornecedores.filter((item) => {
      const bestLink = getBestCondominiumLink({
        item,
        category: filters.category,
      });

      if (filters.condominiumId && !bestLink) {
        return false;
      }

      if (
        filters.category &&
        !categoryMatches({
          item,
          linkCategory: bestLink?.category,
          category: filters.category,
        })
      ) {
        return false;
      }

      if (
        filters.search &&
        !searchMatches({
          item,
          search: filters.search,
        })
      ) {
        return false;
      }

      return true;
    });

    const result = filtered
      .map((item) =>
        buildProviderForTicketsResponse({
          item,
          category: filters.category,
        })
      )
      .sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) {
          return b.priorityScore - a.priorityScore;
        }

        return a.tradeName.localeCompare(b.tradeName, "pt-BR");
      });

    return NextResponse.json({
      items: result,
      totals: {
        total: result.length,
        preferred: result.filter(
          (provider) => provider.condominiumLink?.isPreferred
        ).length,
        linkedToCondominium: result.filter(
          (provider) => !!provider.condominiumLink
        ).length,
      },
      filters: {
        condominiumId: filters.condominiumId,
        category: filters.category || null,
        search: filters.search || null,
        preferredOnly: filters.preferredOnly,
      },
    });
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR FORNECEDORES PARA CHAMADOS:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      { error: "Erro ao listar fornecedores disponíveis para chamados." },
      { status: 500 }
    );
  }
}