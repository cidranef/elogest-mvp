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
   ELOGEST — ETAPA 53.10
   PORTAL — FINANCEIRO COM PAGAMENTO INFORMADO

   Arquivo:
   src/app/portal/financeiro/page.tsx
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

type SubmissionStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CANCELED";

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

type PaymentSubmission = {
  id: string;
  financialEntryId?: string;
  status: SubmissionStatus;
  paidAt: string;
  amountCents: number;
  paymentMethod?: FinancialPaymentMethod | string | null;
  notes?: string | null;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  entry?: {
    id: string;
    description: string;
  } | null;
  attachment?: PortalFinancialAttachment | null;
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

type PaymentSubmissionsResponse = {
  submissions?: PaymentSubmission[];
  error?: string;
  message?: string;
};

type FiltersState = {
  q: string;
  status: "ALL" | FinancialEntryStatus;
  competenceFrom: string;
  competenceTo: string;
  dueFrom: string;
  dueTo: string;
};

type PaymentFormState = {
  financialEntryId: string;
  paidAt: string;
  amount: string;
  paymentMethod: "" | FinancialPaymentMethod;
  notes: string;
};

const defaultFilters: FiltersState = {
  q: "",
  status: "ALL",
  competenceFrom: "",
  competenceTo: "",
  dueFrom: "",
  dueTo: "",
};

const emptyPaymentForm: PaymentFormState = {
  financialEntryId: "",
  paidAt: "",
  amount: "",
  paymentMethod: "",
  notes: "",
};

function getApiErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const payload = data as ApiErrorResponse;
    return payload.error || payload.message || fallback;
  }

  return fallback;
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

function todayInput() {
  return new Date().toISOString().slice(0, 10);
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

function submissionStatusLabel(status?: string | null) {
  return (
    {
      PENDING_REVIEW: "Aguardando Conferência",
      APPROVED: "Aprovado",
      REJECTED: "Recusado",
      CANCELED: "Cancelado",
    }[status || ""] ||
    status ||
    "-"
  );
}

function statusClass(status?: string | null) {
  if (status === "PAID" || status === "APPROVED") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (status === "PENDING_REVIEW" || status === "PARTIALLY_PAID") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "OVERDUE" || status === "REJECTED") {
    return "border-red-200 bg-red-50 text-red-700";
  }

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

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

function KpiCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number | string;
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

function EmptyState() {
  return (
    <section className="rounded-[28px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-8 text-center">
      <h2 className="text-xl font-semibold tracking-tight text-[#17211B]">
        Nenhuma cobrança encontrada
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
        Quando houver mensalidades ou cobranças vinculadas à sua unidade, elas aparecerão aqui.
      </p>
    </section>
  );
}

export default function PortalFinanceiroPage() {
  const [loading, setLoading] = useState(true);
  const [savingPayment, setSavingPayment] = useState(false);
  const [entries, setEntries] = useState<PortalFinancialEntry[]>([]);
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [kpis, setKpis] = useState<NonNullable<PortalFinancialResponse["kpis"]>>({});
  const [context, setContext] = useState<PortalFinancialResponse["context"]>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(defaultFilters);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentEntry, setPaymentEntry] = useState<PortalFinancialEntry | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(emptyPaymentForm);
  const [paymentFile, setPaymentFile] = useState<File | null>(null);

  const submissionsByEntryId = useMemo(() => {
    const map = new Map<string, PaymentSubmission[]>();

    for (const submission of submissions) {
      const entryId = submission.financialEntryId || submission.entry?.id;
      if (!entryId) continue;
      map.set(entryId, [...(map.get(entryId) || []), submission]);
    }

    return map;
  }, [submissions]);

  const loadPayments = useCallback(async () => {
    const res = await fetch("/api/portal/financeiro/pagamentos", {
      cache: "no-store",
    });
    const data: unknown = await res.json();

    if (!res.ok) {
      setSubmissions([]);
      return;
    }

    const payload = data as PaymentSubmissionsResponse;
    setSubmissions(Array.isArray(payload.submissions) ? payload.submissions : []);
  }, []);

  const loadEntries = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) setLoading(true);
        setError("");

        const params = new URLSearchParams();
        if (appliedFilters.q.trim()) params.set("q", appliedFilters.q.trim());
        if (appliedFilters.status !== "ALL") params.set("status", appliedFilters.status);
        if (appliedFilters.competenceFrom) params.set("competenceFrom", dateInputToIso(appliedFilters.competenceFrom) || appliedFilters.competenceFrom);
        if (appliedFilters.competenceTo) params.set("competenceTo", dateInputToIso(appliedFilters.competenceTo) || appliedFilters.competenceTo);
        if (appliedFilters.dueFrom) params.set("dueFrom", dateInputToIso(appliedFilters.dueFrom) || appliedFilters.dueFrom);
        if (appliedFilters.dueTo) params.set("dueTo", dateInputToIso(appliedFilters.dueTo) || appliedFilters.dueTo);

        const query = params.toString();
        const res = await fetch(`/api/portal/financeiro${query ? `?${query}` : ""}`, {
          cache: "no-store",
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          setEntries([]);
          setKpis({});
          setContext(undefined);
          setError(getApiErrorMessage(data, "Erro ao carregar financeiro."));
          return;
        }

        const payload = data as PortalFinancialResponse;
        setEntries(Array.isArray(payload.entries) ? payload.entries : []);
        setKpis(payload.kpis || {});
        setContext(payload.context);
        setMessage(payload.message || "");

        await loadPayments();
      } catch (err) {
        console.error(err);
        setEntries([]);
        setKpis({});
        setError("Erro ao carregar financeiro.");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [appliedFilters, loadPayments],
  );

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  function showSuccess(messageText: string) {
    setSuccess(messageText);
    setError("");
    window.setTimeout(() => setSuccess(""), 4500);
  }

  function openPaymentModal(entry: PortalFinancialEntry) {
    const remaining = entry.settlementSummary?.remainingPrincipalCents ?? entry.valueCents;

    setPaymentEntry(entry);
    setPaymentForm({
      financialEntryId: entry.id,
      paidAt: todayInput(),
      amount: formatCurrencyInput(String(Math.max(remaining, 0))),
      paymentMethod: "",
      notes: "",
    });
    setPaymentFile(null);
    setPaymentModalOpen(true);
  }

  function closePaymentModal() {
    if (savingPayment) return;
    setPaymentEntry(null);
    setPaymentForm(emptyPaymentForm);
    setPaymentFile(null);
    setPaymentModalOpen(false);
  }

  async function savePaymentSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!paymentForm.financialEntryId) {
      alert("Selecione a cobrança.");
      return;
    }

    if (!paymentForm.paidAt) {
      alert("Informe a data do pagamento.");
      return;
    }

    if (valueInputToCents(paymentForm.amount) <= 0) {
      alert("Informe o valor pago.");
      return;
    }

    if (!paymentFile) {
      alert("Envie o comprovante.");
      return;
    }

    try {
      setSavingPayment(true);

      const formData = new FormData();
      formData.append("financialEntryId", paymentForm.financialEntryId);
      formData.append("paidAt", dateInputToIso(paymentForm.paidAt) || paymentForm.paidAt);
      formData.append("amount", paymentForm.amount);
      formData.append("paymentMethod", paymentForm.paymentMethod);
      formData.append("notes", paymentForm.notes);
      formData.append("file", paymentFile);

      const res = await fetch("/api/portal/financeiro/pagamentos", {
        method: "POST",
        body: formData,
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao enviar comprovante."));
        return;
      }

      closePaymentModal();
      await loadEntries({ showLoading: false });
      showSuccess("Pagamento enviado para conferência da administradora.");
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar comprovante.");
    } finally {
      setSavingPayment(false);
    }
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Financeiro"
        description="Consultando cobranças da unidade ativa..."
      />
    );
  }

  return (
    <PortalContextGuard>
      <PortalShell
        current="financeiro"
        title="Financeiro"
        description="Acompanhe cobranças, baixas e comprovantes da sua unidade."
      >
        <div className="space-y-8">
          <header>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
              Portal Financeiro
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Financeiro Da Unidade
            </h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-[#5E6B63]">
              Consulte as cobranças da unidade ativa e envie comprovantes para conferência da administradora.
            </p>

            {context?.unit && (
              <p className="mt-3 text-sm font-bold text-[#256D3C]">
                {context.condominium?.name} • {context.unit.block ? `Bloco ${context.unit.block} • ` : ""}
                Unidade {context.unit.unitNumber || context.unit.id}
              </p>
            )}
          </header>

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
          {message && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
              {message}
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Cobranças" value={kpis.total || 0} description="Total de cobranças da unidade." />
            <KpiCard label="Em Aberto" value={kpis.open || 0} description={moneyTextFromCents(kpis.openValueCents)} />
            <KpiCard label="Atrasadas" value={kpis.overdue || 0} description={moneyTextFromCents(kpis.overdueValueCents)} />
            <KpiCard label="Pagas" value={kpis.paid || 0} description={moneyTextFromCents(kpis.paidValueCents)} />
          </section>

          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <input
                type="search"
                value={filters.q}
                onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="Buscar cobrança..."
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
              />
              <select
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as FiltersState["status"] }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
              >
                <option value="ALL">Todos Os Status</option>
                <option value="OPEN">Em Aberto</option>
                <option value="OVERDUE">Atrasado</option>
                <option value="PARTIALLY_PAID">Parcialmente Pago</option>
                <option value="PAID">Pago</option>
              </select>
              <input
                type="date"
                value={filters.competenceFrom}
                onChange={(event) => setFilters((prev) => ({ ...prev, competenceFrom: event.target.value }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
                title="Competência inicial"
              />
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
                  setFilters(defaultFilters);
                  setAppliedFilters(defaultFilters);
                }}
                className="h-11 rounded-2xl border border-[#DDE5DF] px-5 text-sm font-bold text-[#5E6B63] transition hover:bg-[#F9FBFA]"
              >
                Limpar
              </button>
            </div>
          </section>

          <section className="space-y-4">
            {entries.map((entry) => {
              const entrySubmissions = submissionsByEntryId.get(entry.id) || [];
              const hasPendingSubmission = entrySubmissions.some((submission) => submission.status === "PENDING_REVIEW");
              const canInformPayment =
                entry.status !== "PAID" &&
                entry.status !== "CANCELED" &&
                !hasPendingSubmission &&
                Number(entry.settlementSummary?.remainingPrincipalCents ?? entry.valueCents) > 0;

              return (
                <article
                  key={entry.id}
                  className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusClass(entry.effectiveStatus)}>{statusLabel(entry.effectiveStatus)}</Badge>
                        {hasPendingSubmission && (
                          <Badge className={statusClass("PENDING_REVIEW")}>Pagamento Em Análise</Badge>
                        )}
                      </div>

                      <h2 className="mt-3 text-xl font-semibold tracking-tight text-[#17211B]">
                        {entry.description}
                      </h2>

                      <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                        {entry.category?.name || "Cobrança"} • Competência {formatCompetence(entry.competence)}
                      </p>

                      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Vencimento</p>
                          <p className="font-semibold text-[#17211B]">{formatDate(entry.dueDate)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Valor</p>
                          <p className="font-semibold text-[#17211B]">{moneyTextFromCents(entry.valueCents)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Pago</p>
                          <p className="font-semibold text-[#256D3C]">{moneyTextFromCents(entry.settlementSummary?.netPaidCents)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Saldo</p>
                          <p className="font-semibold text-[#17211B]">{moneyTextFromCents(entry.settlementSummary?.remainingPrincipalCents)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Baixas</p>
                          <p className="font-semibold text-[#17211B]">{entry.settlementSummary?.activeSettlementsCount || 0}</p>
                        </div>
                      </div>

                      {entrySubmissions.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                          <p className="text-sm font-bold text-[#17211B]">
                            Pagamentos Informados
                          </p>

                          <div className="mt-3 space-y-2">
                            {entrySubmissions.map((submission) => (
                              <div
                                key={submission.id}
                                className="rounded-2xl border border-[#DDE5DF] bg-white p-3"
                              >
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                  <div>
                                    <Badge className={statusClass(submission.status)}>{submissionStatusLabel(submission.status)}</Badge>
                                    <p className="mt-2 text-sm font-semibold text-[#17211B]">
                                      {moneyTextFromCents(submission.amountCents)} • {formatDate(submission.paidAt)}
                                    </p>
                                    {submission.rejectionReason && (
                                      <p className="mt-1 text-xs font-semibold text-red-700">
                                        Motivo: {submission.rejectionReason}
                                      </p>
                                    )}
                                  </div>

                                  {submission.attachment && (
                                    <a
                                      href={submission.attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-xl border border-[#DDE5DF] px-3 py-2 text-xs font-bold text-[#256D3C] hover:bg-[#EAF7EE]"
                                    >
                                      Ver Comprovante
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(entry.settlements || []).filter((settlement) => !settlement.reversedAt).length > 0 && (
                        <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                          <p className="text-sm font-bold text-[#17211B]">
                            Baixas Confirmadas
                          </p>
                          <div className="mt-3 space-y-2">
                            {(entry.settlements || [])
                              .filter((settlement) => !settlement.reversedAt)
                              .map((settlement) => (
                                <div key={settlement.id} className="rounded-2xl border border-[#DDE5DF] bg-white p-3">
                                  <p className="text-sm font-semibold text-[#17211B]">
                                    {moneyTextFromCents(settlement.amountCents)} • {formatDate(settlement.paidAt)}
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-[#5E6B63]">
                                    {paymentMethodLabel(settlement.paymentMethod)}
                                  </p>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      {canInformPayment ? (
                        <button
                          type="button"
                          onClick={() => openPaymentModal(entry)}
                          className="rounded-2xl bg-[#256D3C] px-4 py-2 text-sm font-bold text-white hover:bg-[#174B2A]"
                        >
                          Informar Pagamento
                        </button>
                      ) : hasPendingSubmission ? (
                        <span className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
                          Aguardando Conferência
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}

            {entries.length === 0 && <EmptyState />}
          </section>

          {paymentModalOpen && paymentEntry && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/55 p-4">
              <form
                onSubmit={savePaymentSubmission}
                className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-[#17211B]">
                      Informar Pagamento
                    </h2>
                    <p className="mt-1 text-sm font-medium text-[#5E6B63]">
                      Envie o comprovante para conferência da administradora. Isso não confirma a baixa automaticamente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closePaymentModal}
                    className="rounded-2xl border border-[#DDE5DF] px-4 py-2 text-sm font-bold text-[#5E6B63]"
                  >
                    Fechar
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#5E6B63]">
                  {paymentEntry.description} • Saldo em aberto:{" "}
                  {moneyTextFromCents(paymentEntry.settlementSummary?.remainingPrincipalCents)}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#17211B]">Data Do Pagamento</label>
                    <input
                      type="date"
                      value={paymentForm.paidAt}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, paidAt: event.target.value }))}
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#17211B]">Forma De Pagamento</label>
                    <select
                      value={paymentForm.paymentMethod}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value as PaymentFormState["paymentMethod"] }))}
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                    >
                      <option value="">Não Informada</option>
                      <option value="PIX">Pix</option>
                      <option value="BOLETO">Boleto</option>
                      <option value="BANK_TRANSFER">Transferência Bancária</option>
                      <option value="CASH">Dinheiro</option>
                      <option value="CREDIT_CARD">Cartão De Crédito</option>
                      <option value="DEBIT_CARD">Cartão De Débito</option>
                      <option value="CHECK">Cheque</option>
                      <option value="OTHER">Outro</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#17211B]">Valor Pago (R$)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={paymentForm.amount}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: formatCurrencyInput(event.target.value) }))}
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                      placeholder="0,00"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#17211B]">Comprovante</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(event) => setPaymentFile(event.target.files?.[0] || null)}
                      className="block w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm font-semibold text-[#17211B]"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-[#17211B]">Observações</label>
                    <textarea
                      value={paymentForm.notes}
                      onChange={(event) => setPaymentForm((prev) => ({ ...prev, notes: event.target.value }))}
                      className="min-h-24 w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                      placeholder="Ex.: Pagamento realizado por Pix no nome do titular da unidade."
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closePaymentModal}
                    className="h-11 rounded-2xl border border-[#DDE5DF] px-5 text-sm font-bold text-[#5E6B63]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingPayment}
                    className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white hover:bg-[#174B2A] disabled:opacity-60"
                  >
                    {savingPayment ? "Enviando..." : "Enviar Para Conferência"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </PortalShell>
    </PortalContextGuard>
  );
}
