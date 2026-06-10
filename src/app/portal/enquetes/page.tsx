"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PortalContextGuard from "@/components/PortalContextGuard";
import PortalShell from "@/components/PortalShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   PORTAL - ENQUETES

   Arquivo:
   src/app/portal/enquetes/page.tsx

   ETAPA 50 — ENQUETES

   Objetivo:
   - Exibir enquetes disponíveis para o perfil ativo do usuário.
   - Permitir resposta pelo portal.
   - Separar enquetes abertas, respondidas e encerradas.
   - Exibir resultados somente quando a API permitir.

   Segurança:
   - A proteção real fica nas APIs do portal.
   - A página usa PortalContextGuard para proteção visual.
   - As APIs validam sessão, perfil ativo, condomínio/unidade/vínculo,
     status da enquete, plano/módulo e regra de público-alvo.

   Observação:
   - Enquetes são consultas operacionais/consultivas.
   - Votação formal de assembleia será tratada em módulo próprio.
   ========================================================= */



type PollType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "YES_NO" | "TEXT";

type PollStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "CLOSED"
  | "CANCELED"
  | "ARCHIVED";

type PollTargetScope =
  | "CONDOMINIUM"
  | "BLOCK"
  | "UNIT"
  | "ROLE"
  | "LINK_TYPE"
  | "GOVERNANCE"
  | "CUSTOM";

type PollResultVisibility =
  | "ADMIN_ONLY"
  | "PARTICIPANTS_AFTER_RESPONSE"
  | "PARTICIPANTS_AFTER_CLOSED"
  | "PUBLIC_TO_TARGET"
  | "AFTER_RESPONSE"
  | "AFTER_CLOSE"
  | "PUBLIC_TO_TARGETS";

type PollResponseStatus = "NOT_RESPONDED" | "RESPONDED";

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

interface PollOptionItem {
  id: string;
  label: string;
  order: number;
  _count?: {
    responseOptions?: number;
  };
}

interface PollResultItem {
  optionId: string;
  label: string;
  order: number;
  total: number;
  percentage: number;
}

interface PollResponseItem {
  id: string;
  textAnswer?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  options?: {
    id: string;
    option?: {
      id: string;
      label: string;
      order: number;
    } | null;
  }[];
}

interface PollListItem {
  id: string;
  title: string;
  description?: string | null;
  type: PollType | string;
  status: PollStatus | string;
  targetScope: PollTargetScope | string;
  resultVisibility?: PollResultVisibility | string | null;
  allowResponseUpdate?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  publishedAt?: string | null;
  closedAt?: string | null;
  resultsPublishedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  condominium?: {
    id: string;
    name: string;
  } | null;
  createdByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  options?: PollOptionItem[];
  responseStatus?: PollResponseStatus | string;
  userResponse?: PollResponseItem | null;
  canRespond?: boolean;
  canViewResults?: boolean;
  results?: PollResultItem[];
  totalResponses?: number;
  _count?: {
    responses?: number;
    options?: number;
    targets?: number;
  };
}

interface PollDetailResponse {
  poll?: PollListItem;
  canRespond?: boolean;
  canViewResults?: boolean;
  userResponse?: PollResponseItem | null;
  results?: PollResultItem[];
  totalResponses?: number;
  error?: string;
  message?: string;
}

interface PollsListResponse {
  polls?: PollListItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  kpis?: {
    totalOpen?: number;
    totalResponded?: number;
    totalClosed?: number;
    totalAvailable?: number;
  };
  error?: string;
  message?: string;
}

interface FiltersState {
  q: string;
  status: "ALL" | "OPEN" | "RESPONDED" | "CLOSED";
}

interface AnswerState {
  selectedOptionId: string;
  selectedOptionIds: string[];
  textAnswer: string;
}

const defaultFilters: FiltersState = {
  q: "",
  status: "ALL",
};

const emptyAnswer: AnswerState = {
  selectedOptionId: "",
  selectedOptionIds: [],
  textAnswer: "",
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

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function excerpt(value?: string | null, maxLength = 150) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Sem descrição adicional.";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function pollTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    SINGLE_CHOICE: "Escolha Única",
    MULTIPLE_CHOICE: "Múltipla Escolha",
    YES_NO: "Sim / Não",
    TEXT: "Resposta Aberta",
  };

  return labels[type || ""] || type || "-";
}

function pollStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho",
    PUBLISHED: "Aberta",
    CLOSED: "Encerrada",
    CANCELED: "Cancelada",
    ARCHIVED: "Arquivada",
  };

  return labels[status || ""] || status || "-";
}

function pollStatusClass(status?: string | null) {
  const classes: Record<string, string> = {
    DRAFT: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    PUBLISHED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    CLOSED: "border-blue-200 bg-blue-50 text-blue-700",
    CANCELED: "border-red-200 bg-red-50 text-red-700",
    ARCHIVED: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return classes[status || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function targetScopeLabel(scope?: string | null) {
  const labels: Record<string, string> = {
    CONDOMINIUM: "Todo O Condomínio",
    BLOCK: "Bloco",
    UNIT: "Unidade",
    ROLE: "Perfil De Acesso",
    LINK_TYPE: "Tipo De Vínculo",
    GOVERNANCE: "Síndico E Conselho",
    CUSTOM: "Personalizado",
  };

  return labels[scope || ""] || scope || "-";
}

function resultVisibilityLabel(visibility?: string | null) {
  const labels: Record<string, string> = {
    ADMIN_ONLY: "Somente Administradora",
    PARTICIPANTS_AFTER_RESPONSE: "Após Responder",
    PARTICIPANTS_AFTER_CLOSED: "Após Encerramento",
    PUBLIC_TO_TARGET: "Público-Alvo",

    /* Compatibilidade com versões intermediárias da Etapa 50. */
    AFTER_RESPONSE: "Após Responder",
    AFTER_CLOSE: "Após Encerramento",
    PUBLIC_TO_TARGETS: "Público-Alvo",
  };

  return labels[visibility || ""] || "-";
}

function responseStatusLabel(poll: PollListItem) {
  if (poll.responseStatus === "RESPONDED" || poll.userResponse) {
    return "Respondida";
  }

  if (poll.status === "PUBLISHED" && poll.canRespond !== false) {
    return "Pendente";
  }

  return "Não Disponível";
}

function responseStatusClass(poll: PollListItem) {
  if (poll.responseStatus === "RESPONDED" || poll.userResponse) {
    return "border-[#CFE6D4] bg-[#F6FFF8] text-[#256D3C]";
  }

  if (poll.status === "PUBLISHED" && poll.canRespond !== false) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-[#DDE5DF] bg-[#F9FBFA] text-[#7A877F]";
}

function canSubmitAnswer(poll: PollListItem | null, answer: AnswerState) {
  if (!poll || poll.canRespond === false || poll.status !== "PUBLISHED") {
    return false;
  }

  if (poll.type === "TEXT") {
    return answer.textAnswer.trim().length >= 2;
  }

  if (poll.type === "MULTIPLE_CHOICE") {
    return answer.selectedOptionIds.length > 0;
  }

  return Boolean(answer.selectedOptionId);
}

function buildAnswerPayload(poll: PollListItem, answer: AnswerState) {
  if (poll.type === "TEXT") {
    return {
      textAnswer: answer.textAnswer.trim(),
    };
  }

  if (poll.type === "MULTIPLE_CHOICE") {
    return {
      optionIds: answer.selectedOptionIds,
    };
  }

  return {
    optionId: answer.selectedOptionId,
  };
}

function describeUserResponse(response?: PollResponseItem | null) {
  if (!response) {
    return "Você ainda não respondeu esta enquete.";
  }

  if (response.textAnswer) {
    return response.textAnswer;
  }

  const labels = response.options
    ?.map((item) => item.option?.label)
    .filter((label): label is string => Boolean(label));

  if (labels && labels.length > 0) {
    return labels.join(", ");
  }

  return "Resposta registrada.";
}

function getPollTimeState(poll: PollListItem) {
  if (poll.status !== "PUBLISHED") {
    return pollStatusLabel(poll.status);
  }

  const now = Date.now();
  const startsAt = poll.startsAt ? new Date(poll.startsAt).getTime() : null;
  const endsAt = poll.endsAt ? new Date(poll.endsAt).getTime() : null;

  if (startsAt && !Number.isNaN(startsAt) && startsAt > now) {
    return `Abre em ${formatDateTime(poll.startsAt)}`;
  }

  if (endsAt && !Number.isNaN(endsAt) && endsAt < now) {
    return "Prazo encerrado";
  }

  if (endsAt && !Number.isNaN(endsAt)) {
    return `Aberta até ${formatDateTime(poll.endsAt)}`;
  }

  return "Aberta para resposta";
}



/* =========================================================
   COMPONENTES DE APOIO
   ========================================================= */

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

function EmptyState() {
  return (
    <section className="rounded-[28px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#EAF7EE] text-2xl">
        ◉
      </div>

      <h2 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">
        Nenhuma enquete disponível
      </h2>

      <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
        Quando houver uma nova consulta aberta para o seu perfil de acesso,
        ela aparecerá aqui para resposta e acompanhamento.
      </p>
    </section>
  );
}

function ResultsBlock({
  results,
  totalResponses,
}: {
  results: PollResultItem[];
  totalResponses: number;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#5E6B63]">
        Resultado ainda não disponível ou sem respostas registradas.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#5E6B63]">
        Total de respostas consideradas: {totalResponses}
      </div>

      {results.map((result) => (
        <div
          key={result.optionId}
          className="rounded-2xl border border-[#DDE5DF] bg-white p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#17211B]">
              {result.label}
            </p>

            <p className="text-sm font-bold text-[#256D3C]">
              {result.total} voto(s) • {result.percentage}%
            </p>
          </div>

          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#EEF2EF]">
            <div
              className="h-full rounded-full bg-[#256D3C]"
              style={{ width: `${Math.min(Math.max(result.percentage, 0), 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function PortalEnquetesPage() {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [polls, setPolls] = useState<PollListItem[]>([]);
  const [pagination, setPagination] = useState<PollsListResponse["pagination"]>();
  const [kpis, setKpis] = useState<NonNullable<PollsListResponse["kpis"]>>({});
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(defaultFilters);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState<PollListItem | null>(null);
  const [answer, setAnswer] = useState<AnswerState>(emptyAnswer);
  const notificationPollIdHandledRef = useRef<string | null>(null);



  /* =========================================================
     CARREGAMENTO
     ========================================================= */

  const loadPolls = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        setError("");

        const params = new URLSearchParams();

        if (appliedFilters.q.trim()) {
          params.set("q", appliedFilters.q.trim());
        }

        if (appliedFilters.status !== "ALL") {
          params.set("status", appliedFilters.status);
        }

        const query = params.toString();
        const res = await fetch(`/api/portal/enquetes${query ? `?${query}` : ""}`, {
          cache: "no-store",
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          setPolls([]);
          setPagination(undefined);
          setKpis({});
          setError(getApiErrorMessage(data, "Erro ao carregar enquetes."));
          return;
        }

        const payload = data as PollsListResponse;

        setPolls(Array.isArray(payload.polls) ? payload.polls : []);
        setPagination(payload.pagination);
        setKpis(payload.kpis || {});
      } catch (err) {
        console.error(err);
        setPolls([]);
        setPagination(undefined);
        setKpis({});
        setError("Erro ao carregar enquetes.");
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [appliedFilters],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPolls();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadPolls]);



  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const computedMetrics = useMemo(() => {
    const total = pagination?.total ?? polls.length;
    const open = kpis.totalOpen ?? polls.filter((poll) => poll.status === "PUBLISHED").length;
    const responded =
      kpis.totalResponded ??
      polls.filter((poll) => poll.responseStatus === "RESPONDED" || poll.userResponse).length;
    const closed =
      kpis.totalClosed ??
      polls.filter((poll) => poll.status === "CLOSED" || poll.status === "CANCELED").length;
    const pending = polls.filter(
      (poll) => poll.status === "PUBLISHED" && poll.responseStatus !== "RESPONDED" && !poll.userResponse,
    ).length;

    return {
      total,
      open,
      responded,
      closed,
      pending,
    };
  }, [kpis, pagination, polls]);

  const canSubmit = canSubmitAnswer(selectedPoll, answer);



  /* =========================================================
     AÇÕES
     ========================================================= */

  function applyFilters() {
    setAppliedFilters(filters);
  }

  function clearFilters() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  }

  function toggleMultipleOption(optionId: string) {
    setAnswer((prev) => {
      const exists = prev.selectedOptionIds.includes(optionId);

      return {
        ...prev,
        selectedOptionIds: exists
          ? prev.selectedOptionIds.filter((id) => id !== optionId)
          : [...prev.selectedOptionIds, optionId],
      };
    });
  }

  const openPollDetailById = useCallback(
    async (pollId: string, fallbackPoll?: PollListItem | null) => {
      try {
        setDetailOpen(true);
        setDetailLoading(true);
        setSelectedPoll(fallbackPoll || null);
        setAnswer(emptyAnswer);
        setError("");
        setSuccess("");

        const res = await fetch(`/api/portal/enquetes/${pollId}`, {
          cache: "no-store",
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          setDetailOpen(false);
          setSelectedPoll(null);
          alert(getApiErrorMessage(data, "Erro ao carregar enquete."));
          return;
        }

        const payload = data as PollDetailResponse;
        const detail = payload.poll || fallbackPoll || null;

        if (!detail) {
          setDetailOpen(false);
          setSelectedPoll(null);
          alert("Não foi possível carregar os dados da enquete.");
          return;
        }

        const userResponse = payload.userResponse || detail.userResponse || null;

        setSelectedPoll({
          ...detail,
          canRespond: payload.canRespond ?? detail.canRespond,
          canViewResults: payload.canViewResults ?? detail.canViewResults,
          userResponse,
          results: payload.results || detail.results || [],
          totalResponses: payload.totalResponses ?? detail.totalResponses ?? 0,
        });
      } catch (err) {
        console.error(err);
        setDetailOpen(false);
        setSelectedPoll(null);
        alert("Erro ao carregar enquete.");
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  function openPollDetail(poll: PollListItem) {
    return openPollDetailById(poll.id, poll);
  }

  /* =========================================================
     ABERTURA DIRETA A PARTIR DA NOTIFICAÇÃO

     A notificação usa /portal/enquetes?pollId=... porque a
     experiência aprovada desta página abre a enquete em modal.
     Isso evita depender de uma rota visual /portal/enquetes/[id].
     ========================================================= */

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const pollId = new URLSearchParams(window.location.search).get("pollId");

      if (!pollId || notificationPollIdHandledRef.current === pollId) {
        return;
      }

      notificationPollIdHandledRef.current = pollId;

      const fallbackPoll = polls.find((poll) => poll.id === pollId) || null;
      void openPollDetailById(pollId, fallbackPoll);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [openPollDetailById, polls]);


  function closeDetail() {
    if (saving || detailLoading) {
      return;
    }

    setDetailOpen(false);
    setSelectedPoll(null);
    setAnswer(emptyAnswer);
  }

  async function submitAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPoll || !canSubmit) {
      alert("Revise sua resposta antes de enviar.");
      return;
    }

    if (!confirm("Deseja registrar sua resposta nesta enquete?")) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/portal/enquetes/${selectedPoll.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildAnswerPayload(selectedPoll, answer)),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao registrar resposta."));
        return;
      }

      const payload = data as PollDetailResponse;

      setSelectedPoll((current) =>
        current
          ? {
              ...current,
              userResponse: payload.userResponse || payload.poll?.userResponse || current.userResponse,
              responseStatus: "RESPONDED",
              canRespond: payload.canRespond ?? false,
              canViewResults: payload.canViewResults ?? current.canViewResults,
              results: payload.results || current.results || [],
              totalResponses: payload.totalResponses ?? current.totalResponses ?? 0,
            }
          : current,
      );

      setAnswer(emptyAnswer);
      setSuccess("Resposta registrada com sucesso.");
      await loadPolls({ showLoading: false });
      window.dispatchEvent(new Event("elogest:polls-updated"));
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar resposta.");
    } finally {
      setSaving(false);
    }
  }



  /* =========================================================
     ESTADO DE CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Enquetes"
        description="Preparando as consultas disponíveis para o seu perfil de acesso..."
      />
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <PortalContextGuard
      fallbackTitle="Enquetes indisponíveis neste perfil de acesso"
      fallbackDescription="As enquetes são exibidas conforme o condomínio, unidade, vínculo e perfil ativo. Troque o perfil de acesso caso esteja procurando enquetes de outro vínculo."
    >
      <PortalShell
        title="Enquetes"
        description="Responda consultas abertas para o seu condomínio e acompanhe os resultados quando estiverem disponíveis."
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
                Consulta Condominial
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Enquetes Do Condomínio
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                Participe de consultas rápidas, registre sua opinião e acompanhe
                decisões operacionais quando os resultados estiverem liberados.
              </p>
            </div>
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
            <KpiCard
              label="Disponíveis"
              value={computedMetrics.total}
              description="Enquetes encontradas para o seu perfil ativo."
            />

            <KpiCard
              label="Abertas"
              value={computedMetrics.open}
              description="Consultas atualmente abertas para participação."
            />

            <KpiCard
              label="Pendentes"
              value={computedMetrics.pending}
              description="Enquetes abertas que ainda aguardam sua resposta."
            />

            <KpiCard
              label="Respondidas"
              value={computedMetrics.responded}
              description="Respostas registradas por você neste perfil."
            />
          </section>

          <section className="overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
              <input
                type="search"
                value={filters.q}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    q: event.target.value,
                  }))
                }
                placeholder="Buscar por título ou descrição..."
                className="h-11 w-full min-w-0 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              />

              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: event.target.value as FiltersState["status"],
                  }))
                }
                className="h-11 w-full min-w-0 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              >
                <option value="ALL">Todas As Enquetes</option>
                <option value="OPEN">Abertas</option>
                <option value="RESPONDED">Respondidas</option>
                <option value="CLOSED">Encerradas</option>
              </select>

              <div className="flex min-w-0 gap-2 md:justify-end">
                <button
                  type="button"
                  onClick={applyFilters}
                  className="inline-flex h-11 min-w-[104px] items-center justify-center rounded-2xl bg-[#17211B] px-4 text-sm font-semibold text-white transition hover:bg-[#256D3C]"
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
            </div>
          </section>

          {polls.length === 0 ? (
            <EmptyState />
          ) : (
            <section className="grid gap-4 xl:grid-cols-2">
              {polls.map((poll) => {
                const responded = poll.responseStatus === "RESPONDED" || Boolean(poll.userResponse);
                const totalResponses = poll.totalResponses ?? poll._count?.responses ?? 0;

                return (
                  <article
                    key={poll.id}
                    className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)] transition hover:border-[#CFE6D4]"
                  >
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${pollStatusClass(poll.status)}`}>
                        {pollStatusLabel(poll.status)}
                      </span>

                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${responseStatusClass(poll)}`}>
                        {responseStatusLabel(poll)}
                      </span>

                      <span className="inline-flex rounded-full border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-1 text-xs font-bold text-[#5E6B63]">
                        {pollTypeLabel(poll.type)}
                      </span>
                    </div>

                    <h2 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">
                      {poll.title}
                    </h2>

                    <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                      {excerpt(poll.description)}
                    </p>

                    <div className="mt-4 grid gap-3 text-sm font-medium text-[#5E6B63] md:grid-cols-2">
                      <div className="rounded-2xl bg-[#F6F8F7] p-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                          Condomínio
                        </p>
                        <p className="mt-1 font-semibold text-[#17211B]">
                          {poll.condominium?.name || "Condomínio"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#F6F8F7] p-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                          Público-Alvo
                        </p>
                        <p className="mt-1 font-semibold text-[#17211B]">
                          {targetScopeLabel(poll.targetScope)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#F6F8F7] p-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                          Prazo
                        </p>
                        <p className="mt-1 font-semibold text-[#17211B]">
                          {getPollTimeState(poll)}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#F6F8F7] p-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                          Participação
                        </p>
                        <p className="mt-1 font-semibold text-[#17211B]">
                          {responded ? "Sua resposta foi registrada" : `${totalResponses} resposta(s)`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void openPollDetail(poll)}
                        className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.18)] transition hover:bg-[#174B2A]"
                      >
                        {responded ? "Ver Enquete" : "Responder"}
                      </button>

                      {poll.canViewResults && (
                        <button
                          type="button"
                          onClick={() => void openPollDetail(poll)}
                          className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-[#F6FFF8] px-5 text-sm font-semibold text-[#256D3C] transition hover:border-[#256D3C]"
                        >
                          Ver Resultado
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>

        {detailOpen && selectedPoll && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/70 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl">
              <div className="flex flex-col gap-4 border-b border-[#DDE5DF] pb-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
                    {pollTypeLabel(selectedPoll.type)}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {selectedPoll.title}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                    {selectedPoll.description || "Sem descrição adicional."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeDetail}
                  disabled={detailLoading || saving}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Fechar enquete"
                >
                  ×
                </button>
              </div>

              {detailLoading ? (
                <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-5 text-sm font-semibold text-[#5E6B63]">
                  Carregando detalhes da enquete...
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="min-w-0 rounded-2xl bg-[#F6F8F7] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                        Status
                      </p>
                      <p className="mt-1 font-semibold text-[#17211B]">
                        {pollStatusLabel(selectedPoll.status)}
                      </p>
                    </div>

                    <div className="min-w-0 rounded-2xl bg-[#F6F8F7] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                        Público
                      </p>
                      <p className="mt-1 font-semibold text-[#17211B]">
                        {targetScopeLabel(selectedPoll.targetScope)}
                      </p>
                    </div>

                    <div className="min-w-0 rounded-2xl bg-[#F6F8F7] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                        Prazo
                      </p>
                      <p className="mt-1 font-semibold text-[#17211B]">
                        {getPollTimeState(selectedPoll)}
                      </p>
                    </div>

                    <div className="min-w-0 rounded-2xl bg-[#F6F8F7] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                        Resultado
                      </p>
                      <p
                        className="mt-1 max-w-full break-words text-sm font-semibold leading-5 text-[#17211B]"
                        title={resultVisibilityLabel(selectedPoll.resultVisibility)}
                      >
                        {resultVisibilityLabel(selectedPoll.resultVisibility)}
                      </p>
                    </div>
                  </div>

                  {selectedPoll.userResponse && (
                    <section className="rounded-3xl border border-[#CFE6D4] bg-[#F6FFF8] p-5">
                      <p className="text-sm font-bold text-[#256D3C]">
                        Sua resposta já foi registrada
                      </p>
                      <p className="mt-2 text-sm font-medium leading-6 text-[#255D37]">
                        {describeUserResponse(selectedPoll.userResponse)}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-[#5E6B63]">
                        Registrada em {formatDateTime(selectedPoll.userResponse.createdAt)}
                      </p>
                    </section>
                  )}

                  {!selectedPoll.userResponse && selectedPoll.canRespond !== false && selectedPoll.status === "PUBLISHED" && (
                    <form
                      onSubmit={(event) => void submitAnswer(event)}
                      className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-5"
                    >
                      <p className="text-sm font-bold text-[#17211B]">
                        Registrar Resposta
                      </p>

                      {selectedPoll.type === "TEXT" ? (
                        <textarea
                          value={answer.textAnswer}
                          onChange={(event) =>
                            setAnswer((prev) => ({
                              ...prev,
                              textAnswer: event.target.value,
                            }))
                          }
                          rows={5}
                          placeholder="Digite sua resposta..."
                          className="mt-3 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                        />
                      ) : (
                        <div className="mt-3 space-y-3">
                          {(selectedPoll.options || []).map((option) => {
                            const checked =
                              selectedPoll.type === "MULTIPLE_CHOICE"
                                ? answer.selectedOptionIds.includes(option.id)
                                : answer.selectedOptionId === option.id;

                            return (
                              <label
                                key={option.id}
                                className={[
                                  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
                                  checked
                                    ? "border-[#256D3C] bg-[#EAF7EE]"
                                    : "border-[#DDE5DF] bg-white hover:border-[#CFE6D4]",
                                ].join(" ")}
                              >
                                <input
                                  type={selectedPoll.type === "MULTIPLE_CHOICE" ? "checkbox" : "radio"}
                                  name="poll-option"
                                  checked={checked}
                                  onChange={() => {
                                    if (selectedPoll.type === "MULTIPLE_CHOICE") {
                                      toggleMultipleOption(option.id);
                                      return;
                                    }

                                    setAnswer((prev) => ({
                                      ...prev,
                                      selectedOptionId: option.id,
                                    }));
                                  }}
                                  className="mt-1 h-4 w-4 accent-[#256D3C]"
                                />

                                <span className="text-sm font-semibold leading-6 text-[#17211B]">
                                  {option.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-medium leading-5 text-[#7A877F]">
                          Sua resposta será vinculada ao seu perfil ativo para preservar a rastreabilidade da consulta.
                        </p>

                        <button
                          type="submit"
                          disabled={!canSubmit || saving}
                          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {saving ? "Registrando..." : "Enviar Resposta"}
                        </button>
                      </div>
                    </form>
                  )}

                  {selectedPoll.canViewResults ? (
                    <section className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-5">
                      <div className="mb-4">
                        <p className="text-sm font-bold text-[#17211B]">
                          Resultado Publicado
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#5E6B63]">
                          Exibido após a publicação oficial pela administradora.
                        </p>
                        {selectedPoll.resultsPublishedAt && (
                          <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                            Publicado em {formatDateTime(selectedPoll.resultsPublishedAt)}
                          </p>
                        )}
                      </div>

                      <ResultsBlock
                        results={selectedPoll.results || []}
                        totalResponses={selectedPoll.totalResponses ?? 0}
                      />
                    </section>
                  ) : (
                    <section className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-5">
                      <p className="text-sm font-bold text-[#17211B]">
                        Resultado Ainda Não Publicado
                      </p>
                      <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                        O resultado ficará disponível após a publicação oficial pela administradora, respeitando a regra de visibilidade definida para esta consulta.
                      </p>
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </PortalShell>
    </PortalContextGuard>
  );
}
