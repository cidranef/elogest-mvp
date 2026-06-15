import { NextRequest, NextResponse } from "next/server";
import {
  FinancialEntryType,
  Status,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireFinancialAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - FINANCEIRO - CATEGORIAS

   Arquivo:
   src/app/api/admin/financeiro/categorias/route.ts

   ETAPA 53.1 — FINANCEIRO INICIAL

   Métodos:
   - GET: lista categorias financeiras da administradora ativa.
   - POST: cria categoria financeira.
   - PATCH: edita ou altera o status de categoria existente.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Bloqueia administradora INACTIVE pelo admin-api-guard.
   - Exige módulo comercial Financeiro liberado.
   - Isola dados por administratorId do perfil ativo.
   - SUPER_ADMIN não opera esta API.

   Decisões:
   - Categorias pertencem à administradora e podem ser reutilizadas
     em diferentes condomínios da mesma carteira.
   - Não há exclusão física nesta etapa. Categorias deixam de ser
     usadas por inativação, preservando histórico financeiro.
   ========================================================= */

type CategoryMutationBody = {
  id?: unknown;
  type?: unknown;
  name?: unknown;
  description?: unknown;
  status?: unknown;
  sortOrder?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 400,
    },
  );
}

function notFound(message: string) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 404,
    },
  );
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown) {
  return normalizeNullableString(value) ?? "";
}

function parseFinancialEntryType(value: unknown) {
  if (typeof value !== "string") {
    return {
      ok: false as const,
      message: "Informe o tipo da categoria financeira.",
    };
  }

  if (!Object.values(FinancialEntryType).includes(value as FinancialEntryType)) {
    return {
      ok: false as const,
      message: "Tipo de categoria financeira inválido.",
    };
  }

  return {
    ok: true as const,
    value: value as FinancialEntryType,
  };
}

function parseStatus(value: unknown, fallback: Status = Status.ACTIVE) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: fallback,
    };
  }

  if (typeof value !== "string" || !Object.values(Status).includes(value as Status)) {
    return {
      ok: false as const,
      message: "Status da categoria inválido.",
    };
  }

  const status = value as Status;

  if (status !== Status.ACTIVE && status !== Status.INACTIVE) {
    return {
      ok: false as const,
      message: "A categoria deve estar ativa ou inativa.",
    };
  }

  return {
    ok: true as const,
    value: status,
  };
}

function parseSortOrder(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: 0,
    };
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return {
      ok: false as const,
      message: "Informe uma ordem de exibição válida.",
    };
  }

  return {
    ok: true as const,
    value: Math.max(Math.floor(parsed), 0),
  };
}

async function findDuplicatedCategory(params: {
  administratorId: string;
  type: FinancialEntryType;
  name: string;
  ignoreId?: string | null;
}) {
  return db.financialCategory.findFirst({
    where: {
      administratorId: params.administratorId,
      type: params.type,
      name: {
        equals: params.name,
        mode: "insensitive",
      },
      ...(params.ignoreId
        ? {
            id: {
              not: params.ignoreId,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);

    const search = normalizeNullableString(searchParams.get("q"));
    const typeParam = normalizeNullableString(searchParams.get("type"));
    const statusParam = normalizeNullableString(searchParams.get("status"));

    const requestedPage = Number(searchParams.get("page") || 1);
    const requestedPageSize = Number(searchParams.get("pageSize") || 50);

    const page = Number.isFinite(requestedPage)
      ? Math.max(Math.floor(requestedPage), 1)
      : 1;

    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(Math.max(Math.floor(requestedPageSize), 1), 100)
      : 50;

    const where: Prisma.FinancialCategoryWhereInput = {
      administratorId: auth.administratorId,
    };

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    if (typeParam && typeParam !== "ALL") {
      if (!Object.values(FinancialEntryType).includes(typeParam as FinancialEntryType)) {
        return badRequest("Tipo de categoria financeira inválido.");
      }

      where.type = typeParam as FinancialEntryType;
    }

    if (statusParam && statusParam !== "ALL") {
      if (!Object.values(Status).includes(statusParam as Status)) {
        return badRequest("Status da categoria inválido.");
      }

      where.status = statusParam as Status;
    }

    const [
      categories,
      total,
      totalRevenue,
      totalExpense,
      totalActive,
      totalInactive,
    ] = await Promise.all([
      db.financialCategory.findMany({
        where,
        orderBy: [
          {
            type: "asc",
          },
          {
            sortOrder: "asc",
          },
          {
            name: "asc",
          },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: {
              entries: true,
              chargeBatches: true,
            },
          },
        },
      }),
      db.financialCategory.count({
        where,
      }),
      db.financialCategory.count({
        where: {
          administratorId: auth.administratorId,
          type: FinancialEntryType.REVENUE,
        },
      }),
      db.financialCategory.count({
        where: {
          administratorId: auth.administratorId,
          type: FinancialEntryType.EXPENSE,
        },
      }),
      db.financialCategory.count({
        where: {
          administratorId: auth.administratorId,
          status: Status.ACTIVE,
        },
      }),
      db.financialCategory.count({
        where: {
          administratorId: auth.administratorId,
          status: Status.INACTIVE,
        },
      }),
    ]);

    return NextResponse.json({
      categories,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
      kpis: {
        totalRevenue,
        totalExpense,
        totalActive,
        totalInactive,
      },
    });
  } catch (error) {
    console.error("Erro ao listar categorias financeiras:", error);

    return NextResponse.json(
      {
        error: "Não foi possível carregar as categorias financeiras.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as CategoryMutationBody;

    const typeValidation = parseFinancialEntryType(body.type);
    const statusValidation = parseStatus(body.status);
    const sortOrderValidation = parseSortOrder(body.sortOrder);
    const name = normalizeRequiredString(body.name);
    const description = normalizeNullableString(body.description);

    if (!typeValidation.ok) {
      return badRequest(typeValidation.message);
    }

    if (!statusValidation.ok) {
      return badRequest(statusValidation.message);
    }

    if (!sortOrderValidation.ok) {
      return badRequest(sortOrderValidation.message);
    }

    if (name.length < 2) {
      return badRequest("Informe um nome com pelo menos 2 caracteres.");
    }

    if (name.length > 100) {
      return badRequest("O nome da categoria pode ter no máximo 100 caracteres.");
    }

    if (description && description.length > 300) {
      return badRequest("A descrição pode ter no máximo 300 caracteres.");
    }

    const duplicatedCategory = await findDuplicatedCategory({
      administratorId: auth.administratorId,
      type: typeValidation.value,
      name,
    });

    if (duplicatedCategory) {
      return badRequest("Já existe uma categoria com este nome e tipo.");
    }

    const category = await db.financialCategory.create({
      data: {
        administratorId: auth.administratorId,
        type: typeValidation.value,
        name,
        description,
        status: statusValidation.value,
        sortOrder: sortOrderValidation.value,
        isDefault: false,
      },
      include: {
        _count: {
          select: {
            entries: true,
            chargeBatches: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        category,
        message: "Categoria financeira criada com sucesso.",
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Erro ao criar categoria financeira:", error);

    return NextResponse.json(
      {
        error: "Não foi possível criar a categoria financeira.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as CategoryMutationBody;

    const id = normalizeRequiredString(body.id);

    if (!id) {
      return badRequest("Informe a categoria financeira.");
    }

    const currentCategory = await db.financialCategory.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        type: true,
        name: true,
        description: true,
        status: true,
        sortOrder: true,
      },
    });

    if (!currentCategory) {
      return notFound("Categoria financeira não encontrada.");
    }

    const typeValidation = parseFinancialEntryType(
      body.type ?? currentCategory.type,
    );
    const statusValidation = parseStatus(
      body.status,
      currentCategory.status,
    );
    const sortOrderValidation = parseSortOrder(
      body.sortOrder ?? currentCategory.sortOrder,
    );
    const name = normalizeRequiredString(body.name ?? currentCategory.name);
    const description =
      body.description === undefined
        ? currentCategory.description
        : normalizeNullableString(body.description);

    if (!typeValidation.ok) {
      return badRequest(typeValidation.message);
    }

    if (!statusValidation.ok) {
      return badRequest(statusValidation.message);
    }

    if (!sortOrderValidation.ok) {
      return badRequest(sortOrderValidation.message);
    }

    if (name.length < 2) {
      return badRequest("Informe um nome com pelo menos 2 caracteres.");
    }

    if (name.length > 100) {
      return badRequest("O nome da categoria pode ter no máximo 100 caracteres.");
    }

    if (description && description.length > 300) {
      return badRequest("A descrição pode ter no máximo 300 caracteres.");
    }

    const duplicatedCategory = await findDuplicatedCategory({
      administratorId: auth.administratorId,
      type: typeValidation.value,
      name,
      ignoreId: currentCategory.id,
    });

    if (duplicatedCategory) {
      return badRequest("Já existe uma categoria com este nome e tipo.");
    }

    const category = await db.financialCategory.update({
      where: {
        id: currentCategory.id,
      },
      data: {
        type: typeValidation.value,
        name,
        description,
        status: statusValidation.value,
        sortOrder: sortOrderValidation.value,
      },
      include: {
        _count: {
          select: {
            entries: true,
            chargeBatches: true,
          },
        },
      },
    });

    return NextResponse.json({
      category,
      message: "Categoria financeira atualizada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao atualizar categoria financeira:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar a categoria financeira.",
      },
      {
        status: 500,
      },
    );
  }
}
