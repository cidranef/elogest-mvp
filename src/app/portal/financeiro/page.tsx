"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import PortalContextGuard from "@/components/PortalContextGuard";
import PortalShell from "@/components/PortalShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ELOGEST — ETAPA 53.6
   PORTAL — FINANCEIRO POR UNIDADE

   Arquivo:
   src/app/portal/financeiro/page.tsx

   Objetivo:
   - Exibir ao usuário do portal as mensalidades vinculadas à
     unidade do perfil ativo.
   - Mostrar status, competência, vencimento, valor, baixas e
     comprovantes autorizados.
   - Não expor despesas gerais do condomínio nem documentos
     privados administrativos.
   ========================================================= */

type FinancialEntryStatus =
  | "OPEN"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELED";

type FinancialPaymentMethod =
  | "CASH"
  | "PIX"
  | "BANK_TRANSFER"
  | "BOLETO"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CHECK"
  | "OTHER";

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

type PortalFinancialAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url?: string;
};

type PortalFinancialSettlement = {
  id: string;
  paidAt: string;
  amountCents: number;
  interestCents: number;
  fineCents: number;
  discountCents: number;
  paymentMethod?: FinancialPaymentMethod | string | null;
  notes?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  createdAt: string;
  attachments?: PortalFinancialAttachment[];
};

type PortalFinancialEntry = {
  id: string;
  status: FinancialEntryStatus;
  effectiveStatus: FinancialEntryStatus;
  description: string;
  competence: string;
  dueDate: string;
  valueCents: number;
  notes?: string | null;
  category?: {
    id: string;
    name: string;
  } | null;
  unit?: {
    id: string;
    block?: string | null;
    unitNumber?: string | null;
  } | null;
  condominium?: {
    id: string;
    name: string;
  } | null;
  chargeBatch?: {
    id: string;
    description: string;
    competence: string;
    dueDate: string;
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
  settlements?: PortalFinancialSettlement[];
  attachments?: PortalFinancialAttachment[];
};

type PortalFinancialResponse = {
  context?: {
    condominium?: {
      id: string;
      name: string;
    } | null;
    unit?: {
      id: string;
      block?: string | null;
      unitNumber?: string | null;
    } | null;
    role?: string | null;
    accessLabel?: string | null;
  };
  entries?: PortalFinancialEntry[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  kpis?: {
    total?: number;
    open?: number;
    paid?: number;
    partiallyPaid?: number;
    overdue?: number;
    canceled?: number;
    totalValueCents?: number;
    paidValueCents?: number;
    openValueCents?: number;
    overdueValueCents?: number;
  };
  message?: string;
  error?: string;
};

type FiltersState = {
  q: string;
  status: "ALL" | FinancialEntryStatus;
  competenceFrom: string;
  competenceTo: string;
  dueFrom: string;
  dueTo: string;
};

const defaultFilters: FiltersState = {
  q: "",
  status: "ALL",
  competenceFrom: "",
  competenceTo: "",
  dueFrom: "",
  dueTo: "",
};

function getApiErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const payload = data as ApiErrorResponse;
    return payload.error || payload.message || fallback;
  }

  return fallback;
}

function moneyTextFromCents(value?: number | null) {
  const cents = Number(value || 0);

  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(date);
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

function statusLabel(status?: string | null) {
  return (
    {
      OPEN: "Em Aberto",
      PARTIALLY_PAID: "Parcialmente Pago",
      PAID: "Pago",
      OVERDUE: "Atrasado",
      CANCELED: "Cancelado",
    }[status || ""] ||
    status ||
    "-"
  );
}

function statusClass(status?: string | null) {
  if (status === "PAID") return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  if (status === "PARTIALLY_PAID") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "OVERDUE") return "border-red-200 bg-red-50 text-red-700";
  if (status === "CANCELED") return "border-zinc-200 bg-zinc-50 text-zinc-600";
  return "border-[#DDE5DF] bg-white text-[#5E6B63]";
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

function getUnitLabel(unit?: { block?: string | null; unitNumber?: string | null } | null) {
  if (!unit) return "Unidade não vinculada";
  const block = unit.block ? `Bloco ${unit.block}` : "";
  const number = unit.unitNumber ? `Unidade ${unit.unitNumber}` : "Unidade";
  return [block, number].filter(Boolean).join(" • ");
}

function getSettlementTotal(settlement: PortalFinancialSettlement) {
  return (
    Number(settlement.amountCents || 0) +
    Number(settlement.interestCents || 0) +
    Number(settlement.fineCents || 0) -
    Number(settlement.discountCents || 0)
  );
}

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

function Badge({ children, className }: { children: string; className: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <section className="rounded-[28px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-8 text-center">
      <h2 className="text-xl font-semibold tracking-tight text-[#17211B]">
        Nenhuma mensalidade encontrada
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
        {message ||
          "Quando houver mensalidades vinculadas à unidade do perfil ativo, elas aparecerão aqui para acompanhamento."}
      </p>
    </section>
  );
}

export default function PortalFinanceiroPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [entries, setEntries] = useState<PortalFinancialEntry[]>([]);
  const [kpis, setKpis] = useState<NonNullable<PortalFinancialResponse["kpis"]>>({});
  const [context, setContext] = useState<PortalFinancialResponse["context"]>();
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(defaultFilters);
  const [pagination, setPagination] = useState<PortalFinancialResponse["pagination"]>();

  const loadFinancialEntries = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) setLoading(true);
        setError("");
        setInfoMessage("");

        const params = new URLSearchParams({ page: "1", pageSize: "50" });
        if (appliedFilters.q.trim()) params.set("q", appliedFilters.q.trim());
        if (appliedFilters.status !== "ALL") params.set("status", appliedFilters.status);
        if (appliedFilters.competenceFrom) params.set("competenceFrom", `${appliedFilters.competenceFrom}-01`);
        if (appliedFilters.competenceTo) params.set("competenceTo", `${appliedFilters.competenceTo}-01`);
        if (appliedFilters.dueFrom) params.set("dueFrom", appliedFilters.dueFrom);
        if (appliedFilters.dueTo) params.set("dueTo", appliedFilters.dueTo);

        const res = await fetch(`/api/portal/financeiro?${params.toString()}`, {
          cache: "no-store",
        });
        const data: unknown = await res.json();

        if (!res.ok) {
          setEntries([]);
          setKpis({});
          setPagination(undefined);
          setError(getApiErrorMessage(data, "Erro ao carregar financeiro."));
          return;
        }

        const payload = data as PortalFinancialResponse;
        setEntries(Array.isArray(payload.entries) ? payload.entries : []);
        setKpis(payload.kpis || {});
        setContext(payload.context);
        setPagination(payload.pagination);
        setInfoMessage(payload.message || "");
      } catch (err) {
        console.error(err);
        setEntries([]);
        setKpis({});
        setPagination(undefined);
        setError("Erro ao carregar financeiro.");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [appliedFilters],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFinancialEntries();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadFinancialEntries]);

  const orderedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const aDue = new Date(a.dueDate).getTime();
      const bDue = new Date(b.dueDate).getTime();
      return bDue - aDue;
    });
  }, [entries]);

  function applyFilters(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setAppliedFilters(filters);
  }

  function clearFilters() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Financeiro"
        description="Preparando mensalidades e pagamentos da unidade ativa..."
      />
    );
  }

  return (
    <PortalContextGuard
      fallbackTitle="Financeiro indisponível neste perfil"
      fallbackDescription="O financeiro do portal depende de um perfil ativo vinculado a condomínio e unidade."
    >
      <PortalShell
        current="financeiro"
        title="Financeiro"
        description="Acompanhe mensalidades, vencimentos e pagamentos da unidade ativa."
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
                Financeiro Da Unidade
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Mensalidades
              </h1>
              <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-[#5E6B63]">
                Consulte cobranças vinculadas à unidade do perfil ativo, com
                competência, vencimento, status, baixas registradas e
                comprovantes autorizados.
              </p>
            </div>

            <div className="rounded-[22px] border border-[#DDE5DF] bg-white p-4 text-sm shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
              <p className="font-bold text-[#17211B]">
                {context?.condominium?.name || "Condomínio"}
              </p>
              <p className="mt-1 font-medium text-[#5E6B63]">
                {getUnitLabel(context?.unit)}
              </p>
            </div>
          </header>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {infoMessage && !error && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              {infoMessage}
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="Total Previsto"
              value={moneyTextFromCents(kpis.totalValueCents)}
              description="Valor total das mensalidades da unidade."
            />
            <KpiCard
              label="Recebido/Pago"
              value={moneyTextFromCents(kpis.paidValueCents)}
              description="Total líquido registrado nas baixas."
            />
            <KpiCard
              label="Em Aberto"
              value={moneyTextFromCents(kpis.openValueCents)}
              description="Saldo principal ainda pendente."
            />
            <KpiCard
              label="Atrasado"
              value={moneyTextFromCents(kpis.overdueValueCents)}
              description="Saldo vencido ainda não quitado."
            />
            <KpiCard
              label="Cobranças"
              value={kpis.total ?? 0}
              description="Mensalidades encontradas nos filtros."
            />
          </section>

          <section className="overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
            <div className="border-b border-[#DDE5DF] bg-[#F9FBFA] p-5">
              <h2 className="text-xl font-semibold tracking-tight text-[#17211B]">
                Filtros
              </h2>
              <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                Localize mensalidades por descrição, status, competência ou vencimento.
              </p>
            </div>

            <form onSubmit={applyFilters} className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-6">
              <input
                type="search"
                value={filters.q}
                onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="Buscar mensalidade..."
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10 xl:col-span-2"
              />

              <select
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as FiltersState["status"] }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              >
                <option value="ALL">Todos Os Status</option>
                <option value="OPEN">Em Aberto</option>
                <option value="OVERDUE">Atrasado</option>
                <option value="PARTIALLY_PAID">Parcialmente Pago</option>
                <option value="PAID">Pago</option>
                <option value="CANCELED">Cancelado</option>
              </select>

              <input
                type="month"
                value={filters.competenceFrom}
                onChange={(event) => setFilters((prev) => ({ ...prev, competenceFrom: event.target.value }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                title="Competência inicial"
              />

              <input
                type="month"
                value={filters.competenceTo}
                onChange={(event) => setFilters((prev) => ({ ...prev, competenceTo: event.target.value }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                title="Competência final"
              />

              <div className="flex gap-2 xl:col-span-1">
                <button
                  type="submit"
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-[#17211B] px-4 text-sm font-semibold text-white transition hover:bg-[#256D3C]"
                >
                  Filtrar
                </button>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#5E6B63] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  Limpar
                </button>
              </div>
            </form>
          </section>

          {orderedEntries.length === 0 ? (
            <EmptyState message={infoMessage} />
          ) : (
            <section className="space-y-4">
              {orderedEntries.map((entry) => {
                const summary = entry.settlementSummary;
                const activeSettlements = (entry.settlements || []).filter(
                  (settlement) => !settlement.reversedAt,
                );

                return (
                  <article
                    key={entry.id}
                    className="overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white shadow-[0_18px_50px_rgba(23,33,27,0.05)]"
                  >
                    <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_70%,#EAF7EE_130%)] p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={statusClass(entry.effectiveStatus)}>
                              {statusLabel(entry.effectiveStatus)}
                            </Badge>
                            {entry.category?.name && (
                              <Badge className="border-[#DDE5DF] bg-white text-[#5E6B63]">
                                {entry.category.name}
                              </Badge>
                            )}
                          </div>

                          <h2 className="mt-3 text-xl font-semibold tracking-tight text-[#17211B]">
                            {entry.description}
                          </h2>

                          <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                            Competência {formatCompetence(entry.competence)} • Vencimento {formatDate(entry.dueDate)}
                          </p>
                        </div>

                        <div className="grid gap-2 text-left sm:grid-cols-3 lg:min-w-[520px]">
                          <div className="rounded-2xl border border-[#DDE5DF] bg-white/80 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                              Valor
                            </p>
                            <p className="mt-1 text-lg font-semibold text-[#17211B]">
                              {moneyTextFromCents(entry.valueCents)}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[#DDE5DF] bg-white/80 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                              Pago
                            </p>
                            <p className="mt-1 text-lg font-semibold text-[#256D3C]">
                              {moneyTextFromCents(summary?.netPaidCents)}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[#DDE5DF] bg-white/80 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                              Em Aberto
                            </p>
                            <p className="mt-1 text-lg font-semibold text-[#17211B]">
                              {moneyTextFromCents(summary?.remainingPrincipalCents)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-0 divide-y divide-[#DDE5DF] lg:grid-cols-[1fr_1.2fr] lg:divide-x lg:divide-y-0">
                      <div className="p-5">
                        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                          Dados Da Cobrança
                        </h3>
                        <dl className="mt-4 space-y-3 text-sm">
                          <div>
                            <dt className="font-semibold text-[#17211B]">Unidade</dt>
                            <dd className="mt-1 text-[#5E6B63]">{getUnitLabel(entry.unit)}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-[#17211B]">Condomínio</dt>
                            <dd className="mt-1 text-[#5E6B63]">{entry.condominium?.name || "-"}</dd>
                          </div>
                          {entry.notes && (
                            <div>
                              <dt className="font-semibold text-[#17211B]">Observações</dt>
                              <dd className="mt-1 whitespace-pre-wrap text-[#5E6B63]">{entry.notes}</dd>
                            </div>
                          )}
                        </dl>

                        {entry.attachments && entry.attachments.length > 0 && (
                          <div className="mt-5">
                            <h4 className="text-sm font-bold text-[#17211B]">Comprovantes Da Cobrança</h4>
                            <div className="mt-2 space-y-2">
                              {entry.attachments.map((attachment) => (
                                <a
                                  key={attachment.id}
                                  href={attachment.url || "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-semibold text-[#256D3C] transition hover:border-[#256D3C]"
                                >
                                  {attachment.originalName}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="p-5">
                        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                          Baixas Registradas
                        </h3>

                        {activeSettlements.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#5E6B63]">
                            Nenhum pagamento registrado para esta cobrança.
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {activeSettlements.map((settlement) => (
                              <div
                                key={settlement.id}
                                className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="font-semibold text-[#17211B]">
                                      {moneyTextFromCents(getSettlementTotal(settlement))}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-[#5E6B63]">
                                      Pago em {formatDate(settlement.paidAt)} • {paymentMethodLabel(settlement.paymentMethod)}
                                    </p>
                                  </div>
                                  <Badge className="border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]">
                                    Registrada
                                  </Badge>
                                </div>

                                <div className="mt-3 grid gap-2 text-xs font-semibold text-[#5E6B63] sm:grid-cols-4">
                                  <span>Principal: {moneyTextFromCents(settlement.amountCents)}</span>
                                  <span>Juros: {moneyTextFromCents(settlement.interestCents)}</span>
                                  <span>Multa: {moneyTextFromCents(settlement.fineCents)}</span>
                                  <span>Desconto: {moneyTextFromCents(settlement.discountCents)}</span>
                                </div>

                                {settlement.notes && (
                                  <p className="mt-3 whitespace-pre-wrap text-sm text-[#5E6B63]">
                                    {settlement.notes}
                                  </p>
                                )}

                                {settlement.attachments && settlement.attachments.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {settlement.attachments.map((attachment) => (
                                      <a
                                        key={attachment.id}
                                        href={attachment.url || "#"}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex rounded-full border border-[#CFE6D4] bg-white px-3 py-1.5 text-xs font-bold text-[#256D3C] transition hover:border-[#256D3C]"
                                      >
                                        {attachment.originalName}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4 text-center text-sm font-semibold text-[#5E6B63]">
              Exibindo página {pagination.page} de {pagination.totalPages}. A paginação avançada será refinada nos próximos blocos.
            </div>
          )}
        </div>
      </PortalShell>
    </PortalContextGuard>
  );
}
