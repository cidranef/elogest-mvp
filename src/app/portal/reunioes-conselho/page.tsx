"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PortalShell from "@/components/PortalShell";

/* =========================================================
   PORTAL - REUNIÕES DE CONSELHO

   Arquivo:
   src/app/portal/reunioes-conselho/page.tsx

   ETAPA 49 — REUNIÕES DE CONSELHO

   Objetivo:
   - Exibir ao síndico/conselheiro as reuniões disponíveis
     para o perfil ativo.
   - Permitir acompanhamento de status, presença e acesso à
     Sala De Reunião EloGest.

   Segurança:
   - A segurança real fica na API /api/portal/reunioes-conselho.
   - A página apenas consome os dados já filtrados por perfil ativo.
   - Morador/proprietário sem vínculo de governança deve receber
     mensagem amigável retornada pela API.
   ========================================================= */

type MeetingStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED"
  | "ARCHIVED";

type MeetingMode = "PRESENTIAL" | "ONLINE" | "HYBRID";

type RoomStatus = "NOT_CREATED" | "SCHEDULED" | "OPEN" | "CLOSED" | "CANCELED";

type ParticipantStatus =
  | "INVITED"
  | "CONFIRMED"
  | "DECLINED"
  | "ATTENDED"
  | "ABSENT";

type PortalCouncilMeeting = {
  id: string;
  title: string;
  description?: string | null;
  status: MeetingStatus;
  mode?: MeetingMode;
  meetingMode?: MeetingMode;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  location?: string | null;
  condominium?: {
    id: string;
    name: string;
  } | null;
  meetingRoom?: {
    id: string;
    status?: RoomStatus | string | null;
    roomStatus?: RoomStatus | string | null;
    mode?: MeetingMode | null;
    openedAt?: string | null;
    closedAt?: string | null;
  } | null;
  room?: {
    id: string;
    status?: RoomStatus | string | null;
    roomStatus?: RoomStatus | string | null;
    openedAt?: string | null;
    closedAt?: string | null;
  } | null;
  myParticipant?: {
    id?: string;
    role?: string | null;
    status?: ParticipantStatus | string | null;
    respondedAt?: string | null;
    confirmedAt?: string | null;
  } | null;
  participantStatus?: ParticipantStatus | string | null;
  agendaItemsCount?: number;
  participantsCount?: number;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    participants?: number;
    agendaItems?: number;
  };
};

type PortalMeetingsResponse = {
  meetings?: PortalCouncilMeeting[];
  councilMeetings?: PortalCouncilMeeting[];
  reunioes?: PortalCouncilMeeting[];
  pagination?: {
    page: number;
    limit?: number;
    pageSize?: number;
    total: number;
    pages?: number;
    totalPages?: number;
  };
  kpis?: {
    total?: number;
    scheduled?: number;
    inProgress?: number;
    completed?: number;
    pendingConfirmation?: number;
  } | null;
  activeAccess?: {
    id: string;
    role: string;
    label?: string | null;
    condominiumId?: string | null;
    unitId?: string | null;
    linkType?: string | null;
    isGovernanceProfile?: boolean;
  } | null;
  error?: string;
};

const statusLabels: Record<MeetingStatus, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Realizada",
  CANCELED: "Cancelada",
  ARCHIVED: "Arquivada",
};

const modeLabels: Record<MeetingMode, string> = {
  PRESENTIAL: "Presencial",
  ONLINE: "Online",
  HYBRID: "Híbrida",
};

const roomStatusLabels: Record<RoomStatus, string> = {
  NOT_CREATED: "Sala não criada",
  SCHEDULED: "Aguardando abertura",
  OPEN: "Sala aberta",
  CLOSED: "Sala encerrada",
  CANCELED: "Sala cancelada",
};

const participantStatusLabels: Record<string, string> = {
  INVITED: "Convite pendente",
  CONFIRMED: "Presença confirmada",
  DECLINED: "Presença recusada",
  ATTENDED: "Participou",
  ABSENT: "Ausente",
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Data não definida";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Data não definida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTimeRange(start?: string | null, end?: string | null) {
  if (!start) {
    return "Horário não definido";
  }

  const startDate = new Date(start);

  if (Number.isNaN(startDate.getTime())) {
    return "Horário não definido";
  }

  const startLabel = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(startDate);

  if (!end) {
    return startLabel;
  }

  const endDate = new Date(end);

  if (Number.isNaN(endDate.getTime())) {
    return startLabel;
  }

  const endLabel = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(endDate);

  return `${startLabel} às ${endLabel}`;
}

function getStatusClass(status: MeetingStatus) {
  const classes: Record<MeetingStatus, string> = {
    DRAFT: "border-slate-200 bg-slate-50 text-slate-700",
    SCHEDULED: "border-blue-200 bg-blue-50 text-blue-700",
    IN_PROGRESS: "border-emerald-200 bg-emerald-50 text-emerald-700",
    COMPLETED: "border-[#DDE5DF] bg-[#EAF7EE] text-[#256D3C]",
    CANCELED: "border-red-200 bg-red-50 text-red-700",
    ARCHIVED: "border-zinc-200 bg-zinc-50 text-zinc-700",
  };

  return classes[status] || classes.DRAFT;
}

function getParticipantStatusClass(status?: string | null) {
  if (status === "CONFIRMED" || status === "ATTENDED") {
    return "border-[#BFE8C4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (status === "DECLINED" || status === "ABSENT") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function normalizeMeetings(data: PortalMeetingsResponse) {
  return data.meetings || data.councilMeetings || data.reunioes || [];
}

function getMeetingMode(meeting: PortalCouncilMeeting) {
  return (
    meeting.meetingMode || meeting.mode || meeting.meetingRoom?.mode || "ONLINE"
  );
}

function getRoomStatus(meeting: PortalCouncilMeeting) {
  return (
    meeting.room?.roomStatus ||
    meeting.room?.status ||
    meeting.meetingRoom?.roomStatus ||
    meeting.meetingRoom?.status ||
    null
  );
}

function getParticipantStatus(meeting: PortalCouncilMeeting) {
  return meeting.participantStatus || meeting.myParticipant?.status || null;
}

function getParticipantStatusLabel(status?: string | null) {
  if (!status) {
    return null;
  }

  return participantStatusLabels[status] || status;
}

function hasConfirmedPresence(status?: string | null) {
  return status === "CONFIRMED" || status === "ATTENDED";
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#C8D8CD] bg-white/80 p-8 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF7EE] text-2xl">
        ◯
      </div>

      <h2 className="mt-4 text-lg font-bold text-[#17211B]">
        Nenhuma reunião encontrada
      </h2>

      <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-[#5E6B63]">
        {message}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-44 animate-pulse rounded-[28px] border border-[#DDE5DF] bg-white/80 shadow-sm"
        />
      ))}
    </div>
  );
}

function KpiCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="rounded-[26px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_45px_rgba(23,33,27,0.06)]">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">
        {label}
      </p>

      <p className="mt-3 text-3xl font-bold tracking-tight text-[#17211B]">
        {value}
      </p>

      <p className="mt-2 text-sm font-medium text-[#5E6B63]">{helper}</p>
    </div>
  );
}

export default function PortalCouncilMeetingsPage() {
  const [meetings, setMeetings] = useState<PortalCouncilMeeting[]>([]);
  const [activeAccess, setActiveAccess] =
    useState<PortalMeetingsResponse["activeAccess"]>(null);
  const [kpis, setKpis] = useState<PortalMeetingsResponse["kpis"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [mode, setMode] = useState("ALL");

  const filteredMeetings = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return meetings.filter((meeting) => {
      const matchesSearch = normalizedSearch
        ? [
            meeting.title,
            meeting.description || "",
            meeting.condominium?.name || "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        : true;

      const matchesStatus = status === "ALL" || meeting.status === status;
      const matchesMode = mode === "ALL" || getMeetingMode(meeting) === mode;

      return matchesSearch && matchesStatus && matchesMode;
    });
  }, [meetings, mode, search, status]);

  const calculatedKpis = useMemo(() => {
    const total = meetings.length;
    const scheduled = meetings.filter(
      (item) => item.status === "SCHEDULED",
    ).length;
    const inProgress = meetings.filter(
      (item) => item.status === "IN_PROGRESS",
    ).length;
    const pendingConfirmation = meetings.filter((item) => {
      const participantStatus = getParticipantStatus(item);
      return !participantStatus || participantStatus === "INVITED";
    }).length;

    return {
      total: kpis?.total ?? total,
      scheduled: kpis?.scheduled ?? scheduled,
      inProgress: kpis?.inProgress ?? inProgress,
      pendingConfirmation: kpis?.pendingConfirmation ?? pendingConfirmation,
    };
  }, [kpis, meetings]);

  async function loadMeetings() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/portal/reunioes-conselho", {
        cache: "no-store",
      });

      const data = (await response.json()) as PortalMeetingsResponse;

      if (!response.ok) {
        setError(
          data.error || "Não foi possível carregar as reuniões de conselho.",
        );
        setMeetings([]);
        return;
      }

      setMeetings(normalizeMeetings(data));
      setActiveAccess(data.activeAccess || null);
      setKpis(data.kpis || null);
    } catch (requestError) {
      console.error("Erro ao carregar reuniões de conselho:", requestError);
      setError("Não foi possível carregar as reuniões de conselho.");
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMeetings();
  }, []);

  return (
    <PortalShell current="reunioes-conselho">
      <main className="min-h-screen bg-[linear-gradient(135deg,#F6F8F7_0%,#FFFFFF_48%,#EAF7EE_130%)] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-[34px] border border-[#DDE5DF] bg-white/88 p-6 shadow-[0_22px_70px_rgba(23,33,27,0.08)] backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#BFE8C4] bg-[#EAF7EE] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                  Governança Condominial
                </div>

                <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#17211B] sm:text-4xl">
                  Reuniões De Conselho
                </h1>

                <p className="mt-3 text-base font-medium leading-7 text-[#5E6B63]">
                  Acompanhe reuniões, pautas, confirmações de presença e acesso
                  à Sala De Reunião EloGest pelo seu perfil ativo.
                </p>

                {activeAccess && (
                  <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-semibold text-[#5E6B63]">
                    Perfil ativo: {activeAccess.label || activeAccess.role}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/portal/dashboard"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-bold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  Voltar Ao Portal
                </Link>

                <Link
                  href="/portal/reunioes-conselho/nova"
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(37,109,60,0.24)] transition hover:bg-[#1F5A32]"
                >
                  Nova Reunião
                </Link>

                <button
                  type="button"
                  onClick={() => void loadMeetings()}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#BFE8C4] bg-[#EAF7EE] px-5 text-sm font-bold text-[#256D3C] shadow-sm transition hover:bg-[#DDF3E0]"
                >
                  Atualizar
                </button>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total"
              value={calculatedKpis.total || 0}
              helper="Reuniões visíveis para o perfil ativo."
            />

            <KpiCard
              label="Agendadas"
              value={calculatedKpis.scheduled || 0}
              helper="Próximas reuniões programadas."
            />

            <KpiCard
              label="Em Andamento"
              value={calculatedKpis.inProgress || 0}
              helper="Salas abertas neste momento."
            />

            <KpiCard
              label="Confirmação"
              value={calculatedKpis.pendingConfirmation || 0}
              helper="Convites aguardando resposta."
            />
          </section>

          <section className="mt-6 rounded-[28px] border border-[#DDE5DF] bg-white p-4 shadow-sm sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por título, descrição ou condomínio..."
                className="h-12 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              />

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-12 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              >
                <option value="ALL">Todos os status</option>
                <option value="SCHEDULED">Agendada</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="COMPLETED">Realizada</option>
                <option value="CANCELED">Cancelada</option>
              </select>

              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                className="h-12 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              >
                <option value="ALL">Todos os formatos</option>
                <option value="ONLINE">Online</option>
                <option value="PRESENTIAL">Presencial</option>
                <option value="HYBRID">Híbrida</option>
              </select>
            </div>
          </section>

          <section className="mt-6">
            {loading && <LoadingState />}

            {!loading && error && (
              <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm">
                <h2 className="text-lg font-bold">Acesso indisponível</h2>
                <p className="mt-2 text-sm font-semibold leading-6">{error}</p>
              </div>
            )}

            {!loading && !error && filteredMeetings.length === 0 && (
              <EmptyState message="Não há reuniões disponíveis para os filtros selecionados ou para o perfil ativo neste momento." />
            )}

            {!loading && !error && filteredMeetings.length > 0 && (
              <div className="grid gap-4">
                {filteredMeetings.map((meeting) => {
                  const participantsCount =
                    meeting.participantsCount ??
                    meeting._count?.participants ??
                    0;
                  const agendaItemsCount =
                    meeting.agendaItemsCount ??
                    meeting._count?.agendaItems ??
                    0;
                  const participantStatus = getParticipantStatus(meeting);
                  const presenceConfirmed = hasConfirmedPresence(participantStatus);
                  const roomAvailable =
                    getMeetingMode(meeting) !== "PRESENTIAL" &&
                    meeting.status !== "CANCELED" &&
                    meeting.status !== "ARCHIVED" &&
                    getRoomStatus(meeting) !== "CANCELED";
                  const canEnterRoom = roomAvailable && presenceConfirmed;

                  return (
                    <article
                      key={meeting.id}
                      className="rounded-[30px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_45px_rgba(23,33,27,0.06)] transition hover:border-[#BFE8C4] hover:shadow-[0_24px_60px_rgba(23,33,27,0.08)] sm:p-6"
                    >
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={[
                                "inline-flex rounded-full border px-3 py-1 text-xs font-bold",
                                getStatusClass(meeting.status),
                              ].join(" ")}
                            >
                              {statusLabels[meeting.status] || meeting.status}
                            </span>

                            <span className="inline-flex rounded-full border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-1 text-xs font-bold text-[#5E6B63]">
                              {modeLabels[getMeetingMode(meeting)] ||
                                getMeetingMode(meeting)}
                            </span>

                            {getParticipantStatus(meeting) && (
                              <span
                                className={[
                                  "inline-flex rounded-full border px-3 py-1 text-xs font-bold",
                                  getParticipantStatusClass(
                                    getParticipantStatus(meeting),
                                  ),
                                ].join(" ")}
                              >
                                {getParticipantStatusLabel(getParticipantStatus(meeting))}
                              </span>
                            )}
                          </div>

                          <h2 className="mt-4 text-xl font-bold tracking-tight text-[#17211B] sm:text-2xl">
                            {meeting.title}
                          </h2>

                          {meeting.description && (
                            <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-[#5E6B63]">
                              {meeting.description}
                            </p>
                          )}

                          <div className="mt-4 grid gap-3 text-sm font-semibold text-[#5E6B63] md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl bg-[#F9FBFA] p-3">
                              <p className="text-[11px] uppercase tracking-[0.14em] text-[#9AA7A0]">
                                Data
                              </p>
                              <p className="mt-1 text-[#17211B]">
                                {formatDateTime(meeting.scheduledStartAt)}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-[#F9FBFA] p-3">
                              <p className="text-[11px] uppercase tracking-[0.14em] text-[#9AA7A0]">
                                Horário
                              </p>
                              <p className="mt-1 text-[#17211B]">
                                {formatTimeRange(
                                  meeting.scheduledStartAt,
                                  meeting.scheduledEndAt,
                                )}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-[#F9FBFA] p-3">
                              <p className="text-[11px] uppercase tracking-[0.14em] text-[#9AA7A0]">
                                Condomínio
                              </p>
                              <p className="mt-1 truncate text-[#17211B]">
                                {meeting.condominium?.name || "Não informado"}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-[#F9FBFA] p-3">
                              <p className="text-[11px] uppercase tracking-[0.14em] text-[#9AA7A0]">
                                Sala
                              </p>
                              <p className="mt-1 text-[#17211B]">
                                {getRoomStatus(meeting)
                                  ? roomStatusLabels[
                                      getRoomStatus(meeting) as RoomStatus
                                    ] || String(getRoomStatus(meeting))
                                  : "Sala EloGest"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[#5E6B63]">
                            <span className="rounded-full bg-[#F1F5F2] px-3 py-1">
                              {participantsCount} participante(s)
                            </span>

                            <span className="rounded-full bg-[#F1F5F2] px-3 py-1">
                              {agendaItemsCount} item(ns) de pauta
                            </span>

                            {meeting.location && (
                              <span className="rounded-full bg-[#F1F5F2] px-3 py-1">
                                Local: {meeting.location}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-3 sm:min-w-52">
                          <Link
                            href={`/portal/reunioes-conselho/${meeting.id}`}
                            className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-bold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
                          >
                            Ver Detalhes
                          </Link>

                          {canEnterRoom && (
                            <Link
                              href={`/portal/reunioes-conselho/${meeting.id}/sala`}
                              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(37,109,60,0.24)] transition hover:bg-[#1F5A32]"
                            >
                              Entrar Na Sala
                            </Link>
                          )}

                          {roomAvailable && !presenceConfirmed && (
                            <Link
                              href={`/portal/reunioes-conselho/${meeting.id}`}
                              className="inline-flex h-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-5 text-center text-sm font-bold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100"
                            >
                              Confirmar Presença
                            </Link>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </PortalShell>
  );
}
