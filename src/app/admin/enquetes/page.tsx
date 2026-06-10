"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ENQUETES - PÁGINA ADMINISTRATIVA

   Arquivo:
   src/app/admin/enquetes/page.tsx

   ETAPA 50 — ENQUETES

   Objetivo:
   - Listar enquetes da administradora ativa.
   - Criar enquete como rascunho ou publicada.
   - Publicar, encerrar, prorrogar, cancelar e arquivar enquetes.
   - Publicar oficialmente resultados após o encerramento.
   - Destacar enquetes vencidas que aguardam decisão administrativa.
   - Consultar detalhe, resultados e histórico.

   Segurança:
   - A proteção real fica nas APIs.
   - A página usa AdminContextGuard para proteção visual.
   - As APIs exigem perfil ativo ADMINISTRADORA, administradora ativa
     e módulo comercial Enquetes liberado.

   Decisão de produto:
   - Enquete é consulta/opinião operacional.
   - Votação formal de assembleia fica reservada para a etapa própria.
   ========================================================= */

type PollType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "YES_NO" | "TEXT";
type PollStatus = "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED" | "CANCELED";
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
  | "PUBLIC_TO_TARGET";
type AccessRole = "SINDICO" | "MORADOR" | "PROPRIETARIO" | "CONSELHEIRO";
type UnitPersonLinkType =
  | "OWNER"
  | "RESIDENT"
  | "TENANT"
  | "DEPENDENT"
  | "AUTHORIZED";
type PollAction =
  | "PUBLISH"
  | "CLOSE"
  | "ARCHIVE"
  | "CANCEL"
  | "REOPEN"
  | "EXTEND"
  | "PUBLISH_RESULTS";

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

interface Condominio {
  id: string;
  name: string;
  status?: string | null;
}

interface PollOptionItem {
  id?: string;
  label: string;
  description?: string | null;
  order: number;
  isActive?: boolean;
}

interface PollTargetItem {
  id?: string;
  condominiumId?: string | null;
  unitId?: string | null;
  block?: string | null;
  role?: string | null;
  linkType?: string | null;
  unit?: {
    id: string;
    block?: string | null;
    unitNumber?: string | null;
  } | null;
}

interface PollResponseItem {
  id: string;
  textAnswer?: string | null;
  submittedAt: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  userAccess?: {
    id: string;
    role?: string | null;
    label?: string | null;
  } | null;
  selectedOption?: {
    id: string;
    label: string;
    order?: number | null;
  } | null;
  selectedOptions?: {
    id?: string;
    option?: {
      id: string;
      label: string;
      order?: number | null;
    } | null;
  }[];
}

interface PollLogItem {
  id: string;
  action: string;
  message?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

interface PollListItem {
  id: string;
  title: string;
  description?: string | null;
  type: PollType | string;
  status: PollStatus | string;
  targetScope: PollTargetScope | string;
  resultVisibility: PollResultVisibility | string;
  startsAt?: string | null;
  endsAt?: string | null;
  publishedAt?: string | null;
  closedAt?: string | null;
  archivedAt?: string | null;
  canceledAt?: string | null;
  resultsPublishedAt?: string | null;
  resultsPublishedByUserId?: string | null;
  adminExpiryReminderSentAt?: string | null;
  resultsPublishedByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  allowResponseUpdate: boolean;
  anonymousResults: boolean;
  requireEligibleVoter: boolean;
  createdAt: string;
  updatedAt: string;
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
  targets?: PollTargetItem[];
  responses?: PollResponseItem[];
  logs?: PollLogItem[];
  _count?: {
    responses?: number;
    targets?: number;
    logs?: number;
    notifications?: number;
  };
}

interface PollResults {
  totalResponses?: number;
  optionCounts?: {
    optionId: string;
    total: number;
  }[];
}

interface PollsResponse {
  polls?: PollListItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  kpis?: {
    totalDraft?: number;
    totalPublished?: number;
    totalClosed?: number;
    totalArchived?: number;
    totalCanceled?: number;
    totalResponses?: number;
  };
  error?: string;
}

interface PollDetailResponse {
  poll?: PollListItem;
  results?: PollResults;
  error?: string;
  message?: string;
}

interface PollFormState {
  title: string;
  description: string;
  condominiumId: string;
  type: PollType;
  status: "DRAFT" | "PUBLISHED";
  targetScope: PollTargetScope;
  resultVisibility: PollResultVisibility;
  startsAt: string;
  endsAt: string;
  block: string;
  role: "" | AccessRole;
  linkType: "" | UnitPersonLinkType;
  allowResponseUpdate: boolean;
  anonymousResults: boolean;
  requireEligibleVoter: boolean;
  options: string[];
}

interface FiltersState {
  q: string;
  condominiumId: string;
  status: "ALL" | PollStatus;
  type: "ALL" | PollType;
  targetScope: "ALL" | PollTargetScope;
}

const emptyForm: PollFormState = {
  title: "",
  description: "",
  condominiumId: "",
  type: "SINGLE_CHOICE",
  status: "DRAFT",
  targetScope: "CONDOMINIUM",
  resultVisibility: "ADMIN_ONLY",
  startsAt: "",
  endsAt: "",
  block: "",
  role: "",
  linkType: "",
  allowResponseUpdate: false,
  anonymousResults: true,
  requireEligibleVoter: false,
  options: ["", ""],
};

const defaultFilters: FiltersState = {
  q: "",
  condominiumId: "",
  status: "ALL",
  type: "ALL",
  targetScope: "ALL",
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

function normalizeDateTimeForApi(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.getTime() - offsetMs);

  return localDate.toISOString().slice(0, 16);
}

function getCreateFormValidationMessage(form: PollFormState) {
  if (form.title.trim().length < 3)
    return "Informe um título com pelo menos 3 caracteres.";
  if (!form.condominiumId) return "Selecione o condomínio da enquete.";

  if (form.status === "PUBLISHED" && form.endsAt) {
    const end = new Date(form.endsAt);
    if (!Number.isNaN(end.getTime()) && end <= new Date()) {
      return "O prazo final deve ser posterior ao horário atual para publicar a enquete.";
    }
  }

  if (form.startsAt && form.endsAt) {
    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end <= start
    ) {
      return "O prazo final deve ser posterior ao início da enquete.";
    }
  }

  if (form.targetScope === "BLOCK" && !form.block.trim())
    return "Informe o bloco do público-alvo.";
  if (form.targetScope === "ROLE" && !form.role)
    return "Selecione o perfil de acesso do público-alvo.";
  if (form.targetScope === "LINK_TYPE" && !form.linkType)
    return "Selecione o tipo de vínculo do público-alvo.";

  if (form.type === "SINGLE_CHOICE" || form.type === "MULTIPLE_CHOICE") {
    const validOptions = form.options
      .map((item) => item.trim())
      .filter(Boolean);
    if (validOptions.length < 2)
      return "Informe pelo menos duas opções de resposta.";
  }

  return "";
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
  const normalized = (value || "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "Sem descrição informada.";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho",
    PUBLISHED: "Publicada",
    CLOSED: "Encerrada",
    ARCHIVED: "Arquivada",
    CANCELED: "Cancelada",
  };

  return labels[status || ""] || status || "-";
}

function statusClass(status?: string | null) {
  const classes: Record<string, string> = {
    DRAFT: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    PUBLISHED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    CLOSED: "border-blue-200 bg-blue-50 text-blue-700",
    ARCHIVED: "border-amber-200 bg-amber-50 text-amber-700",
    CANCELED: "border-red-200 bg-red-50 text-red-700",
  };

  return classes[status || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]";
}


function isPollAwaitingDecision(poll: PollListItem) {
  if (poll.status !== "PUBLISHED" || !poll.endsAt) {
    return false;
  }

  const endsAt = new Date(poll.endsAt);

  return !Number.isNaN(endsAt.getTime()) && endsAt <= new Date();
}

function typeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    SINGLE_CHOICE: "Escolha Única",
    MULTIPLE_CHOICE: "Múltipla Escolha",
    YES_NO: "Sim / Não",
    TEXT: "Resposta Aberta",
  };

  return labels[type || ""] || type || "-";
}

function targetScopeLabel(scope?: string | null) {
  const labels: Record<string, string> = {
    CONDOMINIUM: "Condomínio",
    BLOCK: "Bloco",
    UNIT: "Unidade",
    ROLE: "Perfil De Acesso",
    LINK_TYPE: "Tipo De Vínculo",
    GOVERNANCE: "Síndico E Conselho",
    CUSTOM: "Personalizado",
  };

  return labels[scope || ""] || scope || "-";
}

function resultVisibilityLabel(value?: string | null) {
  const labels: Record<string, string> = {
    ADMIN_ONLY: "Somente Administradora",
    PARTICIPANTS_AFTER_RESPONSE: "Participantes Após Responder",
    PARTICIPANTS_AFTER_CLOSED: "Participantes Após Encerrar",
    PUBLIC_TO_TARGET: "Visível Ao Público-Alvo",
  };

  return labels[value || ""] || value || "-";
}

function roleLabel(role?: string | null) {
  const labels: Record<string, string> = {
    SINDICO: "Síndico",
    MORADOR: "Morador",
    PROPRIETARIO: "Proprietário",
    CONSELHEIRO: "Conselheiro",
  };

  return labels[role || ""] || role || "-";
}

function linkTypeLabel(linkType?: string | null) {
  const labels: Record<string, string> = {
    OWNER: "Proprietário",
    RESIDENT: "Morador",
    TENANT: "Locatário",
    DEPENDENT: "Dependente",
    AUTHORIZED: "Autorizado",
  };

  return labels[linkType || ""] || linkType || "-";
}

function pollLogActionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    CREATED: "Criada",
    UPDATED: "Editada",
    PUBLISHED: "Publicada",
    CLOSED: "Encerrada",
    ARCHIVED: "Arquivada",
    CANCELED: "Cancelada",
    TARGET_ADDED: "Público Adicionado",
    TARGET_REMOVED: "Público Removido",
    RESPONSE_REGISTERED: "Resposta Registrada",
    RESPONSE_UPDATED: "Resposta Atualizada",
    REMINDER_SENT: "Lembrete Enviado",
    RESULTS_VIEWED: "Resultado Visualizado",
    EXTENDED: "Prazo Prorrogado",
    RESULTS_PUBLISHED: "Resultados Publicados",
  };

  return labels[action || ""] || action || "-";
}

function extractCondominios(data: unknown): Condominio[] {
  if (Array.isArray(data)) {
    return data as Condominio[];
  }

  if (data && typeof data === "object") {
    const payload = data as {
      condominiums?: unknown;
      condominios?: unknown;
      items?: unknown;
      data?: unknown;
    };

    if (Array.isArray(payload.condominiums))
      return payload.condominiums as Condominio[];
    if (Array.isArray(payload.condominios))
      return payload.condominios as Condominio[];
    if (Array.isArray(payload.items)) return payload.items as Condominio[];
    if (Array.isArray(payload.data)) return payload.data as Condominio[];
  }

  return [];
}

function formCanSubmit(form: PollFormState) {
  return getCreateFormValidationMessage(form) === "";
}

function buildOptionsPayload(form: PollFormState) {
  if (form.type === "TEXT") return [];
  if (form.type === "YES_NO") return [];

  return form.options
    .map((label, index) => ({
      label: label.trim(),
      description: null,
      order: index + 1,
    }))
    .filter((option) => option.label.length > 0);
}

function responseSummary(response: PollResponseItem) {
  if (response.textAnswer) return response.textAnswer;
  if (response.selectedOption?.label) return response.selectedOption.label;
  const selected = response.selectedOptions
    ?.map((item) => item.option?.label)
    .filter(Boolean);
  if (selected && selected.length > 0) return selected.join(", ");
  return "Resposta registrada.";
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

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="rounded-[28px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#EAF7EE] text-2xl">
        ☑
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">
        Nenhuma enquete encontrada
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
        Crie a primeira enquete para consultar moradores, proprietários,
        síndicos ou conselho sem transformar a rotina em votação formal de
        assembleia.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]"
      >
        Nova Enquete
      </button>
    </section>
  );
}

/* =========================================================
   PÁGINA
   ========================================================= */

export default function AdminEnquetesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [polls, setPolls] = useState<PollListItem[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [kpis, setKpis] = useState<NonNullable<PollsResponse["kpis"]>>({});
  const [pagination, setPagination] = useState<PollsResponse["pagination"]>();

  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<FiltersState>(defaultFilters);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PollFormState>(emptyForm);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailPoll, setDetailPoll] = useState<PollListItem | null>(null);
  const [detailResults, setDetailResults] = useState<PollResults | null>(null);

  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendPoll, setExtendPoll] = useState<PollListItem | null>(null);
  const [newEndsAt, setNewEndsAt] = useState("");

  const [publishResultsModalOpen, setPublishResultsModalOpen] = useState(false);
  const [publishResultsPoll, setPublishResultsPoll] =
    useState<PollListItem | null>(null);
  const [publishResultsVisibility, setPublishResultsVisibility] =
    useState<PollResultVisibility>("PARTICIPANTS_AFTER_CLOSED");

  const loadPolls = useCallback(
    async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
      try {
        if (showLoading) setLoading(true);
        setError("");

        const params = new URLSearchParams();

        if (appliedFilters.q.trim()) params.set("q", appliedFilters.q.trim());
        if (appliedFilters.condominiumId)
          params.set("condominiumId", appliedFilters.condominiumId);
        if (appliedFilters.status !== "ALL")
          params.set("status", appliedFilters.status);
        if (appliedFilters.type !== "ALL")
          params.set("type", appliedFilters.type);
        if (appliedFilters.targetScope !== "ALL")
          params.set("targetScope", appliedFilters.targetScope);

        const query = params.toString();
        const res = await fetch(
          `/api/admin/enquetes${query ? `?${query}` : ""}`,
          { cache: "no-store" },
        );
        const data: unknown = await res.json();

        if (!res.ok) {
          setPolls([]);
          setKpis({});
          setPagination(undefined);
          setError(getApiErrorMessage(data, "Erro ao carregar enquetes."));
          return;
        }

        const payload = data as PollsResponse;
        setPolls(Array.isArray(payload.polls) ? payload.polls : []);
        setKpis(payload.kpis || {});
        setPagination(payload.pagination);
      } catch (err) {
        console.error(err);
        setPolls([]);
        setKpis({});
        setPagination(undefined);
        setError("Erro ao carregar enquetes.");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [appliedFilters],
  );

  const loadCondominios = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/condominios", { cache: "no-store" });
      const data: unknown = await res.json();

      if (!res.ok) {
        setCondominios([]);
        return;
      }

      setCondominios(extractCondominios(data));
    } catch (err) {
      console.error(err);
      setCondominios([]);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPolls();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadPolls]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadCondominios();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadCondominios]);

  const computedMetrics = useMemo(() => {
    return {
      total: pagination?.total ?? polls.length,
      draft: kpis.totalDraft ?? 0,
      published: kpis.totalPublished ?? 0,
      closed: kpis.totalClosed ?? 0,
      archived: kpis.totalArchived ?? 0,
      canceled: kpis.totalCanceled ?? 0,
      responses: kpis.totalResponses ?? 0,
    };
  }, [kpis, pagination, polls.length]);

  const canSubmit = formCanSubmit(form);
  const createFormValidationMessage = getCreateFormValidationMessage(form);

  function openCreateModal() {
    setForm(emptyForm);
    setSuccess("");
    setError("");
    setModalOpen(true);
  }

  function closeCreateModal() {
    if (saving) return;
    setModalOpen(false);
    setForm(emptyForm);
  }

  function updateForm<K extends keyof PollFormState>(
    key: K,
    value: PollFormState[K],
  ) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "type") {
        if (value === "YES_NO" || value === "TEXT") {
          next.options = [];
        }

        if (
          (value === "SINGLE_CHOICE" || value === "MULTIPLE_CHOICE") &&
          next.options.length < 2
        ) {
          next.options = ["", ""];
        }
      }

      if (key === "targetScope") {
        next.block = "";
        next.role = "";
        next.linkType = "";
      }

      return next;
    });
  }

  function updateOption(index: number, value: string) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    }));
  }

  function addOption() {
    setForm((prev) => ({
      ...prev,
      options: prev.options.length >= 20 ? prev.options : [...prev.options, ""],
    }));
  }

  function removeOption(index: number) {
    setForm((prev) => ({
      ...prev,
      options:
        prev.options.length <= 2
          ? prev.options
          : prev.options.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function applyFilters() {
    setAppliedFilters(filters);
  }

  function clearFilters() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      alert("Revise os campos obrigatórios antes de salvar a enquete.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const body = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        condominiumId: form.condominiumId,
        type: form.type,
        status: form.status,
        targetScope: form.targetScope,
        resultVisibility: form.resultVisibility,
        startsAt: normalizeDateTimeForApi(form.startsAt),
        endsAt: normalizeDateTimeForApi(form.endsAt),
        block: form.targetScope === "BLOCK" ? form.block.trim() || null : null,
        role: form.targetScope === "ROLE" ? form.role || null : null,
        linkType:
          form.targetScope === "LINK_TYPE" ? form.linkType || null : null,
        allowResponseUpdate: form.allowResponseUpdate,
        anonymousResults: form.anonymousResults,
        requireEligibleVoter: form.requireEligibleVoter,
        options: buildOptionsPayload(form),
      };

      const res = await fetch("/api/admin/enquetes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao criar enquete."));
        return;
      }

      const payload = data as { message?: string };
      setModalOpen(false);
      setForm(emptyForm);
      setSuccess(payload.message || "Enquete criada com sucesso.");
      await loadPolls({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao criar enquete.");
    } finally {
      setSaving(false);
    }
  }

  async function executeAction(
    poll: PollListItem,
    action: PollAction,
    confirmation: string,
    extraBody: Record<string, unknown> = {},
  ) {
    if (!confirm(confirmation)) return false;

    try {
      setActionLoadingId(poll.id);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/enquetes/${poll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extraBody }),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar enquete."));
        return false;
      }

      const payload = data as PollDetailResponse;
      setSuccess(payload.message || "Enquete atualizada com sucesso.");
      await loadPolls({ showLoading: false });

      if (detailPoll?.id === poll.id && payload.poll) {
        setDetailPoll(payload.poll);
      }

      return true;
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar enquete.");
      return false;
    } finally {
      setActionLoadingId(null);
    }
  }

  function openExtendModal(poll: PollListItem) {
    setExtendPoll(poll);
    setNewEndsAt(toDateTimeLocalValue(poll.endsAt));
    setExtendModalOpen(true);
  }

  function closeExtendModal() {
    if (actionLoadingId) return;
    setExtendModalOpen(false);
    setExtendPoll(null);
    setNewEndsAt("");
  }

  async function submitExtension(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!extendPoll) return;

    const newEndsAtIso = normalizeDateTimeForApi(newEndsAt);

    if (!newEndsAtIso) {
      alert("Informe o novo prazo final da enquete.");
      return;
    }

    const newDate = new Date(newEndsAtIso);
    const currentEnd = extendPoll.endsAt ? new Date(extendPoll.endsAt) : null;

    if (newDate <= new Date()) {
      alert("O novo prazo final deve ser posterior ao horário atual.");
      return;
    }

    if (
      currentEnd &&
      !Number.isNaN(currentEnd.getTime()) &&
      newDate <= currentEnd
    ) {
      alert("O novo prazo final deve ser posterior ao prazo atual da enquete.");
      return;
    }

    const updated = await executeAction(
      extendPoll,
      "EXTEND",
      extendPoll.status === "CLOSED"
        ? `Deseja prorrogar o prazo e reabrir a enquete "${extendPoll.title}"?`
        : `Deseja prorrogar o prazo da enquete "${extendPoll.title}"?`,
      { newEndsAt: newEndsAtIso },
    );

    if (updated) {
      closeExtendModal();
    }
  }

  function openPublishResultsModal(poll: PollListItem) {
    setPublishResultsPoll(poll);
    setPublishResultsVisibility(
      poll.resultVisibility === "ADMIN_ONLY"
        ? "PARTICIPANTS_AFTER_CLOSED"
        : (poll.resultVisibility as PollResultVisibility),
    );
    setPublishResultsModalOpen(true);
  }

  function closePublishResultsModal() {
    if (actionLoadingId) return;
    setPublishResultsModalOpen(false);
    setPublishResultsPoll(null);
    setPublishResultsVisibility("PARTICIPANTS_AFTER_CLOSED");
  }

  async function submitPublishResults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!publishResultsPoll) return;

    if (publishResultsVisibility === "ADMIN_ONLY") {
      alert("Selecione uma visibilidade destinada aos participantes.");
      return;
    }

    const updated = await executeAction(
      publishResultsPoll,
      "PUBLISH_RESULTS",
      `Deseja publicar oficialmente os resultados da enquete "${publishResultsPoll.title}"?`,
      { resultVisibility: publishResultsVisibility },
    );

    if (updated) {
      closePublishResultsModal();
    }
  }

  async function openDetailModal(poll: PollListItem) {
    try {
      setDetailModalOpen(true);
      setDetailPoll(poll);
      setDetailResults(null);
      setDetailLoading(true);
      setError("");

      const res = await fetch(`/api/admin/enquetes/${poll.id}`, {
        cache: "no-store",
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao carregar detalhe da enquete."));
        setDetailModalOpen(false);
        return;
      }

      const payload = data as PollDetailResponse;
      setDetailPoll(payload.poll || poll);
      setDetailResults(payload.results || null);
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar detalhe da enquete.");
      setDetailModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetailModal() {
    if (detailLoading) return;
    setDetailModalOpen(false);
    setDetailPoll(null);
    setDetailResults(null);
  }

  function optionResultTotal(optionId?: string) {
    if (!optionId) return 0;
    return (
      detailResults?.optionCounts?.find((item) => item.optionId === optionId)
        ?.total ?? 0
    );
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Enquetes"
        description="Preparando a área administrativa de enquetes..."
      />
    );
  }

  return (
    <AdminContextGuard
      fallbackTitle="Enquetes indisponíveis neste perfil de acesso"
      fallbackDescription="O módulo de enquetes é exclusivo da área administrativa. Para responder enquetes, acesse o portal com um perfil de síndico, proprietário, morador ou conselheiro."
    >
      <AdminShell
        title="Enquetes"
        description="Crie consultas rápidas e acompanhe respostas por condomínio."
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]"
          >
            Nova Enquete
          </button>
        }
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
                Consulta Condominial
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Enquetes
              </h1>
              <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                Consulte preferências, prioridades e opiniões dos públicos
                corretos, preservando a diferença entre enquete consultiva e
                votação formal de assembleia.
              </p>
            </div>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A] lg:hidden"
            >
              Nova Enquete
            </button>
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

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <KpiCard
              label="Publicadas"
              value={computedMetrics.published}
              description="Enquetes abertas para resposta."
            />
            <KpiCard
              label="Rascunhos"
              value={computedMetrics.draft}
              description="Consultas em preparação."
            />
            <KpiCard
              label="Encerradas"
              value={computedMetrics.closed}
              description="Enquetes finalizadas."
            />
            <KpiCard
              label="Respostas"
              value={computedMetrics.responses}
              description="Participações registradas."
            />
            <KpiCard
              label="Arquivadas"
              value={computedMetrics.archived}
              description="Histórico preservado."
            />
            <KpiCard
              label="Total"
              value={computedMetrics.total}
              description="Total filtrado na carteira."
            />
          </section>

          <section className="overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <input
                type="search"
                value={filters.q}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, q: event.target.value }))
                }
                placeholder="Buscar por título ou descrição..."
                className="h-11 w-full min-w-0 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              />

              <select
                value={filters.condominiumId}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    condominiumId: event.target.value,
                  }))
                }
                className="h-11 w-full min-w-0 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
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
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: event.target.value as FiltersState["status"],
                  }))
                }
                className="h-11 w-full min-w-0 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              >
                <option value="ALL">Todos Os Status</option>
                <option value="DRAFT">Rascunho</option>
                <option value="PUBLISHED">Publicada</option>
                <option value="CLOSED">Encerrada</option>
                <option value="ARCHIVED">Arquivada</option>
                <option value="CANCELED">Cancelada</option>
              </select>

              <select
                value={filters.type}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    type: event.target.value as FiltersState["type"],
                  }))
                }
                className="h-11 w-full min-w-0 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              >
                <option value="ALL">Todos Os Tipos</option>
                <option value="SINGLE_CHOICE">Escolha Única</option>
                <option value="MULTIPLE_CHOICE">Múltipla Escolha</option>
                <option value="YES_NO">Sim / Não</option>
                <option value="TEXT">Resposta Aberta</option>
              </select>

              <select
                value={filters.targetScope}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    targetScope: event.target
                      .value as FiltersState["targetScope"],
                  }))
                }
                className="h-11 w-full min-w-0 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              >
                <option value="ALL">Todos Os Públicos</option>
                <option value="CONDOMINIUM">Condomínio</option>
                <option value="BLOCK">Bloco</option>
                <option value="ROLE">Perfil De Acesso</option>
                <option value="LINK_TYPE">Tipo De Vínculo</option>
                <option value="GOVERNANCE">Síndico E Conselho</option>
              </select>

              <div className="flex min-w-0 gap-2 sm:col-span-2 xl:col-span-3 2xl:col-span-1 2xl:justify-end">
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
            <EmptyState onCreate={openCreateModal} />
          ) : (
            <section className="space-y-4">
              {polls.map((poll) => {
                const responses = poll._count?.responses ?? 0;
                const targets = poll._count?.targets ?? 0;
                const isActionLoading = actionLoadingId === poll.id;
                const canPublish = poll.status === "DRAFT";
                const canClose = poll.status === "PUBLISHED";
                const canCancel =
                  poll.status === "DRAFT" || poll.status === "PUBLISHED";
                const canArchive =
                  poll.status === "CLOSED" || poll.status === "CANCELED";
                const canExtend =
                  poll.status === "PUBLISHED" || poll.status === "CLOSED";
                const canPublishResults =
                  poll.status === "CLOSED" && !poll.resultsPublishedAt;
                const awaitingDecision = isPollAwaitingDecision(poll);

                return (
                  <article
                    key={poll.id}
                    className={[
                      "rounded-[28px] border bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)] transition",
                      awaitingDecision
                        ? "border-amber-300 hover:border-amber-400"
                        : "border-[#DDE5DF] hover:border-[#CFE6D4]",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusClass(poll.status)}`}
                          >
                            {statusLabel(poll.status)}
                          </span>
                          <span className="inline-flex rounded-full border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-1 text-xs font-bold text-[#5E6B63]">
                            {typeLabel(poll.type)}
                          </span>
                          <span className="inline-flex rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-bold text-[#5E6B63]">
                            {targetScopeLabel(poll.targetScope)}
                          </span>
                          {awaitingDecision && (
                            <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                              Aguardando Decisão
                            </span>
                          )}
                          {poll.resultsPublishedAt && (
                            <span className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">
                              Resultado Publicado
                            </span>
                          )}
                        </div>

                        {awaitingDecision && (
                          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-sm font-bold text-amber-800">
                              O prazo desta enquete foi encerrado.
                            </p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-amber-700">
                              Revise as respostas e escolha entre encerrar a enquete ou prorrogar o prazo.
                            </p>
                          </div>
                        )}

                        <h2 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">
                          {poll.title}
                        </h2>
                        <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                          {excerpt(poll.description)}
                        </p>

                        <div className="mt-4 grid gap-3 text-sm font-medium text-[#5E6B63] md:grid-cols-2 xl:grid-cols-5">
                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Condomínio
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {poll.condominium?.name || "-"}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Prazo Final
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {formatDateTime(poll.endsAt)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Respostas
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {responses} resposta(s)
                            </p>
                          </div>
                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Alvos
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {targets || 1} regra(s)
                            </p>
                          </div>
                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Resultados
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {poll.resultsPublishedAt
                                ? "Publicado Oficialmente"
                                : resultVisibilityLabel(poll.resultVisibility)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:w-64 lg:justify-end">
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => void openDetailModal(poll)}
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-white px-4 text-xs font-bold text-[#256D3C] transition hover:border-[#256D3C] hover:bg-[#F6FFF8] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Detalhes
                        </button>
                        {canPublish && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() =>
                              void executeAction(
                                poll,
                                "PUBLISH",
                                `Deseja publicar a enquete "${poll.title}"?`,
                              )
                            }
                            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-xs font-bold text-white transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Publicar
                          </button>
                        )}
                        {canClose && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() =>
                              void executeAction(
                                poll,
                                "CLOSE",
                                `Deseja encerrar a enquete "${poll.title}"?`,
                              )
                            }
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 px-4 text-xs font-bold text-blue-700 transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Encerrar
                          </button>
                        )}
                        {canExtend && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => openExtendModal(poll)}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-purple-200 bg-purple-50 px-4 text-xs font-bold text-purple-700 transition hover:border-purple-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Prorrogar Prazo
                          </button>
                        )}
                        {canPublishResults && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => openPublishResultsModal(poll)}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-[#F6FFF8] px-4 text-xs font-bold text-[#256D3C] transition hover:border-[#256D3C] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Publicar Resultado
                          </button>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() =>
                              void executeAction(
                                poll,
                                "CANCEL",
                                `Deseja cancelar a enquete "${poll.title}"?`,
                              )
                            }
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 text-xs font-bold text-red-700 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Cancelar
                          </button>
                        )}
                        {canArchive && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() =>
                              void executeAction(
                                poll,
                                "ARCHIVE",
                                `Deseja arquivar a enquete "${poll.title}"? O histórico será preservado.`,
                              )
                            }
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-4 text-xs font-bold text-amber-700 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Arquivar
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/70 p-4 backdrop-blur-sm">
            <form
              onSubmit={(event) => void handleSave(event)}
              className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl"
            >
              <div className="flex flex-col gap-4 border-b border-[#DDE5DF] pb-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
                    Nova Enquete
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    Criar Consulta Condominial
                  </h2>
                  <p className="mt-1 text-sm font-medium text-[#5E6B63]">
                    Defina o público, o tipo de resposta e a visibilidade dos
                    resultados.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={saving}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Fechar modal"
                >
                  ×
                </button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="text-sm font-bold text-[#17211B]">
                    Título
                  </span>
                  <input
                    value={form.title}
                    onChange={(event) =>
                      updateForm("title", event.target.value)
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    placeholder="Ex.: Qual prioridade de melhoria para o próximo mês?"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="text-sm font-bold text-[#17211B]">
                    Descrição
                  </span>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      updateForm("description", event.target.value)
                    }
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    placeholder="Explique o objetivo da enquete de forma simples."
                  />
                </label>

                <label>
                  <span className="text-sm font-bold text-[#17211B]">
                    Condomínio
                  </span>
                  <select
                    value={form.condominiumId}
                    onChange={(event) =>
                      updateForm("condominiumId", event.target.value)
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  >
                    <option value="">Selecione</option>
                    {condominios.map((condominio) => (
                      <option key={condominio.id} value={condominio.id}>
                        {condominio.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="text-sm font-bold text-[#17211B]">
                    Status Inicial
                  </span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      updateForm(
                        "status",
                        event.target.value as PollFormState["status"],
                      )
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  >
                    <option value="DRAFT">Salvar Como Rascunho</option>
                    <option value="PUBLISHED">Criar E Publicar</option>
                  </select>
                </label>

                <label>
                  <span className="text-sm font-bold text-[#17211B]">
                    Tipo De Resposta
                  </span>
                  <select
                    value={form.type}
                    onChange={(event) =>
                      updateForm("type", event.target.value as PollType)
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  >
                    <option value="SINGLE_CHOICE">Escolha Única</option>
                    <option value="MULTIPLE_CHOICE">Múltipla Escolha</option>
                    <option value="YES_NO">Sim / Não</option>
                    <option value="TEXT">Resposta Aberta</option>
                  </select>
                </label>

                <label>
                  <span className="text-sm font-bold text-[#17211B]">
                    Público-Alvo
                  </span>
                  <select
                    value={form.targetScope}
                    onChange={(event) =>
                      updateForm(
                        "targetScope",
                        event.target.value as PollTargetScope,
                      )
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  >
                    <option value="CONDOMINIUM">Todo O Condomínio</option>
                    <option value="BLOCK">Bloco</option>
                    <option value="ROLE">Perfil De Acesso</option>
                    <option value="LINK_TYPE">Tipo De Vínculo</option>
                    <option value="GOVERNANCE">Síndico E Conselho</option>
                  </select>
                </label>

                {form.targetScope === "BLOCK" && (
                  <label>
                    <span className="text-sm font-bold text-[#17211B]">
                      Bloco
                    </span>
                    <input
                      value={form.block}
                      onChange={(event) =>
                        updateForm("block", event.target.value)
                      }
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                      placeholder="Ex.: Bloco A"
                    />
                  </label>
                )}

                {form.targetScope === "ROLE" && (
                  <label>
                    <span className="text-sm font-bold text-[#17211B]">
                      Perfil
                    </span>
                    <select
                      value={form.role}
                      onChange={(event) =>
                        updateForm(
                          "role",
                          event.target.value as PollFormState["role"],
                        )
                      }
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    >
                      <option value="">Selecione</option>
                      <option value="SINDICO">Síndico</option>
                      <option value="CONSELHEIRO">Conselheiro</option>
                      <option value="PROPRIETARIO">Proprietário</option>
                      <option value="MORADOR">Morador</option>
                    </select>
                  </label>
                )}

                {form.targetScope === "LINK_TYPE" && (
                  <label>
                    <span className="text-sm font-bold text-[#17211B]">
                      Tipo De Vínculo
                    </span>
                    <select
                      value={form.linkType}
                      onChange={(event) =>
                        updateForm(
                          "linkType",
                          event.target.value as PollFormState["linkType"],
                        )
                      }
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    >
                      <option value="">Selecione</option>
                      <option value="OWNER">Proprietário</option>
                      <option value="RESIDENT">Morador</option>
                      <option value="TENANT">Locatário</option>
                      <option value="DEPENDENT">Dependente</option>
                      <option value="AUTHORIZED">Autorizado</option>
                    </select>
                  </label>
                )}

                <label>
                  <span className="text-sm font-bold text-[#17211B]">
                    Início
                  </span>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) =>
                      updateForm("startsAt", event.target.value)
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  />
                </label>

                <label>
                  <span className="text-sm font-bold text-[#17211B]">
                    Prazo Final
                  </span>
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) =>
                      updateForm("endsAt", event.target.value)
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  />
                  {form.status === "PUBLISHED" &&
                    createFormValidationMessage.includes("prazo final") && (
                      <p className="mt-2 text-xs font-semibold text-red-700">
                        {createFormValidationMessage}
                      </p>
                    )}
                </label>

                <label className="md:col-span-2">
                  <span className="text-sm font-bold text-[#17211B]">
                    Visibilidade Dos Resultados
                  </span>
                  <select
                    value={form.resultVisibility}
                    onChange={(event) =>
                      updateForm(
                        "resultVisibility",
                        event.target.value as PollResultVisibility,
                      )
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  >
                    <option value="ADMIN_ONLY">Somente Administradora</option>
                    <option value="PARTICIPANTS_AFTER_RESPONSE">
                      Participantes Após Responder
                    </option>
                    <option value="PARTICIPANTS_AFTER_CLOSED">
                      Participantes Após Encerrar
                    </option>
                    <option value="PUBLIC_TO_TARGET">
                      Visível Ao Público-Alvo
                    </option>
                  </select>
                </label>

                {(form.type === "SINGLE_CHOICE" ||
                  form.type === "MULTIPLE_CHOICE") && (
                  <div className="md:col-span-2 rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#17211B]">
                          Opções
                        </p>
                        <p className="mt-1 text-xs font-medium text-[#5E6B63]">
                          Informe pelo menos duas opções.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addOption}
                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-white px-4 text-xs font-bold text-[#256D3C] transition hover:border-[#256D3C]"
                      >
                        Adicionar
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {form.options.map((option, index) => (
                        <div key={`option-${index}`} className="flex gap-2">
                          <input
                            value={option}
                            onChange={(event) =>
                              updateOption(index, event.target.value)
                            }
                            className="h-11 flex-1 rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                            placeholder={`Opção ${index + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(index)}
                            disabled={form.options.length <= 2}
                            className="inline-flex h-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 text-xs font-bold text-red-700 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="md:col-span-2 grid gap-3 md:grid-cols-3">
                  <label className="flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#17211B]">
                    <input
                      type="checkbox"
                      checked={form.allowResponseUpdate}
                      onChange={(event) =>
                        updateForm("allowResponseUpdate", event.target.checked)
                      }
                      className="mt-1"
                    />
                    Permitir troca de resposta enquanto estiver aberta
                  </label>
                  <label className="flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#17211B]">
                    <input
                      type="checkbox"
                      checked={form.anonymousResults}
                      onChange={(event) =>
                        updateForm("anonymousResults", event.target.checked)
                      }
                      className="mt-1"
                    />
                    Agregar resultados sem expor nomes no portal
                  </label>
                  <label className="flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#17211B]">
                    <input
                      type="checkbox"
                      checked={form.requireEligibleVoter}
                      onChange={(event) =>
                        updateForm("requireEligibleVoter", event.target.checked)
                      }
                      className="mt-1"
                    />
                    Exigir vínculo apto a voto quando aplicável
                  </label>
                </div>
              </div>

              {!canSubmit && createFormValidationMessage && (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                  {createFormValidationMessage}
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#DDE5DF] pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={saving}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || saving}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Salvar Enquete"}
                </button>
              </div>
            </form>
          </div>
        )}

        {extendModalOpen && extendPoll && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/70 p-4 backdrop-blur-sm">
            <form
              onSubmit={(event) => void submitExtension(event)}
              className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#DDE5DF] pb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-purple-700">
                    Prorrogar Prazo
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {extendPoll.title}
                  </h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                    Informe um novo prazo posterior ao atual. Se a enquete já
                    estiver encerrada, ela será reaberta automaticamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeExtendModal}
                  disabled={Boolean(actionLoadingId)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Fechar prorrogação"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                <p className="text-sm font-semibold text-[#5E6B63]">
                  Prazo Atual:{" "}
                  <span className="text-[#17211B]">
                    {formatDateTime(extendPoll.endsAt)}
                  </span>
                </p>
                <label className="mt-4 block">
                  <span className="text-sm font-bold text-[#17211B]">
                    Novo Prazo Final
                  </span>
                  <input
                    type="datetime-local"
                    value={newEndsAt}
                    onChange={(event) => setNewEndsAt(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#DDE5DF] pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeExtendModal}
                  disabled={Boolean(actionLoadingId)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(actionLoadingId) || !newEndsAt}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-purple-700 px-5 text-sm font-semibold text-white transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirmar Prorrogação
                </button>
              </div>
            </form>
          </div>
        )}

        {publishResultsModalOpen && publishResultsPoll && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/70 p-4 backdrop-blur-sm">
            <form
              onSubmit={(event) => void submitPublishResults(event)}
              className="w-full max-w-xl rounded-[32px] bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#DDE5DF] pb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
                    Publicar Resultado
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {publishResultsPoll.title}
                  </h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                    Libere oficialmente o resultado no portal. A publicação fica
                    registrada no histórico da enquete.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePublishResultsModal}
                  disabled={Boolean(actionLoadingId)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Fechar publicação de resultados"
                >
                  ×
                </button>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-bold text-[#17211B]">
                  Visibilidade Após Publicação
                </span>
                <select
                  value={publishResultsVisibility}
                  onChange={(event) =>
                    setPublishResultsVisibility(
                      event.target.value as PollResultVisibility,
                    )
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                >
                  <option value="PARTICIPANTS_AFTER_RESPONSE">
                    Participantes Após Responder
                  </option>
                  <option value="PARTICIPANTS_AFTER_CLOSED">
                    Participantes Após Encerrar
                  </option>
                  <option value="PUBLIC_TO_TARGET">
                    Visível Ao Público-Alvo
                  </option>
                </select>
              </label>

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-800">
                A enquete já está encerrada. Esta ação publica oficialmente os
                resultados para o público selecionado e preserva a
                rastreabilidade.
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#DDE5DF] pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closePublishResultsModal}
                  disabled={Boolean(actionLoadingId)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(actionLoadingId)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Publicar Resultado
                </button>
              </div>
            </form>
          </div>
        )}

        {detailModalOpen && detailPoll && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/70 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl">
              <div className="flex flex-col gap-4 border-b border-[#DDE5DF] pb-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
                    Detalhe Da Enquete
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {detailPoll.title}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-[#5E6B63]">
                    {detailPoll.condominium?.name || "Condomínio"} •{" "}
                    {statusLabel(detailPoll.status)} •{" "}
                    {detailResults?.totalResponses ??
                      detailPoll._count?.responses ??
                      0}{" "}
                    resposta(s)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDetailModal}
                  disabled={detailLoading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Fechar detalhe"
                >
                  ×
                </button>
              </div>

              {detailLoading ? (
                <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-5 text-sm font-semibold text-[#5E6B63]">
                  Carregando detalhe da enquete...
                </div>
              ) : (
                <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
                  <div className="space-y-5">
                    <section className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-5">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                        Descrição
                      </p>
                      <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                        {excerpt(detailPoll.description, 500)}
                      </p>
                    </section>

                    <section className="rounded-3xl border border-[#DDE5DF] bg-white p-5">
                      <h3 className="text-lg font-semibold tracking-tight text-[#17211B]">
                        Resultados
                      </h3>
                      <div className="mt-4 space-y-3">
                        {detailPoll.type === "TEXT" ? (
                          <p className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#5E6B63]">
                            Respostas abertas aparecem na lista de participações
                            recentes.
                          </p>
                        ) : detailPoll.options &&
                          detailPoll.options.length > 0 ? (
                          detailPoll.options.map((option) => {
                            const total = optionResultTotal(option.id);
                            const totalResponses =
                              detailResults?.totalResponses || 0;
                            const percent =
                              totalResponses > 0
                                ? Math.round((total / totalResponses) * 100)
                                : 0;

                            return (
                              <div
                                key={option.id || option.label}
                                className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-bold text-[#17211B]">
                                    {option.label}
                                  </p>
                                  <p className="text-sm font-bold text-[#256D3C]">
                                    {total} voto(s) • {percent}%
                                  </p>
                                </div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                                  <div
                                    className="h-full rounded-full bg-[#256D3C]"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#5E6B63]">
                            Nenhuma opção registrada.
                          </p>
                        )}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-[#DDE5DF] bg-white p-5">
                      <h3 className="text-lg font-semibold tracking-tight text-[#17211B]">
                        Respostas Recentes
                      </h3>
                      <div className="mt-4 space-y-3">
                        {detailPoll.responses &&
                        detailPoll.responses.length > 0 ? (
                          detailPoll.responses.map((response) => (
                            <div
                              key={response.id}
                              className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                            >
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="text-sm font-bold text-[#17211B]">
                                    {response.user?.name ||
                                      response.user?.email ||
                                      "Usuário"}
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-[#5E6B63]">
                                    {responseSummary(response)}
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                                    {roleLabel(response.userAccess?.role)}{" "}
                                    {response.userAccess?.label
                                      ? `• ${response.userAccess.label}`
                                      : ""}
                                  </p>
                                </div>
                                <span className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-[#5E6B63]">
                                  {formatDateTime(response.submittedAt)}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#5E6B63]">
                            Nenhuma resposta registrada até o momento.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>

                  <aside className="space-y-5">
                    <section className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-5">
                      <h3 className="text-lg font-semibold tracking-tight text-[#17211B]">
                        Resumo
                      </h3>
                      <div className="mt-4 space-y-3 text-sm font-semibold text-[#5E6B63]">
                        <p>
                          <span className="text-[#17211B]">Tipo:</span>{" "}
                          {typeLabel(detailPoll.type)}
                        </p>
                        <p>
                          <span className="text-[#17211B]">Público:</span>{" "}
                          {targetScopeLabel(detailPoll.targetScope)}
                        </p>
                        <p>
                          <span className="text-[#17211B]">Resultado:</span>{" "}
                          {resultVisibilityLabel(detailPoll.resultVisibility)}
                        </p>
                        <p>
                          <span className="text-[#17211B]">Início:</span>{" "}
                          {formatDateTime(detailPoll.startsAt)}
                        </p>
                        <p>
                          <span className="text-[#17211B]">Prazo:</span>{" "}
                          {formatDateTime(detailPoll.endsAt)}
                        </p>
                        <p>
                          <span className="text-[#17211B]">
                            Publicação Do Resultado:
                          </span>{" "}
                          {detailPoll.resultsPublishedAt
                            ? formatDateTime(detailPoll.resultsPublishedAt)
                            : "Ainda não publicada"}
                        </p>
                        {detailPoll.resultsPublishedAt && (
                          <p>
                            <span className="text-[#17211B]">
                              Resultado Publicado Por:
                            </span>{" "}
                            {detailPoll.resultsPublishedByUser?.name ||
                              detailPoll.resultsPublishedByUser?.email ||
                              "-"}
                          </p>
                        )}
                        <p>
                          <span className="text-[#17211B]">Criada Por:</span>{" "}
                          {detailPoll.createdByUser?.name ||
                            detailPoll.createdByUser?.email ||
                            "-"}
                        </p>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-[#DDE5DF] bg-white p-5">
                      <h3 className="text-lg font-semibold tracking-tight text-[#17211B]">
                        Públicos-Alvo
                      </h3>
                      <div className="mt-4 space-y-2">
                        {detailPoll.targets && detailPoll.targets.length > 0 ? (
                          detailPoll.targets.map((target) => (
                            <div
                              key={
                                target.id ||
                                `${target.role}-${target.linkType}-${target.block}`
                              }
                              className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3 text-sm font-semibold text-[#5E6B63]"
                            >
                              {target.unit?.unitNumber
                                ? `Unidade ${target.unit.unitNumber}`
                                : target.block
                                  ? `Bloco ${target.block}`
                                  : target.role
                                    ? roleLabel(target.role)
                                    : target.linkType
                                      ? linkTypeLabel(target.linkType)
                                      : "Todo o condomínio"}
                            </div>
                          ))
                        ) : (
                          <p className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F9FBFA] p-3 text-sm font-semibold text-[#5E6B63]">
                            Nenhuma regra específica.
                          </p>
                        )}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-[#DDE5DF] bg-white p-5">
                      <h3 className="text-lg font-semibold tracking-tight text-[#17211B]">
                        Histórico
                      </h3>
                      <div className="mt-4 space-y-3">
                        {detailPoll.logs && detailPoll.logs.length > 0 ? (
                          detailPoll.logs.map((log) => (
                            <div
                              key={log.id}
                              className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3"
                            >
                              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#256D3C]">
                                {pollLogActionLabel(log.action)}
                              </p>
                              <p className="mt-2 text-sm font-semibold text-[#17211B]">
                                {log.message || "Evento registrado."}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                                {formatDateTime(log.createdAt)}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F9FBFA] p-3 text-sm font-semibold text-[#5E6B63]">
                            Nenhum evento registrado.
                          </p>
                        )}
                      </div>
                    </section>
                  </aside>
                </div>
              )}
            </div>
          </div>
        )}
      </AdminShell>
    </AdminContextGuard>
  );
}
