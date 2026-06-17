"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";
import OperationalAnnouncementAiAssistant from "@/components/admin/OperationalAnnouncementAiAssistant";



/* =========================================================
   COMUNICADOS - PÁGINA ADMINISTRATIVA

   Arquivo:
   src/app/admin/comunicados/page.tsx

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Objetivo:
   - Listar comunicados da administradora ativa.
   - Criar comunicado como rascunho ou agendado.
   - Publicar comunicado.
   - Arquivar comunicado.
   - Exibir indicadores básicos de leitura.

   Segurança:
   - A proteção real fica nas APIs.
   - A página usa AdminContextGuard para proteção visual.
   - As APIs exigem perfil ativo ADMINISTRADORA, administradora ativa
     e módulo comercial Comunicados liberado.

   Observação:
   - O menu lateral será conectado na Etapa 48.7 para evitar mexer
     no AdminShell antes da página administrativa estar aprovada.
   ========================================================= */



type AnnouncementType =
  | "GENERAL"
  | "MAINTENANCE"
  | "ASSEMBLY"
  | "FINANCIAL"
  | "SECURITY"
  | "EMERGENCY"
  | "GOVERNANCE";

type AnnouncementStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

type AnnouncementPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

type AnnouncementTargetScope =
  | "ALL_ADMINISTRATOR"
  | "CONDOMINIUM"
  | "BLOCK"
  | "UNIT"
  | "ROLE"
  | "LINK_TYPE"
  | "CUSTOM";

type AnnouncementLogAction =
  | "CREATED"
  | "UPDATED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "ARCHIVED"
  | "REMINDER_SENT"
  | "READING_CONFIRMED"
  | "ATTACHMENT_ADDED"
  | "ATTACHMENT_REMOVED";

type AccessRole =
  | "ADMINISTRADORA"
  | "SINDICO"
  | "MORADOR"
  | "PROPRIETARIO"
  | "CONSELHEIRO";

type UnitPersonLinkType =
  | "OWNER"
  | "RESIDENT"
  | "TENANT"
  | "DEPENDENT"
  | "AUTHORIZED";

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

interface Condominio {
  id: string;
  name: string;
  status?: string | null;
}

interface AnnouncementListItem {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType | string;
  status: AnnouncementStatus | string;
  priority: AnnouncementPriority | string;
  targetScope: AnnouncementTargetScope | string;
  publishAt?: string | null;
  publishedAt?: string | null;
  eventDate?: string | null;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  expiresAt?: string | null;
  requireReadingConfirmation: boolean;
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
  targets?: {
    id?: string;
    condominiumId?: string | null;
    unitId?: string | null;
    block?: string | null;
    role?: string | null;
    linkType?: string | null;
  }[];
  attachments?: AnnouncementAttachmentItem[];
  _count?: {
    readings?: number;
    targets?: number;
    attachments?: number;
  };
}

interface AnnouncementsResponse {
  announcements?: AnnouncementListItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  kpis?: {
    totalPublished?: number;
    totalDraft?: number;
    totalScheduled?: number;
    totalArchived?: number;
    totalReadings?: number;
  };
  error?: string;
}


interface AnnouncementReadingItem {
  id: string;
  readAt: string;
  createdAt?: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  userAccess?: {
    id: string;
    role?: string | null;
    label?: string | null;
    condominium?: {
      id: string;
      name?: string | null;
    } | null;
    unit?: {
      id: string;
      block?: string | null;
      unitNumber?: string | null;
    } | null;
  } | null;
}

interface AnnouncementReadingsResponse {
  announcement?: {
    id: string;
    title: string;
  };
  readings?: AnnouncementReadingItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: {
    totalReadings?: number;
  };
  error?: string;
}

interface AnnouncementLogItem {
  id: string;
  action: AnnouncementLogAction | string;
  message?: string | null;
  metadata?: unknown;
  createdAt: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

interface AnnouncementHistoryResponse {
  announcement?: {
    id: string;
    title: string;
  };
  logs?: AnnouncementLogItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: {
    totalLogs?: number;
  };
  error?: string;
}

interface AnnouncementAttachmentItem {
  id: string;
  originalName: string;
  storedName?: string | null;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
  uploadedByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

interface AnnouncementAttachmentsResponse {
  announcement?: {
    id: string;
    title: string;
  };
  attachments?: AnnouncementAttachmentItem[];
  attachment?: AnnouncementAttachmentItem;
  error?: string;
  message?: string;
}

interface AnnouncementFormState {
  title: string;
  content: string;
  type: AnnouncementType;
  status: "DRAFT" | "SCHEDULED";
  priority: AnnouncementPriority;
  targetScope: AnnouncementTargetScope;
  condominiumId: string;
  block: string;
  role: "" | AccessRole;
  linkType: "" | UnitPersonLinkType;
  publishAt: string;
  eventStartAt: string;
  eventEndAt: string;
  expiresAt: string;
  requireReadingConfirmation: boolean;
}

interface FiltersState {
  q: string;
  condominiumId: string;
  status: "ALL" | AnnouncementStatus;
  type: "ALL" | AnnouncementType;
  priority: "ALL" | AnnouncementPriority;
}

const emptyForm: AnnouncementFormState = {
  title: "",
  content: "",
  type: "GENERAL",
  status: "DRAFT",
  priority: "NORMAL",
  targetScope: "CONDOMINIUM",
  condominiumId: "",
  block: "",
  role: "",
  linkType: "",
  publishAt: "",
  eventStartAt: "",
  eventEndAt: "",
  expiresAt: "",
  requireReadingConfirmation: true,
};

const defaultFilters: FiltersState = {
  q: "",
  condominiumId: "",
  status: "ALL",
  type: "ALL",
  priority: "ALL",
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

function formatFileSize(value?: number | null) {
  if (!value || value <= 0) {
    return "0 KB";
  }

  if (value < 1024 * 1024) {
    return `${Math.ceil(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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

function excerpt(value: string, maxLength = 150) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho",
    SCHEDULED: "Agendado",
    PUBLISHED: "Publicado",
    ARCHIVED: "Arquivado",
  };

  return labels[status || ""] || status || "-";
}

function statusClass(status?: string | null) {
  const classes: Record<string, string> = {
    DRAFT: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    SCHEDULED: "border-blue-200 bg-blue-50 text-blue-700",
    PUBLISHED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    ARCHIVED: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return classes[status || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function typeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    GENERAL: "Geral",
    MAINTENANCE: "Manutenção",
    ASSEMBLY: "Assembleia",
    FINANCIAL: "Financeiro",
    SECURITY: "Segurança",
    EMERGENCY: "Emergência",
    GOVERNANCE: "Governança",
  };

  return labels[type || ""] || type || "-";
}

function priorityLabel(priority?: string | null) {
  const labels: Record<string, string> = {
    LOW: "Baixa",
    NORMAL: "Normal",
    HIGH: "Alta",
    URGENT: "Urgente",
  };

  return labels[priority || ""] || priority || "-";
}

function priorityClass(priority?: string | null) {
  const classes: Record<string, string> = {
    LOW: "border-[#DDE5DF] bg-white text-[#5E6B63]",
    NORMAL: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    HIGH: "border-amber-200 bg-amber-50 text-amber-700",
    URGENT: "border-red-200 bg-red-50 text-red-700",
  };

  return classes[priority || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function targetScopeLabel(scope?: string | null) {
  const labels: Record<string, string> = {
    ALL_ADMINISTRATOR: "Toda A Carteira",
    CONDOMINIUM: "Condomínio",
    BLOCK: "Bloco",
    UNIT: "Unidade",
    ROLE: "Perfil De Acesso",
    LINK_TYPE: "Tipo De Vínculo",
    CUSTOM: "Personalizado",
  };

  return labels[scope || ""] || scope || "-";
}

function roleLabel(role?: string | null) {
  const labels: Record<string, string> = {
    ADMINISTRADORA: "Administradora",
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

function announcementLogActionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    CREATED: "Criado",
    UPDATED: "Editado",
    SCHEDULED: "Agendado",
    PUBLISHED: "Publicado",
    ARCHIVED: "Arquivado",
    REMINDER_SENT: "Lembrete enviado",
    READING_CONFIRMED: "Leitura confirmada",
    ATTACHMENT_ADDED: "Anexo adicionado",
    ATTACHMENT_REMOVED: "Anexo removido",
  };

  return labels[action || ""] || action || "-";
}

function announcementLogActionClass(action?: string | null) {
  const classes: Record<string, string> = {
    CREATED: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    UPDATED: "border-blue-200 bg-blue-50 text-blue-700",
    SCHEDULED: "border-blue-200 bg-blue-50 text-blue-700",
    PUBLISHED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    ARCHIVED: "border-amber-200 bg-amber-50 text-amber-700",
    REMINDER_SENT: "border-purple-200 bg-purple-50 text-purple-700",
    READING_CONFIRMED: "border-[#CFE6D4] bg-[#F6FFF8] text-[#256D3C]",
    ATTACHMENT_ADDED: "border-[#DDE5DF] bg-white text-[#255D37]",
    ATTACHMENT_REMOVED: "border-red-200 bg-red-50 text-red-700",
  };

  return classes[action || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function formCanSubmit(form: AnnouncementFormState) {
  if (form.title.trim().length < 3) {
    return false;
  }

  if (form.content.trim().length < 10) {
    return false;
  }

  if (form.targetScope === "CONDOMINIUM" && !form.condominiumId) {
    return false;
  }

  if (form.targetScope === "BLOCK" && (!form.condominiumId || !form.block.trim())) {
    return false;
  }

  if (form.targetScope === "ROLE" && !form.role) {
    return false;
  }

  if (form.targetScope === "LINK_TYPE" && !form.linkType) {
    return false;
  }

  if (form.status === "SCHEDULED" && !form.publishAt) {
    return false;
  }

  if (form.eventStartAt && form.eventEndAt) {
    const start = new Date(form.eventStartAt);
    const end = new Date(form.eventEndAt);

    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end <= start
    ) {
      return false;
    }
  }

  return true;
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

    if (Array.isArray(payload.condominiums)) {
      return payload.condominiums as Condominio[];
    }

    if (Array.isArray(payload.condominios)) {
      return payload.condominios as Condominio[];
    }

    if (Array.isArray(payload.items)) {
      return payload.items as Condominio[];
    }

    if (Array.isArray(payload.data)) {
      return payload.data as Condominio[];
    }
  }

  return [];
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
        ✉
      </div>

      <h2 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">
        Nenhum comunicado encontrado
      </h2>

      <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
        Crie o primeiro comunicado para registrar avisos oficiais, acompanhar
        confirmações de leitura e fortalecer a rastreabilidade da comunicação
        com condomínios, síndicos, proprietários e moradores.
      </p>

      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]"
      >
        Novo Comunicado
      </button>
    </section>
  );
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function AdminComunicadosPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [announcements, setAnnouncements] = useState<AnnouncementListItem[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [kpis, setKpis] = useState<NonNullable<AnnouncementsResponse["kpis"]>>({});
  const [pagination, setPagination] = useState<AnnouncementsResponse["pagination"]>();

  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(defaultFilters);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementListItem | null>(null);
  const [form, setForm] = useState<AnnouncementFormState>(emptyForm);

  const [readingsModalOpen, setReadingsModalOpen] = useState(false);
  const [readingsLoading, setReadingsLoading] = useState(false);

  const [attachmentsModalOpen, setAttachmentsModalOpen] = useState(false);
  const [attachmentsAnnouncement, setAttachmentsAnnouncement] = useState<AnnouncementListItem | null>(null);
  const [attachments, setAttachments] = useState<AnnouncementAttachmentItem[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentDeletingId, setAttachmentDeletingId] = useState<string | null>(null);
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null);
  const [draftAttachmentFile, setDraftAttachmentFile] = useState<File | null>(null);
  const [readingsAnnouncement, setReadingsAnnouncement] = useState<AnnouncementListItem | null>(null);
  const [readings, setReadings] = useState<AnnouncementReadingItem[]>([]);
  const [readingsTotal, setReadingsTotal] = useState(0);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyAnnouncement, setHistoryAnnouncement] = useState<AnnouncementListItem | null>(null);
  const [historyLogs, setHistoryLogs] = useState<AnnouncementLogItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);



  /* =========================================================
     CARREGAMENTO
     ========================================================= */

  const loadAnnouncements = useCallback(
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

        if (appliedFilters.condominiumId) {
          params.set("condominiumId", appliedFilters.condominiumId);
        }

        if (appliedFilters.status !== "ALL") {
          params.set("status", appliedFilters.status);
        }

        if (appliedFilters.type !== "ALL") {
          params.set("type", appliedFilters.type);
        }

        if (appliedFilters.priority !== "ALL") {
          params.set("priority", appliedFilters.priority);
        }

        const query = params.toString();
        const res = await fetch(`/api/admin/comunicados${query ? `?${query}` : ""}`, {
          cache: "no-store",
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          setAnnouncements([]);
          setKpis({});
          setPagination(undefined);
          setError(getApiErrorMessage(data, "Erro ao carregar comunicados."));
          return;
        }

        const payload = data as AnnouncementsResponse;

        setAnnouncements(Array.isArray(payload.announcements) ? payload.announcements : []);
        setKpis(payload.kpis || {});
        setPagination(payload.pagination);
      } catch (err) {
        console.error(err);
        setAnnouncements([]);
        setKpis({});
        setPagination(undefined);
        setError("Erro ao carregar comunicados.");
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [appliedFilters],
  );

  const loadCondominios = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/condominios", {
        cache: "no-store",
      });

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
    void loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    void loadCondominios();
  }, [loadCondominios]);



  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const computedMetrics = useMemo(() => {
    const total = pagination?.total ?? announcements.length;
    const published = kpis.totalPublished ?? 0;
    const draft = kpis.totalDraft ?? 0;
    const scheduled = kpis.totalScheduled ?? 0;
    const archived = kpis.totalArchived ?? 0;
    const readings = kpis.totalReadings ?? 0;
    const visiblePendingBase = announcements.filter(
      (announcement) => announcement.status === "PUBLISHED" && announcement.requireReadingConfirmation,
    ).length;

    return {
      total,
      published,
      draft,
      scheduled,
      archived,
      readings,
      visiblePendingBase,
    };
  }, [announcements, kpis, pagination]);

  const canSubmit = formCanSubmit(form);
  const attachmentsModalReadings = attachmentsAnnouncement?._count?.readings ?? 0;
  const attachmentsModalCanManage = Boolean(
    attachmentsAnnouncement &&
      (attachmentsAnnouncement.status === "DRAFT" ||
        attachmentsAnnouncement.status === "SCHEDULED" ||
        (attachmentsAnnouncement.status === "PUBLISHED" && attachmentsModalReadings === 0)),
  );



  /* =========================================================
     AÇÕES
     ========================================================= */

  function openCreateModal() {
    setEditingAnnouncement(null);
    setForm(emptyForm);
    setDraftAttachmentFile(null);
    setSuccess("");
    setError("");
    setModalOpen(true);
  }

  async function openEditModal(announcement: AnnouncementListItem) {
    if (announcement.status !== "DRAFT" && announcement.status !== "SCHEDULED") {
      alert("Somente comunicados em rascunho ou agendados podem ser editados.");
      return;
    }

    try {
      setActionLoadingId(announcement.id);
      setSuccess("");
      setError("");

      const res = await fetch(`/api/admin/comunicados/${announcement.id}`, {
        cache: "no-store",
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao carregar comunicado para edição."));
        return;
      }

      const payload = data as { announcement?: AnnouncementListItem };
      const detail = payload.announcement || announcement;
      const firstTarget = Array.isArray(detail.targets) ? detail.targets[0] : null;

      setEditingAnnouncement(detail);
      setDraftAttachmentFile(null);
      setForm({
        title: detail.title || "",
        content: detail.content || "",
        type: detail.type as AnnouncementType,
        status: detail.status === "SCHEDULED" ? "SCHEDULED" : "DRAFT",
        priority: detail.priority as AnnouncementPriority,
        targetScope: detail.targetScope as AnnouncementTargetScope,
        condominiumId: detail.condominium?.id || firstTarget?.condominiumId || "",
        block: firstTarget?.block || "",
        role: firstTarget?.role ? (firstTarget.role as AnnouncementFormState["role"]) : "",
        linkType: firstTarget?.linkType ? (firstTarget.linkType as AnnouncementFormState["linkType"]) : "",
        publishAt: toDateTimeLocalValue(detail.publishAt),
        eventStartAt: toDateTimeLocalValue(detail.eventStartAt || detail.eventDate),
        eventEndAt: toDateTimeLocalValue(detail.eventEndAt),
        expiresAt: toDateTimeLocalValue(detail.expiresAt),
        requireReadingConfirmation: Boolean(detail.requireReadingConfirmation),
      });
      setModalOpen(true);
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar comunicado para edição.");
    } finally {
      setActionLoadingId(null);
    }
  }

  function closeCreateModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setEditingAnnouncement(null);
    setDraftAttachmentFile(null);
  }

  function updateForm<K extends keyof AnnouncementFormState>(
    key: K,
    value: AnnouncementFormState[K],
  ) {
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };

      if (key === "targetScope") {
        next.condominiumId = "";
        next.block = "";
        next.role = "";
        next.linkType = "";
      }

      if (key === "status" && value === "DRAFT") {
        next.publishAt = "";
      }

      return next;
    });
  }

  function applyAnnouncementAiSuggestion(suggestion: {
    title?: string | null;
    content?: string | null;
  }) {
    setForm((prev) => ({
      ...prev,
      title: suggestion.title || prev.title,
      content: suggestion.content || prev.content,
    }));
  }

  function applyFilters() {
    setAppliedFilters(filters);
  }

  function clearFilters() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  }



  async function uploadOptionalAttachmentForAnnouncement({
    announcementId,
    file,
  }: {
    announcementId: string;
    file: File;
  }) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/admin/comunicados/${announcementId}/anexos`, {
      method: "POST",
      body: formData,
    });

    const data: unknown = await res.json();

    if (!res.ok) {
      throw new Error(getApiErrorMessage(data, "Comunicado salvo, mas não foi possível anexar o documento."));
    }

    return data as AnnouncementAttachmentsResponse;
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      alert("Revise os campos obrigatórios antes de salvar o comunicado.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const body = {
        title: form.title.trim(),
        content: form.content.trim(),
        type: form.type,
        status: form.status,
        priority: form.priority,
        targetScope: form.targetScope,
        condominiumId:
          form.targetScope === "CONDOMINIUM" ||
          form.targetScope === "BLOCK" ||
          form.targetScope === "ROLE" ||
          form.targetScope === "LINK_TYPE"
            ? form.condominiumId || null
            : null,
        block: form.targetScope === "BLOCK" ? form.block.trim() || null : null,
        role: form.targetScope === "ROLE" ? form.role || null : null,
        linkType: form.targetScope === "LINK_TYPE" ? form.linkType || null : null,
        publishAt: form.status === "SCHEDULED" ? normalizeDateTimeForApi(form.publishAt) : null,
        eventStartAt: normalizeDateTimeForApi(form.eventStartAt),
        eventEndAt: normalizeDateTimeForApi(form.eventEndAt),
        expiresAt: normalizeDateTimeForApi(form.expiresAt),
        requireReadingConfirmation: form.requireReadingConfirmation,
      };

      const endpoint = editingAnnouncement
        ? `/api/admin/comunicados/${editingAnnouncement.id}`
        : "/api/admin/comunicados";

      const res = await fetch(endpoint, {
        method: editingAnnouncement ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, editingAnnouncement ? "Erro ao editar comunicado." : "Erro ao criar comunicado."));
        return;
      }

      const payload = data as { announcement?: { id?: string } };
      const announcementId = payload.announcement?.id || editingAnnouncement?.id;

      if (draftAttachmentFile && announcementId) {
        try {
          await uploadOptionalAttachmentForAnnouncement({
            announcementId,
            file: draftAttachmentFile,
          });
        } catch (attachmentError) {
          alert(
            attachmentError instanceof Error
              ? attachmentError.message
              : "Comunicado salvo, mas não foi possível anexar o documento.",
          );
        }
      }

      setModalOpen(false);
      setEditingAnnouncement(null);
      setDraftAttachmentFile(null);
      setForm(emptyForm);
      setSuccess(editingAnnouncement ? "Comunicado atualizado com sucesso." : "Comunicado criado com sucesso.");
      await loadAnnouncements({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert(editingAnnouncement ? "Erro ao editar comunicado." : "Erro ao criar comunicado.");
    } finally {
      setSaving(false);
    }
  }

  async function openReadingsModal(announcement: AnnouncementListItem) {
    try {
      setReadingsAnnouncement(announcement);
      setReadingsModalOpen(true);
      setReadingsLoading(true);
      setReadings([]);
      setReadingsTotal(0);

      const res = await fetch(`/api/admin/comunicados/${announcement.id}/leituras?pageSize=100`, {
        cache: "no-store",
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao carregar leituras do comunicado."));
        return;
      }

      const payload = data as AnnouncementReadingsResponse;
      setReadings(Array.isArray(payload.readings) ? payload.readings : []);
      setReadingsTotal(payload.pagination?.total ?? payload.summary?.totalReadings ?? 0);
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar leituras do comunicado.");
    } finally {
      setReadingsLoading(false);
    }
  }

  function closeReadingsModal() {
    if (readingsLoading) {
      return;
    }

    setReadingsModalOpen(false);
    setReadingsAnnouncement(null);
    setReadings([]);
    setReadingsTotal(0);
  }

  async function openHistoryModal(announcement: AnnouncementListItem) {
    try {
      setHistoryAnnouncement(announcement);
      setHistoryModalOpen(true);
      setHistoryLoading(true);
      setHistoryLogs([]);
      setHistoryTotal(0);

      const res = await fetch(`/api/admin/comunicados/${announcement.id}/historico?pageSize=100`, {
        cache: "no-store",
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao carregar histórico do comunicado."));
        return;
      }

      const payload = data as AnnouncementHistoryResponse;
      setHistoryLogs(Array.isArray(payload.logs) ? payload.logs : []);
      setHistoryTotal(payload.pagination?.total ?? payload.summary?.totalLogs ?? 0);
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar histórico do comunicado.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistoryModal() {
    if (historyLoading) {
      return;
    }

    setHistoryModalOpen(false);
    setHistoryAnnouncement(null);
    setHistoryLogs([]);
    setHistoryTotal(0);
  }


  async function openAttachmentsModal(announcement: AnnouncementListItem) {
    try {
      setAttachmentsModalOpen(true);
      setAttachmentsAnnouncement(announcement);
      setAttachments([]);
      setSelectedAttachmentFile(null);
      setAttachmentsLoading(true);
      setError("");

      const res = await fetch(`/api/admin/comunicados/${announcement.id}/anexos`, {
        cache: "no-store",
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao carregar anexos do comunicado."));
        return;
      }

      const payload = data as AnnouncementAttachmentsResponse;
      setAttachments(Array.isArray(payload.attachments) ? payload.attachments : []);
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar anexos do comunicado.");
    } finally {
      setAttachmentsLoading(false);
    }
  }



  function closeAttachmentsModal() {
    if (attachmentsLoading || attachmentUploading || attachmentDeletingId) {
      return;
    }

    setAttachmentsModalOpen(false);
    setAttachmentsAnnouncement(null);
    setAttachments([]);
    setSelectedAttachmentFile(null);
  }



  async function uploadAttachment() {
    if (!attachmentsAnnouncement || !selectedAttachmentFile || attachmentUploading) {
      return;
    }

    try {
      setAttachmentUploading(true);
      setError("");

      const formData = new FormData();
      formData.append("file", selectedAttachmentFile);

      const res = await fetch(`/api/admin/comunicados/${attachmentsAnnouncement.id}/anexos`, {
        method: "POST",
        body: formData,
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao enviar anexo."));
        return;
      }

      const payload = data as AnnouncementAttachmentsResponse;

      if (payload.attachment) {
        setAttachments((current) => [payload.attachment as AnnouncementAttachmentItem, ...current]);
      }

      setSelectedAttachmentFile(null);
      await loadAnnouncements({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar anexo.");
    } finally {
      setAttachmentUploading(false);
    }
  }



  async function deleteAttachment(attachment: AnnouncementAttachmentItem) {
    if (!attachmentsAnnouncement || attachmentDeletingId) {
      return;
    }

    if (!confirm(`Remover o anexo "${attachment.originalName}"?`)) {
      return;
    }

    try {
      setAttachmentDeletingId(attachment.id);
      setError("");

      const res = await fetch(
        `/api/admin/comunicados/${attachmentsAnnouncement.id}/anexos/${attachment.id}`,
        {
          method: "DELETE",
        },
      );

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao remover anexo."));
        return;
      }

      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      await loadAnnouncements({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao remover anexo.");
    } finally {
      setAttachmentDeletingId(null);
    }
  }



  async function publishAnnouncement(announcement: AnnouncementListItem) {
    if (
      !confirm(
        `Deseja publicar o comunicado "${announcement.title}" agora?`,
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(announcement.id);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/comunicados/${announcement.id}/publicar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao publicar comunicado."));
        return;
      }

      const payload = data as { message?: string };
      setSuccess(payload.message || "Comunicado publicado com sucesso.");
      await loadAnnouncements({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao publicar comunicado.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function sendUnreadReminder(announcement: AnnouncementListItem) {
    if (
      !confirm(
        `Deseja enviar um lembrete de leitura para quem ainda não confirmou o comunicado "${announcement.title}"?`,
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(announcement.id);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/comunicados/${announcement.id}/lembrete`, {
        method: "POST",
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao enviar lembrete."));
        return;
      }

      const payload = data as { message?: string };
      setSuccess(payload.message || "Lembrete enviado para os destinatários pendentes de leitura.");
      await loadAnnouncements({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar lembrete.");
    } finally {
      setActionLoadingId(null);
    }
  }



  async function archiveAnnouncement(announcement: AnnouncementListItem) {
    if (
      !confirm(
        `Deseja arquivar o comunicado "${announcement.title}"? O histórico será preservado.`,
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(announcement.id);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/comunicados/${announcement.id}/arquivar`, {
        method: "POST",
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao arquivar comunicado."));
        return;
      }

      setSuccess("Comunicado arquivado com sucesso.");
      await loadAnnouncements({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao arquivar comunicado.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function deleteAnnouncement(announcement: AnnouncementListItem) {
    if (
      !confirm(
        `Deseja excluir o rascunho "${announcement.title}"? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(announcement.id);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/comunicados/${announcement.id}`, {
        method: "DELETE",
      });

      const data: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao excluir comunicado."));
        return;
      }

      setSuccess("Comunicado excluído com sucesso.");
      await loadAnnouncements({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir comunicado.");
    } finally {
      setActionLoadingId(null);
    }
  }



  /* =========================================================
     ESTADOS DE CARREGAMENTO
     ========================================================= */

  if (loading) {
    return <EloGestLoadingScreen title="Carregando Comunicados" description="Preparando a área administrativa de comunicados..." />;
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminContextGuard
      fallbackTitle="Comunicados indisponíveis neste perfil de acesso"
      fallbackDescription="O módulo de comunicados é exclusivo da área administrativa. Para acompanhar comunicados como síndico, proprietário ou morador, acesse o portal."
    >
      <AdminShell
        title="Comunicados"
        description="Publique avisos oficiais e acompanhe confirmações de leitura."
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]"
          >
            Novo Comunicado
          </button>
        }
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
                Comunicação Oficial
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Comunicados e Confirmação de Leitura
              </h1>

              <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                Canal oficial para avisos, orientações, manutenções, assembleias e registros de ciência pelos usuários do portal.
              </p>
            </div>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A] lg:hidden"
            >
              Novo Comunicado
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

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="Publicados"
              value={computedMetrics.published}
              description="Comunicados ativos para leitura no portal."
            />

            <KpiCard
              label="Rascunhos"
              value={computedMetrics.draft}
              description="Comunicados em preparação pela administradora."
            />

            <KpiCard
              label="Agendados"
              value={computedMetrics.scheduled}
              description="Comunicados com publicação futura configurada."
            />

            <KpiCard
              label="Leituras"
              value={computedMetrics.readings}
              description="Confirmações registradas até o momento."
            />

            <KpiCard
              label="Arquivados"
              value={computedMetrics.archived}
              description="Histórico preservado para consulta futura."
            />
          </section>

          <section className="overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <input
                type="search"
                value={filters.q}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    q: event.target.value,
                  }))
                }
                placeholder="Buscar por título ou conteúdo..."
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
                <option value="SCHEDULED">Agendado</option>
                <option value="PUBLISHED">Publicado</option>
                <option value="ARCHIVED">Arquivado</option>
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
                <option value="GENERAL">Geral</option>
                <option value="MAINTENANCE">Manutenção</option>
                <option value="ASSEMBLY">Assembleia</option>
                <option value="FINANCIAL">Financeiro</option>
                <option value="SECURITY">Segurança</option>
                <option value="EMERGENCY">Emergência</option>
                <option value="GOVERNANCE">Governança</option>
              </select>

              <select
                value={filters.priority}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    priority: event.target.value as FiltersState["priority"],
                  }))
                }
                className="h-11 w-full min-w-0 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              >
                <option value="ALL">Todas As Prioridades</option>
                <option value="LOW">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
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

          {announcements.length === 0 ? (
            <EmptyState onCreate={openCreateModal} />
          ) : (
            <section className="space-y-4">
              {announcements.map((announcement) => {
                const readings = announcement._count?.readings ?? 0;
                const targets = announcement._count?.targets ?? 0;
                const attachmentsCount = announcement._count?.attachments ?? announcement.attachments?.length ?? 0;
                const isActionLoading = actionLoadingId === announcement.id;
                const canEdit = announcement.status === "DRAFT" || announcement.status === "SCHEDULED";
                const canPublish =
                  announcement.status === "DRAFT" || announcement.status === "SCHEDULED";
                const canArchive = announcement.status === "PUBLISHED" || announcement.status === "SCHEDULED";
                const canDelete = announcement.status === "DRAFT" || announcement.status === "SCHEDULED";
                const canManageAttachments =
                  announcement.status === "DRAFT" ||
                  announcement.status === "SCHEDULED" ||
                  (announcement.status === "PUBLISHED" && readings === 0);

                return (
                  <article
                    key={announcement.id}
                    className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)] transition hover:border-[#CFE6D4]"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusClass(announcement.status)}`}>
                            {statusLabel(announcement.status)}
                          </span>

                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${priorityClass(announcement.priority)}`}>
                            {priorityLabel(announcement.priority)}
                          </span>

                          <span className="inline-flex rounded-full border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-1 text-xs font-bold text-[#5E6B63]">
                            {typeLabel(announcement.type)}
                          </span>
                        </div>

                        <h2 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">
                          {announcement.title}
                        </h2>

                        <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                          {excerpt(announcement.content)}
                        </p>

                        <div className="mt-4 grid gap-3 text-sm font-medium text-[#5E6B63] md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Público-Alvo
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {targetScopeLabel(announcement.targetScope)}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Condomínio
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {announcement.condominium?.name || "Toda A Carteira"}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Início Previsto
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {formatDateTime(announcement.eventStartAt || announcement.eventDate)}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Término Previsto
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {formatDateTime(announcement.eventEndAt)}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Publicação
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {formatDateTime(announcement.publishedAt || announcement.publishAt)}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Leituras
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {readings} confirmações {targets > 0 ? `• ${targets} alvo(s)` : ""}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-[#F6F8F7] p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Documentos Anexos
                            </p>
                            <p className="mt-1 font-semibold text-[#17211B]">
                              {attachmentsCount > 0 ? `${attachmentsCount} arquivo(s)` : "Opcional"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:w-64 lg:justify-end">
                        {canEdit && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => void openEditModal(announcement)}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-white px-4 text-xs font-bold text-[#256D3C] transition hover:border-[#256D3C] hover:bg-[#F6FFF8] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Editar
                          </button>
                        )}

                        {canPublish && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => void publishAnnouncement(announcement)}
                            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-xs font-bold text-white transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Publicar
                          </button>
                        )}

                        {canManageAttachments ? (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => void openAttachmentsModal(announcement)}
                            className={[
                              "inline-flex h-10 items-center justify-center rounded-2xl px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60",
                              attachmentsCount > 0
                                ? "border border-[#CFE6D4] bg-[#F6FFF8] text-[#256D3C] hover:border-[#256D3C]"
                                : "border border-[#DDE5DF] bg-white text-[#255D37] hover:border-[#256D3C] hover:bg-[#F6FFF8]",
                            ].join(" ")}
                            title="Anexos são permitidos enquanto o comunicado não foi lido por nenhum destinatário."
                          >
                            {attachmentsCount > 0
                              ? `Anexos (${attachmentsCount})`
                              : "Anexar Documento"}
                          </button>
                        ) : attachmentsCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => void openAttachmentsModal(announcement)}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-xs font-bold text-[#5E6B63] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                            title="Este comunicado já possui leitura ou foi arquivado. Os anexos ficam preservados apenas para consulta."
                          >
                            Ver Anexos ({attachmentsCount})
                          </button>
                        ) : (
                          <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#EEF2EF] bg-[#F9FBFA] px-4 text-xs font-bold text-[#9AA7A0]">
                            Sem Anexo
                          </span>
                        )}

                        {announcement.status === "PUBLISHED" && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => void openReadingsModal(announcement)}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-[#F6FFF8] px-4 text-xs font-bold text-[#256D3C] transition hover:border-[#256D3C] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Ver Leituras
                          </button>
                        )}

                        {announcement.status === "PUBLISHED" && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => void sendUnreadReminder(announcement)}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-xs font-bold text-[#255D37] transition hover:border-[#256D3C] hover:bg-[#F6FFF8] disabled:cursor-not-allowed disabled:opacity-60"
                            title="Envia nova notificação interna somente para quem ainda não confirmou leitura."
                          >
                            Enviar Lembrete
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => void openHistoryModal(announcement)}
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-xs font-bold text-[#5E6B63] transition hover:border-[#256D3C] hover:bg-white hover:text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-60"
                          title="Consulta o histórico operacional deste comunicado."
                        >
                          Histórico
                        </button>

                        {canArchive && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => void archiveAnnouncement(announcement)}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-4 text-xs font-bold text-amber-700 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Arquivar
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => void deleteAnnouncement(announcement)}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 text-xs font-bold text-red-700 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Excluir
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


        {readingsModalOpen && readingsAnnouncement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/70 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl">
              <div className="flex flex-col gap-4 border-b border-[#DDE5DF] pb-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
                    Confirmações De Leitura
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {readingsAnnouncement.title}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-[#5E6B63]">
                    {readingsTotal} confirmação(ões) registrada(s) para este comunicado.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeReadingsModal}
                  disabled={readingsLoading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Fechar leituras"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {readingsLoading ? (
                  <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-5 text-sm font-semibold text-[#5E6B63]">
                    Carregando confirmações de leitura...
                  </div>
                ) : readings.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F9FBFA] p-5 text-sm font-semibold text-[#5E6B63]">
                    Nenhuma confirmação de leitura registrada até o momento.
                  </div>
                ) : (
                  readings.map((reading) => (
                    <div
                      key={reading.id}
                      className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-sm font-bold text-[#17211B]">
                            {reading.user?.name || reading.user?.email || "Usuário"}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-[#5E6B63]">
                            {reading.user?.email || "E-mail não informado"}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                            {roleLabel(reading.userAccess?.role || "")}
                            {reading.userAccess?.condominium?.name ? ` • ${reading.userAccess.condominium.name}` : ""}
                            {reading.userAccess?.unit?.unitNumber ? ` • Unidade ${reading.userAccess.unit.unitNumber}` : ""}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-[#256D3C]">
                          {formatDateTime(reading.readAt)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}


        {historyModalOpen && historyAnnouncement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/70 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl">
              <div className="flex flex-col gap-4 border-b border-[#DDE5DF] pb-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
                    Histórico Do Comunicado
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {historyAnnouncement.title}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-[#5E6B63]">
                    {historyTotal} evento(s) registrado(s) para preservar a rastreabilidade.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeHistoryModal}
                  disabled={historyLoading}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Fechar histórico"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {historyLoading ? (
                  <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-5 text-sm font-semibold text-[#5E6B63]">
                    Carregando histórico do comunicado...
                  </div>
                ) : historyLogs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F9FBFA] p-5 text-sm font-semibold text-[#5E6B63]">
                    Nenhum evento de histórico registrado até o momento.
                  </div>
                ) : (
                  historyLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <span
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]",
                              announcementLogActionClass(log.action),
                            ].join(" ")}
                          >
                            {announcementLogActionLabel(log.action)}
                          </span>

                          <p className="mt-3 text-sm font-bold text-[#17211B]">
                            {log.message || "Evento registrado no comunicado."}
                          </p>

                          <p className="mt-1 text-xs font-semibold text-[#5E6B63]">
                            {log.user?.name || log.user?.email || "Sistema"}
                            {log.user?.email ? ` • ${log.user.email}` : ""}
                          </p>
                        </div>

                        <div className="shrink-0 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-[#5E6B63]">
                          {formatDateTime(log.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}


        {attachmentsModalOpen && attachmentsAnnouncement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/55 px-4 py-6 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
                    Anexar Documento Opcional
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {attachmentsAnnouncement.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                    Use esta área somente quando o comunicado precisar de um documento de apoio, como PDF, imagem, planilha, ata, convocação ou orientação.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAttachmentsModal}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] text-[#5E6B63] transition hover:border-red-200 hover:text-red-700"
                  aria-label="Fechar modal de anexos"
                >
                  ×
                </button>
              </div>

              {attachmentsModalCanManage ? (
                <div className="mt-6 rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <label className="block">
                    <span className="text-sm font-bold text-[#17211B]">Adicionar Anexo</span>
                    <input
                      type="file"
                      onChange={(event) => setSelectedAttachmentFile(event.target.files?.[0] ?? null)}
                      className="mt-2 block w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm font-semibold text-[#17211B] file:mr-4 file:rounded-xl file:border-0 file:bg-[#EAF7EE] file:px-4 file:py-2 file:text-sm file:font-bold file:text-[#256D3C]"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
                    />
                  </label>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-medium leading-5 text-[#7A877F]">
                      Limite de 10 MB por arquivo. O comunicado pode permanecer sem anexo.
                    </p>

                    <button
                      type="button"
                      onClick={() => void uploadAttachment()}
                      disabled={!selectedAttachmentFile || attachmentUploading}
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#17211B] px-5 text-sm font-bold text-white transition hover:bg-[#256D3C] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {attachmentUploading ? "Enviando..." : "Enviar Anexo"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-800">
                    Documentos bloqueados para alteração
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-700">
                    Este comunicado já possui confirmação de leitura ou foi arquivado. Para preservar a rastreabilidade, não é mais possível adicionar ou remover documentos.
                  </p>
                </div>
              )}

              <div className="mt-6 space-y-3">
                {attachmentsLoading ? (
                  <div className="rounded-3xl border border-[#DDE5DF] bg-white p-5 text-sm font-semibold text-[#5E6B63]">
                    Carregando anexos...
                  </div>
                ) : attachments.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-[#CFE0D5] bg-[#F9FBFA] p-6 text-center">
                    <h3 className="text-base font-bold text-[#17211B]">Nenhum Anexo Adicionado</h3>
                    <p className="mt-2 text-sm leading-6 text-[#7A877F]">
                      Este comunicado continuará válido normalmente sem anexos.
                    </p>
                  </div>
                ) : (
                  attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex flex-col gap-3 rounded-3xl border border-[#DDE5DF] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#17211B]">
                          {attachment.originalName}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                          {formatFileSize(attachment.sizeBytes)} • Enviado em {formatDateTime(attachment.createdAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-xs font-bold text-[#255D37] transition hover:border-[#256D3C] hover:bg-[#F6FFF8]"
                        >
                          Abrir
                        </a>
                        <button
                          type="button"
                          onClick={() => void deleteAttachment(attachment)}
                          disabled={!attachmentsModalCanManage || attachmentDeletingId === attachment.id}
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-red-100 bg-red-50 px-4 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {attachmentDeletingId === attachment.id ? "Removendo..." : "Remover"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17211B]/70 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl">
              <div className="flex flex-col gap-4 border-b border-[#DDE5DF] pb-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
                    {editingAnnouncement ? "Editar Comunicado" : "Novo Comunicado"}
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {editingAnnouncement ? "Editar Comunicado Oficial" : "Criar Comunicado Oficial"}
                  </h2>

                  <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                    Defina ou ajuste o conteúdo, público-alvo, prioridade e necessidade de confirmação de leitura.
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

              <form onSubmit={handleSave} className="mt-6 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="md:col-span-2">
                    <span className="text-sm font-bold text-[#17211B]">Título</span>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(event) => updateForm("title", event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                      placeholder="Ex.: Manutenção programada no elevador social"
                      required
                    />
                  </label>

                  <label className="md:col-span-2">
                    <span className="text-sm font-bold text-[#17211B]">Conteúdo</span>
                    <textarea
                      value={form.content}
                      onChange={(event) => updateForm("content", event.target.value)}
                      className="mt-2 min-h-40 w-full resize-y rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-semibold leading-6 text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                      placeholder="Digite o comunicado que será exibido no portal."
                      required
                    />
                  </label>

                  <OperationalAnnouncementAiAssistant
                    context={{
                      title: form.title,
                      content: form.content,
                      type: form.type,
                      priority: form.priority,
                      targetScope: form.targetScope,
                      condominiumName:
                        condominios.find((condominio) => condominio.id === form.condominiumId)?.name || null,
                      eventStartAt: form.eventStartAt || null,
                      eventEndAt: form.eventEndAt || null,
                      expiresAt: form.expiresAt || null,
                      requireReadingConfirmation: form.requireReadingConfirmation,
                    }}
                    onApplySuggestion={applyAnnouncementAiSuggestion}
                  />

                  <label>
                    <span className="text-sm font-bold text-[#17211B]">Tipo</span>
                    <select
                      value={form.type}
                      onChange={(event) => updateForm("type", event.target.value as AnnouncementType)}
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    >
                      <option value="GENERAL">Geral</option>
                      <option value="MAINTENANCE">Manutenção</option>
                      <option value="ASSEMBLY">Assembleia</option>
                      <option value="FINANCIAL">Financeiro</option>
                      <option value="SECURITY">Segurança</option>
                      <option value="EMERGENCY">Emergência</option>
                      <option value="GOVERNANCE">Governança</option>
                    </select>
                  </label>

                  <label>
                    <span className="text-sm font-bold text-[#17211B]">Prioridade</span>
                    <select
                      value={form.priority}
                      onChange={(event) => updateForm("priority", event.target.value as AnnouncementPriority)}
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    >
                      <option value="LOW">Baixa</option>
                      <option value="NORMAL">Normal</option>
                      <option value="HIGH">Alta</option>
                      <option value="URGENT">Urgente</option>
                    </select>
                  </label>

                  <label>
                    <span className="text-sm font-bold text-[#17211B]">Status Inicial</span>
                    <select
                      value={form.status}
                      onChange={(event) => updateForm("status", event.target.value as AnnouncementFormState["status"])}
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    >
                      <option value="DRAFT">Salvar Como Rascunho</option>
                      <option value="SCHEDULED">Agendar Publicação</option>
                    </select>
                  </label>

                  <label>
                    <span className="text-sm font-bold text-[#17211B]">Público-Alvo</span>
                    <select
                      value={form.targetScope}
                      onChange={(event) => updateForm("targetScope", event.target.value as AnnouncementTargetScope)}
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    >
                      <option value="CONDOMINIUM">Todos Do Condomínio</option>
                      <option value="BLOCK">Por Bloco Do Condomínio</option>
                      <option value="ALL_ADMINISTRATOR">Toda A Carteira</option>
                      <option value="ROLE">Por Perfil De Acesso</option>
                      <option value="LINK_TYPE">Por Tipo De Vínculo</option>
                    </select>
                  </label>

                  {(form.targetScope === "CONDOMINIUM" || form.targetScope === "BLOCK" || form.targetScope === "ROLE" || form.targetScope === "LINK_TYPE") && (
                    <label>
                      <span className="text-sm font-bold text-[#17211B]">
                        Condomínio {form.targetScope === "CONDOMINIUM" || form.targetScope === "BLOCK" ? "" : "Opcional"}
                      </span>
                      <select
                        value={form.condominiumId}
                        onChange={(event) => updateForm("condominiumId", event.target.value)}
                        className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                        required={form.targetScope === "CONDOMINIUM" || form.targetScope === "BLOCK"}
                      >
                        <option value="">
                          {form.targetScope === "CONDOMINIUM" || form.targetScope === "BLOCK" ? "Selecione" : "Todos Os Condomínios"}
                        </option>
                        {condominios.map((condominio) => (
                          <option key={condominio.id} value={condominio.id}>
                            {condominio.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}


                  {form.targetScope === "BLOCK" && (
                    <label>
                      <span className="text-sm font-bold text-[#17211B]">Bloco</span>
                      <input
                        type="text"
                        value={form.block}
                        onChange={(event) => updateForm("block", event.target.value)}
                        placeholder="Ex.: A, B, Torre 1"
                        className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                        required
                      />
                      <p className="mt-2 text-xs font-medium leading-5 text-[#7A877F]">
                        O comunicado será exibido aos perfis vinculados às unidades ativas deste bloco.
                      </p>
                    </label>
                  )}

                  {form.targetScope === "ROLE" && (
                    <label>
                      <span className="text-sm font-bold text-[#17211B]">Perfil De Acesso</span>
                      <select
                        value={form.role}
                        onChange={(event) => updateForm("role", event.target.value as AnnouncementFormState["role"])}
                        className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                        required
                      >
                        <option value="">Selecione</option>
                        <option value="SINDICO">{roleLabel("SINDICO")}</option>
                        <option value="PROPRIETARIO">{roleLabel("PROPRIETARIO")}</option>
                        <option value="MORADOR">{roleLabel("MORADOR")}</option>
                        <option value="CONSELHEIRO">{roleLabel("CONSELHEIRO")}</option>
                      </select>
                    </label>
                  )}

                  {form.targetScope === "LINK_TYPE" && (
                    <label>
                      <span className="text-sm font-bold text-[#17211B]">Tipo De Vínculo</span>
                      <select
                        value={form.linkType}
                        onChange={(event) => updateForm("linkType", event.target.value as AnnouncementFormState["linkType"])}
                        className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                        required
                      >
                        <option value="">Selecione</option>
                        <option value="OWNER">{linkTypeLabel("OWNER")}</option>
                        <option value="RESIDENT">{linkTypeLabel("RESIDENT")}</option>
                        <option value="TENANT">{linkTypeLabel("TENANT")}</option>
                        <option value="DEPENDENT">{linkTypeLabel("DEPENDENT")}</option>
                        <option value="AUTHORIZED">{linkTypeLabel("AUTHORIZED")}</option>
                      </select>
                    </label>
                  )}

                  <label>
                    <span className="text-sm font-bold text-[#17211B]">Início Previsto Do Evento</span>
                    <input
                      type="datetime-local"
                      value={form.eventStartAt}
                      onChange={(event) => updateForm("eventStartAt", event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                    <span className="mt-1 block text-xs font-semibold text-[#7A877F]">
                      Informe quando a manutenção, assembleia, vistoria ou evento comunicado começa.
                    </span>
                  </label>

                  <label>
                    <span className="text-sm font-bold text-[#17211B]">Término Previsto Do Evento</span>
                    <input
                      type="datetime-local"
                      value={form.eventEndAt}
                      onChange={(event) => updateForm("eventEndAt", event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                    <span className="mt-1 block text-xs font-semibold text-[#7A877F]">
                      Informe a previsão de término para orientar moradores, síndicos e proprietários.
                    </span>
                  </label>

                  {form.status === "SCHEDULED" && (
                    <label>
                      <span className="text-sm font-bold text-[#17211B]">Publicar Em</span>
                      <input
                        type="datetime-local"
                        value={form.publishAt}
                        onChange={(event) => updateForm("publishAt", event.target.value)}
                        className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                        required
                      />
                    </label>
                  )}

                  <label>
                    <span className="text-sm font-bold text-[#17211B]">Expira Em Opcional</span>
                    <input
                      type="datetime-local"
                      value={form.expiresAt}
                      onChange={(event) => updateForm("expiresAt", event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </label>

                  <label className="md:col-span-2 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                    <span className="block text-sm font-bold text-[#17211B]">
                      Documento Anexo Opcional
                    </span>
                    <span className="mt-1 block text-sm font-medium leading-5 text-[#5E6B63]">
                      Anexe um PDF, imagem, documento ou planilha quando o comunicado precisar de material complementar. Depois da primeira confirmação de leitura, os anexos ficam bloqueados para preservar a rastreabilidade.
                    </span>
                    <input
                      type="file"
                      onChange={(event) => setDraftAttachmentFile(event.target.files?.[0] ?? null)}
                      className="mt-3 block w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm font-semibold text-[#17211B] file:mr-4 file:rounded-xl file:border-0 file:bg-[#EAF7EE] file:px-4 file:py-2 file:text-sm file:font-bold file:text-[#256D3C]"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt"
                    />
                    {draftAttachmentFile && (
                      <p className="mt-2 text-xs font-semibold text-[#256D3C]">
                        Arquivo selecionado: {draftAttachmentFile.name}
                      </p>
                    )}
                  </label>

                  <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                    <input
                      type="checkbox"
                      checked={form.requireReadingConfirmation}
                      onChange={(event) => updateForm("requireReadingConfirmation", event.target.checked)}
                      className="mt-1 h-4 w-4 accent-[#256D3C]"
                    />
                    <span>
                      <span className="block text-sm font-bold text-[#17211B]">
                        Exigir Confirmação De Leitura
                      </span>
                      <span className="mt-1 block text-sm font-medium leading-5 text-[#5E6B63]">
                        Quando marcado, o portal exibirá a ação para o usuário confirmar ciência do comunicado.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-[#DDE5DF] pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    disabled={saving}
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={saving || !canSubmit}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Salvando..." : editingAnnouncement ? "Salvar Alterações" : "Salvar Comunicado"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </AdminShell>
    </AdminContextGuard>
  );
}
