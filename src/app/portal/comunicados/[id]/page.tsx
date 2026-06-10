"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";
import PortalContextGuard from "@/components/PortalContextGuard";
import PortalShell from "@/components/PortalShell";

/* =========================================================
   PORTAL - DETALHE DO COMUNICADO

   ETAPA 48:
   Exibe o comunicado permitido para o perfil ativo e permite
   confirmação de leitura de forma idempotente pela API.

   Observação:
   - A segurança real permanece no backend.
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

interface PortalAnnouncementAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

interface PortalAnnouncementDetail {
  id: string;
  title: string;
  content: string;
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
  createdByUser?: {
    name?: string | null;
    email?: string | null;
  } | null;
  attachments?: PortalAnnouncementAttachment[];
}

interface PortalAnnouncementDetailResponse {
  announcement?: PortalAnnouncementDetail;
  comunicado?: PortalAnnouncementDetail;
  data?: PortalAnnouncementDetail;
  error?: string;
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

function getParamId(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default function PortalComunicadoDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const announcementId = useMemo(() => getParamId(params?.id), [params]);

  const [announcement, setAnnouncement] = useState<PortalAnnouncementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const fetchAnnouncement = useCallback(async () => {
    if (!announcementId) {
      setError("Comunicado não identificado.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/portal/comunicados/${announcementId}`, {
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as PortalAnnouncementDetailResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível carregar o comunicado.");
      }

      const receivedAnnouncement = payload.announcement ?? payload.comunicado ?? payload.data ?? null;

      if (!receivedAnnouncement) {
        throw new Error("Comunicado não encontrado ou indisponível para o seu perfil ativo.");
      }

      setAnnouncement(receivedAnnouncement);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar comunicado.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [announcementId]);

  useEffect(() => {
    void fetchAnnouncement();
  }, [fetchAnnouncement]);

  const handleConfirmReading = async () => {
    if (!announcementId || confirming) {
      return;
    }

    try {
      setConfirming(true);
      setError("");
      setSuccessMessage("");

      const response = await fetch(`/api/portal/comunicados/${announcementId}/confirmar-leitura`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        readAt?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível confirmar a leitura.");
      }

      const readAt = payload.readAt ?? new Date().toISOString();

      setAnnouncement((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          isRead: true,
          readAt,
        };
      });

      setSuccessMessage("Leitura confirmada com sucesso.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao confirmar leitura.";
      setError(message);
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Comunicado"
        description="Buscando o comunicado vinculado ao seu perfil ativo..."
      />
    );
  }

  return (
    <PortalContextGuard>
      <PortalShell>
        <main className="min-h-screen bg-[#F6F8F5] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex w-fit items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                ← Voltar
              </button>

              <Link
                href="/portal/comunicados"
                className="inline-flex w-fit items-center justify-center rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
              >
                Ver Todos Os Comunicados
              </Link>
            </section>

            {error && !announcement ? (
              <section className="rounded-[2rem] border border-red-100 bg-red-50 p-8 text-center text-red-700 shadow-sm">
                <h1 className="text-xl font-bold">Comunicado Indisponível</h1>
                <p className="mt-2 text-sm leading-6">{error}</p>
              </section>
            ) : null}

            {announcement ? (
              <>
                <article className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
                  <div className="mb-5 flex flex-wrap items-center gap-2">
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

                  <h1 className="text-2xl font-bold tracking-tight text-[#17211B] sm:text-3xl">
                    {announcement.title}
                  </h1>

                  <div className="mt-5 grid gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
                    <div>
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Publicado Em
                      </span>
                      <strong className="mt-1 block font-semibold text-slate-700">
                        {formatDateTime(announcement.publishedAt ?? announcement.publishAt)}
                      </strong>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Condomínio
                      </span>
                      <strong className="mt-1 block font-semibold text-slate-700">
                        {announcement.condominium?.name ?? "Geral"}
                      </strong>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Início Previsto
                      </span>
                      <strong className="mt-1 block font-semibold text-slate-700">
                        {announcement.eventStartAt || announcement.eventDate
                          ? formatDateTime(announcement.eventStartAt ?? announcement.eventDate)
                          : "Não Informado"}
                      </strong>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Término Previsto
                      </span>
                      <strong className="mt-1 block font-semibold text-slate-700">
                        {announcement.eventEndAt ? formatDateTime(announcement.eventEndAt) : "Não Informado"}
                      </strong>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Confirmação
                      </span>
                      <strong className="mt-1 block font-semibold text-slate-700">
                        {announcement.requireReadingConfirmation ? "Obrigatória" : "Não Obrigatória"}
                      </strong>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Lido Em
                      </span>
                      <strong className="mt-1 block font-semibold text-slate-700">
                        {announcement.readAt ? formatDateTime(announcement.readAt) : "Ainda Não Confirmado"}
                      </strong>
                    </div>
                  </div>

                  <div className="mt-8 whitespace-pre-wrap rounded-3xl border border-slate-100 bg-white text-base leading-8 text-slate-700">
                    {announcement.content}
                  </div>

                  {announcement.attachments && announcement.attachments.length > 0 ? (
                    <section className="mt-8 rounded-3xl border border-slate-100 bg-slate-50 p-5">
                      <h2 className="text-lg font-bold text-[#17211B]">Anexos Do Comunicado</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        Documentos complementares enviados pela administradora.
                      </p>

                      <div className="mt-4 space-y-3">
                        {announcement.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-emerald-200 hover:bg-emerald-50/40 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-[#17211B]">
                                {attachment.originalName}
                              </span>
                              <span className="mt-1 block text-xs font-semibold text-slate-500">
                                {formatFileSize(attachment.sizeBytes)} • Enviado em {formatDateTime(attachment.createdAt)}
                              </span>
                            </span>
                            <span className="inline-flex w-fit rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-xs font-bold text-emerald-700">
                              Abrir Anexo
                            </span>
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </article>

                {error ? (
                  <section className="rounded-3xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                  </section>
                ) : null}

                {successMessage ? (
                  <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                    {successMessage}
                  </section>
                ) : null}

                <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
                  {announcement.requireReadingConfirmation ? (
                    announcement.isRead ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-[#17211B]">Leitura Confirmada</h2>
                          <p className="mt-1 text-sm text-slate-500">
                            Sua confirmação foi registrada em {formatDateTime(announcement.readAt)}.
                          </p>
                        </div>
                        <span className="inline-flex w-fit rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                          ✓ Confirmado
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-[#17211B]">Confirmação De Leitura</h2>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                            Confirme que você tomou ciência deste comunicado. O registro ficará disponível para acompanhamento da administradora.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleConfirmReading()}
                          disabled={confirming}
                          className="inline-flex items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5B32] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {confirming ? "Confirmando..." : "Confirmar Leitura"}
                        </button>
                      </div>
                    )
                  ) : (
                    <div>
                      <h2 className="text-lg font-bold text-[#17211B]">Comunicado Informativo</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        Este comunicado não exige confirmação formal de leitura.
                      </p>
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </main>
      </PortalShell>
    </PortalContextGuard>
  );
}
