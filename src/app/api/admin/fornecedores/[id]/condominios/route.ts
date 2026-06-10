import {
  CondominiumProviderLinkType,
  CondominiumProviderStatus,
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
   FORNECEDORES - CONDOMÍNIOS VINCULADOS

   Arquivo:
   src/app/api/admin/fornecedores/[id]/condominios/route.ts

   ETAPA 46 — REDE DE FORNECEDORES ELOGEST
   ETAPA 47 — PLANOS, MÓDULOS E LIMITES

   Objetivo:
   - Listar condomínios da carteira e vínculos do fornecedor.
   - Vincular fornecedor a condomínio da própria administradora.
   - Atualizar vínculo operacional por condomínio.
   - Desvincular com histórico seguro, inativando o vínculo.

   Regras:
   - [id] representa providerId.
   - O fornecedor precisa estar homologado/vinculado à administradora
     via AdministratorProvider.
   - O condomínio precisa pertencer à administradora do perfil ativo.
   - SUPER_ADMIN não opera por /api/admin/*.
   - Administradora inativa é bloqueada pelo requireActiveAdminApiAccess().
   - Etapa 47: acesso ao módulo Fornecedores é validado por plano.
   ========================================================= */



interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}



type RequestBody = Record<string, unknown>;



type CondominiumProviderItem = Prisma.CondominiumProviderGetPayload<{
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
    provider: {
      select: {
        id: true;
        tradeName: true;
        primaryCategory: true;
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



function normalizeCondominiumProviderStatus(
  value: unknown
): CondominiumProviderStatus | null {
  const status = cleanText(value).toUpperCase();

  if (
    status === CondominiumProviderStatus.ACTIVE ||
    status === CondominiumProviderStatus.SUSPENDED ||
    status === CondominiumProviderStatus.ENDED ||
    status === CondominiumProviderStatus.INACTIVE
  ) {
    return status as CondominiumProviderStatus;
  }

  return null;
}



function normalizeCondominiumProviderLinkType(
  value: unknown
): CondominiumProviderLinkType | null {
  const linkType = cleanText(value).toUpperCase();

  if (
    linkType === CondominiumProviderLinkType.CONTRACT ||
    linkType === CondominiumProviderLinkType.RECURRING ||
    linkType === CondominiumProviderLinkType.ON_DEMAND ||
    linkType === CondominiumProviderLinkType.INDICATED ||
    linkType === CondominiumProviderLinkType.PREFERRED ||
    linkType === CondominiumProviderLinkType.OTHER
  ) {
    return linkType as CondominiumProviderLinkType;
  }

  return null;
}



function normalizeOptionalDate(value: unknown) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}



function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}



function buildCondominiumProviderResponse(item: CondominiumProviderItem) {
  return {
    id: item.id,
    administratorId: item.administratorId,
    condominiumId: item.condominiumId,
    providerId: item.providerId,
    administratorProviderId: item.administratorProviderId,
    status: item.status,
    linkType: item.linkType,
    category: item.category,
    isPreferred: item.isPreferred,
    startDate: item.startDate,
    endDate: item.endDate,
    notes: item.notes,
    condominium: item.condominium,
    provider: item.provider,
    createdByUserId: item.createdByUserId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
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
        select: {
          id: true,
          tradeName: true,
          primaryCategory: true,
        },
      },
    },
  });
}



async function getCondominiumProviderLinks({
  providerId,
  administratorId,
}: {
  providerId: string;
  administratorId: string;
}) {
  return db.condominiumProvider.findMany({
    where: {
      providerId,
      administratorId,
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
      provider: {
        select: {
          id: true,
          tradeName: true,
          primaryCategory: true,
        },
      },
    },
    orderBy: [
      {
        status: "asc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
}



async function buildResponse({
  providerId,
  administratorId,
}: {
  providerId: string;
  administratorId: string;
}) {
  const [condominiums, links] = await Promise.all([
    db.condominium.findMany({
      where: {
        administratorId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        city: true,
        state: true,
      },
      orderBy: [
        {
          status: "asc",
        },
        {
          name: "asc",
        },
      ],
    }),
    getCondominiumProviderLinks({
      providerId,
      administratorId,
    }),
  ]);

  const linkedCondominiumIds = new Set(
    links
      .filter((link) => link.status !== CondominiumProviderStatus.INACTIVE)
      .map((link) => link.condominiumId)
  );

  const activeLinks = links.filter(
    (link) => link.status === CondominiumProviderStatus.ACTIVE
  );

  const preferredLinks = links.filter((link) => link.isPreferred);

  return {
    availableCondominiums: condominiums.map((condominium) => ({
      ...condominium,
      alreadyLinked: linkedCondominiumIds.has(condominium.id),
    })),
    condominiumProviders: links.map((link) =>
      buildCondominiumProviderResponse(link)
    ),
    totals: {
      condominiums: condominiums.length,
      links: links.length,
      activeLinks: activeLinks.length,
      preferredLinks: preferredLinks.length,
    },
  };
}



async function unsetOtherPreferredLinks({
  tx,
  administratorId,
  condominiumId,
  providerId,
  category,
  exceptId,
}: {
  tx: Prisma.TransactionClient;
  administratorId: string;
  condominiumId: string;
  providerId: string;
  category?: string | null;
  exceptId?: string | null;
}) {
  await tx.condominiumProvider.updateMany({
    where: {
      administratorId,
      condominiumId,
      category: category || null,
      id: exceptId
        ? {
            not: exceptId,
          }
        : undefined,
      providerId: {
        not: providerId,
      },
    },
    data: {
      isPreferred: false,
    },
  });
}



/* =========================================================
   GET - LISTAR CONDOMÍNIOS E VÍNCULOS DO FORNECEDOR
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

    const homologation = await getAdministratorProviderByContext({
      providerId,
      administratorId: adminApiAccess.administratorId,
    });

    if (!homologation) {
      return NextResponse.json(
        { error: "Fornecedor não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    const response = await buildResponse({
      providerId,
      administratorId: adminApiAccess.administratorId,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR CONDOMÍNIOS DO FORNECEDOR:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      { error: "Erro ao listar condomínios do fornecedor." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - VINCULAR FORNECEDOR AO CONDOMÍNIO
   ========================================================= */

export async function POST(req: Request, context: RouteContext) {
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

    const condominiumId = cleanText(body.condominiumId);

    if (!providerId) {
      return NextResponse.json(
        { error: "ID do fornecedor não informado." },
        { status: 400 }
      );
    }

    if (!condominiumId) {
      return NextResponse.json(
        { error: "Selecione um condomínio para vincular." },
        { status: 400 }
      );
    }

    const homologation = await getAdministratorProviderByContext({
      providerId,
      administratorId: adminApiAccess.administratorId,
    });

    if (!homologation) {
      return NextResponse.json(
        { error: "Fornecedor não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    const condominium = await db.condominium.findFirst({
      where: {
        id: condominiumId,
        administratorId: adminApiAccess.administratorId,
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!condominium) {
      return NextResponse.json(
        { error: "Condomínio não encontrado ou fora da carteira." },
        { status: 404 }
      );
    }

    const existingActiveLink = await db.condominiumProvider.findFirst({
      where: {
        administratorId: adminApiAccess.administratorId,
        providerId,
        condominiumId,
        status: {
          not: CondominiumProviderStatus.INACTIVE,
        },
      },
    });

    if (existingActiveLink) {
      return NextResponse.json(
        { error: "Este fornecedor já está vinculado a este condomínio." },
        { status: 409 }
      );
    }

    const status =
      normalizeCondominiumProviderStatus(body.status) ||
      CondominiumProviderStatus.ACTIVE;

    const linkType =
      normalizeCondominiumProviderLinkType(body.linkType) ||
      CondominiumProviderLinkType.ON_DEMAND;

    const category =
      cleanOptionalText(body.category) || homologation.provider.primaryCategory;

    const isPreferred = normalizeBoolean(body.isPreferred, false);

    const startDate = normalizeOptionalDate(body.startDate);
    const endDate = normalizeOptionalDate(body.endDate);

    if (
      body.startDate !== undefined &&
      body.startDate !== null &&
      body.startDate !== "" &&
      !startDate
    ) {
      return NextResponse.json(
        { error: "Data de início inválida." },
        { status: 400 }
      );
    }

    if (
      body.endDate !== undefined &&
      body.endDate !== null &&
      body.endDate !== "" &&
      !endDate
    ) {
      return NextResponse.json(
        { error: "Data de encerramento inválida." },
        { status: 400 }
      );
    }

    if (startDate && endDate && endDate < startDate) {
      return NextResponse.json(
        {
          error:
            "A data de encerramento não pode ser anterior à data de início.",
        },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      if (isPreferred) {
        await unsetOtherPreferredLinks({
          tx,
          administratorId: adminApiAccess.administratorId,
          condominiumId,
          providerId,
          category,
        });
      }

      await tx.condominiumProvider.create({
        data: {
          administratorId: adminApiAccess.administratorId,
          condominiumId,
          providerId,
          administratorProviderId: homologation.id,
          status,
          linkType,
          category,
          isPreferred,
          startDate,
          endDate,
          notes: cleanOptionalText(body.notes),
          createdByUserId: adminApiAccess.authUser.id,
        },
      });
    });

    const response = await buildResponse({
      providerId,
      administratorId: adminApiAccess.administratorId,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("ERRO AO VINCULAR FORNECEDOR AO CONDOMÍNIO:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    if (isPrismaKnownRequestError(error) && error.code === "P2002") {
      return NextResponse.json(
        { error: "Este vínculo já existe." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao vincular fornecedor ao condomínio." },
      { status: 500 }
    );
  }
}



/* =========================================================
   PATCH - ATUALIZAR VÍNCULO COM CONDOMÍNIO
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
    const linkId = cleanText(body.linkId || body.condominiumProviderId);

    if (!providerId) {
      return NextResponse.json(
        { error: "ID do fornecedor não informado." },
        { status: 400 }
      );
    }

    if (!linkId) {
      return NextResponse.json(
        { error: "ID do vínculo não informado." },
        { status: 400 }
      );
    }

    const link = await db.condominiumProvider.findFirst({
      where: {
        id: linkId,
        providerId,
        administratorId: adminApiAccess.administratorId,
      },
    });

    if (!link) {
      return NextResponse.json(
        { error: "Vínculo não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    const updateData: Prisma.CondominiumProviderUncheckedUpdateInput = {};
    let nextStartDate = link.startDate;
    let nextEndDate = link.endDate;
    let nextCategory = link.category;

    if (body.status !== undefined) {
      const status = normalizeCondominiumProviderStatus(body.status);

      if (!status) {
        return NextResponse.json(
          {
            error:
              "Status inválido. Use ACTIVE, SUSPENDED, ENDED ou INACTIVE.",
          },
          { status: 400 }
        );
      }

      updateData.status = status;

      if (
        (status === CondominiumProviderStatus.ENDED ||
          status === CondominiumProviderStatus.INACTIVE) &&
        !link.endDate
      ) {
        updateData.endDate = new Date();
      }
    }

    if (body.linkType !== undefined) {
      const linkType = normalizeCondominiumProviderLinkType(body.linkType);

      if (!linkType) {
        return NextResponse.json(
          {
            error:
              "Tipo de vínculo inválido. Use CONTRACT, RECURRING, ON_DEMAND, INDICATED, PREFERRED ou OTHER.",
          },
          { status: 400 }
        );
      }

      updateData.linkType = linkType;
    }

    if (body.category !== undefined) {
      nextCategory = cleanOptionalText(body.category);
      updateData.category = nextCategory;
    }

    if (body.isPreferred !== undefined) {
      updateData.isPreferred = normalizeBoolean(body.isPreferred, false);
    }

    if (body.startDate !== undefined) {
      const startDate = normalizeOptionalDate(body.startDate);

      if (body.startDate !== null && body.startDate !== "" && !startDate) {
        return NextResponse.json(
          { error: "Data de início inválida." },
          { status: 400 }
        );
      }

      nextStartDate = startDate;
      updateData.startDate = startDate;
    }

    if (body.endDate !== undefined) {
      const endDate = normalizeOptionalDate(body.endDate);

      if (body.endDate !== null && body.endDate !== "" && !endDate) {
        return NextResponse.json(
          { error: "Data de encerramento inválida." },
          { status: 400 }
        );
      }

      nextEndDate = endDate;
      updateData.endDate = endDate;
    }

    if (body.notes !== undefined) {
      updateData.notes = cleanOptionalText(body.notes);
    }

    if (nextStartDate && nextEndDate && nextEndDate < nextStartDate) {
      return NextResponse.json(
        {
          error:
            "A data de encerramento não pode ser anterior à data de início.",
        },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      if (updateData.isPreferred === true) {
        await unsetOtherPreferredLinks({
          tx,
          administratorId: adminApiAccess.administratorId,
          condominiumId: link.condominiumId,
          providerId,
          category: nextCategory,
          exceptId: link.id,
        });
      }

      await tx.condominiumProvider.update({
        where: {
          id: link.id,
        },
        data: updateData,
      });
    });

    const response = await buildResponse({
      providerId,
      administratorId: adminApiAccess.administratorId,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("ERRO AO ATUALIZAR VÍNCULO DO FORNECEDOR:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      { error: "Erro ao atualizar vínculo do fornecedor." },
      { status: 500 }
    );
  }
}



/* =========================================================
   DELETE - DESVINCULAR FORNECEDOR DO CONDOMÍNIO

   Mantém histórico operacional: em vez de apagar, marca INACTIVE.
   ========================================================= */

export async function DELETE(req: Request, context: RouteContext) {
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
    const url = new URL(req.url);
    const linkId = cleanText(url.searchParams.get("linkId"));

    if (!providerId) {
      return NextResponse.json(
        { error: "ID do fornecedor não informado." },
        { status: 400 }
      );
    }

    if (!linkId) {
      return NextResponse.json(
        { error: "ID do vínculo não informado." },
        { status: 400 }
      );
    }

    const link = await db.condominiumProvider.findFirst({
      where: {
        id: linkId,
        providerId,
        administratorId: adminApiAccess.administratorId,
      },
    });

    if (!link) {
      return NextResponse.json(
        { error: "Vínculo não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    await db.condominiumProvider.update({
      where: {
        id: link.id,
      },
      data: {
        status: CondominiumProviderStatus.INACTIVE,
        isPreferred: false,
        endDate: link.endDate || new Date(),
      },
    });

    const response = await buildResponse({
      providerId,
      administratorId: adminApiAccess.administratorId,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("ERRO AO DESVINCULAR FORNECEDOR DO CONDOMÍNIO:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      { error: "Erro ao desvincular fornecedor do condomínio." },
      { status: 500 }
    );
  }
}
