"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ELOGEST — ETAPA 53.10
   ADMIN — PAGAMENTOS INFORMADOS

   Arquivo:
   src/app/admin/financeiro/pagamentos-informados/page.tsx
   ========================================================= */

type SubmissionStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CANCELED";

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

type PaymentSubmission = {
  id: string;
  status: SubmissionStatus;
  paidAt: string;
  amountCents: number;
  paymentMethod?: string | null;
  notes?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  entry?: {
    id: string;
    description: string;
    valueCents: number;
    paidPrincipalCents?: number;
    remainingPrincipalCents?: number;
    competence: string;
    dueDate: string;
    status: string;
    condominium?: {
      id: string;
      name: string;
    } | null;
    unit?: {
      id: string;
      block?: string | null;
      unitNumber?: string | null;
    } | null;
    category?: {
      id: string;
      name: string;
    } | null;
  } | null;
  submittedByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  reviewedByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  attachment?: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    url: string;
  } | null;
};

type ResponsePayload = {
  submissions?: PaymentSubmission[];
  kpis?: Record<string, number>;
  error?: string;
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

function unitLabel(unit?: PaymentSubmission["entry"] extends infer E ? any : never) {
  if (!unit) return "-";
  const block = unit.block ? `Bloco ${unit.block}` : "";
  const number = unit.unitNumber ? `Unidade ${unit.unitNumber}` : "Unidade";
  return [block, number].filter(Boolean).join(" • ");
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

function statusLabel(status?: string | null) {
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
  if (status === "PENDING_REVIEW") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "APPROVED") return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  if (status === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  return "border-[#DDE5DF] bg-[#F9FBFA] text-[#5E6B63]";
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

export default function AdminPagamentosInformadosPage() {
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState({
    q: "",
    status: "PENDING_REVIEW" as "ALL" | SubmissionStatus,
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const pendingCount = kpis.PENDING_REVIEW || 0;

  const loadSubmissions = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) setLoading(true);
        setError("");

        const params = new URLSearchParams();

        if (appliedFilters.q.trim()) params.set("q", appliedFilters.q.trim());
        if (appliedFilters.status !== "ALL") params.set("status", appliedFilters.status);

        const res = await fetch(`/api/admin/financeiro/pagamentos-informados?${params.toString()}`, {
          cache: "no-store",
        });
        const data: unknown = await res.json();

        if (!res.ok) {
          setSubmissions([]);
          setKpis({});
          setError(getApiErrorMessage(data, "Erro ao carregar pagamentos informados."));
          return;
        }

        const payload = data as ResponsePayload;
        setSubmissions(Array.isArray(payload.submissions) ? payload.submissions : []);
        setKpis(payload.kpis || {});
      } catch (err) {
        console.error(err);
        setSubmissions([]);
        setKpis({});
        setError("Erro ao carregar pagamentos informados.");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [appliedFilters],
  );

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  function showSuccess(message: string) {
    setSuccess(message);
    setError("");
    window.setTimeout(() => setSuccess(""), 4500);
  }

  async function reviewSubmission({
    submission,
    action,
    reviewNotes,
  }: {
    submission: PaymentSubmission;
    action: "APPROVE" | "REJECT";
    reviewNotes: string;
  }) {
    try {
      setActionLoadingId(submission.id);

      const res = await fetch("/api/admin/financeiro/pagamentos-informados", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: submission.id,
          action,
          reviewNotes,
          rejectionReason: reviewNotes,
        }),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao analisar pagamento informado."));
        return;
      }

      await loadSubmissions({ showLoading: false });
      showSuccess(action === "APPROVE" ? "Pagamento aprovado e baixa registrada." : "Pagamento recusado.");
    } catch (err) {
      console.error(err);
      alert("Erro ao analisar pagamento informado.");
    } finally {
      setActionLoadingId(null);
    }
  }

  function approveSubmission(submission: PaymentSubmission) {
    const note = window.prompt(
      `Confirmar pagamento de ${moneyTextFromCents(submission.amountCents)}? Observação opcional:`,
      "Comprovante conferido pela administradora.",
    );

    if (note === null) return;

    void reviewSubmission({
      submission,
      action: "APPROVE",
      reviewNotes: note,
    });
  }

  function rejectSubmission(submission: PaymentSubmission) {
    const reason = window.prompt("Informe o motivo da recusa:");

    if (!reason || reason.trim().length < 3) {
      alert("Informe o motivo da recusa.");
      return;
    }

    void reviewSubmission({
      submission,
      action: "REJECT",
      reviewNotes: reason.trim(),
    });
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Pagamentos Informados"
        description="Conferindo comprovantes enviados pelo portal..."
      />
    );
  }

  return (
    <AdminContextGuard
      fallbackTitle="Financeiro indisponível neste perfil de acesso"
      fallbackDescription="A análise de pagamentos informados é exclusiva da área administrativa."
    >
      <AdminShell
        current="financeiro"
        title="Financeiro"
        description="Conferência de pagamentos enviados pelo portal."
      >
        <div className="space-y-8">
          <header>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
              Financeiro Admin
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Pagamentos Informados
            </h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-[#5E6B63]">
              Analise comprovantes enviados pelo portal. A baixa oficial só é registrada após aprovação da administradora.
            </p>
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

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Pendentes" value={pendingCount} description="Aguardando conferência da administradora." />
            <KpiCard label="Aprovados" value={kpis.APPROVED || 0} description="Baixas registradas após conferência." />
            <KpiCard label="Recusados" value={kpis.REJECTED || 0} description="Comprovantes não confirmados." />
            <KpiCard label="Total" value={Object.values(kpis).reduce((sum, value) => sum + value, 0)} description="Pagamentos informados no portal." />
          </section>

          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                type="search"
                value={filters.q}
                onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="Buscar por condomínio, cobrança ou usuário..."
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
              />

              <select
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as typeof filters.status }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
              >
                <option value="ALL">Todos Os Status</option>
                <option value="PENDING_REVIEW">Aguardando Conferência</option>
                <option value="APPROVED">Aprovados</option>
                <option value="REJECTED">Recusados</option>
                <option value="CANCELED">Cancelados</option>
              </select>

              <button
                type="button"
                onClick={() => setAppliedFilters(filters)}
                className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#174B2A]"
              >
                Aplicar Filtros
              </button>
            </div>
          </section>

          <section className="space-y-4">
            {submissions.map((submission) => (
              <article
                key={submission.id}
                className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={statusClass(submission.status)}>{statusLabel(submission.status)}</Badge>
                      <Badge className="border-[#DDE5DF] bg-[#F9FBFA] text-[#5E6B63]">
                        {paymentMethodLabel(submission.paymentMethod)}
                      </Badge>
                    </div>

                    <h2 className="mt-3 text-xl font-semibold tracking-tight text-[#17211B]">
                      {submission.entry?.description || "Cobrança"}
                    </h2>

                    <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                      {submission.entry?.condominium?.name || "Condomínio"} • {unitLabel(submission.entry?.unit)}
                    </p>

                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Valor Informado</p>
                        <p className="font-semibold text-[#17211B]">{moneyTextFromCents(submission.amountCents)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Pago Em</p>
                        <p className="font-semibold text-[#17211B]">{formatDate(submission.paidAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Competência</p>
                        <p className="font-semibold text-[#17211B]">{formatCompetence(submission.entry?.competence)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Saldo Atual</p>
                        <p className="font-semibold text-[#17211B]">{moneyTextFromCents(submission.entry?.remainingPrincipalCents)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Enviado Por</p>
                        <p className="font-semibold text-[#17211B]">{submission.submittedByUser?.name || submission.submittedByUser?.email || "-"}</p>
                      </div>
                    </div>

                    {submission.notes && (
                      <p className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold leading-6 text-[#5E6B63]">
                        {submission.notes}
                      </p>
                    )}

                    {submission.status === "REJECTED" && submission.rejectionReason && (
                      <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
                        Motivo da recusa: {submission.rejectionReason}
                      </p>
                    )}

                    {submission.reviewedAt && (
                      <p className="mt-3 text-xs font-semibold text-[#7A877F]">
                        Revisado em {formatDateTime(submission.reviewedAt)} por {submission.reviewedByUser?.name || "administradora"}.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {submission.attachment && (
                      <a
                        href={submission.attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-[#DDE5DF] px-4 py-2 text-sm font-bold text-[#256D3C] hover:bg-[#EAF7EE]"
                      >
                        Ver Comprovante
                      </a>
                    )}

                    {submission.status === "PENDING_REVIEW" && (
                      <>
                        <button
                          type="button"
                          onClick={() => approveSubmission(submission)}
                          disabled={actionLoadingId === submission.id}
                          className="rounded-2xl bg-[#256D3C] px-4 py-2 text-sm font-bold text-white hover:bg-[#174B2A] disabled:opacity-60"
                        >
                          Aprovar E Baixar
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectSubmission(submission)}
                          disabled={actionLoadingId === submission.id}
                          className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          Recusar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}

            {submissions.length === 0 && (
              <section className="rounded-[28px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-8 text-center">
                <h2 className="text-xl font-semibold tracking-tight text-[#17211B]">
                  Nenhum pagamento informado encontrado
                </h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
                  Quando o usuário enviar comprovantes pelo portal, eles aparecerão aqui para conferência.
                </p>
              </section>
            )}
          </section>
        </div>
      </AdminShell>
    </AdminContextGuard>
  );
}
