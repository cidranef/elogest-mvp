"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import PortalShell from "@/components/PortalShell";

/* =========================================================
   PORTAL - DETALHE DA REUNIÃO DE CONSELHO

   Arquivo:
   src/app/portal/reunioes-conselho/[id]/page.tsx

   ETAPA 49 — REUNIÕES DE CONSELHO

   Objetivo:
   - Exibir ao síndico/conselheiro o detalhe da reunião.
   - Permitir confirmação ou recusa de presença.
   - Exibir pauta, participantes, anexos, histórico público e
     dados da Sala De Reunião EloGest.

   Segurança:
   - A segurança real fica na API /api/portal/reunioes-conselho/[id].
   - Esta página apenas consome dados já filtrados pelo perfil ativo.
   - Observações internas da administradora não são exibidas no portal.
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

type AgendaStatus =
  | "PENDING"
  | "IN_DISCUSSION"
  | "DECIDED"
  | "POSTPONED"
  | "CANCELED";

type PortalCouncilMeetingDetail = {
  id: string;
  title: string;
  description?: string | null;
  status: MeetingStatus;
  mode?: MeetingMode;
  meetingMode?: MeetingMode;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  location?: string | null;
  summary?: string | null;
  decisions?: string | null;
  nextSteps?: string | null;
  recordKeeper?: {
    userId?: string | null;
    participantId?: string | null;
    userAccessId?: string | null;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    roleLabel?: string | null;
    assignedAt?: string | null;
  } | null;
  isCurrentUserRecordKeeper?: boolean;
  canAccessRoom?: boolean;
  condominium?: {
    id: string;
    name: string;
  } | null;
  meetingRoom?: {
    id: string;
    type?: string;
    mode?: MeetingMode;
    status?: RoomStatus;
    roomStatus?: RoomStatus;
    scheduledStartAt?: string | null;
    scheduledEndAt?: string | null;
    openedAt?: string | null;
    closedAt?: string | null;
    location?: string | null;
    provider?: string | null;
    accessInstructions?: string | null;
  } | null;
  room?: {
    id: string;
    status?: RoomStatus;
    roomStatus?: RoomStatus;
    openedAt?: string | null;
    closedAt?: string | null;
    accessInstructions?: string | null;
  } | null;
  agendaItems?: {
    id: string;
    order: number;
    title: string;
    description?: string | null;
    status?: AgendaStatus | string;
    discussionNotes?: string | null;
    decision?: string | null;
    responsibleName?: string | null;
    dueDate?: string | null;
  }[];
  participants?: {
    id: string;
    role?: string | null;
    status?: ParticipantStatus | string;
    invitedAt?: string | null;
    respondedAt?: string | null;
    confirmedAt?: string | null;
    joinedAt?: string | null;
    attendanceNote?: string | null;
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
    } | null;
  }[];
  attachments?: {
    id: string;
    originalName: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    url?: string | null;
    description?: string | null;
    createdAt?: string | null;
  }[];
  logs?: {
    id: string;
    action: string;
    message?: string | null;
    createdAt?: string | null;
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
    } | null;
  }[];
  myParticipant?: {
    id: string;
    role?: string | null;
    status?: ParticipantStatus | string;
    respondedAt?: string | null;
    confirmedAt?: string | null;
  } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type PortalMeetingDetailResponse = {
  meeting?: PortalCouncilMeetingDetail;
  activeAccess?: {
    id: string;
    role: string;
    label?: string | null;
    condominiumId?: string | null;
    unitId?: string | null;
    linkType?: string | null;
    isGovernanceProfile?: boolean;
  } | null;
  participant?: {
    id: string;
    role?: string | null;
    status?: ParticipantStatus | string;
    respondedAt?: string | null;
    confirmedAt?: string | null;
  };
  message?: string;
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

const agendaStatusLabels: Record<string, string> = {
  PENDING: "Pendente",
  IN_DISCUSSION: "Em discussão",
  DECIDED: "Decidido",
  POSTPONED: "Adiado",
  CANCELED: "Cancelado",
};


type ConsolidatedPortalParticipant = {
  id: string;
  name: string;
  roles: string[];
  status: string;
};

const participantStatusPriority: Record<string, number> = {
  ATTENDED: 50,
  CONFIRMED: 40,
  INVITED: 30,
  DECLINED: 20,
  ABSENT: 10,
};

function getParticipantRoleLabel(role?: string | null) {
  const labels: Record<string, string> = {
    ADMINISTRADORA: "Administradora",
    SINDICO: "Síndico",
    CONSELHEIRO: "Conselheiro",
    MORADOR: "Morador",
    PROPRIETARIO: "Proprietário",
  };

  return labels[role || ""] || role || "Perfil não informado";
}

function getBestParticipantStatus(statuses: Array<string | null | undefined>) {
  const validStatuses = statuses.filter((item): item is string => Boolean(item));

  if (validStatuses.length === 0) {
    return "INVITED";
  }

  return validStatuses.sort(
    (a, b) =>
      (participantStatusPriority[b] ?? 0) -
      (participantStatusPriority[a] ?? 0),
  )[0];
}

function addUniqueValue(list: string[], value?: string | null) {
  const trimmed = String(value || "").trim();

  if (trimmed && !list.includes(trimmed)) {
    list.push(trimmed);
  }
}

function consolidatePortalParticipants(
  participants: NonNullable<PortalCouncilMeetingDetail["participants"]>,
): ConsolidatedPortalParticipant[] {
  const grouped = new Map<
    string,
    {
      id: string;
      name: string;
      roles: string[];
      statuses: string[];
    }
  >();

  participants.forEach((participant) => {
    const userKey = participant.user?.id || participant.id;
    const current =
      grouped.get(userKey) ||
      {
        id: userKey,
        name:
          participant.user?.name ||
          participant.user?.email ||
          "Participante",
        roles: [],
        statuses: [],
      };

    addUniqueValue(current.roles, getParticipantRoleLabel(participant.role));
    addUniqueValue(current.statuses, participant.status);

    grouped.set(userKey, current);
  });

  return Array.from(grouped.values()).map((item) => ({
    id: item.id,
    name: item.name,
    roles: item.roles,
    status: getBestParticipantStatus(item.statuses),
  }));
}

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

function formatDate(value?: string | null) {
  if (!value) {
    return "Sem prazo definido";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem prazo definido";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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

function formatFileSize(size?: number | null) {
  if (!size || size <= 0) {
    return "Tamanho não informado";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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

function hasConfirmedPresence(status?: string | null) {
  return status === "CONFIRMED" || status === "ATTENDED";
}

function getRoomStatus(meeting: PortalCouncilMeetingDetail | null) {
  return (
    meeting?.meetingRoom?.status ||
    meeting?.meetingRoom?.roomStatus ||
    meeting?.room?.status ||
    meeting?.room?.roomStatus ||
    null
  );
}

function getMeetingMode(meeting: PortalCouncilMeetingDetail | null) {
  return (
    meeting?.mode ||
    meeting?.meetingMode ||
    meeting?.meetingRoom?.mode ||
    "ONLINE"
  );
}

function InfoCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9AA7A0]">
        {label}
      </p>

      <p className="mt-2 text-sm font-bold text-[#17211B]">{value}</p>

      {helper && (
        <p className="mt-1 text-xs font-medium leading-5 text-[#7A877F]">
          {helper}
        </p>
      )}
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold tracking-tight text-[#17211B]">
        {title}
      </h2>

      {description && (
        <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
          {description}
        </p>
      )}
    </div>
  );
}

function CouncilPortalShell({ children }: { children: ReactNode }) {
  return <PortalShell current="reunioes-conselho">{children}</PortalShell>;
}

function LoadingState() {
  return (
    <CouncilPortalShell>
      <main className="min-h-screen bg-[linear-gradient(135deg,#F6F8F7_0%,#FFFFFF_48%,#EAF7EE_130%)] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="h-72 animate-pulse rounded-[34px] border border-[#DDE5DF] bg-white/80 shadow-sm" />

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-36 animate-pulse rounded-[28px] border border-[#DDE5DF] bg-white/80 shadow-sm"
              />
            ))}
          </div>
        </div>
      </main>
    </CouncilPortalShell>
  );
}

export default function PortalCouncilMeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const meetingId = params?.id;

  const [meeting, setMeeting] = useState<PortalCouncilMeetingDetail | null>(
    null,
  );
  const [activeAccess, setActiveAccess] =
    useState<PortalMeetingDetailResponse["activeAccess"]>(null);
  const [loading, setLoading] = useState(true);
  const [savingPresence, setSavingPresence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const mode = getMeetingMode(meeting);
  const roomStatus = getRoomStatus(meeting);
  const participantStatus = meeting?.myParticipant?.status || null;
  const presenceConfirmed = hasConfirmedPresence(participantStatus);
  const canRespondPresence =
    meeting?.myParticipant &&
    (meeting.status === "SCHEDULED" || meeting.status === "IN_PROGRESS");
  const canAccessRoom =
    Boolean(meeting?.canAccessRoom) &&
    presenceConfirmed &&
    mode !== "PRESENTIAL" &&
    meeting?.status !== "CANCELED" &&
    meeting?.status !== "ARCHIVED";

  const consolidatedParticipants = useMemo(() => {
    return consolidatePortalParticipants(meeting?.participants || []);
  }, [meeting?.participants]);

  const participantsSummary = useMemo(() => {
    const confirmed = consolidatedParticipants.filter(
      (item) => item.status === "CONFIRMED" || item.status === "ATTENDED",
    ).length;
    const pending = consolidatedParticipants.filter(
      (item) => !item.status || item.status === "INVITED",
    ).length;
    const declined = consolidatedParticipants.filter(
      (item) => item.status === "DECLINED",
    ).length;

    return {
      total: consolidatedParticipants.length,
      confirmed,
      pending,
      declined,
    };
  }, [consolidatedParticipants]);

  async function loadMeeting() {
    if (!meetingId) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        `/api/portal/reunioes-conselho/${meetingId}`,
        {
          cache: "no-store",
        },
      );

      const data = (await response.json()) as PortalMeetingDetailResponse;

      if (!response.ok || !data.meeting) {
        setError(
          data.error || "Não foi possível carregar a reunião de conselho.",
        );
        setMeeting(null);
        return;
      }

      setMeeting(data.meeting);
      setActiveAccess(data.activeAccess || null);
    } catch (requestError) {
      console.error("Erro ao carregar reunião de conselho:", requestError);
      setError("Não foi possível carregar a reunião de conselho.");
      setMeeting(null);
    } finally {
      setLoading(false);
    }
  }

  async function updatePresence(action: "CONFIRM" | "DECLINE") {
    if (!meetingId) {
      return;
    }

    setSavingPresence(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        `/api/portal/reunioes-conselho/${meetingId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        },
      );

      const data = (await response.json()) as PortalMeetingDetailResponse;

      if (!response.ok) {
        setError(data.error || "Não foi possível atualizar sua presença.");
        return;
      }

      setSuccessMessage(data.message || "Presença atualizada com sucesso.");
      await loadMeeting();
    } catch (requestError) {
      console.error("Erro ao atualizar presença:", requestError);
      setError("Não foi possível atualizar sua presença.");
    } finally {
      setSavingPresence(false);
    }
  }

  useEffect(() => {
    void loadMeeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  if (loading) {
    return <LoadingState />;
  }

  if (error && !meeting) {
    return (
      <CouncilPortalShell>
        <main className="min-h-screen bg-[linear-gradient(135deg,#F6F8F7_0%,#FFFFFF_48%,#EAF7EE_130%)] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-[34px] border border-red-200 bg-red-50 p-8 text-red-800 shadow-sm">
              <h1 className="text-2xl font-bold">Reunião indisponível</h1>

              <p className="mt-3 text-sm font-semibold leading-6">{error}</p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/portal/reunioes-conselho"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-red-200 bg-white px-5 text-sm font-bold text-red-800 transition hover:bg-red-100"
                >
                  Voltar Para Reuniões
                </Link>

                <button
                  type="button"
                  onClick={() => void loadMeeting()}
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-700 px-5 text-sm font-bold text-white transition hover:bg-red-800"
                >
                  Tentar Novamente
                </button>
              </div>
            </div>
          </div>
        </main>
      </CouncilPortalShell>
    );
  }

  if (!meeting) {
    return null;
  }

  return (
    <CouncilPortalShell>
      <main className="min-h-screen bg-[linear-gradient(135deg,#F6F8F7_0%,#FFFFFF_48%,#EAF7EE_130%)] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-[34px] border border-[#DDE5DF] bg-white/88 p-6 shadow-[0_22px_70px_rgba(23,33,27,0.08)] backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
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
                    {modeLabels[mode] || mode}
                  </span>

                  {meeting.myParticipant?.status && (
                    <span
                      className={[
                        "inline-flex rounded-full border px-3 py-1 text-xs font-bold",
                        getParticipantStatusClass(meeting.myParticipant.status),
                      ].join(" ")}
                    >
                      {participantStatusLabels[meeting.myParticipant.status] ||
                        meeting.myParticipant.status}
                    </span>
                  )}
                </div>

                <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#17211B] sm:text-4xl">
                  {meeting.title}
                </h1>

                <p className="mt-3 text-base font-medium leading-7 text-[#5E6B63]">
                  {meeting.description ||
                    "Consulte os dados da reunião, pauta, participantes e informações da Sala De Reunião EloGest."}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <InfoCard
                    label="Condomínio"
                    value={meeting.condominium?.name || "Não informado"}
                  />

                  <InfoCard
                    label="Data"
                    value={formatDateTime(meeting.scheduledStartAt)}
                  />

                  <InfoCard
                    label="Horário"
                    value={formatTimeRange(
                      meeting.scheduledStartAt,
                      meeting.scheduledEndAt,
                    )}
                  />

                  <InfoCard
                    label="Sala"
                    value={
                      roomStatus
                        ? roomStatusLabels[roomStatus] || roomStatus
                        : "Sala EloGest"
                    }
                    helper={
                      meeting.meetingRoom?.provider
                        ? `Provedor: ${meeting.meetingRoom.provider}`
                        : "Ambiente preparado dentro do EloGest."
                    }
                  />
                </div>

                {activeAccess && (
                  <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-semibold text-[#5E6B63]">
                    Perfil ativo: {activeAccess.label || activeAccess.role}
                  </div>
                )}

                <div
                  className={[
                    "mt-4 rounded-2xl border px-4 py-4 text-sm",
                    meeting.recordKeeper
                      ? meeting.isCurrentUserRecordKeeper
                        ? "border-[#8ED08E] bg-[#EAF7EE] text-[#256D3C]"
                        : "border-[#DDE5DF] bg-[#F9FBFA] text-[#5E6B63]"
                      : "border-amber-200 bg-amber-50 text-amber-800",
                  ].join(" ")}
                >
                  <p className="font-bold text-[#17211B]">
                    Responsável Pelo Registro
                  </p>

                  {meeting.recordKeeper ? (
                    <>
                      <p className="mt-1 font-semibold">
                        {meeting.recordKeeper.name}
                        {meeting.recordKeeper.roleLabel
                          ? ` • ${meeting.recordKeeper.roleLabel}`
                          : ""}
                      </p>

                      <p className="mt-2 leading-6">
                        {meeting.isCurrentUserRecordKeeper
                          ? "Você foi escolhido para registrar discussões, decisões e encaminhamentos desta reunião."
                          : "Essa pessoa ficará responsável por registrar as informações oficiais da reunião."}
                      </p>

                      {meeting.recordKeeper.assignedAt && (
                        <p className="mt-2 text-xs font-semibold opacity-80">
                          Definido em {formatDateTime(meeting.recordKeeper.assignedAt)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 leading-6">
                      O responsável pelo registro ainda será definido no início da reunião.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-3 sm:min-w-60">
                <Link
                  href="/portal/reunioes-conselho"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-bold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  Voltar Para Reuniões
                </Link>

                {canAccessRoom && (
                  <Link
                    href={`/portal/reunioes-conselho/${meeting.id}/sala`}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(37,109,60,0.24)] transition hover:bg-[#1F5A32]"
                  >
                    Entrar Na Sala
                  </Link>
                )}

                {!canAccessRoom &&
                  mode !== "PRESENTIAL" &&
                  meeting?.myParticipant &&
                  !presenceConfirmed &&
                  canRespondPresence && (
                    <button
                      type="button"
                      disabled={savingPresence}
                      onClick={() => void updatePresence("CONFIRM")}
                      className="inline-flex h-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-5 text-sm font-bold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Confirmar Para Entrar
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-5 text-sm font-bold text-[#5E6B63] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  Atualizar Tela
                </button>
              </div>
            </div>
          </section>

          {(error || successMessage) && (
            <section className="mt-5">
              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="rounded-2xl border border-[#BFE8C4] bg-[#EAF7EE] px-5 py-4 text-sm font-semibold text-[#256D3C]">
                  {successMessage}
                </div>
              )}
            </section>
          )}

          {!canAccessRoom &&
            mode !== "PRESENTIAL" &&
            meeting?.myParticipant &&
            !presenceConfirmed && (
              <section className="mt-5 rounded-[26px] border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
                <h2 className="text-lg font-bold">Confirme sua presença para acessar a sala</h2>
                <p className="mt-2 text-sm font-semibold leading-6">
                  Para entrar na Sala De Reunião EloGest, confirme primeiro que você participará desta reunião.
                </p>

                {canRespondPresence && (
                  <button
                    type="button"
                    disabled={savingPresence}
                    onClick={() => void updatePresence("CONFIRM")}
                    className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Confirmar Presença
                  </button>
                )}
              </section>
            )}

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_45px_rgba(23,33,27,0.06)]">
                <SectionTitle
                  title="Minha Presença"
                  description="Confirme se você participará da reunião. Esta informação ajuda a administradora a acompanhar quórum e organização."
                />

                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <p className="text-sm font-bold text-[#17211B]">
                    Status atual:{" "}
                    {meeting.myParticipant?.status
                      ? participantStatusLabels[meeting.myParticipant.status] ||
                        meeting.myParticipant.status
                      : "Você não está na lista nominal de participantes."}
                  </p>

                  {meeting.myParticipant?.respondedAt && (
                    <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                      Respondido em{" "}
                      {formatDateTime(meeting.myParticipant.respondedAt)}
                    </p>
                  )}
                </div>

                {canRespondPresence && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={savingPresence}
                      onClick={() => void updatePresence("CONFIRM")}
                      className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(37,109,60,0.22)] transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Confirmar Presença
                    </button>

                    <button
                      type="button"
                      disabled={savingPresence}
                      onClick={() => void updatePresence("DECLINE")}
                      className="inline-flex h-12 items-center justify-center rounded-2xl border border-red-200 bg-white px-5 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Recusar Presença
                    </button>
                  </div>
                )}

                {!canRespondPresence && (
                  <p className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm font-semibold text-[#5E6B63]">
                    A confirmação de presença fica disponível para reuniões
                    agendadas ou em andamento quando seu perfil está entre os
                    participantes.
                  </p>
                )}
              </div>

              <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_45px_rgba(23,33,27,0.06)]">
                <SectionTitle
                  title="Pauta Da Reunião"
                  description="Itens previstos para discussão e acompanhamento durante a reunião de conselho."
                />

                {meeting.agendaItems && meeting.agendaItems.length > 0 ? (
                  <div className="space-y-3">
                    {meeting.agendaItems.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                              Item {item.order}
                            </p>

                            <h3 className="mt-1 text-base font-bold text-[#17211B]">
                              {item.title}
                            </h3>
                          </div>

                          {item.status && (
                            <span className="inline-flex rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-bold text-[#5E6B63]">
                              {agendaStatusLabels[item.status] || item.status}
                            </span>
                          )}
                        </div>

                        {item.description && (
                          <p className="mt-3 text-sm font-medium leading-6 text-[#5E6B63]">
                            {item.description}
                          </p>
                        )}

                        {(item.decision ||
                          item.discussionNotes ||
                          item.responsibleName ||
                          item.dueDate) && (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {item.discussionNotes && (
                              <InfoCard
                                label="Discussão"
                                value={item.discussionNotes}
                              />
                            )}

                            {item.decision && (
                              <InfoCard label="Decisão" value={item.decision} />
                            )}

                            {item.responsibleName && (
                              <InfoCard
                                label="Responsável"
                                value={item.responsibleName}
                              />
                            )}

                            {item.dueDate && (
                              <InfoCard
                                label="Prazo"
                                value={formatDate(item.dueDate)}
                              />
                            )}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-[#C8D8CD] bg-[#F9FBFA] p-5 text-sm font-semibold text-[#5E6B63]">
                    Nenhum item de pauta cadastrado para esta reunião.
                  </p>
                )}
              </div>

              {(meeting.summary || meeting.decisions || meeting.nextSteps) && (
                <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_45px_rgba(23,33,27,0.06)]">
                  <SectionTitle
                    title="Resumo E Encaminhamentos"
                    description="Informações registradas após ou durante a reunião."
                  />

                  <div className="grid gap-3">
                    {meeting.summary && (
                      <InfoCard label="Resumo" value={meeting.summary} />
                    )}

                    {meeting.decisions && (
                      <InfoCard label="Decisões" value={meeting.decisions} />
                    )}

                    {meeting.nextSteps && (
                      <InfoCard
                        label="Próximos Passos"
                        value={meeting.nextSteps}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            <aside className="space-y-6">
              <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_45px_rgba(23,33,27,0.06)]">
                <SectionTitle
                  title="Sala De Reunião EloGest"
                  description="A reunião acontece dentro do EloGest. O provedor de vídeo poderá ser plugado futuramente."
                />

                <div className="grid gap-3">
                  <InfoCard
                    label="Status Da Sala"
                    value={
                      roomStatus
                        ? roomStatusLabels[roomStatus] || roomStatus
                        : "Sala EloGest"
                    }
                  />

                  <InfoCard label="Formato" value={modeLabels[mode] || mode} />

                  <InfoCard
                    label="Local"
                    value={
                      meeting.location ||
                      meeting.meetingRoom?.location ||
                      "Não informado"
                    }
                  />

                  {meeting.meetingRoom?.accessInstructions && (
                    <InfoCard
                      label="Instruções De Acesso"
                      value={meeting.meetingRoom.accessInstructions}
                    />
                  )}
                </div>

                {canAccessRoom && (
                  <Link
                    href={`/portal/reunioes-conselho/${meeting.id}/sala`}
                    className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(37,109,60,0.24)] transition hover:bg-[#1F5A32]"
                  >
                    Entrar Na Sala
                  </Link>
                )}
              </div>

              <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_45px_rgba(23,33,27,0.06)]">
                <SectionTitle
                  title="Participantes"
                  description={`${participantsSummary.total} participante(s), ${participantsSummary.confirmed} confirmado(s), ${participantsSummary.pending} pendente(s).`}
                />

                {consolidatedParticipants.length > 0 ? (
                  <div className="space-y-3">
                    {consolidatedParticipants.map((participant) => (
                      <div
                        key={participant.id}
                        className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[#17211B]">
                              {participant.name}
                            </p>

                            <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                              {participant.roles.join(" e ")}
                            </p>
                          </div>

                          <span
                            className={[
                              "shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold",
                              getParticipantStatusClass(participant.status),
                            ].join(" ")}
                          >
                            {participantStatusLabels[participant.status] ||
                              participant.status ||
                              "Pendente"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-[#C8D8CD] bg-[#F9FBFA] p-5 text-sm font-semibold text-[#5E6B63]">
                    Nenhum participante listado para esta reunião.
                  </p>
                )}
              </div>

              <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_45px_rgba(23,33,27,0.06)]">
                <SectionTitle
                  title="Anexos"
                  description="Documentos de apoio disponibilizados para a reunião."
                />

                {meeting.attachments && meeting.attachments.length > 0 ? (
                  <div className="space-y-3">
                    {meeting.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 transition hover:border-[#256D3C] hover:bg-white"
                      >
                        <p className="text-sm font-bold text-[#17211B]">
                          {attachment.originalName}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                          {formatFileSize(attachment.sizeBytes)}
                        </p>

                        {attachment.description && (
                          <p className="mt-2 text-xs font-medium leading-5 text-[#5E6B63]">
                            {attachment.description}
                          </p>
                        )}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-[#C8D8CD] bg-[#F9FBFA] p-5 text-sm font-semibold text-[#5E6B63]">
                    Nenhum anexo disponível para esta reunião.
                  </p>
                )}
              </div>
            </aside>
          </section>

          <section className="mt-6 rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-[0_18px_45px_rgba(23,33,27,0.06)]">
            <SectionTitle
              title="Histórico Público"
              description="Eventos relevantes da reunião visíveis para o perfil ativo."
            />

            {meeting.logs && meeting.logs.length > 0 ? (
              <div className="space-y-3">
                {meeting.logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#17211B]">
                          {log.message || log.action}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                          {log.user?.name ||
                            log.user?.email ||
                            "Sistema EloGest"}
                        </p>
                      </div>

                      <p className="text-xs font-bold text-[#7A877F]">
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-[#C8D8CD] bg-[#F9FBFA] p-5 text-sm font-semibold text-[#5E6B63]">
                Nenhum histórico público disponível para esta reunião.
              </p>
            )}
          </section>
        </div>
      </main>
    </CouncilPortalShell>
  );
}
