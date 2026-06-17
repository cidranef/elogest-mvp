"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ETAPA 55.8 — AUDITORIA, LOGS E GOVERNANÇA DA IA

   Página:
   /admin/ia

   Objetivo:
   - Exibir usos da IA Operacional registrados em AiOperationLog.
   - Permitir filtros por data, módulo, ação, status e busca textual.
   - Reforçar governança: IA é assistiva e não executa ações críticas.
   ========================================================= */

type AiLogStatus = "SUCCESS" | "ERROR" | "SKIPPED" | string;

type AiOperationLogItem = {
  id: string;
  administratorId: string;
  userId?: string | null;
  module: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  promptVersion?: string | null;
  status: AiLogStatus;
  inputHash?: string | null;
  outputHash?: string | null;
  outputPreview?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
};

type AiLogsResponse = {
  ok?: boolean;
  generatedAt?: string;
  aiStatus?: {
    enabled?: boolean;
    provider?: string;
    reason?: string;
  };
  moduleEnabled?: boolean;
  moduleAccess?: {
    allowed?: boolean;
    source?: string;
    reason?: string;
  };
  logs?: AiOperationLogItem[];
  options?: {
    modules?: string[];
    actions?: string[];
    statuses?: string[];
  };
  kpis?: {
    totalLogs?: number;
    successLogs?: number;
    errorLogs?: number;
    skippedLogs?: number;
    filteredLogs?: number;
  };
  pagination?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
  error?: string;
};

type FiltersState = {
  q: string;
  module: string;
  action: string;
  status: string;
  startDate: string;
  endDate: string;
};

const defaultFilters: FiltersState = {
  q: "",
  module: "ALL",
  action: "ALL",
  status: "ALL",
  startDate: "",
  endDate: "",
};

function getApiErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: string }).error;

    if (error) return error;
  }

  return fallback;
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

function moduleLabel(value?: string | null) {
  const labels: Record<string, string> = {
    ia_operacional: "IA Operacional",
  };

  return labels[value || ""] || value || "-";
}

function actionLabel(value?: string | null) {
  const labels: Record<string, string> = {
    STATUS_CHECK: "Verificação De Status",
    DASHBOARD_OPERATIONAL_SUMMARY: "Resumo Do Dashboard",
    TICKET_SUMMARY: "Resumo De Chamado",
    TICKET_RESPONSE_SUGGESTION: "Sugestão De Resposta",
    TICKET_NEXT_ACTION: "Próxima Ação Do Chamado",
    TICKET_PRIORITY_ANALYSIS: "Priorização De Chamados",
    ANNOUNCEMENT_IMPROVE: "Melhorar Comunicado",
    ANNOUNCEMENT_SUMMARY: "Versão Resumida Do Comunicado",
    ANNOUNCEMENT_REMINDER: "Lembrete De Comunicado",
    FINANCIAL_EXECUTIVE_SUMMARY: "Resumo Financeiro",
    REPORTS_EXECUTIVE_SUMMARY: "Leitura De Relatórios",
  };

  return labels[value || ""] || value || "-";
}

function statusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    SUCCESS: "Sucesso",
    ERROR: "Erro",
    SKIPPED: "Fallback / Não Executada",
  };

  return labels[value || ""] || value || "-";
}

function statusClass(value?: string | null) {
  if (value === "SUCCESS") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (value === "ERROR") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (value === "SKIPPED") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function providerLabel(value?: string | null) {
  if (value === "openai") return "OpenAI";
  if (value === "none") return "Não Configurada";
  return value || "-";
}

function shortHash(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 12);
}

function userLabel(log: AiOperationLogItem) {
  if (log.user?.name) return log.user.name;
  if (log.user?.email) return log.user.email;
  if (log.userId) return "Usuário Registrado";
  return "Sistema / Serviço";
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
      <p className="mt-3 text-3xl font-semibold tracking-tight text-[#17211B]">
        {value}
      </p>
      <p className="mt-2 text-sm font-medium leading-5 text-[#5E6B63]">
        {description}
      </p>
    </div>
  );
}

export default function AdminIaGovernancaPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<AiLogsResponse>({});
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(defaultFilters);
  const [page, setPage] = useState(1);

  const pageSize = 30;

  const loadLogs = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        setError("");

        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });

        if (appliedFilters.q.trim()) params.set("q", appliedFilters.q.trim());
        if (appliedFilters.module !== "ALL") params.set("module", appliedFilters.module);
        if (appliedFilters.action !== "ALL") params.set("action", appliedFilters.action);
        if (appliedFilters.status !== "ALL") params.set("status", appliedFilters.status);
        if (appliedFilters.startDate) params.set("startDate", appliedFilters.startDate);
        if (appliedFilters.endDate) params.set("endDate", appliedFilters.endDate);

        const res = await fetch(`/api/admin/ia/logs?${params.toString()}`, {
          cache: "no-store",
        });
        const data: unknown = await res.json();

        if (!res.ok) {
          setPayload({});
          setError(getApiErrorMessage(data, "Erro ao carregar auditoria da IA."));
          return;
        }

        setPayload(data as AiLogsResponse);
      } catch (err) {
        console.error(err);
        setPayload({});
        setError("Erro ao carregar auditoria da IA.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [appliedFilters, page],
  );

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const logs = payload.logs || [];
  const kpis = payload.kpis || {};
  const pagination = payload.pagination || {};
  const options = payload.options || {};
  const aiStatus = payload.aiStatus || {};
  const moduleAccess = payload.moduleAccess || {};

  const hasFilters = useMemo(() => {
    return (
      appliedFilters.q.trim() !== "" ||
      appliedFilters.module !== "ALL" ||
      appliedFilters.action !== "ALL" ||
      appliedFilters.status !== "ALL" ||
      appliedFilters.startDate !== "" ||
      appliedFilters.endDate !== ""
    );
  }, [appliedFilters]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters(filters);
  }

  function clearFilters() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Auditoria Da IA"
        description="Consolidando logs de uso, fallback, erros e governança da IA Operacional."
      />
    );
  }

  return (
    <AdminContextGuard
      fallbackTitle="Governança da IA indisponível neste perfil de acesso"
      fallbackDescription="A auditoria da IA Operacional é exclusiva da área administrativa. Para acompanhar informações como síndico, morador, proprietário ou conselheiro, acesse o portal."
    >
      <AdminShell
        current="ia"
        title="IA Operacional"
        description="Auditoria, logs e governança dos usos assistivos da IA no EloGest."
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
                Governança Da IA
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Auditoria Da IA Operacional
              </h1>

              <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-[#5E6B63]">
                Acompanhe quando a IA foi usada, em qual módulo, qual ação foi
                solicitada, se houve fallback, erro ou geração bem-sucedida.
              </p>

              <p className="mt-2 text-xs text-[#7A877F]">
                Atualizado em {formatDateTime(payload.generatedAt)}.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadLogs({ showLoading: false })}
              disabled={refreshing}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-60"
            >
              {refreshing ? "Atualizando..." : "Atualizar Logs"}
            </button>
          </header>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="Total"
              value={kpis.totalLogs ?? 0}
              description="Registros históricos da IA nesta administradora."
            />
            <KpiCard
              label="Sucesso"
              value={kpis.successLogs ?? 0}
              description="Gerações concluídas com provedor de IA."
            />
            <KpiCard
              label="Fallback"
              value={kpis.skippedLogs ?? 0}
              description="Uso de regra segura ou execução não realizada."
            />
            <KpiCard
              label="Erros"
              value={kpis.errorLogs ?? 0}
              description="Falhas registradas para investigação técnica."
            />
            <KpiCard
              label="Filtrados"
              value={kpis.filteredLogs ?? logs.length}
              description="Registros conforme os filtros aplicados."
            />
          </section>

          <section className="rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
            <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-[#17211B]">
                    Estado Da Governança
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Esta visão registra rastreabilidade técnica e operacional. A IA
                    segue assistiva, sem execução automática de ações críticas.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[620px]">
                  <div className="rounded-2xl border border-[#CFE6D4] bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                      Módulo
                    </p>
                    <p className="mt-2 text-sm font-bold text-[#17211B]">
                      {moduleAccess.allowed ? "Liberado" : "Bloqueado"}
                    </p>
                    <p className="mt-1 text-xs text-[#5E6B63]">
                      Origem: {moduleAccess.source || "-"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                      Provedor
                    </p>
                    <p className="mt-2 text-sm font-bold text-[#17211B]">
                      {providerLabel(aiStatus.provider)}
                    </p>
                    <p className="mt-1 text-xs text-[#5E6B63]">
                      {aiStatus.enabled ? "IA configurada" : aiStatus.reason || "Sem provedor ativo"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                      Política
                    </p>
                    <p className="mt-2 text-sm font-bold text-[#17211B]">
                      Revisão Humana
                    </p>
                    <p className="mt-1 text-xs text-[#5E6B63]">
                      IA não executa ações automaticamente.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  O Que É Registrado
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  Módulo, ação, entidade relacionada, status, versão de prompt,
                  hashes de entrada/saída, prévia da resposta e erro quando houver.
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Privacidade
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  O log guarda hashes e prévias limitadas. O objetivo é auditoria,
                  não exposição integral dos dados enviados para análise.
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Uso Permitido
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  A IA apenas apoia leitura, redação, priorização e recomendações.
                  Decisões e ações permanecem sob responsabilidade humana.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Filtros De Auditoria
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                  Refine a consulta por período, módulo, ação, status ou busca textual.
                </p>
              </div>

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  Limpar Filtros
                </button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <input
                value={filters.q}
                onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="Buscar por ação, módulo, usuário, entidade ou erro..."
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white xl:col-span-2"
              />

              <select
                value={filters.module}
                onChange={(event) => setFilters((prev) => ({ ...prev, module: event.target.value }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white"
              >
                <option value="ALL">Todos Os Módulos</option>
                {(options.modules || []).map((item) => (
                  <option key={item} value={item}>
                    {moduleLabel(item)}
                  </option>
                ))}
              </select>

              <select
                value={filters.action}
                onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white"
              >
                <option value="ALL">Todas As Ações</option>
                {(options.actions || []).map((item) => (
                  <option key={item} value={item}>
                    {actionLabel(item)}
                  </option>
                ))}
              </select>

              <select
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white"
              >
                <option value="ALL">Todos Os Status</option>
                {(options.statuses || ["SUCCESS", "SKIPPED", "ERROR"]).map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={applyFilters}
                className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#174B2A]"
              >
                Aplicar
              </button>

              <input
                type="date"
                value={filters.startDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white"
                title="Data inicial"
              />

              <input
                type="date"
                value={filters.endDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white"
                title="Data final"
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white shadow-sm">
            <div className="border-b border-[#DDE5DF] bg-[#F9FBFA] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#17211B]">
                    Logs Da IA Operacional
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    Registros ordenados do mais recente para o mais antigo.
                  </p>
                </div>

                <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-bold text-[#5E6B63]">
                  Página {pagination.page || page} de {pagination.totalPages || 1}
                </span>
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="p-8 text-center">
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Nenhum Log Encontrado
                </h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#5E6B63]">
                  Ainda não há registros de IA para os filtros atuais. Gere uma
                  leitura assistiva em algum módulo ou amplie os filtros.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#EEF2EF]">
                {logs.map((log) => (
                  <article key={log.id} className="p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(log.status)}`}>
                            {statusLabel(log.status)}
                          </span>
                          <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-bold text-[#256D3C]">
                            {moduleLabel(log.module)}
                          </span>
                          <span className="rounded-full border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-1 text-xs font-bold text-[#5E6B63]">
                            {formatDateTime(log.createdAt)}
                          </span>
                        </div>

                        <h3 className="mt-3 text-lg font-semibold tracking-tight text-[#17211B]">
                          {actionLabel(log.action)}
                        </h3>

                        <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                          {userLabel(log)}
                          {log.user?.email ? ` • ${log.user.email}` : ""}
                          {log.entityType ? ` • ${log.entityType}` : ""}
                          {log.entityId ? ` • ${log.entityId}` : ""}
                        </p>

                        {log.outputPreview && (
                          <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                              Prévia Da Saída
                            </p>
                            <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                              {log.outputPreview}
                            </p>
                          </div>
                        )}

                        {log.errorMessage && (
                          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-red-700">
                              Erro / Motivo
                            </p>
                            <p className="mt-2 text-sm leading-6 text-red-700">
                              {log.errorMessage}
                            </p>
                          </div>
                        )}
                      </div>

                      <aside className="grid shrink-0 gap-3 text-sm sm:grid-cols-3 xl:w-[360px] xl:grid-cols-1">
                        <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                            Prompt
                          </p>
                          <p className="mt-1 break-words font-semibold text-[#17211B]">
                            {log.promptVersion || "-"}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                            Hash Entrada
                          </p>
                          <p className="mt-1 font-mono text-xs font-semibold text-[#17211B]">
                            {shortHash(log.inputHash)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                            Hash Saída
                          </p>
                          <p className="mt-1 font-mono text-xs font-semibold text-[#17211B]">
                            {shortHash(log.outputHash)}
                          </p>
                        </div>
                      </aside>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-[#DDE5DF] bg-[#F9FBFA] p-5 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-semibold text-[#5E6B63]">
                {pagination.total || 0} registro(s) encontrado(s).
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={(pagination.page || page) <= 1}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-50"
                >
                  Anterior
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(pagination.totalPages || current, current + 1))
                  }
                  disabled={(pagination.page || page) >= (pagination.totalPages || 1)}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          </section>
        </div>
      </AdminShell>
    </AdminContextGuard>
  );
}
