import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   ETAPA 54.7 — RELATÓRIO DE FORNECEDORES

   API:
   /api/admin/relatorios/fornecedores

   Objetivo:
   - Consolidar fornecedores da Rede De Fornecedores EloGest.
   - Exibir homologação, bloqueios, vínculos por condomínio,
     categorias e status.
   - Respeitar isolamento por administratorId.
   - Consultar de forma defensiva os models:
     Provider, AdministratorProvider e CondominiumProvider.
   ========================================================= */

type ProviderReportEntry = {
  id: string;
  providerId: string;
  name: string;
  document: string;
  category: string;
  status: string;
  homologationStatus: string;
  city: string;
  state: string;
  condominiumCount: number;
  condominiumNames: string[];
  availableForTickets: boolean;
  approvedAt: string | null;
  blockedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

type ProviderReportResponse = {
  generatedAt: string;
  filters: {
    condominiumId: string;
    period: string;
    status: string;
    homologationStatus: string;
    category: string;
    ticketAvailability: string;
  };
  summary: {
    total: number;
    approved: number;
    pending: number;
    blocked: number;
    inactive: number;
    active: number;
    availableForTickets: number;
    linkedToCondominiums: number;
    condominiumLinks: number;
    categories: number;
  };
  entries: ProviderReportEntry[];
};

type AdminAccessResult = {
  administratorId?: string;
  activeAccess?: {
    administratorId?: string | null;
  } | null;
  user?: {
    activeAccess?: {
      administratorId?: string | null;
    } | null;
  } | null;
  error?: string;
  status?: number;
};

type UnknownRecord = Record<string, unknown>;

type PrismaDelegate = {
  findMany?: (args?: UnknownRecord) => Promise<UnknownRecord[]>;
};

function toIsoString(value: unknown) {
  if (!value) return null;

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  return null;
}

function toText(value: unknown, fallback = "-") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Sim" : "Não";

  return fallback;
}

function toBoolean(value: unknown) {
  return value === true;
}

function asArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? (value as UnknownRecord[]) : [];
}

function periodStart(period: string) {
  if (period === "ALL") return null;

  const days = period === "7D" ? 7 : period === "90D" ? 90 : 30;
  const date = new Date();

  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);

  return date;
}

function normalizeFilter(value: string | null, fallback = "ALL") {
  const text = String(value || "").trim();
  return text || fallback;
}

async function safeFindMany(model: unknown, args?: UnknownRecord) {
  try {
    const delegate = model as PrismaDelegate;

    if (!delegate?.findMany) return [];

    return await delegate.findMany(args);
  } catch (error) {
    console.warn("[relatorios/fornecedores] Falha ao consultar model:", error);
    return [];
  }
}

async function getAdminContext() {
  const access = (await requireActiveAdminApiAccess()) as AdminAccessResult;

  if (access?.error) {
    return {
      errorResponse: NextResponse.json(
        { error: access.error },
        { status: access.status || 403 }
      ),
      administratorId: null,
    };
  }

  const administratorId =
    access?.administratorId ||
    access?.activeAccess?.administratorId ||
    access?.user?.activeAccess?.administratorId ||
    null;

  if (!administratorId) {
    return {
      errorResponse: NextResponse.json(
        { error: "Administradora não identificada para gerar o relatório." },
        { status: 403 }
      ),
      administratorId: null,
    };
  }

  return {
    errorResponse: null,
    administratorId,
  };
}

function getProvider(record: UnknownRecord) {
  const provider = record.provider;

  if (provider && typeof provider === "object") {
    return provider as UnknownRecord;
  }

  return record;
}

function getProviderName(provider: UnknownRecord) {
  return toText(
    provider.tradeName ??
      provider.name ??
      provider.legalName ??
      provider.corporateName ??
      provider.companyName ??
      provider.razaoSocial,
    "Fornecedor"
  );
}

function getDocument(provider: UnknownRecord) {
  return toText(
    provider.document ??
      provider.documentNumber ??
      provider.cnpj ??
      provider.cpfCnpj ??
      provider.taxId,
    "-"
  );
}

function getCategory(provider: UnknownRecord, record: UnknownRecord) {
  const category = provider.category ?? record.category;

  if (category && typeof category === "object") {
    return toText((category as UnknownRecord).name, "Sem categoria");
  }

  return toText(
    provider.categoryName ??
      provider.segment ??
      provider.providerCategory ??
      record.categoryName ??
      record.segment,
    "Sem categoria"
  );
}

function getCity(provider: UnknownRecord) {
  return toText(provider.city ?? provider.addressCity ?? provider.municipality, "-");
}

function getState(provider: UnknownRecord) {
  return toText(provider.state ?? provider.addressState ?? provider.uf, "-");
}

function normalizeStatus(value: unknown) {
  const text = toText(value, "ACTIVE").toUpperCase();

  if (["ACTIVE", "ATIVO", "APPROVED", "HOMOLOGATED"].includes(text)) {
    return "ACTIVE";
  }

  if (["INACTIVE", "INATIVO"].includes(text)) return "INACTIVE";
  if (["BLOCKED", "BLOQUEADO"].includes(text)) return "BLOCKED";
  if (["PENDING", "PENDENTE", "UNDER_REVIEW"].includes(text)) return "PENDING";

  return text || "ACTIVE";
}

function normalizeHomologationStatus(record: UnknownRecord) {
  const raw =
    record.homologationStatus ??
    record.approvalStatus ??
    record.status ??
    record.providerStatus;

  const text = toText(raw, "PENDING").toUpperCase();

  if (["APPROVED", "HOMOLOGATED", "ACTIVE", "APROVADO", "HOMOLOGADO"].includes(text)) {
    return "APPROVED";
  }

  if (["BLOCKED", "BLOQUEADO"].includes(text)) return "BLOCKED";
  if (["INACTIVE", "INATIVO"].includes(text)) return "INACTIVE";
  if (["REJECTED", "REJEITADO"].includes(text)) return "REJECTED";

  return "PENDING";
}

function getCondominiumName(link: UnknownRecord) {
  const condominium = link.condominium;

  if (condominium && typeof condominium === "object") {
    return toText((condominium as UnknownRecord).name, "");
  }

  return toText(link.condominiumName, "");
}

function normalizeEntry(record: UnknownRecord): ProviderReportEntry {
  const provider = getProvider(record);
  const condominiumLinks =
    asArray(record.condominiums).length > 0
      ? asArray(record.condominiums)
      : asArray(record.condominiumProviders).length > 0
        ? asArray(record.condominiumProviders)
        : asArray(record.condominiumLinks);

  const condominiumNames = Array.from(
    new Set(
      condominiumLinks
        .map((link) => getCondominiumName(link))
        .filter((name) => !!name)
    )
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const homologationStatus = normalizeHomologationStatus(record);
  const status = normalizeStatus(record.status ?? provider.status);

  return {
    id: toText(record.id, crypto.randomUUID()),
    providerId: toText(provider.id ?? record.providerId, "-"),
    name: getProviderName(provider),
    document: getDocument(provider),
    category: getCategory(provider, record),
    status,
    homologationStatus,
    city: getCity(provider),
    state: getState(provider),
    condominiumCount: condominiumNames.length,
    condominiumNames,
    availableForTickets: toBoolean(
      record.availableForTickets ??
        record.enabledForTickets ??
        record.allowTicketAssignment ??
        record.isAvailableForTickets
    ),
    approvedAt: toIsoString(
      record.approvedAt ?? record.homologatedAt ?? record.releasedAt
    ),
    blockedAt: toIsoString(record.blockedAt),
    createdAt:
      toIsoString(record.createdAt ?? provider.createdAt) || new Date().toISOString(),
    updatedAt: toIsoString(record.updatedAt ?? provider.updatedAt),
  };
}

function applyReportFilters(
  entries: ProviderReportEntry[],
  filters: ProviderReportResponse["filters"]
) {
  return entries.filter((entry) => {
    if (filters.status !== "ALL" && entry.status !== filters.status) return false;

    if (
      filters.homologationStatus !== "ALL" &&
      entry.homologationStatus !== filters.homologationStatus
    ) {
      return false;
    }

    if (filters.category !== "ALL" && entry.category !== filters.category) {
      return false;
    }

    if (filters.ticketAvailability === "AVAILABLE" && !entry.availableForTickets) {
      return false;
    }

    if (filters.ticketAvailability === "NOT_AVAILABLE" && entry.availableForTickets) {
      return false;
    }

    if (
      filters.condominiumId !== "ALL" &&
      !entry.condominiumNames.some((name) => name === filters.condominiumId)
    ) {
      return false;
    }

    return true;
  });
}

function buildSummary(entries: ProviderReportEntry[]) {
  const categories = new Set(
    entries.map((entry) => entry.category).filter((category) => !!category)
  );

  return {
    total: entries.length,
    approved: entries.filter((entry) => entry.homologationStatus === "APPROVED")
      .length,
    pending: entries.filter((entry) => entry.homologationStatus === "PENDING")
      .length,
    blocked: entries.filter(
      (entry) => entry.homologationStatus === "BLOCKED" || entry.status === "BLOCKED"
    ).length,
    inactive: entries.filter((entry) => entry.status === "INACTIVE").length,
    active: entries.filter((entry) => entry.status === "ACTIVE").length,
    availableForTickets: entries.filter((entry) => entry.availableForTickets).length,
    linkedToCondominiums: entries.filter((entry) => entry.condominiumCount > 0)
      .length,
    condominiumLinks: entries.reduce(
      (sum, entry) => sum + entry.condominiumCount,
      0
    ),
    categories: categories.size,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { errorResponse, administratorId } = await getAdminContext();

    if (errorResponse) return errorResponse;

    const searchParams = request.nextUrl.searchParams;

    const filters: ProviderReportResponse["filters"] = {
      condominiumId: normalizeFilter(searchParams.get("condominiumId")),
      period: normalizeFilter(searchParams.get("period"), "30D"),
      status: normalizeFilter(searchParams.get("status")),
      homologationStatus: normalizeFilter(searchParams.get("homologationStatus")),
      category: normalizeFilter(searchParams.get("category")),
      ticketAvailability: normalizeFilter(searchParams.get("ticketAvailability")),
    };

    const createdAtStart = periodStart(filters.period);

    const database = db as unknown as {
      administratorProvider?: unknown;
      provider?: unknown;
    };

    let rows = await safeFindMany(database.administratorProvider, {
      where: {
        administratorId,
        ...(createdAtStart
          ? {
              createdAt: {
                gte: createdAtStart,
              },
            }
          : {}),
      },
      include: {
        provider: true,
        condominiums: {
          include: {
            condominium: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        condominiumProviders: {
          include: {
            condominium: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        condominiumLinks: {
          include: {
            condominium: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 1000,
    });

    if (rows.length === 0) {
      rows = await safeFindMany(database.provider, {
        where: {
          administratorId,
          ...(createdAtStart
            ? {
                createdAt: {
                  gte: createdAtStart,
                },
              }
            : {}),
        },
        include: {
          condominiums: {
            include: {
              condominium: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          condominiumProviders: {
            include: {
              condominium: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1000,
      });
    }

    const entries = rows.map(normalizeEntry);
    const filteredEntries = applyReportFilters(entries, filters);

    const response: ProviderReportResponse = {
      generatedAt: new Date().toISOString(),
      filters,
      summary: buildSummary(filteredEntries),
      entries: filteredEntries,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[GET /api/admin/relatorios/fornecedores]", error);

    return NextResponse.json(
      { error: "Erro ao carregar relatório de fornecedores." },
      { status: 500 }
    );
  }
}
