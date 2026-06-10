"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ASSEMBLEIAS - PÁGINA ADMINISTRATIVA

   Arquivo:
   src/app/admin/assembleias/page.tsx

   ELOGEST — ETAPA 51.2

   Objetivo:
   - Listar assembleias da administradora ativa.
   - Criar assembleia como rascunho ou agendada.
   - Exibir indicadores, filtros e resumo operacional.
   - Preparar a navegação para pautas, elegibilidade,
     procurações, votação e apuração nos próximos blocos.

   Segurança:
   - A proteção real fica nas APIs.
   - A página usa AdminContextGuard para proteção visual.
   - A API exige perfil ativo ADMINISTRADORA, administradora ativa,
     isolamento por carteira e módulo comercial Assembleias liberado.
   ========================================================= */

type AssemblyType = "ORDINARY" | "EXTRAORDINARY" | "SPECIAL" | "OTHER";
type AssemblyStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "RESULTS_PUBLISHED"
  | "CANCELED"
  | "ARCHIVED";
type MeetingMode = "PRESENTIAL" | "ONLINE" | "HYBRID";

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

interface Condominio {
  id: string;
  name: string;
  status?: string | null;
}

interface AssemblyListItem {
  id: string;
  title: string;
  description?: string | null;
  type: AssemblyType | string;
  status: AssemblyStatus | string;
  mode: MeetingMode | string;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  votingStartsAt?: string | null;
  votingEndsAt?: string | null;
  location?: string | null;
  externalMeetingUrl?: string | null;
  convocationText?: string | null;
  allowVoteChange: boolean;
  createdAt: string;
  updatedAt: string;
  condominium?: { id: string; name: string } | null;
  createdByUser?: { id: string; name?: string | null; email?: string | null } | null;
  _count?: {
    agendaItems?: number;
    eligibleUnits?: number;
    votes?: number;
    attachments?: number;
    representations?: number;
    logs?: number;
  };
}

interface AssembliesResponse {
  assemblies?: AssemblyListItem[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  kpis?: {
    totalDraft?: number;
    totalScheduled?: number;
    totalOpen?: number;
    totalClosed?: number;
    totalResultsPublished?: number;
    totalCanceled?: number;
    totalArchived?: number;
    totalVotes?: number;
  };
  error?: string;
}


interface PendingAgendaItem {
  id: string;
  title: string;
  description?: string | null;
  deferredAt?: string | null;
  deferredReason?: string | null;
  deferredNotes?: string | null;
  resultSummary?: string | null;
  assembly?: {
    id: string;
    title: string;
    scheduledStartAt?: string | null;
    resultsPublishedAt?: string | null;
  } | null;
}

interface PendingAgendaItemsResponse {
  pendingAgendaItems?: PendingAgendaItem[];
  error?: string;
}

interface AssemblyFormState {
  title: string;
  description: string;
  condominiumId: string;
  type: AssemblyType;
  mode: MeetingMode;
  status: "DRAFT" | "SCHEDULED";
  scheduledStartAt: string;
  scheduledEndAt: string;
  votingStartsAt: string;
  votingEndsAt: string;
  location: string;
  externalMeetingUrl: string;
  accessInstructions: string;
  convocationText: string;
  internalNotes: string;
  allowVoteChange: boolean;
}

interface FiltersState {
  q: string;
  condominiumId: string;
  status: "ALL" | AssemblyStatus;
  type: "ALL" | AssemblyType;
  mode: "ALL" | MeetingMode;
}

const emptyForm: AssemblyFormState = {
  title: "",
  description: "",
  condominiumId: "",
  type: "ORDINARY",
  mode: "HYBRID",
  status: "DRAFT",
  scheduledStartAt: "",
  scheduledEndAt: "",
  votingStartsAt: "",
  votingEndsAt: "",
  location: "",
  externalMeetingUrl: "",
  accessInstructions: "",
  convocationText: "",
  internalNotes: "",
  allowVoteChange: false,
};

const defaultFilters: FiltersState = {
  q: "",
  condominiumId: "",
  status: "ALL",
  type: "ALL",
  mode: "ALL",
};

function getApiErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const payload = data as ApiErrorResponse;
    return payload.error || payload.message || fallback;
  }
  return fallback;
}

async function readApiResponse(response: Response): Promise<unknown> {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return {
      error:
        response.status === 404
          ? "A API de assembleias ainda não foi encontrada pelo Next.js. Confira se o arquivo src/app/api/admin/assembleias/route.ts existe e reinicie o servidor local."
          : "A API retornou uma resposta inválida. Reinicie o servidor local e tente novamente.",
    };
  }
}

function normalizeDateTimeForApi(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function deferredReasonLabel(reason?: string | null) {
  const labels: Record<string, string> = {
    TIE: "Empate",
    NO_QUORUM: "Ausência De Quórum",
    BUDGET_REVIEW: "Necessidade De Orçamento",
    MORE_INFORMATION: "Informações Complementares",
    POSTPONE: "Deliberação Adiada",
    OTHER: "Outro Motivo",
  };
  return labels[reason || ""] || reason || "Pauta Pendente";
}

function excerpt(value?: string | null, maxLength = 145) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Sem descrição informada.";
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength).trim()}...`;
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho",
    SCHEDULED: "Agendada",
    OPEN: "Em Andamento",
    CLOSED: "Encerrada",
    RESULTS_PUBLISHED: "Resultados Publicados",
    CANCELED: "Cancelada",
    ARCHIVED: "Arquivada",
  };
  return labels[status || ""] || status || "-";
}

function statusClass(status?: string | null) {
  const classes: Record<string, string> = {
    DRAFT: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    SCHEDULED: "border-blue-200 bg-blue-50 text-blue-700",
    OPEN: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    CLOSED: "border-violet-200 bg-violet-50 text-violet-700",
    RESULTS_PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    CANCELED: "border-red-200 bg-red-50 text-red-700",
    ARCHIVED: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return classes[status || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function typeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    ORDINARY: "Ordinária",
    EXTRAORDINARY: "Extraordinária",
    SPECIAL: "Especial",
    OTHER: "Outra",
  };
  return labels[type || ""] || type || "-";
}

function modeLabel(mode?: string | null) {
  const labels: Record<string, string> = {
    PRESENTIAL: "Presencial",
    ONLINE: "Virtual",
    HYBRID: "Híbrida",
  };
  return labels[mode || ""] || mode || "-";
}

function extractCondominios(data: unknown): Condominio[] {
  if (Array.isArray(data)) return data as Condominio[];
  if (data && typeof data === "object") {
    const payload = data as { condominiums?: unknown; condominios?: unknown; items?: unknown; data?: unknown };
    if (Array.isArray(payload.condominiums)) return payload.condominiums as Condominio[];
    if (Array.isArray(payload.condominios)) return payload.condominios as Condominio[];
    if (Array.isArray(payload.items)) return payload.items as Condominio[];
    if (Array.isArray(payload.data)) return payload.data as Condominio[];
  }
  return [];
}

function getCreateValidationMessage(form: AssemblyFormState) {
  if (form.title.trim().length < 3) return "Informe um título com pelo menos 3 caracteres.";
  if (!form.condominiumId) return "Selecione o condomínio da assembleia.";

  const scheduledStartAt = form.scheduledStartAt ? new Date(form.scheduledStartAt) : null;
  const scheduledEndAt = form.scheduledEndAt ? new Date(form.scheduledEndAt) : null;
  const votingStartsAt = form.votingStartsAt ? new Date(form.votingStartsAt) : null;
  const votingEndsAt = form.votingEndsAt ? new Date(form.votingEndsAt) : null;

  if (scheduledStartAt && scheduledEndAt && scheduledEndAt <= scheduledStartAt) {
    return "O encerramento previsto deve ser posterior ao início da assembleia.";
  }
  if (votingStartsAt && votingEndsAt && votingEndsAt <= votingStartsAt) {
    return "O prazo final da votação deve ser posterior ao início da votação.";
  }
  if (form.status === "SCHEDULED") {
    if (!form.scheduledStartAt) return "Informe o início previsto para agendar a assembleia.";
    if (!form.votingStartsAt) return "Informe quando a votação será iniciada.";
    if (!form.votingEndsAt) return "Informe o prazo final da votação.";
    if (votingEndsAt && votingEndsAt <= new Date()) return "O prazo final da votação deve ser futuro.";
  }
  return "";
}

function KpiCard({ label, value, description }: { label: string; value: number | string; description: string }) {
  return (
    <div className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-[#17211B]">{value}</p>
      <p className="mt-2 text-sm font-medium leading-5 text-[#5E6B63]">{description}</p>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="rounded-[28px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#EAF7EE] text-2xl">🏛</div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">Nenhuma assembleia encontrada</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
        Crie a primeira assembleia para organizar convocação, pautas e votação pelo celular com rastreabilidade por unidade.
      </p>
      <button type="button" onClick={onCreate} className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]">
        Nova Assembleia
      </button>
    </section>
  );
}

export default function AdminAssembleiasPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [assemblies, setAssemblies] = useState<AssemblyListItem[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [kpis, setKpis] = useState<NonNullable<AssembliesResponse["kpis"]>>({});
  const [pagination, setPagination] = useState<AssembliesResponse["pagination"]>();
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(defaultFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AssemblyFormState>(emptyForm);
  const [pendingAgendaLoading, setPendingAgendaLoading] = useState(false);
  const [pendingAgendaItems, setPendingAgendaItems] = useState<PendingAgendaItem[]>([]);
  const [selectedPendingAgendaItemIds, setSelectedPendingAgendaItemIds] = useState<string[]>([]);

  const loadAssemblies = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    try {
      if (showLoading) setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (appliedFilters.q.trim()) params.set("q", appliedFilters.q.trim());
      if (appliedFilters.condominiumId) params.set("condominiumId", appliedFilters.condominiumId);
      if (appliedFilters.status !== "ALL") params.set("status", appliedFilters.status);
      if (appliedFilters.type !== "ALL") params.set("type", appliedFilters.type);
      if (appliedFilters.mode !== "ALL") params.set("mode", appliedFilters.mode);
      const query = params.toString();
      const res = await fetch(`/api/admin/assembleias${query ? `?${query}` : ""}`, { cache: "no-store" });
      const data = await readApiResponse(res);
      if (!res.ok) {
        setAssemblies([]);
        setKpis({});
        setPagination(undefined);
        setError(getApiErrorMessage(data, "Erro ao carregar assembleias."));
        return;
      }
      const payload = data as AssembliesResponse;
      setAssemblies(Array.isArray(payload.assemblies) ? payload.assemblies : []);
      setKpis(payload.kpis || {});
      setPagination(payload.pagination);
    } catch (err) {
      console.error(err);
      setAssemblies([]);
      setKpis({});
      setPagination(undefined);
      setError("Erro ao carregar assembleias.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [appliedFilters]);

  const loadCondominios = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/condominios", { cache: "no-store" });
      const data = await readApiResponse(res);
      setCondominios(res.ok ? extractCondominios(data) : []);
    } catch (err) {
      console.error(err);
      setCondominios([]);
    }
  }, []);

  const loadPendingAgendaItems = useCallback(async (condominiumId: string) => {
    if (!condominiumId) {
      setPendingAgendaItems([]);
      setSelectedPendingAgendaItemIds([]);
      return;
    }

    try {
      setPendingAgendaLoading(true);
      const params = new URLSearchParams({ condominiumId });
      const res = await fetch(`/api/admin/assembleias/pautas-pendentes?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await readApiResponse(res);
      if (!res.ok) {
        setPendingAgendaItems([]);
        setSelectedPendingAgendaItemIds([]);
        return;
      }
      const payload = data as PendingAgendaItemsResponse;
      setPendingAgendaItems(Array.isArray(payload.pendingAgendaItems) ? payload.pendingAgendaItems : []);
      setSelectedPendingAgendaItemIds([]);
    } catch (err) {
      console.error(err);
      setPendingAgendaItems([]);
      setSelectedPendingAgendaItemIds([]);
    } finally {
      setPendingAgendaLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadAssemblies(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadAssemblies]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadCondominios(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadCondominios]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPendingAgendaItems(form.condominiumId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [form.condominiumId, loadPendingAgendaItems]);

  const metrics = useMemo(() => ({
    total: pagination?.total ?? assemblies.length,
    draft: kpis.totalDraft ?? 0,
    scheduled: kpis.totalScheduled ?? 0,
    open: kpis.totalOpen ?? 0,
    closed: kpis.totalClosed ?? 0,
    published: kpis.totalResultsPublished ?? 0,
    votes: kpis.totalVotes ?? 0,
  }), [assemblies.length, kpis, pagination]);

  const validationMessage = getCreateValidationMessage(form);
  const canSubmit = validationMessage === "";

  function updateForm<K extends keyof AssemblyFormState>(key: K, value: AssemblyFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreateModal() {
    setForm(emptyForm);
    setPendingAgendaItems([]);
    setSelectedPendingAgendaItemIds([]);
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function togglePendingAgendaItem(agendaItemId: string) {
    setSelectedPendingAgendaItemIds((current) =>
      current.includes(agendaItemId)
        ? current.filter((item) => item !== agendaItemId)
        : [...current, agendaItemId],
    );
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      alert(validationMessage || "Revise os campos obrigatórios antes de salvar.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const res = await fetch("/api/admin/assembleias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          title: form.title.trim(),
          description: form.description.trim() || null,
          scheduledStartAt: normalizeDateTimeForApi(form.scheduledStartAt),
          scheduledEndAt: normalizeDateTimeForApi(form.scheduledEndAt),
          votingStartsAt: normalizeDateTimeForApi(form.votingStartsAt),
          votingEndsAt: normalizeDateTimeForApi(form.votingEndsAt),
          location: form.location.trim() || null,
          externalMeetingUrl: form.externalMeetingUrl.trim() || null,
          accessInstructions: form.accessInstructions.trim() || null,
          convocationText: form.convocationText.trim() || null,
          internalNotes: form.internalNotes.trim() || null,
          pendingAgendaItemIds: selectedPendingAgendaItemIds,
        }),
      });
      const data = await readApiResponse(res);
      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao criar assembleia."));
        return;
      }
      const payload = data as { message?: string };
      setModalOpen(false);
      setForm(emptyForm);
      setPendingAgendaItems([]);
      setSelectedPendingAgendaItemIds([]);
      setSuccess(payload.message || "Assembleia criada com sucesso.");
      await loadAssemblies({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao criar assembleia.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <EloGestLoadingScreen />;

  return (
    <AdminContextGuard>
      <AdminShell
        current="assembleias"
        actions={
          <button type="button" onClick={openCreateModal} className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]">
            Nova Assembleia
          </button>
        }
      >
        <section className="mb-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">Governança Deliberativa</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B]">Assembleias e votação pelo celular</h1>
          <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-[#5E6B63]">
            Organize convocações e prepare deliberações formais com voto auditável por unidade. Pautas e regras de deliberação já podem ser configuradas. Elegibilidade, procurações e apuração serão ativadas nos próximos blocos desta etapa.
          </p>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
        {success && <div className="mb-5 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-3 text-sm font-semibold text-[#256D3C]">{success}</div>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Total" value={metrics.total} description="Assembleias cadastradas." />
          <KpiCard label="Rascunhos" value={metrics.draft} description="Em preparação interna." />
          <KpiCard label="Agendadas" value={metrics.scheduled} description="Com programação definida." />
          <KpiCard label="Em andamento" value={metrics.open} description="Abertas para operação." />
          <KpiCard label="Resultados" value={metrics.published} description="Resultados já publicados." />
          <KpiCard label="Votos" value={metrics.votes} description="Registros auditáveis futuros." />
        </section>

        <section className="mt-6 rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input value={filters.q} onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))} placeholder="Buscar assembleia..." className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C] xl:col-span-2" />
            <select value={filters.condominiumId} onChange={(e) => setFilters((p) => ({ ...p, condominiumId: e.target.value }))} className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]">
              <option value="">Todos os condomínios</option>
              {condominios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value as FiltersState["status"] }))} className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]">
              <option value="ALL">Todos os status</option><option value="DRAFT">Rascunho</option><option value="SCHEDULED">Agendada</option><option value="OPEN">Em Andamento</option><option value="CLOSED">Encerrada</option><option value="RESULTS_PUBLISHED">Resultados Publicados</option><option value="CANCELED">Cancelada</option><option value="ARCHIVED">Arquivada</option>
            </select>
            <select value={filters.type} onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value as FiltersState["type"] }))} className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]">
              <option value="ALL">Todos os tipos</option><option value="ORDINARY">Ordinária</option><option value="EXTRAORDINARY">Extraordinária</option><option value="SPECIAL">Especial</option><option value="OTHER">Outra</option>
            </select>
            <select value={filters.mode} onChange={(e) => setFilters((p) => ({ ...p, mode: e.target.value as FiltersState["mode"] }))} className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]">
              <option value="ALL">Todas as modalidades</option><option value="PRESENTIAL">Presencial</option><option value="ONLINE">Virtual</option><option value="HYBRID">Híbrida</option>
            </select>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => setAppliedFilters(filters)} className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#174B2A]">Aplicar Filtros</button>
            <button type="button" onClick={() => { setFilters(defaultFilters); setAppliedFilters(defaultFilters); }} className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#5E6B63] transition hover:border-[#256D3C] hover:text-[#256D3C]">Limpar</button>
          </div>
        </section>

        <section className="mt-6">
          {assemblies.length === 0 ? <EmptyState onCreate={openCreateModal} /> : (
            <div className="grid gap-4 xl:grid-cols-2">
              {assemblies.map((assembly) => (
                <article key={assembly.id} className="rounded-[26px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">{assembly.condominium?.name || "Condomínio"}</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">{assembly.title}</h2>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(assembly.status)}`}>{statusLabel(assembly.status)}</span>
                  </div>
                  <p className="mt-3 text-sm font-medium leading-6 text-[#5E6B63]">{excerpt(assembly.description)}</p>
                  <div className="mt-4 grid gap-3 rounded-2xl bg-[#F9FBFA] p-4 text-sm sm:grid-cols-2">
                    <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Tipo</p><p className="mt-1 font-semibold text-[#17211B]">{typeLabel(assembly.type)}</p></div>
                    <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Modalidade</p><p className="mt-1 font-semibold text-[#17211B]">{modeLabel(assembly.mode)}</p></div>
                    <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Início Previsto</p><p className="mt-1 font-semibold text-[#17211B]">{formatDateTime(assembly.scheduledStartAt)}</p></div>
                    <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Prazo Da Votação</p><p className="mt-1 font-semibold text-[#17211B]">{formatDateTime(assembly.votingEndsAt)}</p></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[#5E6B63]">
                    <span className="rounded-full bg-[#F6F8F7] px-3 py-1.5">{assembly._count?.agendaItems ?? 0} pautas</span>
                    <span className="rounded-full bg-[#F6F8F7] px-3 py-1.5">{assembly._count?.eligibleUnits ?? 0} unidades aptas</span>
                    <span className="rounded-full bg-[#F6F8F7] px-3 py-1.5">{assembly._count?.votes ?? 0} votos</span>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <Link href={`/admin/assembleias/${assembly.id}`} className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 text-sm font-semibold text-[#256D3C] transition hover:border-[#256D3C]">Gerenciar Assembleia</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {modalOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#17211B]/62 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[30px] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Etapa 51</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">Nova Assembleia</h2><p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">Cadastre a base da convocação. Após salvar, abra a assembleia para configurar suas pautas e regras de votação.</p></div>
                <button type="button" onClick={() => !saving && setModalOpen(false)} className="h-10 w-10 rounded-2xl border border-[#DDE5DF] text-lg font-bold text-[#5E6B63]">×</button>
              </div>
              <form onSubmit={handleSave} className="mt-6 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="md:col-span-2"><span className="text-sm font-semibold text-[#17211B]">Título</span><input value={form.title} onChange={(e) => updateForm("title", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" placeholder="Ex.: Assembleia Geral Ordinária 2026" /></label>
                  <label><span className="text-sm font-semibold text-[#17211B]">Condomínio</span><select value={form.condominiumId} onChange={(e) => updateForm("condominiumId", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"><option value="">Selecione...</option>{condominios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label><span className="text-sm font-semibold text-[#17211B]">Status Inicial</span><select value={form.status} onChange={(e) => updateForm("status", e.target.value as AssemblyFormState["status"])} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"><option value="DRAFT">Rascunho</option><option value="SCHEDULED">Agendada</option></select></label>
                  <label><span className="text-sm font-semibold text-[#17211B]">Tipo</span><select value={form.type} onChange={(e) => updateForm("type", e.target.value as AssemblyType)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"><option value="ORDINARY">Ordinária</option><option value="EXTRAORDINARY">Extraordinária</option><option value="SPECIAL">Especial</option><option value="OTHER">Outra</option></select></label>
                  <label><span className="text-sm font-semibold text-[#17211B]">Modalidade</span><select value={form.mode} onChange={(e) => updateForm("mode", e.target.value as MeetingMode)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"><option value="PRESENTIAL">Presencial</option><option value="ONLINE">Virtual</option><option value="HYBRID">Híbrida</option></select></label>
                  <label><span className="text-sm font-semibold text-[#17211B]">Início Previsto</span><input type="datetime-local" value={form.scheduledStartAt} onChange={(e) => updateForm("scheduledStartAt", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                  <label><span className="text-sm font-semibold text-[#17211B]">Encerramento Previsto</span><input type="datetime-local" value={form.scheduledEndAt} onChange={(e) => updateForm("scheduledEndAt", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                  <label><span className="text-sm font-semibold text-[#17211B]">Início Da Votação</span><input type="datetime-local" value={form.votingStartsAt} onChange={(e) => updateForm("votingStartsAt", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                  <label><span className="text-sm font-semibold text-[#17211B]">Fim Da Votação</span><input type="datetime-local" value={form.votingEndsAt} onChange={(e) => updateForm("votingEndsAt", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                  <label><span className="text-sm font-semibold text-[#17211B]">Local Presencial</span><input value={form.location} onChange={(e) => updateForm("location", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" placeholder="Opcional" /></label>
                  <label><span className="text-sm font-semibold text-[#17211B]">Link Da Reunião</span><input value={form.externalMeetingUrl} onChange={(e) => updateForm("externalMeetingUrl", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" placeholder="Opcional" /></label>
                  <label className="md:col-span-2"><span className="text-sm font-semibold text-[#17211B]">Descrição</span><textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium outline-none focus:border-[#256D3C]" /></label>
                  <label className="md:col-span-2"><span className="text-sm font-semibold text-[#17211B]">Texto Da Convocação</span><textarea value={form.convocationText} onChange={(e) => updateForm("convocationText", e.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium outline-none focus:border-[#256D3C]" placeholder="Opcional nesta primeira etapa" /></label>

                  {form.condominiumId && (
                    <section className="md:col-span-2 rounded-2xl border border-[#CFE6D4] bg-[#F5FBF6] p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Pautas Pendentes De Assembleias Anteriores</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                        Selecione as pautas que devem retornar para nova deliberação. Elas serão copiadas para a nova assembleia com vínculo histórico à pauta original.
                      </p>

                      {pendingAgendaLoading ? (
                        <p className="mt-3 text-sm font-semibold text-[#5E6B63]">Consultando pautas pendentes...</p>
                      ) : pendingAgendaItems.length === 0 ? (
                        <p className="mt-3 text-sm font-semibold text-[#5E6B63]">Nenhuma pauta pendente disponível para este condomínio.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {pendingAgendaItems.map((item) => (
                            <label key={item.id} className="flex items-start gap-3 rounded-xl border border-[#DDE5DF] bg-white p-3">
                              <input
                                type="checkbox"
                                checked={selectedPendingAgendaItemIds.includes(item.id)}
                                onChange={() => togglePendingAgendaItem(item.id)}
                                className="mt-1 h-4 w-4"
                              />
                              <span>
                                <strong className="block text-sm text-[#17211B]">{item.title}</strong>
                                <span className="mt-1 block text-xs font-medium leading-5 text-[#5E6B63]">
                                  Origem: {item.assembly?.title || "Assembleia anterior"} · Motivo: {deferredReasonLabel(item.deferredReason)}
                                </span>
                                {item.deferredNotes && (
                                  <span className="mt-1 block text-xs font-medium leading-5 text-[#7A877F]">{item.deferredNotes}</span>
                                )}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"><input type="checkbox" checked={form.allowVoteChange} onChange={(e) => updateForm("allowVoteChange", e.target.checked)} className="mt-1 h-4 w-4" /><span><span className="block text-sm font-semibold text-[#17211B]">Permitir alteração do voto enquanto a assembleia estiver aberta</span><span className="mt-1 block text-xs font-medium leading-5 text-[#7A877F]">Cada alteração permanecerá registrada no histórico para auditoria.</span></span></label>
                </div>
                {validationMessage && <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{validationMessage}</p>}
                <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={() => !saving && setModalOpen(false)} className="h-11 rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63]">Cancelar</button><button type="submit" disabled={!canSubmit || saving} className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Salvando..." : "Salvar Assembleia"}</button></div>
              </form>
            </div>
          </div>
        )}

      </AdminShell>
    </AdminContextGuard>
  );
}
