"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ELOGEST — ETAPA 53.8
   COMPONENTES COMPARTILHADOS — FINANCEIRO ADMIN

   Arquivo:
   src/app/admin/financeiro/_components/FinanceiroUi.tsx

   Objetivo:
   - Reorganizar a experiência do Financeiro Admin sem alterar
     as APIs já aprovadas na Etapa 53.
   - Evitar uma página única excessivamente longa.
   - Separar Dashboard, Receitas, Despesas, Mensalidades e
     Configurações/Categorias.
   - Manter o menu principal "Financeiro" no AdminShell.
   ========================================================= */

type FinancialEntryType = "REVENUE" | "EXPENSE";
type FinancialEntryStatus =
  | "OPEN"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELED";
type FinancialEntryOrigin =
  | "MANUAL"
  | "UNIT_CHARGE_BATCH"
  | "UNIT_CHARGE_ADJUSTMENT"
  | "IMPORT"
  | "OTHER";
type FinancialPaymentMethod =
  | "CASH"
  | "PIX"
  | "BANK_TRANSFER"
  | "BOLETO"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CHECK"
  | "OTHER";
type Status = "ACTIVE" | "INACTIVE";

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

type Condominio = {
  id: string;
  name: string;
  status?: string | null;
};

type UnitItem = {
  id: string;
  condominiumId?: string | null;
  block?: string | null;
  unitNumber?: string | null;
  status?: string | null;
};

type ProviderItem = {
  id: string;
  providerId?: string;
  tradeName?: string | null;
  legalName?: string | null;
  document?: string | null;
  homologation?: {
    status?: string | null;
  } | null;
};

type FinancialCategory = {
  id: string;
  type: FinancialEntryType;
  name: string;
  description?: string | null;
  status: Status;
  isDefault: boolean;
  sortOrder: number;
  entriesCount?: number;
  chargeBatchesCount?: number;
  createdAt: string;
  updatedAt: string;
};

type FinancialAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url?: string;
};

type FinancialSettlement = {
  id: string;
  financialEntryId: string;
  paidAt: string;
  amountCents: number;
  interestCents: number;
  fineCents: number;
  discountCents: number;
  paymentMethod?: FinancialPaymentMethod | string | null;
  notes?: string | null;
  registeredByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  reversedAt?: string | null;
  reversedByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  reversalReason?: string | null;
  attachments?: FinancialAttachment[];
  createdAt: string;
  updatedAt?: string | null;
};

type FinancialEntry = {
  id: string;
  condominiumId: string;
  unitId?: string | null;
  providerId?: string | null;
  categoryId: string;
  chargeBatchId?: string | null;
  type: FinancialEntryType;
  origin: FinancialEntryOrigin;
  status: FinancialEntryStatus;
  effectiveStatus: FinancialEntryStatus;
  description: string;
  competence: string;
  dueDate: string;
  valueCents: number;
  notes?: string | null;
  cancellationReason?: string | null;
  canceledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  condominium?: {
    id: string;
    name: string;
  } | null;
  unit?: {
    id: string;
    block?: string | null;
    unitNumber?: string | null;
  } | null;
  provider?: {
    id: string;
    tradeName?: string | null;
    legalName?: string | null;
    document?: string | null;
  } | null;
  category?: {
    id: string;
    type: FinancialEntryType;
    name: string;
    status: Status;
  } | null;
  settlementSummary?: {
    paidPrincipalCents: number;
    interestCents: number;
    fineCents: number;
    discountCents: number;
    netPaidCents: number;
    remainingPrincipalCents: number;
    activeSettlementsCount: number;
  };
  settlements?: FinancialSettlement[];
  attachments?: FinancialAttachment[];
  counts?: {
    settlements?: number;
    attachments?: number;
    logs?: number;
  };
};

type FinancialChargeBatch = {
  id: string;
  condominiumId: string;
  categoryId: string;
  competence: string;
  dueDate: string;
  description: string;
  defaultValueCents: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  condominium?: {
    id: string;
    name: string;
  } | null;
  category?: {
    id: string;
    name: string;
    type: FinancialEntryType;
    status: Status;
  } | null;
  entries?: {
    id: string;
    unitId?: string | null;
    status: FinancialEntryStatus;
    valueCents: number;
    unit?: {
      id: string;
      block?: string | null;
      unitNumber?: string | null;
    } | null;
  }[];
  counts?: {
    entries?: number;
    logs?: number;
    canceledEntries?: number;
    paidEntries?: number;
    openEntries?: number;
    partiallyPaidEntries?: number;
  };
  totalValueCents?: number;
};

type FinancialDashboardResponse = {
  kpis?: {
    revenuePlannedCents?: number;
    revenueReceivedCents?: number;
    expensePlannedCents?: number;
    expensePaidCents?: number;
    plannedBalanceCents?: number;
    realizedBalanceCents?: number;
    openCents?: number;
    overdueCents?: number;
    totalEntries?: number;
    openEntries?: number;
    overdueEntries?: number;
    paidEntries?: number;
    partiallyPaidEntries?: number;
    canceledEntries?: number;
  };
  byCondominium?: {
    condominiumId: string;
    condominiumName: string;
    revenuePlannedCents: number;
    revenueReceivedCents: number;
    expensePlannedCents: number;
    expensePaidCents: number;
    plannedBalanceCents: number;
    realizedBalanceCents: number;
    openCents: number;
    overdueCents: number;
    entriesCount: number;
  }[];
  error?: string;
};

type EntryFiltersState = {
  q: string;
  condominiumId: string;
  status: "ALL" | FinancialEntryStatus;
  categoryId: string;
};

type EntryFormState = {
  id: string;
  type: FinancialEntryType;
  condominiumId: string;
  unitId: string;
  providerId: string;
  categoryId: string;
  description: string;
  competence: string;
  dueDate: string;
  value: string;
  notes: string;
};

type SettlementFormState = {
  financialEntryId: string;
  paidAt: string;
  amount: string;
  interest: string;
  fine: string;
  discount: string;
  paymentMethod: "" | FinancialPaymentMethod;
  notes: string;
};

type BatchFormState = {
  condominiumId: string;
  categoryId: string;
  description: string;
  competence: string;
  dueDate: string;
  value: string;
  notes: string;
  unitIds: string[];
};

type CategoryFormState = {
  id: string;
  type: FinancialEntryType;
  name: string;
  description: string;
  sortOrder: string;
};

const defaultEntryFilters: EntryFiltersState = {
  q: "",
  condominiumId: "",
  status: "ALL",
  categoryId: "",
};

const emptyEntryForm: EntryFormState = {
  id: "",
  type: "REVENUE",
  condominiumId: "",
  unitId: "",
  providerId: "",
  categoryId: "",
  description: "",
  competence: "",
  dueDate: "",
  value: "",
  notes: "",
};

const emptySettlementForm: SettlementFormState = {
  financialEntryId: "",
  paidAt: "",
  amount: "",
  interest: "",
  fine: "",
  discount: "",
  paymentMethod: "",
  notes: "",
};

const emptyBatchForm: BatchFormState = {
  condominiumId: "",
  categoryId: "",
  description: "Mensalidade Condominial",
  competence: "",
  dueDate: "",
  value: "",
  notes: "",
  unitIds: [],
};

const emptyCategoryForm: CategoryFormState = {
  id: "",
  type: "REVENUE",
  name: "",
  description: "",
  sortOrder: "0",
};

/* =========================================================
   HELPERS
   ========================================================= */

function getApiErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const payload = data as ApiErrorResponse;
    return payload.error || payload.message || fallback;
  }

  return fallback;
}

function normalizeSpaces(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function formatCurrencyInput(value: string) {
  const digits = onlyDigits(value);

  if (!digits) return "";

  const number = Number(digits) / 100;

  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function valueInputToCents(value: string) {
  const digits = onlyDigits(value);
  return digits ? Number(digits) : 0;
}

function moneyTextFromCents(value?: number | null) {
  const cents = Number(value || 0);

  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dateInputToIso(value: string) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function isoToDateInput(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatCompetence(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function typeLabel(type?: string | null) {
  return (
    {
      REVENUE: "Receita",
      EXPENSE: "Despesa",
    }[type || ""] ||
    type ||
    "-"
  );
}

function statusLabel(status?: string | null) {
  return (
    {
      OPEN: "Em Aberto",
      PARTIALLY_PAID: "Parcialmente Pago",
      PAID: "Pago",
      OVERDUE: "Atrasado",
      CANCELED: "Cancelado",
      ACTIVE: "Ativa",
      INACTIVE: "Inativa",
    }[status || ""] ||
    status ||
    "-"
  );
}

function originLabel(origin?: string | null) {
  return (
    {
      MANUAL: "Manual",
      UNIT_CHARGE_BATCH: "Mensalidade Em Lote",
      UNIT_CHARGE_ADJUSTMENT: "Ajuste De Mensalidade",
      IMPORT: "Importação",
      OTHER: "Outro",
    }[origin || ""] ||
    origin ||
    "-"
  );
}

function paymentMethodLabel(value?: string | null) {
  return (
    {
      CASH: "Dinheiro",
      PIX: "Pix",
      BANK_TRANSFER: "Transferência Bancária",
      BOLETO: "Boleto",
      CREDIT_CARD: "Cartão De Crédito",
      DEBIT_CARD: "Cartão De Débito",
      CHECK: "Cheque",
      OTHER: "Outro",
    }[value || ""] ||
    value ||
    "-"
  );
}

function getSettlementNetCents(settlement: {
  amountCents: number;
  interestCents: number;
  fineCents: number;
  discountCents: number;
}) {
  return (
    Number(settlement.amountCents || 0) +
    Number(settlement.interestCents || 0) +
    Number(settlement.fineCents || 0) -
    Number(settlement.discountCents || 0)
  );
}

function statusClass(status?: string | null) {
  if (status === "OPEN" || status === "ACTIVE") {
    return "border-[#DDE5DF] bg-white text-[#5E6B63]";
  }

  if (status === "PAID") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (status === "PARTIALLY_PAID") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "OVERDUE") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "CANCELED" || status === "INACTIVE") {
    return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }

  return "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function typeClass(type?: string | null) {
  if (type === "REVENUE") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function unitLabel(unit?: UnitItem | FinancialEntry["unit"] | null) {
  if (!unit) return "-";

  const block = unit.block ? `Bloco ${unit.block}` : "";
  const number = unit.unitNumber ? `Unidade ${unit.unitNumber}` : "Unidade";

  return [block, number].filter(Boolean).join(" • ");
}

function providerLabel(provider?: ProviderItem | FinancialEntry["provider"] | null) {
  if (!provider) return "-";

  return provider.tradeName || provider.legalName || "Fornecedor";
}

function extractCondominios(data: unknown): Condominio[] {
  if (Array.isArray(data)) return data as Condominio[];

  if (data && typeof data === "object") {
    const payload = data as {
      condominiums?: unknown;
      condominios?: unknown;
      items?: unknown;
      data?: unknown;
    };

    if (Array.isArray(payload.condominiums)) return payload.condominiums as Condominio[];
    if (Array.isArray(payload.condominios)) return payload.condominios as Condominio[];
    if (Array.isArray(payload.items)) return payload.items as Condominio[];
    if (Array.isArray(payload.data)) return payload.data as Condominio[];
  }

  return [];
}

function extractUnits(data: unknown): UnitItem[] {
  if (Array.isArray(data)) return data as UnitItem[];

  if (data && typeof data === "object") {
    const payload = data as {
      units?: unknown;
      unidades?: unknown;
      items?: unknown;
      data?: unknown;
    };

    if (Array.isArray(payload.units)) return payload.units as UnitItem[];
    if (Array.isArray(payload.unidades)) return payload.unidades as UnitItem[];
    if (Array.isArray(payload.items)) return payload.items as UnitItem[];
    if (Array.isArray(payload.data)) return payload.data as UnitItem[];
  }

  return [];
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function entryToForm(entry: FinancialEntry): EntryFormState {
  return {
    id: entry.id,
    type: entry.type,
    condominiumId: entry.condominiumId,
    unitId: entry.unitId || "",
    providerId: entry.providerId || "",
    categoryId: entry.categoryId,
    description: entry.description || "",
    competence: isoToDateInput(entry.competence),
    dueDate: isoToDateInput(entry.dueDate),
    value: formatCurrencyInput(String(entry.valueCents || "")),
    notes: entry.notes || "",
  };
}

function validateEntryForm(form: EntryFormState) {
  if (!form.condominiumId) return "Selecione o condomínio.";
  if (!form.categoryId) return "Selecione a categoria.";
  if (normalizeSpaces(form.description).length < 3) {
    return "Informe uma descrição com pelo menos 3 caracteres.";
  }
  if (!form.competence) return "Informe a competência.";
  if (!form.dueDate) return "Informe a data de vencimento.";
  if (valueInputToCents(form.value) <= 0) return "Informe um valor maior que zero.";

  return "";
}

function buildEntryPayload(form: EntryFormState) {
  return {
    id: form.id || undefined,
    type: form.type,
    condominiumId: form.condominiumId,
    unitId: form.unitId || null,
    providerId: form.providerId || null,
    categoryId: form.categoryId,
    description: normalizeSpaces(form.description),
    competence: dateInputToIso(form.competence),
    dueDate: dateInputToIso(form.dueDate),
    valueCents: valueInputToCents(form.value),
    notes: form.notes.trim() || null,
  };
}

function validateSettlementForm(form: SettlementFormState) {
  if (!form.financialEntryId) return "Selecione o lançamento.";
  if (!form.paidAt) return "Informe a data do pagamento.";
  if (valueInputToCents(form.amount) <= 0) return "Informe o valor principal pago.";
  return "";
}

function buildSettlementPayload(form: SettlementFormState) {
  return {
    financialEntryId: form.financialEntryId,
    paidAt: dateInputToIso(form.paidAt),
    amountCents: valueInputToCents(form.amount),
    interestCents: valueInputToCents(form.interest),
    fineCents: valueInputToCents(form.fine),
    discountCents: valueInputToCents(form.discount),
    paymentMethod: form.paymentMethod || null,
    notes: form.notes.trim() || null,
  };
}

function validateBatchForm(form: BatchFormState) {
  if (!form.condominiumId) return "Selecione o condomínio.";
  if (!form.categoryId) return "Selecione a categoria de receita.";
  if (normalizeSpaces(form.description).length < 3) {
    return "Informe uma descrição com pelo menos 3 caracteres.";
  }
  if (!form.competence) return "Informe a competência.";
  if (!form.dueDate) return "Informe a data de vencimento.";
  if (valueInputToCents(form.value) <= 0) return "Informe um valor maior que zero.";
  if (form.unitIds.length === 0) return "Selecione pelo menos uma unidade.";

  return "";
}

function buildBatchPayload(form: BatchFormState) {
  return {
    condominiumId: form.condominiumId,
    categoryId: form.categoryId,
    description: normalizeSpaces(form.description),
    competence: dateInputToIso(form.competence),
    dueDate: dateInputToIso(form.dueDate),
    defaultValueCents: valueInputToCents(form.value),
    notes: form.notes.trim() || null,
    unitIds: form.unitIds,
  };
}

/* =========================================================
   COMPONENTES VISUAIS
   ========================================================= */

function KpiCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[#17211B]">
        {value}
      </p>
      <p className="mt-2 text-sm font-medium leading-5 text-[#5E6B63]">
        {description}
      </p>
    </div>
  );
}

function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-sm font-semibold text-[#17211B]">{children}</label>;
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-[28px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-8 text-center">
      <h2 className="text-xl font-semibold tracking-tight text-[#17211B]">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
        {description}
      </p>
    </section>
  );
}


function percentOf(value: number | undefined, max: number) {
  if (!max || max <= 0) return 0;

  return Math.min(Math.max((Number(value || 0) / max) * 100, 0), 100);
}

function MiniBar({
  label,
  value,
  max,
}: {
  label: string;
  value?: number;
  max: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-[#17211B]">{label}</p>
        <p className="text-sm font-bold text-[#256D3C]">{moneyTextFromCents(value)}</p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#EEF2EF]">
        <div
          className="h-full rounded-full bg-[#256D3C]"
          style={{ width: `${percentOf(value, max)}%` }}
        />
      </div>
    </div>
  );
}

function MiniChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
      <h2 className="text-lg font-semibold tracking-tight text-[#17211B]">{title}</h2>
      <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">{description}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function FinanceiroSubnav() {
  const pathname = usePathname();

  const items = [
    {
      href: "/admin/financeiro",
      label: "Visão Geral",
      description: "Atalhos principais",
    },
    {
      href: "/admin/financeiro/dashboard",
      label: "Dashboard",
      description: "KPIs e resumo",
    },
    {
      href: "/admin/financeiro/receitas",
      label: "Receitas",
      description: "Entradas e baixas",
    },
    {
      href: "/admin/financeiro/despesas",
      label: "Despesas",
      description: "Saídas e pagamentos",
    },
    {
      href: "/admin/financeiro/mensalidades",
      label: "Mensalidades",
      description: "Geração por unidade",
    },
    {
      href: "/admin/financeiro/configuracoes/categorias",
      label: "Categorias",
      description: "Configurações",
    },
  ];

  return (
    <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-3 shadow-[0_18px_50px_rgba(23,33,27,0.04)]">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/admin/financeiro" && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "rounded-2xl border px-4 py-3 transition",
                active
                  ? "border-[#256D3C] bg-[#EAF7EE] text-[#174B2A]"
                  : "border-transparent bg-[#F9FBFA] text-[#5E6B63] hover:border-[#CFE6D4] hover:bg-white",
              ].join(" ")}
            >
              <p className="text-sm font-bold">{item.label}</p>
              <p className="mt-1 text-xs font-semibold opacity-75">{item.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function FinanceiroPageFrame({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <AdminContextGuard
      fallbackTitle="Financeiro indisponível neste perfil de acesso"
      fallbackDescription="O módulo financeiro é exclusivo da área administrativa e depende do plano ativo da administradora."
    >
      <AdminShell
        current="financeiro"
        title="Financeiro"
        description="Receitas, despesas, mensalidades e acompanhamento financeiro da carteira."
        actions={undefined}
      >
        <div className="space-y-8">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
                Financeiro Admin
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                {title}
              </h1>
              <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-[#5E6B63]">
                {description}
              </p>
            </div>
            {actions}
          </header>

          <FinanceiroSubnav />

          {children}
        </div>
      </AdminShell>
    </AdminContextGuard>
  );
}

/* =========================================================
   LOADERS COMPARTILHADOS
   ========================================================= */

async function loadCondominiosSafe() {
  const res = await fetch("/api/admin/condominios", { cache: "no-store" });
  const data: unknown = await res.json();

  if (!res.ok) return [];
  return extractCondominios(data);
}

async function loadUnitsSafe() {
  const res = await fetch("/api/admin/unidades", { cache: "no-store" });
  const data: unknown = await res.json();

  if (!res.ok) return [];
  return extractUnits(data);
}

async function loadProvidersSafe() {
  const res = await fetch("/api/admin/fornecedores", { cache: "no-store" });
  const data: unknown = await res.json();

  if (!res.ok || !Array.isArray(data)) return [];

  return (data as ProviderItem[]).filter((provider) => {
    const status = provider.homologation?.status;
    return status === "IN_REVIEW" || status === "HOMOLOGATED" || status === "ACTIVE";
  });
}

async function loadCategoriesSafe() {
  const params = new URLSearchParams({ page: "1", pageSize: "300" });
  const res = await fetch(`/api/admin/financeiro/categorias?${params.toString()}`, {
    cache: "no-store",
  });
  const data: unknown = await res.json();

  if (!res.ok) return [];

  const payload = data as {
    categories?: FinancialCategory[];
  };

  return Array.isArray(payload.categories) ? payload.categories : [];
}

/* =========================================================
   HUB
   ========================================================= */

export function FinanceiroHubPage() {
  const cards = [
    {
      href: "/admin/financeiro/dashboard",
      title: "Dashboard Financeiro",
      description: "Acompanhe previsto, realizado, saldo, aberto, atraso e resumo por condomínio.",
      label: "Ver Dashboard",
    },
    {
      href: "/admin/financeiro/receitas",
      title: "Receitas",
      description: "Cadastre receitas, acompanhe recebimentos, baixas, comprovantes e pendências.",
      label: "Gerenciar Receitas",
    },
    {
      href: "/admin/financeiro/despesas",
      title: "Despesas",
      description: "Registre despesas, pagamentos, comprovantes e histórico financeiro.",
      label: "Gerenciar Despesas",
    },
    {
      href: "/admin/financeiro/mensalidades",
      title: "Mensalidades",
      description: "Gere mensalidades por unidade, acompanhe lotes e bloqueie duplicidades.",
      label: "Gerar Mensalidades",
    },
    {
      href: "/admin/financeiro/configuracoes/categorias",
      title: "Categorias Financeiras",
      description: "Organize as categorias de receitas e despesas usadas nos lançamentos.",
      label: "Configurar Categorias",
    },
  ];

  return (
    <FinanceiroPageFrame
      title="Central Financeira"
      description="A operação financeira foi organizada em páginas menores para facilitar a rotina da administradora."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_50px_rgba(23,33,27,0.05)] transition hover:-translate-y-0.5 hover:border-[#CFE6D4] hover:shadow-[0_22px_60px_rgba(23,33,27,0.08)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF7EE] text-xl">
              $
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-tight text-[#17211B]">
              {card.title}
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
              {card.description}
            </p>
            <p className="mt-5 text-sm font-bold text-[#256D3C] group-hover:text-[#174B2A]">
              {card.label} →
            </p>
          </Link>
        ))}
      </section>

      <section className="rounded-[28px] border border-[#DDE5DF] bg-[#F9FBFA] p-6">
        <h2 className="text-xl font-semibold tracking-tight text-[#17211B]">
          Organização Da Etapa 53.8
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
          Esta reorganização melhora a usabilidade sem alterar a modelagem,
          sem mexer nas APIs aprovadas e sem mudar as permissões do módulo.
          A página financeira deixa de concentrar todos os fluxos em um único
          arquivo visual.
        </p>
      </section>
    </FinanceiroPageFrame>
  );
}

/* =========================================================
   DASHBOARD
   ========================================================= */

export function FinanceiroDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [filters, setFilters] = useState({
    condominiumId: "",
    status: "ALL" as "ALL" | FinancialEntryStatus,
    competenceFrom: "",
    competenceTo: "",
    dueFrom: "",
    dueTo: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [dashboard, setDashboard] = useState<FinancialDashboardResponse>({});
  const [error, setError] = useState("");

  const loadDashboard = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) setLoading(true);
        setError("");

        const params = new URLSearchParams();
        if (appliedFilters.condominiumId) params.set("condominiumId", appliedFilters.condominiumId);
        if (appliedFilters.status !== "ALL") params.set("status", appliedFilters.status);
        if (appliedFilters.competenceFrom) params.set("competenceFrom", dateInputToIso(appliedFilters.competenceFrom) || appliedFilters.competenceFrom);
        if (appliedFilters.competenceTo) params.set("competenceTo", dateInputToIso(appliedFilters.competenceTo) || appliedFilters.competenceTo);
        if (appliedFilters.dueFrom) params.set("dueFrom", dateInputToIso(appliedFilters.dueFrom) || appliedFilters.dueFrom);
        if (appliedFilters.dueTo) params.set("dueTo", dateInputToIso(appliedFilters.dueTo) || appliedFilters.dueTo);

        const res = await fetch(`/api/admin/financeiro/dashboard?${params.toString()}`, {
          cache: "no-store",
        });
        const data: unknown = await res.json();

        if (!res.ok) {
          setDashboard({});
          setError(getApiErrorMessage(data, "Erro ao carregar dashboard financeiro."));
          return;
        }

        setDashboard(data as FinancialDashboardResponse);
      } catch (err) {
        console.error(err);
        setDashboard({});
        setError("Erro ao carregar dashboard financeiro.");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [appliedFilters],
  );

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      const condominiums = await loadCondominiosSafe();
      if (active) setCondominios(condominiums);
      await loadDashboard();
    }

    void loadInitial();

    return () => {
      active = false;
    };
  }, [loadDashboard]);

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Dashboard Financeiro"
        description="Consolidando indicadores financeiros da carteira..."
      />
    );
  }

  const kpis = dashboard.kpis || {};
  const maxPlannedValue = Math.max(
    Number(kpis.revenuePlannedCents || 0),
    Number(kpis.expensePlannedCents || 0),
    1,
  );
  const maxRealizedValue = Math.max(
    Number(kpis.revenueReceivedCents || 0),
    Number(kpis.expensePaidCents || 0),
    1,
  );
  const maxRiskValue = Math.max(
    Number(kpis.openCents || 0),
    Number(kpis.overdueCents || 0),
    1,
  );

  return (
    <FinanceiroPageFrame
      title="Dashboard Financeiro"
      description="Visão gerencial de receitas, despesas, saldo previsto, saldo realizado, valores em aberto e atrasos."
    >
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select
            value={filters.condominiumId}
            onChange={(event) => setFilters((prev) => ({ ...prev, condominiumId: event.target.value }))}
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
          >
            <option value="">Todos Os Condomínios</option>
            {condominios.map((condominio) => (
              <option key={condominio.id} value={condominio.id}>
                {condominio.name}
              </option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as typeof filters.status }))}
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
          >
            <option value="ALL">Todos Os Status</option>
            <option value="OPEN">Em Aberto</option>
            <option value="OVERDUE">Atrasado</option>
            <option value="PARTIALLY_PAID">Parcialmente Pago</option>
            <option value="PAID">Pago</option>
            <option value="CANCELED">Cancelado</option>
          </select>

          <input
            type="date"
            value={filters.competenceFrom}
            onChange={(event) => setFilters((prev) => ({ ...prev, competenceFrom: event.target.value }))}
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
            title="Competência Inicial"
          />

          <input
            type="date"
            value={filters.competenceTo}
            onChange={(event) => setFilters((prev) => ({ ...prev, competenceTo: event.target.value }))}
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
            title="Competência Final"
          />

          <button
            type="button"
            onClick={() => setAppliedFilters(filters)}
            className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#174B2A]"
          >
            Aplicar Filtros
          </button>

          <button
            type="button"
            onClick={() => {
              const clean = {
                condominiumId: "",
                status: "ALL" as const,
                competenceFrom: "",
                competenceTo: "",
                dueFrom: "",
                dueTo: "",
              };
              setFilters(clean);
              setAppliedFilters(clean);
            }}
            className="h-11 rounded-2xl border border-[#DDE5DF] px-5 text-sm font-bold text-[#5E6B63] transition hover:bg-[#F9FBFA]"
          >
            Limpar
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Receitas Previstas"
          value={moneyTextFromCents(kpis.revenuePlannedCents)}
          description="Total previsto em receitas filtradas."
        />
        <KpiCard
          label="Receitas Recebidas"
          value={moneyTextFromCents(kpis.revenueReceivedCents)}
          description="Total já recebido em baixas ativas."
        />
        <KpiCard
          label="Despesas Previstas"
          value={moneyTextFromCents(kpis.expensePlannedCents)}
          description="Total previsto em despesas filtradas."
        />
        <KpiCard
          label="Despesas Pagas"
          value={moneyTextFromCents(kpis.expensePaidCents)}
          description="Total já pago em baixas ativas."
        />
        <KpiCard
          label="Saldo Previsto"
          value={moneyTextFromCents(kpis.plannedBalanceCents)}
          description="Receitas previstas menos despesas previstas."
        />
        <KpiCard
          label="Saldo Realizado"
          value={moneyTextFromCents(kpis.realizedBalanceCents)}
          description="Recebido menos pago."
        />
        <KpiCard
          label="Em Aberto"
          value={moneyTextFromCents(kpis.openCents)}
          description={`${kpis.openEntries || 0} lançamento(s) em aberto.`}
        />
        <KpiCard
          label="Atrasado"
          value={moneyTextFromCents(kpis.overdueCents)}
          description={`${kpis.overdueEntries || 0} lançamento(s) atrasado(s).`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MiniChartCard
          title="Previsto"
          description="Comparação entre receitas e despesas previstas no período filtrado."
        >
          <MiniBar label="Receitas Previstas" value={kpis.revenuePlannedCents} max={maxPlannedValue} />
          <MiniBar label="Despesas Previstas" value={kpis.expensePlannedCents} max={maxPlannedValue} />
        </MiniChartCard>

        <MiniChartCard
          title="Realizado"
          description="Comparação entre valores recebidos e pagos por baixas registradas."
        >
          <MiniBar label="Recebido" value={kpis.revenueReceivedCents} max={maxRealizedValue} />
          <MiniBar label="Pago" value={kpis.expensePaidCents} max={maxRealizedValue} />
        </MiniChartCard>

        <MiniChartCard
          title="Atenção"
          description="Valores em aberto e atrasados para acompanhamento operacional."
        >
          <MiniBar label="Em Aberto" value={kpis.openCents} max={maxRiskValue} />
          <MiniBar label="Atrasado" value={kpis.overdueCents} max={maxRiskValue} />
        </MiniChartCard>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
        <div className="border-b border-[#DDE5DF] bg-[#F9FBFA] p-5">
          <h2 className="text-xl font-semibold tracking-tight text-[#17211B]">
            Resumo Por Condomínio
          </h2>
          <p className="mt-1 text-sm font-medium text-[#5E6B63]">
            Consolidação dos principais valores por carteira condominial.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#DDE5DF] text-sm">
            <thead className="bg-[#F9FBFA] text-left text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
              <tr>
                <th className="px-5 py-4">Condomínio</th>
                <th className="px-5 py-4">Receitas</th>
                <th className="px-5 py-4">Recebido</th>
                <th className="px-5 py-4">Despesas</th>
                <th className="px-5 py-4">Pago</th>
                <th className="px-5 py-4">Saldo</th>
                <th className="px-5 py-4">Aberto</th>
                <th className="px-5 py-4">Atrasado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2EF]">
              {(dashboard.byCondominium || []).map((item) => (
                <tr key={item.condominiumId} className="align-top">
                  <td className="px-5 py-4 font-bold text-[#17211B]">{item.condominiumName}</td>
                  <td className="px-5 py-4 font-semibold text-[#256D3C]">{moneyTextFromCents(item.revenuePlannedCents)}</td>
                  <td className="px-5 py-4 font-semibold text-[#256D3C]">{moneyTextFromCents(item.revenueReceivedCents)}</td>
                  <td className="px-5 py-4 font-semibold text-amber-700">{moneyTextFromCents(item.expensePlannedCents)}</td>
                  <td className="px-5 py-4 font-semibold text-amber-700">{moneyTextFromCents(item.expensePaidCents)}</td>
                  <td className="px-5 py-4 font-bold text-[#17211B]">{moneyTextFromCents(item.plannedBalanceCents)}</td>
                  <td className="px-5 py-4 font-semibold text-[#5E6B63]">{moneyTextFromCents(item.openCents)}</td>
                  <td className="px-5 py-4 font-semibold text-red-700">{moneyTextFromCents(item.overdueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(dashboard.byCondominium || []).length === 0 && (
          <div className="p-5">
            <EmptyState
              title="Nenhum indicador encontrado"
              description="Ajuste os filtros ou registre lançamentos financeiros para visualizar o resumo."
            />
          </div>
        )}
      </section>
    </FinanceiroPageFrame>
  );
}

/* =========================================================
   LANÇAMENTOS — RECEITAS / DESPESAS
   ========================================================= */

export function LancamentosFinanceirosPage({
  type,
}: {
  type: FinancialEntryType;
}) {
  const isRevenue = type === "REVENUE";
  const pageTitle = isRevenue ? "Receitas" : "Despesas";
  const actionLabel = isRevenue ? "Nova Receita" : "Nova Despesa";

  const [loading, setLoading] = useState(true);
  const [savingEntry, setSavingEntry] = useState(false);
  const [savingSettlement, setSavingSettlement] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [entryKpis, setEntryKpis] = useState<Record<string, number>>({});
  const [entryFilters, setEntryFilters] = useState<EntryFiltersState>(defaultEntryFilters);
  const [appliedEntryFilters, setAppliedEntryFilters] = useState<EntryFiltersState>(defaultEntryFilters);

  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [providers, setProviders] = useState<ProviderItem[]>([]);

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryForm, setEntryForm] = useState<EntryFormState>({ ...emptyEntryForm, type });

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelEntry, setCancelEntry] = useState<FinancialEntry | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [settlementEntry, setSettlementEntry] = useState<FinancialEntry | null>(null);
  const [settlementForm, setSettlementForm] = useState<SettlementFormState>(emptySettlementForm);
  const [settlementFile, setSettlementFile] = useState<File | null>(null);

  const activeCategories = useMemo(() => {
    return categories.filter(
      (category) => category.status === "ACTIVE" && category.type === type,
    );
  }, [categories, type]);

  const unitsForSelectedCondominium = useMemo(() => {
    if (!entryForm.condominiumId) return [];

    return units.filter((unit) => {
      if (unit.status && unit.status !== "ACTIVE") return false;
      if (!unit.condominiumId) return true;
      return unit.condominiumId === entryForm.condominiumId;
    });
  }, [entryForm.condominiumId, units]);

  const loadEntries = useCallback(
    async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) setLoading(true);
        setError("");

        const params = new URLSearchParams({
          page: "1",
          pageSize: "80",
          type,
        });

        if (appliedEntryFilters.q.trim()) params.set("q", appliedEntryFilters.q.trim());
        if (appliedEntryFilters.condominiumId) params.set("condominiumId", appliedEntryFilters.condominiumId);
        if (appliedEntryFilters.status !== "ALL") params.set("status", appliedEntryFilters.status);
        if (appliedEntryFilters.categoryId) params.set("categoryId", appliedEntryFilters.categoryId);

        const res = await fetch(`/api/admin/financeiro/lancamentos?${params.toString()}`, {
          cache: "no-store",
        });
        const data: unknown = await res.json();

        if (!res.ok) {
          setEntries([]);
          setEntryKpis({});
          setError(getApiErrorMessage(data, `Erro ao carregar ${pageTitle.toLowerCase()}.`));
          return;
        }

        const payload = data as {
          entries?: FinancialEntry[];
          kpis?: Record<string, number>;
        };

        setEntries(Array.isArray(payload.entries) ? payload.entries : []);
        setEntryKpis(payload.kpis || {});
      } catch (err) {
        console.error(err);
        setEntries([]);
        setEntryKpis({});
        setError(`Erro ao carregar ${pageTitle.toLowerCase()}.`);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [appliedEntryFilters, pageTitle, type],
  );

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      try {
        setLoading(true);

        const [loadedCategories, loadedCondominios, loadedUnits, loadedProviders] =
          await Promise.all([
            loadCategoriesSafe(),
            loadCondominiosSafe(),
            loadUnitsSafe(),
            loadProvidersSafe(),
          ]);

        if (!active) return;

        setCategories(loadedCategories);
        setCondominios(loadedCondominios);
        setUnits(loadedUnits);
        setProviders(loadedProviders);

        await loadEntries();
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitial();

    return () => {
      active = false;
    };
  }, [loadEntries]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  function showSuccess(message: string) {
    setSuccess(message);
    setError("");

    window.setTimeout(() => {
      setSuccess("");
    }, 4500);
  }

  function updateEntryForm<K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) {
    setEntryForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "condominiumId") next.unitId = "";

      return next;
    });
  }

  function openEntryModal(entry?: FinancialEntry) {
    setError("");
    setSuccess("");

    if (entry) {
      setEntryForm(entryToForm(entry));
    } else {
      const today = todayInput();

      setEntryForm({
        ...emptyEntryForm,
        type,
        competence: today,
        dueDate: today,
      });
    }

    setEntryModalOpen(true);
  }

  function closeEntryModal() {
    if (savingEntry) return;
    setEntryModalOpen(false);
    setEntryForm({ ...emptyEntryForm, type });
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateEntryForm(entryForm);
    if (validation) {
      alert(validation);
      return;
    }

    try {
      setSavingEntry(true);
      setError("");
      setSuccess("");

      const res = await fetch("/api/admin/financeiro/lancamentos", {
        method: entryForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildEntryPayload({ ...entryForm, type })),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, `Erro ao salvar ${isRevenue ? "receita" : "despesa"}.`));
        return;
      }

      closeEntryModal();
      await loadEntries();
      showSuccess(entryForm.id ? "Lançamento atualizado com sucesso." : "Lançamento criado com sucesso.");
    } catch (err) {
      console.error(err);
      alert(`Erro ao salvar ${isRevenue ? "receita" : "despesa"}.`);
    } finally {
      setSavingEntry(false);
    }
  }

  function openCancelModal(entry: FinancialEntry) {
    setCancelEntry(entry);
    setCancellationReason("");
    setCancelModalOpen(true);
  }

  function closeCancelModal() {
    if (actionLoadingId) return;
    setCancelEntry(null);
    setCancellationReason("");
    setCancelModalOpen(false);
  }

  async function cancelCurrentEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!cancelEntry) return;

    if (normalizeSpaces(cancellationReason).length < 3) {
      alert("Informe o motivo do cancelamento.");
      return;
    }

    try {
      setActionLoadingId(cancelEntry.id);

      const res = await fetch("/api/admin/financeiro/lancamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cancelEntry.id,
          action: "CANCEL",
          cancellationReason: normalizeSpaces(cancellationReason),
        }),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao cancelar lançamento."));
        return;
      }

      closeCancelModal();
      await loadEntries();
      showSuccess("Lançamento cancelado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao cancelar lançamento.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function reactivateEntry(entry: FinancialEntry) {
    if (!confirm(`Deseja reativar o lançamento "${entry.description}"?`)) return;

    try {
      setActionLoadingId(entry.id);

      const res = await fetch("/api/admin/financeiro/lancamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          action: "REACTIVATE",
        }),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao reativar lançamento."));
        return;
      }

      await loadEntries();
      showSuccess("Lançamento reativado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao reativar lançamento.");
    } finally {
      setActionLoadingId(null);
    }
  }

  function openSettlementModal(entry: FinancialEntry) {
    const remaining = entry.settlementSummary?.remainingPrincipalCents ?? entry.valueCents;
    const today = todayInput();

    setSettlementEntry(entry);
    setSettlementForm({
      ...emptySettlementForm,
      financialEntryId: entry.id,
      paidAt: today,
      amount: formatCurrencyInput(String(Math.max(remaining, 0))),
    });
    setSettlementFile(null);
    setSettlementModalOpen(true);
  }

  function closeSettlementModal() {
    if (savingSettlement) return;
    setSettlementEntry(null);
    setSettlementForm(emptySettlementForm);
    setSettlementFile(null);
    setSettlementModalOpen(false);
  }

  async function saveSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateSettlementForm(settlementForm);
    if (validation) {
      alert(validation);
      return;
    }

    try {
      setSavingSettlement(true);

      const res = await fetch("/api/admin/financeiro/baixas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSettlementPayload(settlementForm)),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao registrar baixa."));
        return;
      }

      const payload = data as {
        settlement?: {
          id?: string;
        };
        id?: string;
      };

      const settlementId = payload.settlement?.id || payload.id || "";

      if (settlementFile && settlementId) {
        const formData = new FormData();
        formData.append("file", settlementFile);
        formData.append("financialEntryId", settlementForm.financialEntryId);
        formData.append("financialSettlementId", settlementId);

        const uploadRes = await fetch("/api/admin/financeiro/comprovantes", {
          method: "POST",
          body: formData,
        });
        const uploadData: unknown = await uploadRes.json();

        if (!uploadRes.ok) {
          alert(getApiErrorMessage(uploadData, "Baixa registrada, mas houve erro ao enviar o comprovante."));
        }
      }

      closeSettlementModal();
      await loadEntries();
      showSuccess("Baixa registrada com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar baixa.");
    } finally {
      setSavingSettlement(false);
    }
  }

  async function reverseSettlement(settlement: FinancialSettlement) {
    const reason = window.prompt("Informe o motivo do estorno desta baixa:");

    if (!reason || normalizeSpaces(reason).length < 3) {
      alert("Informe o motivo do estorno.");
      return;
    }

    try {
      setActionLoadingId(settlement.id);

      const res = await fetch("/api/admin/financeiro/baixas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: settlement.id,
          action: "REVERSE",
          reversalReason: normalizeSpaces(reason),
        }),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao estornar baixa."));
        return;
      }

      await loadEntries();
      showSuccess("Baixa estornada com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao estornar baixa.");
    } finally {
      setActionLoadingId(null);
    }
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title={`Carregando ${pageTitle}`}
        description="Preparando lançamentos financeiros..."
      />
    );
  }

  const plannedValue = isRevenue
    ? entryKpis.revenueValueCents
    : entryKpis.expenseValueCents;

  const realizedValue = entries.reduce((sum, entry) => {
    return sum + Number(entry.settlementSummary?.netPaidCents || 0);
  }, 0);

  return (
    <FinanceiroPageFrame
      title={pageTitle}
      description={
        isRevenue
          ? "Gerencie receitas manuais, mensalidades, recebimentos, comprovantes e status de cobrança."
          : "Gerencie despesas, pagamentos, comprovantes e acompanhamento de vencimentos."
      }
      actions={
        <button
          type="button"
          onClick={() => openEntryModal()}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]"
        >
          {actionLabel}
        </button>
      }
    >
      {success && (
        <div className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4 text-sm font-semibold text-[#256D3C]">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={isRevenue ? "Receitas Previstas" : "Despesas Previstas"}
          value={moneyTextFromCents(plannedValue)}
          description="Valor previsto nos lançamentos filtrados."
        />
        <KpiCard
          label={isRevenue ? "Recebido" : "Pago"}
          value={moneyTextFromCents(realizedValue)}
          description="Valor total das baixas, considerando juros, multa e desconto."
        />
        <KpiCard
          label="Em Aberto"
          value={entryKpis.open ?? 0}
          description="Lançamentos aguardando baixa."
        />
        <KpiCard
          label="Atrasados"
          value={entryKpis.overdue ?? 0}
          description="Lançamentos vencidos e ainda não quitados."
        />
      </section>

      <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            type="search"
            value={entryFilters.q}
            onChange={(event) => setEntryFilters((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Buscar por descrição, observação, condomínio..."
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C] xl:col-span-2"
          />

          <select
            value={entryFilters.condominiumId}
            onChange={(event) => setEntryFilters((prev) => ({ ...prev, condominiumId: event.target.value }))}
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
          >
            <option value="">Todos Os Condomínios</option>
            {condominios.map((condominio) => (
              <option key={condominio.id} value={condominio.id}>
                {condominio.name}
              </option>
            ))}
          </select>

          <select
            value={entryFilters.status}
            onChange={(event) => setEntryFilters((prev) => ({ ...prev, status: event.target.value as EntryFiltersState["status"] }))}
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
          >
            <option value="ALL">Todos Os Status</option>
            <option value="OPEN">Em Aberto</option>
            <option value="OVERDUE">Atrasado</option>
            <option value="PARTIALLY_PAID">Parcialmente Pago</option>
            <option value="PAID">Pago</option>
            <option value="CANCELED">Cancelado</option>
          </select>

          <select
            value={entryFilters.categoryId}
            onChange={(event) => setEntryFilters((prev) => ({ ...prev, categoryId: event.target.value }))}
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
          >
            <option value="">Todas As Categorias</option>
            {activeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setAppliedEntryFilters(entryFilters)}
            className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#174B2A]"
          >
            Aplicar
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
        <div className="border-b border-[#DDE5DF] bg-[#F9FBFA] p-5">
          <h2 className="text-xl font-semibold tracking-tight text-[#17211B]">
            {pageTitle}
          </h2>
          <p className="mt-1 text-sm font-medium text-[#5E6B63]">
            Lançamentos organizados em uma página dedicada para melhorar a operação.
          </p>
        </div>

        <div className="divide-y divide-[#EEF2EF]">
          {entries.map((entry) => {
            const activeSettlements = (entry.settlements || []).filter((settlement) => !settlement.reversedAt);

            return (
              <article key={entry.id} className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={typeClass(entry.type)}>{typeLabel(entry.type)}</Badge>
                      <Badge className={statusClass(entry.effectiveStatus)}>{statusLabel(entry.effectiveStatus)}</Badge>
                      <Badge className="border-[#DDE5DF] bg-[#F9FBFA] text-[#5E6B63]">{originLabel(entry.origin)}</Badge>
                    </div>

                    <h3 className="mt-3 text-lg font-semibold tracking-tight text-[#17211B]">
                      {entry.description}
                    </h3>

                    <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                      {entry.condominium?.name || "Condomínio"} • {unitLabel(entry.unit)}
                      {entry.provider ? ` • ${providerLabel(entry.provider)}` : ""}
                    </p>

                    <div className="mt-3 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Competência</p>
                        <p className="font-semibold text-[#17211B]">{formatCompetence(entry.competence)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Vencimento</p>
                        <p className="font-semibold text-[#17211B]">{formatDate(entry.dueDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Valor</p>
                        <p className="font-semibold text-[#17211B]">{moneyTextFromCents(entry.valueCents)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                          {isRevenue ? "Recebido" : "Pago"}
                        </p>
                        <p className="font-semibold text-[#256D3C]">
                          {moneyTextFromCents(entry.settlementSummary?.netPaidCents)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Saldo Aberto</p>
                        <p className="font-semibold text-[#17211B]">
                          {moneyTextFromCents(entry.settlementSummary?.remainingPrincipalCents ?? entry.valueCents)}
                        </p>
                      </div>
                    </div>

                    {activeSettlements.length > 0 && (
                      <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                        <p className="text-sm font-bold text-[#17211B]">
                          Baixas Registradas
                        </p>

                        <div className="mt-3 space-y-3">
                          {activeSettlements.map((settlement) => (
                            <div
                              key={settlement.id}
                              className="rounded-2xl border border-[#DDE5DF] bg-white p-4"
                            >
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="text-sm font-bold text-[#17211B]">
                                    Total {isRevenue ? "Recebido" : "Pago"}: {moneyTextFromCents(getSettlementNetCents(settlement))}
                                  </p>
                                  <p className="mt-1 text-xs font-semibold leading-5 text-[#5E6B63]">
                                    Principal: {moneyTextFromCents(settlement.amountCents)} •
                                    Juros: {moneyTextFromCents(settlement.interestCents)} •
                                    Multa: {moneyTextFromCents(settlement.fineCents)} •
                                    Desconto: {moneyTextFromCents(settlement.discountCents)}
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                                    {formatDate(settlement.paidAt)} • {paymentMethodLabel(settlement.paymentMethod)}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {(settlement.attachments || []).map((attachment) => (
                                    <a
                                      key={attachment.id}
                                      href={attachment.url || `/api/admin/financeiro/comprovantes/${attachment.id}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-xl border border-[#DDE5DF] px-3 py-2 text-xs font-bold text-[#256D3C] hover:bg-[#EAF7EE]"
                                    >
                                      Comprovante
                                    </a>
                                  ))}

                                  <button
                                    type="button"
                                    onClick={() => reverseSettlement(settlement)}
                                    disabled={actionLoadingId === settlement.id}
                                    className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
                                  >
                                    Estornar
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {entry.status !== "CANCELED" && entry.status !== "PAID" && (
                      <button
                        type="button"
                        onClick={() => openSettlementModal(entry)}
                        className="rounded-2xl bg-[#256D3C] px-4 py-2 text-sm font-bold text-white hover:bg-[#174B2A]"
                      >
                        Registrar Baixa
                      </button>
                    )}

                    {entry.origin === "MANUAL" && entry.status !== "CANCELED" && (
                      <button
                        type="button"
                        onClick={() => openEntryModal(entry)}
                        className="rounded-2xl border border-[#DDE5DF] px-4 py-2 text-sm font-bold text-[#5E6B63] hover:bg-[#F9FBFA]"
                      >
                        Editar
                      </button>
                    )}

                    {entry.status !== "CANCELED" ? (
                      <button
                        type="button"
                        onClick={() => openCancelModal(entry)}
                        className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
                      >
                        Cancelar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reactivateEntry(entry)}
                        disabled={actionLoadingId === entry.id}
                        className="rounded-2xl border border-[#CFE6D4] px-4 py-2 text-sm font-bold text-[#256D3C] hover:bg-[#EAF7EE] disabled:opacity-60"
                      >
                        Reativar
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {entries.length === 0 && (
          <div className="p-5">
            <EmptyState
              title={`Nenhuma ${isRevenue ? "receita" : "despesa"} encontrada`}
              description="Crie um novo lançamento ou ajuste os filtros para visualizar registros."
            />
          </div>
        )}
      </section>

      {entryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/55 p-4">
          <form
            onSubmit={saveEntry}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B]">
                  {entryForm.id ? "Editar Lançamento" : actionLabel}
                </h2>
                <p className="mt-1 text-sm font-medium text-[#5E6B63]">
                  Preencha os dados principais do lançamento financeiro.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEntryModal}
                className="rounded-2xl border border-[#DDE5DF] px-4 py-2 text-sm font-bold text-[#5E6B63]"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Condomínio</FieldLabel>
                <select
                  value={entryForm.condominiumId}
                  onChange={(event) => updateEntryForm("condominiumId", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="">Selecione</option>
                  {condominios.map((condominio) => (
                    <option key={condominio.id} value={condominio.id}>
                      {condominio.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel>Categoria</FieldLabel>
                <select
                  value={entryForm.categoryId}
                  onChange={(event) => updateEntryForm("categoryId", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="">Selecione</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel>Unidade Opcional</FieldLabel>
                <select
                  value={entryForm.unitId}
                  onChange={(event) => updateEntryForm("unitId", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="">Sem Unidade</option>
                  {unitsForSelectedCondominium.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unitLabel(unit)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel>Fornecedor Opcional</FieldLabel>
                <select
                  value={entryForm.providerId}
                  onChange={(event) => updateEntryForm("providerId", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="">Sem Fornecedor</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {providerLabel(provider)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <FieldLabel>Descrição</FieldLabel>
                <input
                  type="text"
                  value={entryForm.description}
                  onChange={(event) => updateEntryForm("description", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  placeholder={isRevenue ? "Ex.: Mensalidade Condominial" : "Ex.: Manutenção Do Elevador"}
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Competência</FieldLabel>
                <input
                  type="date"
                  value={entryForm.competence}
                  onChange={(event) => updateEntryForm("competence", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Vencimento</FieldLabel>
                <input
                  type="date"
                  value={entryForm.dueDate}
                  onChange={(event) => updateEntryForm("dueDate", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Valor (R$)</FieldLabel>
                <input
                  type="text"
                  inputMode="numeric"
                  value={entryForm.value}
                  onChange={(event) => updateEntryForm("value", formatCurrencyInput(event.target.value))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <FieldLabel>Observações</FieldLabel>
                <textarea
                  value={entryForm.notes}
                  onChange={(event) => updateEntryForm("notes", event.target.value)}
                  className="min-h-24 w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  placeholder="Observações internas opcionais."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeEntryModal}
                className="h-11 rounded-2xl border border-[#DDE5DF] px-5 text-sm font-bold text-[#5E6B63]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEntry}
                className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white hover:bg-[#174B2A] disabled:opacity-60"
              >
                {savingEntry ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {settlementModalOpen && settlementEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/55 p-4">
          <form
            onSubmit={saveSettlement}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B]">
                  Registrar Baixa
                </h2>
                <p className="mt-1 text-sm font-medium text-[#5E6B63]">
                  {settlementEntry.description} • Saldo em aberto:
                  {" "}
                  {moneyTextFromCents(settlementEntry.settlementSummary?.remainingPrincipalCents ?? settlementEntry.valueCents)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSettlementModal}
                className="rounded-2xl border border-[#DDE5DF] px-4 py-2 text-sm font-bold text-[#5E6B63]"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Data Do Pagamento</FieldLabel>
                <input
                  type="date"
                  value={settlementForm.paidAt}
                  onChange={(event) => setSettlementForm((prev) => ({ ...prev, paidAt: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Forma De Pagamento</FieldLabel>
                <select
                  value={settlementForm.paymentMethod}
                  onChange={(event) => setSettlementForm((prev) => ({ ...prev, paymentMethod: event.target.value as SettlementFormState["paymentMethod"] }))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="">Não Informada</option>
                  <option value="CASH">Dinheiro</option>
                  <option value="PIX">Pix</option>
                  <option value="BANK_TRANSFER">Transferência Bancária</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="CREDIT_CARD">Cartão De Crédito</option>
                  <option value="DEBIT_CARD">Cartão De Débito</option>
                  <option value="CHECK">Cheque</option>
                  <option value="OTHER">Outro</option>
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel>Valor Principal (R$)</FieldLabel>
                <input
                  type="text"
                  inputMode="numeric"
                  value={settlementForm.amount}
                  onChange={(event) => setSettlementForm((prev) => ({ ...prev, amount: formatCurrencyInput(event.target.value) }))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Juros (R$)</FieldLabel>
                <input
                  type="text"
                  inputMode="numeric"
                  value={settlementForm.interest}
                  onChange={(event) => setSettlementForm((prev) => ({ ...prev, interest: formatCurrencyInput(event.target.value) }))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Multa (R$)</FieldLabel>
                <input
                  type="text"
                  inputMode="numeric"
                  value={settlementForm.fine}
                  onChange={(event) => setSettlementForm((prev) => ({ ...prev, fine: formatCurrencyInput(event.target.value) }))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Desconto (R$)</FieldLabel>
                <input
                  type="text"
                  inputMode="numeric"
                  value={settlementForm.discount}
                  onChange={(event) => setSettlementForm((prev) => ({ ...prev, discount: formatCurrencyInput(event.target.value) }))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <FieldLabel>Comprovante Opcional</FieldLabel>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => setSettlementFile(event.target.files?.[0] || null)}
                  className="block w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm font-semibold text-[#17211B]"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <FieldLabel>Observações</FieldLabel>
                <textarea
                  value={settlementForm.notes}
                  onChange={(event) => setSettlementForm((prev) => ({ ...prev, notes: event.target.value }))}
                  className="min-h-24 w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeSettlementModal}
                className="h-11 rounded-2xl border border-[#DDE5DF] px-5 text-sm font-bold text-[#5E6B63]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingSettlement}
                className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white hover:bg-[#174B2A] disabled:opacity-60"
              >
                {savingSettlement ? "Registrando..." : "Registrar Baixa"}
              </button>
            </div>
          </form>
        </div>
      )}

      {cancelModalOpen && cancelEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/55 p-4">
          <form
            onSubmit={cancelCurrentEntry}
            className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-[#17211B]">
              Cancelar Lançamento
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
              Informe o motivo do cancelamento de "{cancelEntry.description}".
            </p>

            <textarea
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
              className="mt-5 min-h-28 w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
              placeholder="Motivo do cancelamento"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCancelModal}
                className="h-11 rounded-2xl border border-[#DDE5DF] px-5 text-sm font-bold text-[#5E6B63]"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={actionLoadingId === cancelEntry.id}
                className="h-11 rounded-2xl bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                Cancelar Lançamento
              </button>
            </div>
          </form>
        </div>
      )}
    </FinanceiroPageFrame>
  );
}

/* =========================================================
   MENSALIDADES
   ========================================================= */

export function MensalidadesFinanceiroPage() {
  const [loading, setLoading] = useState(true);
  const [savingBatch, setSavingBatch] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [batches, setBatches] = useState<FinancialChargeBatch[]>([]);
  const [batchKpis, setBatchKpis] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState({
    q: "",
    condominiumId: "",
    categoryId: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchForm, setBatchForm] = useState<BatchFormState>(emptyBatchForm);

  const activeRevenueCategories = useMemo(() => {
    return categories.filter((category) => category.status === "ACTIVE" && category.type === "REVENUE");
  }, [categories]);

  const unitsForBatchCondominium = useMemo(() => {
    if (!batchForm.condominiumId) return [];

    return units.filter((unit) => {
      if (unit.status && unit.status !== "ACTIVE") return false;
      if (!unit.condominiumId) return true;
      return unit.condominiumId === batchForm.condominiumId;
    });
  }, [batchForm.condominiumId, units]);

  const loadBatches = useCallback(async () => {
    try {
      setError("");

      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (appliedFilters.q.trim()) params.set("q", appliedFilters.q.trim());
      if (appliedFilters.condominiumId) params.set("condominiumId", appliedFilters.condominiumId);
      if (appliedFilters.categoryId) params.set("categoryId", appliedFilters.categoryId);

      const res = await fetch(`/api/admin/financeiro/mensalidades?${params.toString()}`, {
        cache: "no-store",
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        setBatches([]);
        setBatchKpis({});
        setError(getApiErrorMessage(data, "Erro ao carregar lotes de mensalidades."));
        return;
      }

      const payload = data as {
        batches?: FinancialChargeBatch[];
        kpis?: Record<string, number>;
      };

      setBatches(Array.isArray(payload.batches) ? payload.batches : []);
      setBatchKpis(payload.kpis || {});
    } catch (err) {
      console.error(err);
      setBatches([]);
      setBatchKpis({});
      setError("Erro ao carregar lotes de mensalidades.");
    }
  }, [appliedFilters]);

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      try {
        setLoading(true);
        const [loadedCategories, loadedCondominios, loadedUnits] = await Promise.all([
          loadCategoriesSafe(),
          loadCondominiosSafe(),
          loadUnitsSafe(),
        ]);

        if (!active) return;

        setCategories(loadedCategories);
        setCondominios(loadedCondominios);
        setUnits(loadedUnits);

        await loadBatches();
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitial();

    return () => {
      active = false;
    };
  }, [loadBatches]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  function showSuccess(message: string) {
    setSuccess(message);
    setError("");
    window.setTimeout(() => setSuccess(""), 4500);
  }

  function openBatchModal() {
    const today = todayInput();
    setBatchForm({
      ...emptyBatchForm,
      competence: today,
      dueDate: today,
    });
    setBatchModalOpen(true);
  }

  function closeBatchModal() {
    if (savingBatch) return;
    setBatchModalOpen(false);
    setBatchForm(emptyBatchForm);
  }

  function updateBatchForm<K extends keyof BatchFormState>(key: K, value: BatchFormState[K]) {
    setBatchForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "condominiumId") {
        next.unitIds = [];
      }

      return next;
    });
  }

  function toggleBatchUnit(unitId: string) {
    setBatchForm((prev) => {
      const exists = prev.unitIds.includes(unitId);

      return {
        ...prev,
        unitIds: exists
          ? prev.unitIds.filter((id) => id !== unitId)
          : [...prev.unitIds, unitId],
      };
    });
  }

  function selectAllBatchUnits() {
    setBatchForm((prev) => ({
      ...prev,
      unitIds: unitsForBatchCondominium.map((unit) => unit.id),
    }));
  }

  function clearBatchUnits() {
    setBatchForm((prev) => ({
      ...prev,
      unitIds: [],
    }));
  }

  async function saveBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateBatchForm(batchForm);
    if (validation) {
      alert(validation);
      return;
    }

    try {
      setSavingBatch(true);

      const res = await fetch("/api/admin/financeiro/mensalidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBatchPayload(batchForm)),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao gerar mensalidades."));
        return;
      }

      closeBatchModal();
      await loadBatches();
      showSuccess("Mensalidades geradas com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar mensalidades.");
    } finally {
      setSavingBatch(false);
    }
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Mensalidades"
        description="Preparando lotes e unidades..."
      />
    );
  }

  return (
    <FinanceiroPageFrame
      title="Mensalidades"
      description="Gere cobranças por unidade, acompanhe lotes e mantenha bloqueio de duplicidade por unidade e competência."
      actions={
        <button
          type="button"
          onClick={openBatchModal}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]"
        >
          Gerar Mensalidades
        </button>
      }
    >
      {success && (
        <div className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4 text-sm font-semibold text-[#256D3C]">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Lotes"
          value={batchKpis.total ?? 0}
          description="Lotes de mensalidades encontrados."
        />
        <KpiCard
          label="Mensalidades"
          value={batchKpis.totalEntries ?? 0}
          description="Lançamentos gerados por unidade."
        />
        <KpiCard
          label="Valor Total"
          value={moneyTextFromCents(batchKpis.totalValueCents)}
          description="Soma das mensalidades filtradas."
        />
        <KpiCard
          label="Valor Padrão"
          value={moneyTextFromCents(batchKpis.defaultValueCents)}
          description="Soma do valor padrão dos lotes."
        />
      </section>

      <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="search"
            value={filters.q}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Buscar por descrição ou condomínio..."
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C] xl:col-span-2"
          />

          <select
            value={filters.condominiumId}
            onChange={(event) => setFilters((prev) => ({ ...prev, condominiumId: event.target.value }))}
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
          >
            <option value="">Todos Os Condomínios</option>
            {condominios.map((condominio) => (
              <option key={condominio.id} value={condominio.id}>
                {condominio.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setAppliedFilters(filters)}
            className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#174B2A]"
          >
            Aplicar
          </button>

          <button
            type="button"
            onClick={() => {
              const clean = { q: "", condominiumId: "", categoryId: "" };
              setFilters(clean);
              setAppliedFilters(clean);
            }}
            className="h-11 rounded-2xl border border-[#DDE5DF] px-5 text-sm font-bold text-[#5E6B63] hover:bg-[#F9FBFA]"
          >
            Limpar
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {batches.map((batch) => (
          <article
            key={batch.id}
            className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-[#17211B]">
                  {batch.description}
                </h2>
                <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                  {batch.condominium?.name || "Condomínio"} •
                  Competência {formatCompetence(batch.competence)} •
                  Vencimento {formatDate(batch.dueDate)}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge className="border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]">
                    {batch.counts?.entries ?? batch.entries?.length ?? 0} mensalidade(s)
                  </Badge>
                  <Badge className="border-[#DDE5DF] bg-[#F9FBFA] text-[#5E6B63]">
                    {moneyTextFromCents(batch.totalValueCents)}
                  </Badge>
                  <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                    {batch.counts?.paidEntries ?? 0} paga(s)
                  </Badge>
                  <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                    {batch.counts?.openEntries ?? 0} em aberto
                  </Badge>
                </div>
              </div>

              <Link
                href={`/admin/financeiro/receitas?batchId=${batch.id}`}
                className="rounded-2xl border border-[#DDE5DF] px-4 py-2 text-sm font-bold text-[#256D3C] hover:bg-[#EAF7EE]"
              >
                Ver Receitas
              </Link>
            </div>
          </article>
        ))}

        {batches.length === 0 && (
          <EmptyState
            title="Nenhum lote encontrado"
            description="Gere mensalidades por unidade ou ajuste os filtros para visualizar lotes existentes."
          />
        )}
      </section>

      {batchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/55 p-4">
          <form
            onSubmit={saveBatch}
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B]">
                  Gerar Mensalidades
                </h2>
                <p className="mt-1 text-sm font-medium text-[#5E6B63]">
                  Selecione as unidades e gere um lançamento de receita para cada uma.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBatchModal}
                className="rounded-2xl border border-[#DDE5DF] px-4 py-2 text-sm font-bold text-[#5E6B63]"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Condomínio</FieldLabel>
                <select
                  value={batchForm.condominiumId}
                  onChange={(event) => updateBatchForm("condominiumId", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="">Selecione</option>
                  {condominios.map((condominio) => (
                    <option key={condominio.id} value={condominio.id}>
                      {condominio.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel>Categoria De Receita</FieldLabel>
                <select
                  value={batchForm.categoryId}
                  onChange={(event) => updateBatchForm("categoryId", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="">Selecione</option>
                  {activeRevenueCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <FieldLabel>Descrição</FieldLabel>
                <input
                  type="text"
                  value={batchForm.description}
                  onChange={(event) => updateBatchForm("description", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Competência</FieldLabel>
                <input
                  type="date"
                  value={batchForm.competence}
                  onChange={(event) => updateBatchForm("competence", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Vencimento</FieldLabel>
                <input
                  type="date"
                  value={batchForm.dueDate}
                  onChange={(event) => updateBatchForm("dueDate", event.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>Valor Por Unidade (R$)</FieldLabel>
                <input
                  type="text"
                  inputMode="numeric"
                  value={batchForm.value}
                  onChange={(event) => updateBatchForm("value", formatCurrencyInput(event.target.value))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  placeholder="0,00"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <FieldLabel>Observações</FieldLabel>
                <textarea
                  value={batchForm.notes}
                  onChange={(event) => updateBatchForm("notes", event.target.value)}
                  className="min-h-20 w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-[#DDE5DF] bg-[#F9FBFA] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold text-[#17211B]">
                    Unidades
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#5E6B63]">
                    {batchForm.unitIds.length} de {unitsForBatchCondominium.length} selecionada(s).
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectAllBatchUnits}
                    className="rounded-xl border border-[#CFE6D4] px-3 py-2 text-xs font-bold text-[#256D3C] hover:bg-[#EAF7EE]"
                  >
                    Selecionar Todas
                  </button>
                  <button
                    type="button"
                    onClick={clearBatchUnits}
                    className="rounded-xl border border-[#DDE5DF] px-3 py-2 text-xs font-bold text-[#5E6B63] hover:bg-white"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className="mt-4 grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
                {unitsForBatchCondominium.map((unit) => (
                  <label
                    key={unit.id}
                    className={[
                      "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                      batchForm.unitIds.includes(unit.id)
                        ? "border-[#256D3C] bg-[#EAF7EE] text-[#174B2A]"
                        : "border-[#DDE5DF] bg-white text-[#5E6B63]",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={batchForm.unitIds.includes(unit.id)}
                      onChange={() => toggleBatchUnit(unit.id)}
                      className="h-4 w-4"
                    />
                    {unitLabel(unit)}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeBatchModal}
                className="h-11 rounded-2xl border border-[#DDE5DF] px-5 text-sm font-bold text-[#5E6B63]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingBatch}
                className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white hover:bg-[#174B2A] disabled:opacity-60"
              >
                {savingBatch ? "Gerando..." : "Gerar Mensalidades"}
              </button>
            </div>
          </form>
        </div>
      )}
    </FinanceiroPageFrame>
  );
}

/* =========================================================
   CATEGORIAS
   ========================================================= */

export function CategoriasFinanceiroPage() {
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [filters, setFilters] = useState({
    q: "",
    type: "ALL" as "ALL" | FinancialEntryType,
    status: "ALL" as "ALL" | Status,
  });
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const filteredCategories = useMemo(() => {
    const term = filters.q.trim().toLowerCase();

    return categories.filter((category) => {
      if (filters.type !== "ALL" && category.type !== filters.type) return false;
      if (filters.status !== "ALL" && category.status !== filters.status) return false;
      if (!term) return true;

      return [category.name, category.description, typeLabel(category.type), statusLabel(category.status)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [categories, filters]);

  const categoryMetrics = useMemo(() => {
    return {
      total: categories.length,
      active: categories.filter((category) => category.status === "ACTIVE").length,
      revenue: categories.filter((category) => category.type === "REVENUE").length,
      expense: categories.filter((category) => category.type === "EXPENSE").length,
    };
  }, [categories]);

  const loadCategories = useCallback(async () => {
    try {
      setError("");
      const loaded = await loadCategoriesSafe();
      setCategories(loaded);
    } catch (err) {
      console.error(err);
      setCategories([]);
      setError("Erro ao carregar categorias financeiras.");
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      try {
        setLoading(true);
        await loadCategories();
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitial();

    return () => {
      active = false;
    };
  }, [loadCategories]);

  function showSuccess(message: string) {
    setSuccess(message);
    setError("");
    window.setTimeout(() => setSuccess(""), 4500);
  }

  function openCategoryModal(category?: FinancialCategory) {
    setError("");
    setSuccess("");

    if (category) {
      setCategoryForm({
        id: category.id,
        type: category.type,
        name: category.name,
        description: category.description || "",
        sortOrder: String(category.sortOrder || 0),
      });
    } else {
      setCategoryForm(emptyCategoryForm);
    }

    setCategoryModalOpen(true);
  }

  function closeCategoryModal() {
    if (savingCategory) return;
    setCategoryModalOpen(false);
    setCategoryForm(emptyCategoryForm);
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (normalizeSpaces(categoryForm.name).length < 2) {
      alert("Informe um nome com pelo menos 2 caracteres.");
      return;
    }

    try {
      setSavingCategory(true);

      const body = {
        id: categoryForm.id || undefined,
        type: categoryForm.type,
        name: normalizeSpaces(categoryForm.name),
        description: categoryForm.description.trim() || null,
        sortOrder: Number(categoryForm.sortOrder || 0),
      };

      const res = await fetch("/api/admin/financeiro/categorias", {
        method: categoryForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao salvar categoria."));
        return;
      }

      closeCategoryModal();
      await loadCategories();
      showSuccess(categoryForm.id ? "Categoria atualizada com sucesso." : "Categoria criada com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar categoria.");
    } finally {
      setSavingCategory(false);
    }
  }

  async function updateCategoryStatus(category: FinancialCategory, status: Status) {
    const action = status === "ACTIVE" ? "reativar" : "inativar";

    if (!confirm(`Deseja ${action} a categoria "${category.name}"?`)) return;

    try {
      setActionLoadingId(category.id);

      const res = await fetch("/api/admin/financeiro/categorias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: category.id, status }),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar categoria."));
        return;
      }

      await loadCategories();
      showSuccess(status === "ACTIVE" ? "Categoria reativada com sucesso." : "Categoria inativada com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar categoria.");
    } finally {
      setActionLoadingId(null);
    }
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Categorias Financeiras"
        description="Preparando configurações do financeiro..."
      />
    );
  }

  return (
    <FinanceiroPageFrame
      title="Categorias Financeiras"
      description="Configure as categorias usadas em receitas, despesas e mensalidades. Esta área foi separada para reduzir complexidade da operação diária."
      actions={
        <button
          type="button"
          onClick={() => openCategoryModal()}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]"
        >
          Nova Categoria
        </button>
      }
    >
      {success && (
        <div className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4 text-sm font-semibold text-[#256D3C]">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total" value={categoryMetrics.total} description="Categorias cadastradas." />
        <KpiCard label="Ativas" value={categoryMetrics.active} description="Categorias disponíveis para uso." />
        <KpiCard label="Receitas" value={categoryMetrics.revenue} description="Categorias de entrada." />
        <KpiCard label="Despesas" value={categoryMetrics.expense} description="Categorias de saída." />
      </section>

      <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            type="search"
            value={filters.q}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Buscar categoria..."
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
          />

          <select
            value={filters.type}
            onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value as typeof filters.type }))}
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
          >
            <option value="ALL">Todos Os Tipos</option>
            <option value="REVENUE">Receitas</option>
            <option value="EXPENSE">Despesas</option>
          </select>

          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as typeof filters.status }))}
            className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
          >
            <option value="ALL">Todos Os Status</option>
            <option value="ACTIVE">Ativas</option>
            <option value="INACTIVE">Inativas</option>
          </select>

          <button
            type="button"
            onClick={() => setFilters({ q: "", type: "ALL", status: "ALL" })}
            className="h-11 rounded-2xl border border-[#DDE5DF] px-5 text-sm font-bold text-[#5E6B63] hover:bg-[#F9FBFA]"
          >
            Limpar
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
        <div className="border-b border-[#DDE5DF] bg-[#F9FBFA] p-5">
          <h2 className="text-xl font-semibold tracking-tight text-[#17211B]">
            Lista De Categorias
          </h2>
        </div>

        <div className="divide-y divide-[#EEF2EF]">
          {filteredCategories.map((category) => (
            <article key={category.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={typeClass(category.type)}>{typeLabel(category.type)}</Badge>
                  <Badge className={statusClass(category.status)}>{statusLabel(category.status)}</Badge>
                  {category.isDefault && (
                    <Badge className="border-blue-200 bg-blue-50 text-blue-700">Padrão</Badge>
                  )}
                </div>

                <h3 className="mt-3 text-lg font-semibold tracking-tight text-[#17211B]">
                  {category.name}
                </h3>

                <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                  {category.description || "Sem descrição."}
                </p>

                <p className="mt-2 text-xs font-semibold text-[#7A877F]">
                  {category.entriesCount || 0} lançamento(s) • {category.chargeBatchesCount || 0} lote(s)
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openCategoryModal(category)}
                  className="rounded-2xl border border-[#DDE5DF] px-4 py-2 text-sm font-bold text-[#5E6B63] hover:bg-[#F9FBFA]"
                >
                  Editar
                </button>

                {category.status === "ACTIVE" ? (
                  <button
                    type="button"
                    onClick={() => updateCategoryStatus(category, "INACTIVE")}
                    disabled={actionLoadingId === category.id}
                    className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    Inativar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateCategoryStatus(category, "ACTIVE")}
                    disabled={actionLoadingId === category.id}
                    className="rounded-2xl border border-[#CFE6D4] px-4 py-2 text-sm font-bold text-[#256D3C] hover:bg-[#EAF7EE] disabled:opacity-60"
                  >
                    Reativar
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>

        {filteredCategories.length === 0 && (
          <div className="p-5">
            <EmptyState
              title="Nenhuma categoria encontrada"
              description="Crie uma categoria ou ajuste os filtros."
            />
          </div>
        )}
      </section>

      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/55 p-4">
          <form
            onSubmit={saveCategory}
            className="w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B]">
                  {categoryForm.id ? "Editar Categoria" : "Nova Categoria"}
                </h2>
                <p className="mt-1 text-sm font-medium text-[#5E6B63]">
                  Categorias ajudam a organizar relatórios e lançamentos.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCategoryModal}
                className="rounded-2xl border border-[#DDE5DF] px-4 py-2 text-sm font-bold text-[#5E6B63]"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Tipo</FieldLabel>
                <select
                  value={categoryForm.type}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, type: event.target.value as FinancialEntryType }))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="REVENUE">Receita</option>
                  <option value="EXPENSE">Despesa</option>
                </select>
              </div>

              <div className="space-y-2">
                <FieldLabel>Ordem</FieldLabel>
                <input
                  type="number"
                  value={categoryForm.sortOrder}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <FieldLabel>Nome</FieldLabel>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  placeholder="Ex.: Mensalidade Condominial"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <FieldLabel>Descrição</FieldLabel>
                <textarea
                  value={categoryForm.description}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="min-h-24 w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCategoryModal}
                className="h-11 rounded-2xl border border-[#DDE5DF] px-5 text-sm font-bold text-[#5E6B63]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingCategory}
                className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white hover:bg-[#174B2A] disabled:opacity-60"
              >
                {savingCategory ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </FinanceiroPageFrame>
  );
}
