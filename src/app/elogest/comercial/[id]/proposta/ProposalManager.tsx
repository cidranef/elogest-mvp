"use client";

import { useMemo, useState } from "react";

type Plan = {
  id: string;
  name: string;
  slug: string;
  monthlyPriceCents: number | null;
  modules: Array<{ module: { name: string; slug: string } }>;
};

type Proposal = {
  id: string;
  title: string;
  status: string;
  planId: string | null;
  monthlyPriceCents: number | null;
  implementationFeeCents: number | null;
  discountCents: number;
  discountPercent: number | null;
  validUntil: string | Date | null;
  paymentTerms: string | null;
  commercialNotes: string | null;
  modules: string[];
  currentVersion: number;
  acceptedAt: string | Date | null;
  convertedAdministratorId: string | null;
  events: Array<{ id: string; description: string | null; createdAt: string | Date }>;
};

type MoneyField =
  | "monthlyPriceCents"
  | "implementationFeeCents"
  | "discountCents";

type FormData = {
  title: string;
  planId: string;
  monthlyPriceCents: number;
  implementationFeeCents: number;
  discountCents: number;
  discountPercent: number;
  validUntil: string;
  paymentTerms: string;
  commercialNotes: string;
  modules: string[];
  status: string;
};

const field =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const label = "mb-1 block text-sm font-semibold text-slate-700";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "SENT", label: "Enviada" },
  { value: "VIEWED", label: "Visualizada" },
  { value: "NEGOTIATION", label: "Em Negociação" },
  { value: "ACCEPTED", label: "Aceita" },
  { value: "REJECTED", label: "Recusada" },
  { value: "EXPIRED", label: "Expirada" },
  { value: "CANCELLED", label: "Cancelada" },
] as const;

function formatBRLFromCents(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((value ?? 0) / 100);
}

function digitsToBRL(value: string): string {
  const digits = value.replace(/\D/g, "");
  const cents = Number(digits || "0");
  return formatBRLFromCents(cents);
}

function brlToCents(value: string): number {
  const digits = value.replace(/\D/g, "");
  return Number(digits || "0");
}


function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }

  const trimmed = value.trim();
  if (!trimmed) return "";

  // ISO completo ou já no formato esperado pelo input date.
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function statusLabel(value: string): string {
  return STATUS_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export default function ProposalManager({
  leadId,
  initialProposal,
  plans,
}: {
  leadId: string;
  initialProposal: Proposal | null;
  plans: Plan[];
}) {
  const [proposal, setProposal] = useState(initialProposal);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  const [data, setData] = useState<FormData>({
    title: proposal?.title ?? "Proposta Comercial EloGest",
    planId: proposal?.planId ?? "",
    monthlyPriceCents: proposal?.monthlyPriceCents ?? 0,
    implementationFeeCents: proposal?.implementationFeeCents ?? 0,
    discountCents: proposal?.discountCents ?? 0,
    discountPercent: proposal?.discountPercent ?? 0,
    validUntil: toDateInputValue(proposal?.validUntil),
    paymentTerms: proposal?.paymentTerms ?? "",
    commercialNotes: proposal?.commercialNotes ?? "",
    modules: proposal?.modules ?? [],
    status: proposal?.status ?? "DRAFT",
  });

  const [moneyInputs, setMoneyInputs] = useState<Record<MoneyField, string>>({
    monthlyPriceCents: formatBRLFromCents(proposal?.monthlyPriceCents ?? 0),
    implementationFeeCents: formatBRLFromCents(
      proposal?.implementationFeeCents ?? 0,
    ),
    discountCents: formatBRLFromCents(proposal?.discountCents ?? 0),
  });

  const isAccepted = Boolean(proposal?.acceptedAt);
  const isConverted = Boolean(proposal?.convertedAdministratorId);
  const isLocked = isAccepted || isConverted;

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === data.planId),
    [plans, data.planId],
  );

  function setMoney(fieldName: MoneyField, typedValue: string) {
    if (isLocked) return;
    const formatted = digitsToBRL(typedValue);
    const cents = brlToCents(formatted);

    setMoneyInputs((current) => ({
      ...current,
      [fieldName]: formatted,
    }));

    setData((current) => ({
      ...current,
      [fieldName]: cents,
    }));
  }

  function selectPlan(planId: string) {
    if (isLocked) return;
    const plan = plans.find((item) => item.id === planId);
    const monthlyPriceCents = plan?.monthlyPriceCents ?? 0;

    setData((current) => ({
      ...current,
      planId,
      monthlyPriceCents,
      modules: plan?.modules.map((item) => item.module.name) ?? [],
    }));

    setMoneyInputs((current) => ({
      ...current,
      monthlyPriceCents: formatBRLFromCents(monthlyPriceCents),
    }));
  }

  async function save() {
    if (isLocked) {
      alert("A proposta aceita não pode mais ser alterada.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `/api/elogest/comercial/${leadId}/proposta`,
        {
          method: proposal ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Falha ao salvar.");
      }

      setProposal(result.proposal);

      if (result.publicToken) {
        setLink(
          `${window.location.origin}/comercial/proposta/${result.publicToken}`,
        );
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    if (isLocked) {
      alert("Não é possível gerar um novo link para uma proposta já aceita.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `/api/elogest/comercial/${leadId}/proposta`,
        { method: "PUT" },
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Falha ao gerar o link.");
      }

      const url = `${window.location.origin}/comercial/proposta/${result.publicToken}`;
      setLink(url);
      setCopyFeedback("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPublicLink() {
    if (!link) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = link;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

      setCopyFeedback("Link copiado!");
      window.setTimeout(() => setCopyFeedback(""), 2500);
    } catch {
      setCopyFeedback("Não foi possível copiar. Selecione o link manualmente.");
    }
  }

  async function convert() {
    if (!confirm("Converter este lead em administradora ativa?")) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `/api/elogest/comercial/${leadId}/proposta/converter`,
        { method: "POST" },
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Falha ao converter o lead.");
      }

      alert(`Conversão concluída. Administradora: ${result.administratorId}`);
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={label}>Título *</label>
            <input
              className={field}
              disabled={isLocked}
              value={data.title}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </div>

          <div>
            <label className={label}>Plano</label>
            <select
              className={field}
              disabled={isLocked}
              value={data.planId}
              onChange={(event) => selectPlan(event.target.value)}
            >
              <option value="">Selecione</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            {selectedPlan?.monthlyPriceCents != null && (
              <p className="mt-1 text-xs text-slate-500">
                Valor padrão do plano: {" "}
                {formatBRLFromCents(selectedPlan.monthlyPriceCents)}
              </p>
            )}
          </div>

          <div>
            <label className={label}>Mensalidade</label>
            <input
              type="text"
              inputMode="numeric"
              className={field}
              disabled={isLocked}
              value={moneyInputs.monthlyPriceCents}
              onChange={(event) =>
                setMoney("monthlyPriceCents", event.target.value)
              }
              placeholder="R$ 0,00"
              aria-label="Mensalidade em reais"
            />
          </div>

          <div>
            <label className={label}>Taxa De Implantação</label>
            <input
              type="text"
              inputMode="numeric"
              className={field}
              disabled={isLocked}
              value={moneyInputs.implementationFeeCents}
              onChange={(event) =>
                setMoney("implementationFeeCents", event.target.value)
              }
              placeholder="R$ 0,00"
              aria-label="Taxa de implantação em reais"
            />
          </div>

          <div>
            <label className={label}>Desconto Em Reais</label>
            <input
              type="text"
              inputMode="numeric"
              className={field}
              disabled={isLocked}
              value={moneyInputs.discountCents}
              onChange={(event) => setMoney("discountCents", event.target.value)}
              placeholder="R$ 0,00"
              aria-label="Desconto em reais"
            />
          </div>

          <div>
            <label className={label}>Desconto (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={field}
              disabled={isLocked}
              value={data.discountPercent}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  discountPercent: Math.min(
                    100,
                    Math.max(0, Number(event.target.value) || 0),
                  ),
                }))
              }
            />
          </div>

          <div>
            <label className={label}>Validade</label>
            <input
              type="date"
              className={field}
              disabled={isLocked}
              value={data.validUntil}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  validUntil: event.target.value,
                }))
              }
            />
          </div>

          <div>
            <label className={label}>Status</label>
            <select
              className={field}
              disabled={isLocked}
              value={data.status}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className={label}>Módulos Incluídos</label>
          <textarea
            className={field}
            disabled={isLocked}
            rows={4}
            value={data.modules.join("\n")}
            onChange={(event) =>
              setData((current) => ({
                ...current,
                modules: event.target.value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              }))
            }
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={label}>Condições De Pagamento</label>
            <textarea
              className={field}
              disabled={isLocked}
              rows={4}
              value={data.paymentTerms}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  paymentTerms: event.target.value,
                }))
              }
            />
          </div>

          <div>
            <label className={label}>Observações Comerciais</label>
            <textarea
              className={field}
              disabled={isLocked}
              rows={4}
              value={data.commercialNotes}
              onChange={(event) =>
                setData((current) => ({
                  ...current,
                  commercialNotes: event.target.value,
                }))
              }
            />
          </div>
        </div>

        {isLocked && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-950">
              {isConverted
                ? "Proposta convertida em administradora"
                : "Proposta aceita e bloqueada para edição"}
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              {isConverted
                ? "O fluxo comercial foi concluído. O PDF permanece disponível para consulta."
                : "Valores, plano, módulos e condições não podem mais ser alterados após o aceite formal."}
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {!isLocked && (
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {proposal ? "Salvar Nova Versão" : "Criar Proposta"}
            </button>
          )}

          {proposal && (
            <>
              {!isLocked && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={renew}
                  className="rounded-xl border border-emerald-700 px-5 py-3 font-semibold text-emerald-800 disabled:opacity-50"
                >
                  Gerar Link Seguro
                </button>
              )}

              <a
                href={`/api/elogest/comercial/${leadId}/proposta/pdf`}
                className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800"
              >
                Baixar PDF
              </a>

              {isAccepted && !isConverted && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={convert}
                  className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50"
                >
                  Converter Em Administradora
                </button>
              )}

              {isConverted && (
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-xl bg-slate-200 px-5 py-3 font-semibold text-slate-600"
                >
                  Administradora Convertida
                </button>
              )}
            </>
          )}
        </div>

        {link && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Link Público Seguro</p>
                <p className="mt-1 truncate text-sm text-emerald-950" title={link}>{link}</p>
              </div>
              <button
                type="button"
                onClick={copyPublicLink}
                className="shrink-0 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900"
              >
                Copiar Link
              </button>
            </div>
            {copyFeedback ? (
              <p className="mt-2 text-sm font-medium text-emerald-800" role="status">{copyFeedback}</p>
            ) : null}
          </div>
        )}
      </section>

      {proposal && (
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Status
            </span>
            <p className="mt-2 text-xl font-bold">
              {statusLabel(proposal.status)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Versão
            </span>
            <p className="mt-2 text-xl font-bold">
              {proposal.currentVersion}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <span className="text-xs font-semibold uppercase text-slate-500">
              Aceite
            </span>
            <p className="mt-2 text-xl font-bold">
              {proposal.acceptedAt ? "Confirmado" : "Pendente"}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
