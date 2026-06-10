"use client";

import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

/* =========================================================
   ADMIN - REUNIÕES DE CONSELHO

   Arquivo:
   src/app/admin/reunioes-conselho/page.tsx

   ETAPA 49 — REUNIÕES DE CONSELHO

   Objetivo:
   - Listar reuniões de conselho da administradora ativa.
   - Criar reunião como rascunho ou agendada.
   - Iniciar a experiência da Sala De Reunião EloGest.
   - Manter a base preparada para Assembleias futuras.

   Segurança:
   - A proteção real permanece nas APIs.
   - Esta página apenas consome /api/admin/reunioes-conselho.
   - Caso o plano/módulo esteja bloqueado, a API retorna 403 e a tela
     mostra uma mensagem amigável sem quebrar a interface.

   ETAPA 49.9 — AJUSTE DE SHELL E AÇÃO DE CRIAÇÃO
   - Página passa a usar AdminShell oficial.
   - Botão Nova Reunião respeita o bloqueio comercial do módulo.
   - A validação real de condomínio/plano permanece no formulário e na API.

   ETAPA 49.9.1 — CARREGAMENTO DE CONDOMÍNIOS
   - Normalização do retorno de /api/admin/condominios ficou mais robusta.
   - Aceita formatos comuns: condominiums, items, data, results e rows,
     inclusive quando vierem aninhados.
   - Exibe mensagem clara quando não houver condomínio ativo carregado.
   ========================================================= */

type CouncilMeetingStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED"
  | "ARCHIVED";

type MeetingMode = "ONLINE" | "PRESENTIAL" | "HYBRID";

type CondominiumOption = {
  id: string;
  name: string;
};

type MeetingListItem = {
  id: string;
  title: string;
  description: string | null;
  status: CouncilMeetingStatus;
  mode: MeetingMode;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  location: string | null;
  createdAt: string;
  condominium: {
    id: string;
    name: string;
  } | null;
  meetingRoom: {
    id: string;
    status: string;
    mode: MeetingMode;
    provider: string;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
  } | null;
  createdByUser: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  _count: {
    participants: number;
    agendaItems: number;
    attachments: number;
  };
};

type MeetingsResponse = {
  meetings?: MeetingListItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  kpis?: {
    totalDraft: number;
    totalScheduled: number;
    totalInProgress: number;
    totalCompleted: number;
    totalCanceled: number;
    totalArchived: number;
  };
  error?: string;
};

type CondominiumsResponse = {
  condominiums?: unknown;
  items?: unknown;
  data?: unknown;
  results?: unknown;
  rows?: unknown;
  error?: string;
};

type CreateMeetingForm = {
  title: string;
  description: string;
  condominiumId: string;
  status: "DRAFT" | "SCHEDULED";
  mode: MeetingMode;
  scheduledStartAt: string;
  scheduledEndAt: string;
  location: string;
  accessInstructions: string;
  internalNotes: string;
};

type AgendaDraftItem = {
  localId: string;
  title: string;
  description: string;
};

const INITIAL_FORM: CreateMeetingForm = {
  title: "",
  description: "",
  condominiumId: "",
  status: "DRAFT",
  mode: "ONLINE",
  scheduledStartAt: "",
  scheduledEndAt: "",
  location: "",
  accessInstructions: "",
  internalNotes: "",
};

const STATUS_OPTIONS: Array<{ value: CouncilMeetingStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "Todos Os Status" },
  { value: "DRAFT", label: "Rascunho" },
  { value: "SCHEDULED", label: "Agendada" },
  { value: "IN_PROGRESS", label: "Em Andamento" },
  { value: "COMPLETED", label: "Realizada" },
  { value: "CANCELED", label: "Cancelada" },
  { value: "ARCHIVED", label: "Arquivada" },
];

const MODE_OPTIONS: Array<{ value: MeetingMode | "ALL"; label: string }> = [
  { value: "ALL", label: "Todos Os Formatos" },
  { value: "ONLINE", label: "Online" },
  { value: "PRESENTIAL", label: "Presencial" },
  { value: "HYBRID", label: "Híbrida" },
];

function getStatusLabel(status: CouncilMeetingStatus) {
  const labels: Record<CouncilMeetingStatus, string> = {
    DRAFT: "Rascunho",
    SCHEDULED: "Agendada",
    IN_PROGRESS: "Em Andamento",
    COMPLETED: "Realizada",
    CANCELED: "Cancelada",
    ARCHIVED: "Arquivada",
  };

  return labels[status] ?? status;
}

function getModeLabel(mode: MeetingMode) {
  const labels: Record<MeetingMode, string> = {
    ONLINE: "Online",
    PRESENTIAL: "Presencial",
    HYBRID: "Híbrida",
  };

  return labels[mode] ?? mode;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sem data definida";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeCondominiumOption(value: unknown): CondominiumOption | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Record<string, unknown>;

  const id = typeof item.id === "string" ? item.id : null;
  const name =
    typeof item.name === "string"
      ? item.name
      : typeof item.nome === "string"
        ? item.nome
        : typeof item.title === "string"
          ? item.title
          : null;

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
  };
}

function extractCondominiumArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const objectValue = value as Record<string, unknown>;

  const possibleKeys = [
    "condominiums",
    "items",
    "data",
    "results",
    "rows",
  ];

  for (const key of possibleKeys) {
    const extracted = extractCondominiumArray(objectValue[key]);

    if (extracted.length > 0) {
      return extracted;
    }
  }

  return [];
}

function normalizeCondominiumsResponse(data: CondominiumsResponse) {
  const rawItems = extractCondominiumArray(data);
  const normalized = rawItems
    .map(normalizeCondominiumOption)
    .filter((item): item is CondominiumOption => Boolean(item));

  const uniqueItems = new Map<string, CondominiumOption>();

  for (const item of normalized) {
    uniqueItems.set(item.id, item);
  }

  return Array.from(uniqueItems.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
}

function getErrorMessage(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value) {
    const errorValue = (value as { error?: unknown }).error;

    if (typeof errorValue === "string" && errorValue.trim().length > 0) {
      return errorValue;
    }
  }

  return fallback;
}

export default function AdminCouncilMeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [condominiums, setCondominiums] = useState<CondominiumOption[]>([]);
  const [kpis, setKpis] = useState<MeetingsResponse["kpis"]>();
  const [pagination, setPagination] = useState<MeetingsResponse["pagination"]>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CouncilMeetingStatus | "ALL">("ALL");
  const [mode, setMode] = useState<MeetingMode | "ALL">("ALL");
  const [condominiumId, setCondominiumId] = useState("ALL");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [condominiumsError, setCondominiumsError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasCouncilMeetingModuleAccess, setHasCouncilMeetingModuleAccess] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [form, setForm] = useState<CreateMeetingForm>(INITIAL_FORM);
  const [agendaItems, setAgendaItems] = useState<AgendaDraftItem[]>([
    {
      localId: "agenda-1",
      title: "",
      description: "",
    },
  ]);

  const canCreate = hasCouncilMeetingModuleAccess;

  const selectedCondominiumName = useMemo(() => {
    if (!form.condominiumId) {
      return "Nenhum Condomínio Selecionado";
    }

    return (
      condominiums.find((item) => item.id === form.condominiumId)?.name ??
      "Condomínio Selecionado"
    );
  }, [condominiums, form.condominiumId]);

  const fetchCondominiums = useCallback(async () => {
    setCondominiumsError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "100");
      params.set("limit", "100");
      params.set("status", "ACTIVE");

      const response = await fetch(`/api/admin/condominios?${params.toString()}`, {
        cache: "no-store",
      });

      const data = (await response.json()) as CondominiumsResponse;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Não foi possível carregar os condomínios."),
        );
      }

      const normalizedCondominiums = normalizeCondominiumsResponse(data);

      setCondominiums(normalizedCondominiums);

      if (normalizedCondominiums.length === 0) {
        setCondominiumsError(
          "Nenhum condomínio ativo foi encontrado para esta administradora.",
        );
      }
    } catch (requestError) {
      console.error("Erro ao carregar condomínios:", requestError);
      setCondominiums([]);
      setCondominiumsError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível carregar os condomínios.",
      );
    }
  }, []);

  const fetchMeetings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", "20");

      if (search.trim()) {
        params.set("q", search.trim());
      }

      if (status !== "ALL") {
        params.set("status", status);
      }

      if (mode !== "ALL") {
        params.set("mode", mode);
      }

      if (condominiumId !== "ALL") {
        params.set("condominiumId", condominiumId);
      }

      const response = await fetch(`/api/admin/reunioes-conselho?${params.toString()}`, {
        cache: "no-store",
      });

      const data = (await response.json()) as MeetingsResponse;

      if (!response.ok) {
        if (response.status === 403) {
          setHasCouncilMeetingModuleAccess(false);
        }

        throw new Error(
          getErrorMessage(data, "Não foi possível carregar as reuniões de conselho."),
        );
      }

      setHasCouncilMeetingModuleAccess(true);
      setMeetings(data.meetings ?? []);
      setPagination(data.pagination);
      setKpis(data.kpis);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível carregar as reuniões de conselho.";

      setError(message);
      setMeetings([]);
      setPagination(undefined);
      setKpis(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [condominiumId, mode, page, search, status]);

  useEffect(() => {
    void fetchCondominiums();
  }, [fetchCondominiums]);

  useEffect(() => {
    void fetchMeetings();
  }, [fetchMeetings]);

  function updateForm<K extends keyof CreateMeetingForm>(
    key: K,
    value: CreateMeetingForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function addAgendaItem() {
    setAgendaItems((current) => [
      ...current,
      {
        localId: `agenda-${Date.now()}`,
        title: "",
        description: "",
      },
    ]);
  }

  function removeAgendaItem(localId: string) {
    setAgendaItems((current) => {
      if (current.length === 1) {
        return current;
      }

      return current.filter((item) => item.localId !== localId);
    });
  }

  function updateAgendaItem(
    localId: string,
    key: "title" | "description",
    value: string,
  ) {
    setAgendaItems((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
              ...item,
              [key]: value,
            }
          : item,
      ),
    );
  }

  function resetCreateForm() {
    setForm(INITIAL_FORM);
    setAgendaItems([
      {
        localId: "agenda-1",
        title: "",
        description: "",
      },
    ]);
  }

  async function handleCreateMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!form.title.trim()) {
      setError("Informe um título para a reunião.");
      return;
    }

    if (!form.condominiumId) {
      setError("Selecione o condomínio da reunião.");
      return;
    }

    if (form.status === "SCHEDULED" && !form.scheduledStartAt) {
      setError("Informe a data e horário para agendar a reunião.");
      return;
    }

    if ((form.mode === "PRESENTIAL" || form.mode === "HYBRID") && !form.location.trim()) {
      setError("Informe o local da reunião presencial ou híbrida.");
      return;
    }

    setIsSaving(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      condominiumId: form.condominiumId,
      status: form.status,
      mode: form.mode,
      scheduledStartAt: form.scheduledStartAt || null,
      scheduledEndAt: form.scheduledEndAt || null,
      location: form.location.trim() || null,
      accessInstructions: form.accessInstructions.trim() || null,
      internalNotes: form.internalNotes.trim() || null,
      agendaItems: agendaItems
        .map((item, index) => ({
          title: item.title.trim(),
          description: item.description.trim() || null,
          order: index + 1,
        }))
        .filter((item) => item.title.length >= 3),
    };

    try {
      const response = await fetch("/api/admin/reunioes-conselho", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Não foi possível criar a reunião de conselho."),
        );
      }

      setSuccessMessage(data.message ?? "Reunião de conselho criada com sucesso.");
      setIsCreateModalOpen(false);
      resetCreateForm();
      setPage(1);
      await fetchMeetings();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível criar a reunião de conselho.";

      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminShell current="reunioes-conselho">
      <div className="flex w-full flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-[#DDEBDD] bg-white shadow-sm">
          <div className="flex flex-col gap-5 border-b border-[#E5EFE6] bg-gradient-to-br from-[#FFFFFF] to-[#EAF7EE] p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#256D3C]">
                Etapa 49
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#17211B] sm:text-3xl">
                Reuniões De Conselho
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#4B5B4F]">
                Organize reuniões do conselho com pauta, participantes, histórico e Sala De Reunião EloGest. A mesma base fica preparada para a futura etapa de Assembleias.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMessage(null);
                  setIsCreateModalOpen(true);
                }}
                disabled={!canCreate}
                title={
                  canCreate
                    ? "Criar nova reunião de conselho"
                    : "O módulo Reuniões De Conselho não está liberado no plano atual."
                }
                className="rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5E34] disabled:cursor-not-allowed disabled:bg-[#9CB4A2]"
              >
                Nova Reunião
              </button>
            </div>
          </div>

          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-6">
            <KpiCard label="Rascunhos" value={kpis?.totalDraft ?? 0} />
            <KpiCard label="Agendadas" value={kpis?.totalScheduled ?? 0} />
            <KpiCard label="Em Andamento" value={kpis?.totalInProgress ?? 0} />
            <KpiCard label="Realizadas" value={kpis?.totalCompleted ?? 0} />
            <KpiCard label="Canceladas" value={kpis?.totalCanceled ?? 0} />
            <KpiCard label="Arquivadas" value={kpis?.totalArchived ?? 0} />
          </div>
        </section>

        {successMessage ? (
          <div className="rounded-2xl border border-[#BFE6C8] bg-[#F0FBF2] px-5 py-4 text-sm font-medium text-[#256D3C]">
            {successMessage}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-[#F0C7C7] bg-[#FFF6F6] px-5 py-4 text-sm font-medium text-[#9A2D2D]">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-[#DDEBDD] bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar por título, descrição ou condomínio"
              className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
            />

            <select
              value={condominiumId}
              onChange={(event) => {
                setCondominiumId(event.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
            >
              <option value="ALL">Todos Os Condomínios</option>
              {condominiums.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as CouncilMeetingStatus | "ALL");
                setPage(1);
              }}
              className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as MeetingMode | "ALL");
                setPage(1);
              }}
              className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
            >
              {MODE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void fetchMeetings()}
              className="rounded-2xl border border-[#256D3C] px-5 py-3 text-sm font-semibold text-[#256D3C] transition hover:bg-[#EAF7EE]"
            >
              Atualizar
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-[#DDEBDD] bg-white shadow-sm">
          <div className="border-b border-[#E5EFE6] px-6 py-5">
            <h2 className="text-lg font-bold text-[#17211B]">Reuniões Cadastradas</h2>
            <p className="mt-1 text-sm text-[#617066]">
              A listagem mostra apenas reuniões da carteira ativa da administradora.
            </p>
          </div>

          {isLoading ? (
            <div className="p-8 text-sm text-[#617066]">Carregando reuniões...</div>
          ) : meetings.length === 0 ? (
            <div className="p-8">
              <div className="rounded-3xl border border-dashed border-[#CFE0D2] bg-[#F8FCF9] p-8 text-center">
                <h3 className="text-lg font-bold text-[#17211B]">
                  Nenhuma reunião encontrada
                </h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#617066]">
                  Crie a primeira reunião de conselho para organizar pauta, data, participantes e a Sala De Reunião EloGest.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  disabled={!canCreate}
                  title={
                    canCreate
                      ? "Criar primeira reunião de conselho"
                      : "O módulo Reuniões De Conselho não está liberado no plano atual."
                  }
                  className="mt-5 rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1F5E34] disabled:cursor-not-allowed disabled:bg-[#9CB4A2]"
                >
                  Criar Primeira Reunião
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#E5EFE6]">
              {meetings.map((meeting) => (
                <article key={meeting.id} className="p-5 transition hover:bg-[#F8FCF9]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#EAF7EE] px-3 py-1 text-xs font-bold text-[#256D3C]">
                          {getStatusLabel(meeting.status)}
                        </span>
                        <span className="rounded-full bg-[#F0F4F1] px-3 py-1 text-xs font-semibold text-[#4B5B4F]">
                          {getModeLabel(meeting.mode)}
                        </span>
                        {meeting.meetingRoom ? (
                          <span className="rounded-full bg-[#F7F3E8] px-3 py-1 text-xs font-semibold text-[#7A5A1E]">
                            Sala EloGest
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-3 text-lg font-bold text-[#17211B]">
                        {meeting.title}
                      </h3>
                      <p className="mt-1 text-sm text-[#617066]">
                        {meeting.condominium?.name ?? "Condomínio não informado"} • {formatDateTime(meeting.scheduledStartAt)}
                      </p>
                      {meeting.description ? (
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#4B5B4F]">
                          {meeting.description}
                        </p>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-[#617066]">
                        <span className="rounded-full border border-[#E1EBE3] px-3 py-1">
                          {meeting._count.participants} participante(s)
                        </span>
                        <span className="rounded-full border border-[#E1EBE3] px-3 py-1">
                          {meeting._count.agendaItems} pauta(s)
                        </span>
                        <span className="rounded-full border border-[#E1EBE3] px-3 py-1">
                          {meeting._count.attachments} anexo(s)
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                      <Link
                        href={`/admin/reunioes-conselho/${meeting.id}`}
                        className="rounded-2xl border border-[#DDEBDD] px-4 py-2 text-center text-sm font-semibold text-[#256D3C] transition hover:bg-[#EAF7EE]"
                      >
                        Ver Detalhes
                      </Link>
                      <Link
                        href={`/admin/reunioes-conselho/${meeting.id}/sala`}
                        className="rounded-2xl bg-[#17211B] px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-[#243427]"
                      >
                        Sala EloGest
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {pagination ? (
            <div className="flex flex-col gap-3 border-t border-[#E5EFE6] px-6 py-4 text-sm text-[#617066] sm:flex-row sm:items-center sm:justify-between">
              <span>
                Página {pagination.page} de {pagination.totalPages} • {pagination.total} registro(s)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  className="rounded-xl border border-[#DDEBDD] px-4 py-2 font-semibold text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-xl border border-[#DDEBDD] px-4 py-2 font-semibold text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8 backdrop-blur-sm">
          <form
            onSubmit={(event) => void handleCreateMeeting(event)}
            className="w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="border-b border-[#E5EFE6] bg-[#F8FCF9] p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#256D3C]">
                    Nova Reunião
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-[#17211B]">
                    Criar Reunião De Conselho
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#617066]">
                    A Sala De Reunião EloGest será criada automaticamente junto com a reunião.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    resetCreateForm();
                  }}
                  className="rounded-2xl border border-[#DDEBDD] px-4 py-2 text-sm font-semibold text-[#4B5B4F] transition hover:bg-white"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="grid gap-5 p-6 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <label className="text-sm font-semibold text-[#17211B]">
                  Título Da Reunião
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  placeholder="Ex.: Reunião Ordinária Do Conselho"
                  className="mt-2 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Condomínio
                </label>
                <select
                  value={form.condominiumId}
                  onChange={(event) => updateForm("condominiumId", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                >
                  <option value="">Selecione Um Condomínio</option>
                  {condominiums.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>

                {condominiumsError ? (
                  <p className="mt-2 text-xs font-medium text-[#9A2D2D]">
                    {condominiumsError}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Status Inicial
                </label>
                <select
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value as "DRAFT" | "SCHEDULED")}
                  className="mt-2 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                >
                  <option value="DRAFT">Rascunho</option>
                  <option value="SCHEDULED">Agendada</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Formato
                </label>
                <select
                  value={form.mode}
                  onChange={(event) => updateForm("mode", event.target.value as MeetingMode)}
                  className="mt-2 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                >
                  <option value="ONLINE">Online</option>
                  <option value="PRESENTIAL">Presencial</option>
                  <option value="HYBRID">Híbrida</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Local Presencial
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(event) => updateForm("location", event.target.value)}
                  placeholder="Ex.: Sala De Reuniões / Salão Do Condomínio"
                  className="mt-2 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Início Previsto
                </label>
                <input
                  type="datetime-local"
                  value={form.scheduledStartAt}
                  onChange={(event) => updateForm("scheduledStartAt", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-[#17211B]">
                  Término Previsto
                </label>
                <input
                  type="datetime-local"
                  value={form.scheduledEndAt}
                  onChange={(event) => updateForm("scheduledEndAt", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="text-sm font-semibold text-[#17211B]">
                  Descrição
                </label>
                <textarea
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  rows={3}
                  placeholder="Resumo do objetivo da reunião."
                  className="mt-2 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="text-sm font-semibold text-[#17211B]">
                  Instruções De Acesso À Sala
                </label>
                <textarea
                  value={form.accessInstructions}
                  onChange={(event) => updateForm("accessInstructions", event.target.value)}
                  rows={3}
                  placeholder="Ex.: Entrar com 5 minutos de antecedência e identificar-se com nome completo."
                  className="mt-2 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                />
              </div>

              <div className="lg:col-span-2 rounded-3xl border border-[#E5EFE6] bg-[#F8FCF9] p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[#17211B]">Pauta Inicial</h3>
                    <p className="mt-1 text-sm text-[#617066]">
                      Os itens de pauta ajudam a organizar a reunião e preparar a ata futuramente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addAgendaItem}
                    className="rounded-2xl border border-[#256D3C] px-4 py-2 text-sm font-semibold text-[#256D3C] transition hover:bg-[#EAF7EE]"
                  >
                    Adicionar Pauta
                  </button>
                </div>

                <div className="mt-5 flex flex-col gap-4">
                  {agendaItems.map((item, index) => (
                    <div key={item.localId} className="rounded-2xl border border-[#DDEBDD] bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-bold text-[#256D3C]">
                          Pauta {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAgendaItem(item.localId)}
                          disabled={agendaItems.length === 1}
                          className="text-sm font-semibold text-[#9A2D2D] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remover
                        </button>
                      </div>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(event) => updateAgendaItem(item.localId, "title", event.target.value)}
                        placeholder="Título da pauta"
                        className="mt-3 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                      />
                      <textarea
                        value={item.description}
                        onChange={(event) => updateAgendaItem(item.localId, "description", event.target.value)}
                        rows={2}
                        placeholder="Descrição ou observação da pauta"
                        className="mt-3 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2">
                <label className="text-sm font-semibold text-[#17211B]">
                  Observações Internas
                </label>
                <textarea
                  value={form.internalNotes}
                  onChange={(event) => updateForm("internalNotes", event.target.value)}
                  rows={3}
                  placeholder="Anotações visíveis apenas para a administradora."
                  className="mt-2 w-full rounded-2xl border border-[#DDEBDD] px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20"
                />
              </div>

              <div className="lg:col-span-2 rounded-3xl border border-[#DDEBDD] bg-[#F8FCF9] p-5 text-sm leading-6 text-[#4B5B4F]">
                <strong className="text-[#17211B]">Sala De Reunião EloGest:</strong> ao salvar, será criada uma sala vinculada ao condomínio {selectedCondominiumName}. A tecnologia de câmera/vídeo será plugável futuramente, sem alterar a experiência principal dentro do EloGest.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#E5EFE6] bg-[#F8FCF9] p-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  resetCreateForm();
                }}
                className="rounded-2xl border border-[#DDEBDD] px-5 py-3 text-sm font-semibold text-[#4B5B4F] transition hover:bg-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1F5E34] disabled:cursor-not-allowed disabled:bg-[#9CB4A2]"
              >
                {isSaving ? "Salvando..." : "Salvar Reunião"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AdminShell>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#E5EFE6] bg-[#F8FCF9] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#617066]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-[#17211B]">{value}</p>
    </div>
  );
}
