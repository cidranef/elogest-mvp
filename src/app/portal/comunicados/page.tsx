"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";
import PortalContextGuard from "@/components/PortalContextGuard";
import PortalShell from "@/components/PortalShell";

/* =========================================================
   PORTAL - COMUNICADOS

   ETAPA 48:
   Lista de comunicados disponíveis para o perfil ativo do
   usuário no portal, com destaque para pendências de leitura.

   Observação:
   - A segurança real permanece nas APIs do portal.
   - Esta página apenas consome o retorno permitido pelo backend.
   - Não utiliza lucide-react para evitar dependência não instalada.
   ========================================================= */

type AnnouncementPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type AnnouncementType =
  | "GENERAL"
  | "MAINTENANCE"
  | "ASSEMBLY"
  | "FINANCIAL"
  | "SECURITY"
  | "EMERGENCY"
  | "GOVERNANCE";

interface PortalAnnouncement {
  id: string;
  title: string;
  content?: string | null;
  type: AnnouncementType | string;
  priority: AnnouncementPriority | string;
  publishedAt?: string | null;
  publishAt?: string | null;
  eventDate?: string | null;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  expiresAt?: string | null;
  requireReadingConfirmation: boolean;
  isRead: boolean;
  readAt?: string | null;
  condominium?: {
    id?: string;
    name?: string | null;
  } | null;
}

interface PortalAnnouncementKpis {
  total: number;
  read: number;
  unread: number;
}

interface PortalAnnouncementResponse {
  announcements?: PortalAnnouncement[];
  comunicados?: PortalAnnouncement[];
  items?: PortalAnnouncement[];
  data?: PortalAnnouncement[];
  kpis?: Partial<PortalAnnouncementKpis>;
}

type ReadFilter = "ALL" | "UNREAD" | "READ";
type PriorityFilter = "ALL" | AnnouncementPriority;

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

function getPriorityLabel(priority: string) {
  const labels: Record<string, string> = {
    LOW: "Baixa",
    NORMAL: "Normal",
    HIGH: "Alta",
    URGENT: "Urgente",
  };

  return labels[priority] ?? priority;
}

function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    GENERAL: "Geral",
    MAINTENANCE: "Manutenção",
    ASSEMBLY: "Assembleia",
    FINANCIAL: "Financeiro",
    SECURITY: "Segurança",
    EMERGENCY: "Emergência",
    GOVERNANCE: "Governança",
  };

  return labels[type] ?? type;
}

function getPriorityClass(priority: string) {
  if (priority === "URGENT") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (priority === "HIGH") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (priority === "LOW") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getAnnouncementPreview(content?: string | null) {
  if (!content) {
    return "Abra o comunicado para visualizar o conteúdo completo.";
  }

  const normalizedContent = content.replace(/\s+/g, " ").trim();

  if (normalizedContent.length <= 160) {
    return normalizedContent;
  }

  return `${normalizedContent.slice(0, 160)}...`;
}

function extractAnnouncements(payload: PortalAnnouncementResponse) {
  return (
    payload.announcements ??
    payload.comunicados ??
    payload.items ??
    payload.data ??
    []
  );
}

export default function PortalComunicadosPage() {
  const [announcements, setAnnouncements] = useState<PortalAnnouncement[]>([]);
  const [kpis, setKpis] = useState<PortalAnnouncementKpis>({
    total: 0,
    read: 0,
    unread: 0,
  });
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState<ReadFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/portal/comunicados", {
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as PortalAnnouncementResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível carregar os comunicados.");
      }

      const receivedAnnouncements = extractAnnouncements(payload);
      const calculatedRead = receivedAnnouncements.filter((item) => item.isRead).length;
      const calculatedUnread = receivedAnnouncements.length - calculatedRead;

      setAnnouncements(receivedAnnouncements);
      setKpis({
        total: payload.kpis?.total ?? receivedAnnouncements.length,
        read: payload.kpis?.read ?? calculatedRead,
        unread: payload.kpis?.unread ?? calculatedUnread,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar comunicados.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  const filteredAnnouncements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return announcements.filter((announcement) => {
      const matchesSearch =
        !normalizedSearch ||
        announcement.title.toLowerCase().includes(normalizedSearch) ||
        (announcement.content ?? "").toLowerCase().includes(normalizedSearch) ||
        (announcement.condominium?.name ?? "").toLowerCase().includes(normalizedSearch);

      const matchesReadFilter =
        readFilter === "ALL" ||
        (readFilter === "READ" && announcement.isRead) ||
        (readFilter === "UNREAD" && !announcement.isRead);

      const matchesPriority = priorityFilter === "ALL" || announcement.priority === priorityFilter;

      return matchesSearch && matchesReadFilter && matchesPriority;
    });
  }, [announcements, priorityFilter, readFilter, search]);

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Comunicados"
        description="Preparando os comunicados disponíveis para o seu perfil ativo..."
      />
    );
  }

  return (
    <PortalContextGuard>
      <PortalShell>
        <main className="min-h-screen bg-[#F6F8F5] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <section className="rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <span aria-hidden="true">◉</span>
                    Portal EloGest
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#17211B] sm:text-3xl">
                    Comunicados
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    Acompanhe avisos oficiais, orientações importantes e confirmações de leitura vinculadas ao seu perfil ativo.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void fetchAnnouncements()}
                  className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
                >
                  Atualizar
                </button>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Total</p>
                <strong className="mt-2 block text-3xl font-bold text-[#17211B]">{kpis.total}</strong>
                <span className="mt-1 block text-sm text-slate-500">Comunicados Recebidos</span>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-500">Lidos</p>
                <strong className="mt-2 block text-3xl font-bold text-emerald-700">{kpis.read}</strong>
                <span className="mt-1 block text-sm text-slate-500">Leituras Confirmadas</span>
              </div>

              <div className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-500">Pendentes</p>
                <strong className="mt-2 block text-3xl font-bold text-amber-700">{kpis.unread}</strong>
                <span className="mt-1 block text-sm text-slate-500">Aguardando Confirmação</span>
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Buscar Comunicado</span>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 focus-within:border-emerald-400">
                    <span className="text-slate-400" aria-hidden="true">⌕</span>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Título, conteúdo ou condomínio"
                      className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Leitura</span>
                  <select
                    value={readFilter}
                    onChange={(event) => setReadFilter(event.target.value as ReadFilter)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-400"
                  >
                    <option value="ALL">Todos</option>
                    <option value="UNREAD">Pendentes</option>
                    <option value="READ">Lidos</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Prioridade</span>
                  <select
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-400"
                  >
                    <option value="ALL">Todas</option>
                    <option value="URGENT">Urgente</option>
                    <option value="HIGH">Alta</option>
                    <option value="NORMAL">Normal</option>
                    <option value="LOW">Baixa</option>
                  </select>
                </label>
              </div>
            </section>

            {error ? (
              <section className="rounded-3xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
                {error}
              </section>
            ) : null}

            <section className="flex flex-col gap-4">
              {filteredAnnouncements.length === 0 ? (
                <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-700">
                    ✉
                  </div>
                  <h2 className="text-lg font-bold text-[#17211B]">Nenhum Comunicado Encontrado</h2>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                    Quando houver comunicados oficiais compatíveis com seu perfil ativo, eles aparecerão nesta área.
                  </p>
                </div>
              ) : (
                filteredAnnouncements.map((announcement) => (
                  <article
                    key={announcement.id}
                    className={`rounded-[2rem] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      announcement.isRead ? "border-slate-100" : "border-emerald-200 ring-1 ring-emerald-100"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityClass(
                              announcement.priority,
                            )}`}
                          >
                            {getPriorityLabel(announcement.priority)}
                          </span>

                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {getTypeLabel(announcement.type)}
                          </span>

                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                              announcement.isRead
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {announcement.isRead ? "Leitura Confirmada" : "Pendente De Leitura"}
                          </span>
                        </div>

                        <h2 className="text-lg font-bold leading-tight text-[#17211B]">
                          {announcement.title}
                        </h2>

                        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                          {getAnnouncementPreview(announcement.content)}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                          <span>Publicado Em: {formatDateTime(announcement.publishedAt ?? announcement.publishAt)}</span>
                          {announcement.eventStartAt || announcement.eventDate ? (
                            <span>Início Previsto: {formatDateTime(announcement.eventStartAt || announcement.eventDate)}</span>
                          ) : null}
                          {announcement.eventEndAt ? (
                            <span>Término Previsto: {formatDateTime(announcement.eventEndAt)}</span>
                          ) : null}
                          <span>Condomínio: {announcement.condominium?.name ?? "Geral"}</span>
                          {announcement.readAt ? <span>Lido Em: {formatDateTime(announcement.readAt)}</span> : null}
                        </div>
                      </div>

                      <Link
                        href={`/portal/comunicados/${announcement.id}`}
                        className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-[#256D3C] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5B32]"
                      >
                        Visualizar
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </section>
          </div>
        </main>
      </PortalShell>
    </PortalContextGuard>
  );
}
