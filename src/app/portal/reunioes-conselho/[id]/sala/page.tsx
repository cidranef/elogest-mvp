"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import PortalShell from "@/components/PortalShell";

/* =========================================================
   PORTAL - SALA DE REUNIÃO ELOGEST

   Arquivo:
   src/app/portal/reunioes-conselho/[id]/sala/page.tsx

   ETAPA 49 — REUNIÕES DE CONSELHO

   Objetivo:
   - Exibir a Sala De Reunião EloGest para síndico/conselheiro.
   - Manter a experiência da reunião dentro do EloGest.
   - Preparar a área central para câmera/vídeo plugável futuramente.
   - Exibir pauta, participantes, status da sala e dados da reunião.

   Segurança:
   - A segurança real fica na API /api/portal/reunioes-conselho/[id].
   - Esta página apenas consome dados já filtrados pelo perfil ativo.
   - Não possui controles administrativos de abrir/encerrar sala.
   - Morador/proprietário sem vínculo de governança ou convite não acessa.
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

type PortalCouncilMeetingRoom = {
  id: string;
  title: string;
  description?: string | null;
  status: MeetingStatus;
  mode?: MeetingMode;
  meetingMode?: MeetingMode;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  location?: string | null;
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
  canManageRoom?: boolean;
  canAccessRoom?: boolean;
  condominium?: {
    id: string;
    name: string;
  } | null;
  meetingRoom?: {
    id: string;
    type?: string | null;
    mode?: MeetingMode | null;
    status?: RoomStatus | null;
    roomStatus?: RoomStatus | null;
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
    status?: RoomStatus | null;
    roomStatus?: RoomStatus | null;
    openedAt?: string | null;
    closedAt?: string | null;
    accessInstructions?: string | null;
  } | null;
  agendaItems?: {
    id: string;
    order: number;
    title: string;
    description?: string | null;
    status?: string | null;
    decision?: string | null;
    discussionNotes?: string | null;
    responsibleName?: string | null;
    dueDate?: string | null;
  }[];
  participants?: {
    id: string;
    role?: string | null;
    status?: ParticipantStatus | string | null;
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
    } | null;
  }[];
  myParticipant?: {
    id: string;
    role?: string | null;
    status?: ParticipantStatus | string | null;
  } | null;
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
};

type PortalMeetingRoomResponse = {
  meeting?: PortalCouncilMeetingRoom;
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

type AgendaItemForm = {
  status: string;
  discussionNotes: string;
  decision: string;
  responsibleName: string;
  dueDate: string;
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
  OPEN: "Pendente",
  DISCUSSED: "Em discussão",
  APPROVED: "Resolvida",
  REJECTED: "Rejeitada",
  POSTPONED: "Adiada",
  CANCELED: "Cancelada",
  PENDING: "Pendente",
  IN_DISCUSSION: "Em discussão",
  DECIDED: "Decidida",
};

const agendaStatusOptions = [
  { value: "OPEN", label: "Pendente" },
  { value: "DISCUSSED", label: "Em discussão" },
  { value: "APPROVED", label: "Resolvida" },
  { value: "POSTPONED", label: "Adiada" },
  { value: "CANCELED", label: "Cancelada" },
];


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
  participants: NonNullable<PortalCouncilMeetingRoom["participants"]>,
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

function formatInputDate(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
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

function getMeetingMode(meeting: PortalCouncilMeetingRoom | null) {
  return (
    meeting?.mode ||
    meeting?.meetingMode ||
    meeting?.meetingRoom?.mode ||
    "ONLINE"
  );
}

function getRoomStatus(meeting: PortalCouncilMeetingRoom | null) {
  return (
    meeting?.meetingRoom?.status ||
    meeting?.meetingRoom?.roomStatus ||
    meeting?.room?.status ||
    meeting?.room?.roomStatus ||
    null
  );
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

function getRoomStatusClass(status?: RoomStatus | null) {
  if (status === "OPEN") {
    return "border-[#BFE8C4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (status === "CLOSED") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  if (status === "CANCELED") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/14 bg-white/10 px-4 py-3 text-white shadow-[0_12px_35px_rgba(0,0,0,0.12)] backdrop-blur">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">
        {label}
      </p>

      <p className="mt-1 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function CouncilPortalShell({ children }: { children: ReactNode }) {
  return <PortalShell current="reunioes-conselho">{children}</PortalShell>;
}

function LoadingState() {
  return (
    <CouncilPortalShell>
      <main className="min-h-screen bg-[#101711] px-4 py-6 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="h-[520px] animate-pulse rounded-[38px] border border-white/10 bg-white/10" />
        </div>
      </main>
    </CouncilPortalShell>
  );
}

export default function PortalCouncilMeetingRoomPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params?.id;

  const [meeting, setMeeting] = useState<PortalCouncilMeetingRoom | null>(null);
  const [activeAccess, setActiveAccess] =
    useState<PortalMeetingRoomResponse["activeAccess"]>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isManagingRoom, setIsManagingRoom] = useState(false);
  const [isConfirmingPresence, setIsConfirmingPresence] = useState(false);
  const [isAssigningRecordKeeper, setIsAssigningRecordKeeper] = useState(false);
  const [selectedRecordKeeperUserId, setSelectedRecordKeeperUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const mode = getMeetingMode(meeting);
  const roomStatus = getRoomStatus(meeting);
  const isRoomOpen = roomStatus === "OPEN";
  const isPresentialOnly = mode === "PRESENTIAL";
  const participantStatus = meeting?.myParticipant?.status || null;
  const presenceConfirmed = hasConfirmedPresence(participantStatus);
  const canUseRoom =
    Boolean(meeting?.canAccessRoom) &&
    presenceConfirmed &&
    !isPresentialOnly &&
    meeting?.status !== "CANCELED" &&
    meeting?.status !== "ARCHIVED";
  const canManageRoom =
    presenceConfirmed &&
    Boolean(meeting?.canManageRoom || activeAccess?.isGovernanceProfile || meeting?.isCurrentUserRecordKeeper) &&
    meeting?.status !== "COMPLETED" &&
    meeting?.status !== "CANCELED" &&
    meeting?.status !== "ARCHIVED";
  const canOpenRoom =
    canManageRoom &&
    meeting?.status !== "IN_PROGRESS" &&
    roomStatus !== "OPEN";
  const canCloseRoom =
    canManageRoom &&
    (meeting?.status === "IN_PROGRESS" || roomStatus === "OPEN");

  const consolidatedParticipants = useMemo(() => {
    return consolidatePortalParticipants(meeting?.participants || []);
  }, [meeting?.participants]);

  const participantsSummary = useMemo(() => {
    return {
      total: consolidatedParticipants.length,
      confirmed: consolidatedParticipants.filter(
        (item) => item.status === "CONFIRMED" || item.status === "ATTENDED",
      ).length,
      pending: consolidatedParticipants.filter(
        (item) => !item.status || item.status === "INVITED",
      ).length,
      declined: consolidatedParticipants.filter((item) => item.status === "DECLINED")
        .length,
    };
  }, [consolidatedParticipants]);

  useEffect(() => {
    if (meeting?.recordKeeper?.userId) {
      setSelectedRecordKeeperUserId(meeting.recordKeeper.userId);
      return;
    }

    if (consolidatedParticipants.length > 0 && !selectedRecordKeeperUserId) {
      setSelectedRecordKeeperUserId(consolidatedParticipants[0].id);
    }
  }, [consolidatedParticipants, meeting?.recordKeeper?.userId, selectedRecordKeeperUserId]);

  async function loadMeeting(options?: { silent?: boolean }) {
    if (!meetingId) {
      return;
    }

    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await fetch(
        `/api/portal/reunioes-conselho/${meetingId}`,
        {
          cache: "no-store",
        },
      );

      const data = (await response.json()) as PortalMeetingRoomResponse;

      if (!response.ok || !data.meeting) {
        setError(
          data.error || "Não foi possível carregar a Sala De Reunião EloGest.",
        );
        setMeeting(null);
        return;
      }

      setMeeting(data.meeting);
      setActiveAccess(data.activeAccess || null);
    } catch (requestError) {
      console.error("Erro ao carregar Sala De Reunião EloGest:", requestError);
      setError("Não foi possível carregar a Sala De Reunião EloGest.");
      setMeeting(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function updateRoom(action: "abrir" | "encerrar") {
    if (!meetingId) {
      return;
    }

    setIsManagingRoom(true);
    setError(null);
    setActionMessage(null);

    try {
      const response = await fetch(
        `/api/portal/reunioes-conselho/${meetingId}/sala/${action}`,
        {
          method: "POST",
        },
      );

      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setError(
          data.error ||
            (action === "abrir"
              ? "Não foi possível abrir a Sala De Reunião EloGest."
              : "Não foi possível encerrar a Sala De Reunião EloGest."),
        );
        return;
      }

      setActionMessage(
        data.message ||
          (action === "abrir"
            ? "Sala De Reunião EloGest aberta com sucesso."
            : "Sala De Reunião EloGest encerrada com sucesso."),
      );
      await loadMeeting({ silent: true });
    } catch (requestError) {
      console.error("Erro ao atualizar Sala De Reunião EloGest:", requestError);
      setError(
        action === "abrir"
          ? "Não foi possível abrir a Sala De Reunião EloGest."
          : "Não foi possível encerrar a Sala De Reunião EloGest.",
      );
    } finally {
      setIsManagingRoom(false);
    }
  }

  async function confirmPresence() {
    if (!meetingId) {
      return;
    }

    setIsConfirmingPresence(true);
    setError(null);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/portal/reunioes-conselho/${meetingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "CONFIRM",
        }),
      });

      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setError(data.error || "Não foi possível confirmar sua presença.");
        return;
      }

      setActionMessage(data.message || "Presença confirmada. A sala foi liberada para seu perfil.");
      await loadMeeting({ silent: true });
    } catch (requestError) {
      console.error("Erro ao confirmar presença pela sala:", requestError);
      setError("Não foi possível confirmar sua presença.");
    } finally {
      setIsConfirmingPresence(false);
    }
  }

  async function assignRecordKeeper() {
    if (!meetingId || !selectedRecordKeeperUserId) {
      setError("Selecione o responsável pelo registro.");
      return;
    }

    setIsAssigningRecordKeeper(true);
    setError(null);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/portal/reunioes-conselho/${meetingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "SET_RECORD_KEEPER",
          recordKeeperUserId: selectedRecordKeeperUserId,
        }),
      });

      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setError(data.error || "Não foi possível definir o responsável pelo registro.");
        return;
      }

      setActionMessage(data.message || "Responsável pelo registro definido com sucesso.");
      await loadMeeting({ silent: true });
    } catch (requestError) {
      console.error("Erro ao definir responsável pelo registro:", requestError);
      setError("Não foi possível definir o responsável pelo registro.");
    } finally {
      setIsAssigningRecordKeeper(false);
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
        <main className="min-h-screen bg-[#101711] px-4 py-6 text-white sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-[34px] border border-red-400/30 bg-red-950/35 p-8 shadow-[0_22px_70px_rgba(0,0,0,0.25)]">
              <h1 className="text-2xl font-bold">Sala indisponível</h1>

              <p className="mt-3 text-sm font-semibold leading-6 text-red-100">
                {error}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/portal/reunioes-conselho"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-5 text-sm font-bold text-white transition hover:bg-white/15"
                >
                  Voltar Para Reuniões
                </Link>

                <button
                  type="button"
                  onClick={() => void loadMeeting()}
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-bold text-[#17211B] transition hover:bg-[#EAF7EE]"
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

  if (!presenceConfirmed && !isPresentialOnly && meeting.myParticipant) {
    return (
      <CouncilPortalShell>
        <main className="min-h-screen overflow-hidden bg-[#101711] text-white">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(37,109,60,0.22),transparent_36%)]" />

          <div className="relative mx-auto flex min-h-screen max-w-4xl items-center px-4 py-8 sm:px-6 lg:px-8">
            <section className="w-full rounded-[38px] border border-amber-300/25 bg-amber-300/10 p-7 shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:p-9">
              <span className="inline-flex rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-100">
                Confirmação necessária
              </span>

              <h1 className="mt-5 text-3xl font-bold tracking-tight text-white">
                Confirme sua presença para acessar a sala
              </h1>

              <p className="mt-4 text-sm font-medium leading-7 text-white/70">
                Você está convidado para a reunião “{meeting.title}”. Para entrar
                na Sala De Reunião EloGest, confirme primeiro que participará da reunião.
              </p>

              <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.06] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">
                  Status atual
                </p>
                <p className="mt-2 text-lg font-bold text-white">
                  {participantStatusLabels[participantStatus || ""] ||
                    participantStatus ||
                    "Convite pendente"}
                </p>
              </div>

              {error && (
                <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-950/35 px-5 py-4 text-sm font-semibold text-red-100">
                  {error}
                </div>
              )}

              {actionMessage && (
                <div className="mt-5 rounded-2xl border border-[#8ED08E]/30 bg-[#8ED08E]/12 px-5 py-4 text-sm font-semibold text-[#DDF6DF]">
                  {actionMessage}
                </div>
              )}

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void confirmPresence()}
                  disabled={isConfirmingPresence}
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#8ED08E] px-5 text-sm font-bold text-[#101711] transition hover:bg-[#BFE8C4] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isConfirmingPresence ? "Confirmando..." : "Confirmar Presença"}
                </button>

                <Link
                  href={`/portal/reunioes-conselho/${meeting.id}`}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/14 bg-white/10 px-5 text-sm font-bold text-white transition hover:bg-white/15"
                >
                  Voltar Para Detalhes
                </Link>

                <Link
                  href="/portal/reunioes-conselho"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/14 bg-transparent px-5 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Ver Reuniões
                </Link>
              </div>
            </section>
          </div>
        </main>
      </CouncilPortalShell>
    );
  }

  return (
    <CouncilPortalShell>
      <main className="min-h-screen overflow-hidden bg-[#101711] text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(37,109,60,0.22),transparent_36%)]" />

        <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <section className="rounded-[38px] border border-white/10 bg-white/[0.07] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      "inline-flex rounded-full border px-3 py-1 text-xs font-bold",
                      getStatusClass(meeting.status),
                    ].join(" ")}
                  >
                    {statusLabels[meeting.status] || meeting.status}
                  </span>

                  <span
                    className={[
                      "inline-flex rounded-full border px-3 py-1 text-xs font-bold",
                      getRoomStatusClass(roomStatus),
                    ].join(" ")}
                  >
                    {roomStatus
                      ? roomStatusLabels[roomStatus] || roomStatus
                      : "Sala EloGest"}
                  </span>

                  <span className="inline-flex rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs font-bold text-white/75">
                    {modeLabels[mode] || mode}
                  </span>
                </div>

                <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-[#8ED08E]">
                  Sala De Reunião EloGest
                </p>

                <h1 className="mt-2 truncate text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  {meeting.title}
                </h1>

                <p className="mt-3 max-w-3xl text-sm font-medium leading-7 text-white/62">
                  A reunião acontece dentro do EloGest. A área de câmera/vídeo
                  abaixo está preparada para receber o provedor que será
                  definido futuramente.
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-3 sm:min-w-64">
                <Link
                  href={`/portal/reunioes-conselho/${meeting.id}`}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/14 bg-white/10 px-5 text-sm font-bold text-white transition hover:bg-white/15"
                >
                  Voltar Para Detalhes
                </Link>

                <button
                  type="button"
                  onClick={() => void loadMeeting({ silent: true })}
                  disabled={refreshing}
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-bold text-[#17211B] transition hover:bg-[#EAF7EE] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshing ? "Atualizando..." : "Atualizar Sala"}
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <InfoPill
                label="Condomínio"
                value={meeting.condominium?.name || "Não informado"}
              />

              <InfoPill
                label="Data"
                value={formatDateTime(meeting.scheduledStartAt)}
              />

              <InfoPill
                label="Horário"
                value={formatTimeRange(
                  meeting.scheduledStartAt,
                  meeting.scheduledEndAt,
                )}
              />

              <InfoPill
                label="Meu Perfil"
                value={
                  activeAccess?.label || activeAccess?.role || "Perfil ativo"
                }
              />

              <InfoPill
                label="Registro"
                value={
                  meeting.recordKeeper
                    ? meeting.isCurrentUserRecordKeeper
                      ? "Você registra"
                      : meeting.recordKeeper.name || "Responsável definido"
                    : "A definir"
                }
              />
            </div>
          </section>

          <section
            className={[
              "mt-5 rounded-[30px] border p-5 shadow-[0_18px_45px_rgba(0,0,0,0.18)] backdrop-blur",
              meeting.recordKeeper
                ? meeting.isCurrentUserRecordKeeper
                  ? "border-[#8ED08E]/35 bg-[#8ED08E]/12 text-white"
                  : "border-white/10 bg-white/[0.07] text-white"
                : "border-amber-300/25 bg-amber-300/10 text-white",
            ].join(" ")}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8ED08E]">
                  Responsável Pelo Registro
                </p>

                {meeting.recordKeeper ? (
                  <>
                    <h2 className="mt-2 text-xl font-bold">
                      {meeting.recordKeeper.name}
                      {meeting.recordKeeper.roleLabel
                        ? ` • ${meeting.recordKeeper.roleLabel}`
                        : ""}
                    </h2>

                    <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-white/68">
                      {meeting.isCurrentUserRecordKeeper
                        ? "Você foi escolhido para registrar as informações oficiais desta reunião. Os campos de discussão, decisão, ação, responsável e prazo das pautas estão disponíveis abaixo do vídeo."
                        : "Essa pessoa ficará responsável por registrar discussões, decisões e encaminhamentos das pautas durante a reunião."}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm font-medium leading-6 text-white/68">
                    O responsável pelo registro ainda será definido pela organização da reunião.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:min-w-72">
                {meeting.recordKeeper?.assignedAt && (
                  <span className="rounded-full border border-white/12 bg-white/10 px-4 py-2 text-xs font-bold text-white/72">
                    Definido em {formatDateTime(meeting.recordKeeper.assignedAt)}
                  </span>
                )}

                {canManageRoom && consolidatedParticipants.length > 0 && (
                  <div className="rounded-2xl border border-white/12 bg-white/10 p-3">
                    <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/55">
                      Definir Responsável
                      <select
                        value={selectedRecordKeeperUserId}
                        onChange={(event) => setSelectedRecordKeeperUserId(event.target.value)}
                        className="h-11 rounded-2xl border border-white/12 bg-[#101711] px-3 text-sm font-semibold normal-case tracking-normal text-white outline-none transition focus:border-[#8ED08E]"
                      >
                        {consolidatedParticipants.map((participant) => (
                          <option key={participant.id} value={participant.id}>
                            {participant.name} — {participant.roles.join(" e ")}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() => void assignRecordKeeper()}
                      disabled={isAssigningRecordKeeper || !selectedRecordKeeperUserId}
                      className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-white px-4 text-sm font-bold text-[#17211B] transition hover:bg-[#EAF7EE] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isAssigningRecordKeeper ? "Definindo..." : "Definir Responsável"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-950/35 px-5 py-4 text-sm font-semibold text-red-100">
              {error}
            </div>
          )}

          {actionMessage && (
            <div className="mt-5 rounded-2xl border border-[#8ED08E]/30 bg-[#8ED08E]/12 px-5 py-4 text-sm font-semibold text-[#DDF6DF]">
              {actionMessage}
            </div>
          )}

          <section className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
            <div className="min-w-0 space-y-8">
              <div className="xl:sticky xl:top-6 rounded-[38px] border border-white/10 bg-[#0D130F]/80 p-4 shadow-[0_28px_90px_rgba(0,0,0,0.28)] sm:p-5">
              <div className="relative flex min-h-[520px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(23,33,27,0.95),rgba(13,19,15,0.98))]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(142,208,142,0.16),transparent_34%)]" />

                <div className="relative flex flex-1 items-center justify-center p-6 text-center">
                  <div className="max-w-2xl">
                    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[30px] border border-[#8ED08E]/25 bg-[#8ED08E]/10 shadow-[0_20px_60px_rgba(142,208,142,0.12)]">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-12 w-12 text-[#8ED08E]"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7Z"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                        <path
                          d="m16 10 4-2.5v9L16 14"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                      </svg>
                    </div>

                    <h2 className="mt-7 text-3xl font-bold tracking-tight text-white">
                      {isPresentialOnly
                        ? "Reunião presencial"
                        : isRoomOpen
                          ? "Sala aberta"
                          : "Aguardando abertura da sala"}
                    </h2>

                    <p className="mt-4 text-sm font-medium leading-7 text-white/62">
                      {isPresentialOnly
                        ? "Esta reunião foi cadastrada como presencial. Consulte o local e as informações da pauta ao lado."
                        : isRoomOpen
                          ? "A sala está aberta. O componente de câmera/vídeo será conectado aqui quando o provedor da plataforma for definido."
                          : "Quando a administradora abrir a sala, esta área será o ambiente principal da reunião por câmera dentro do EloGest."}
                    </p>

                    {canManageRoom && (
                      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                        {canOpenRoom && (
                          <button
                            type="button"
                            onClick={() => void updateRoom("abrir")}
                            disabled={isManagingRoom}
                            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#8ED08E] px-5 text-sm font-bold text-[#101711] shadow-[0_16px_38px_rgba(142,208,142,0.18)] transition hover:bg-[#BFE8C4] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isManagingRoom ? "Abrindo..." : "Iniciar Reunião"}
                          </button>
                        )}

                        {canCloseRoom && (
                          <button
                            type="button"
                            onClick={() => void updateRoom("encerrar")}
                            disabled={isManagingRoom}
                            className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/14 bg-white/10 px-5 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isManagingRoom ? "Encerrando..." : "Encerrar Reunião"}
                          </button>
                        )}
                      </div>
                    )}

                    {!canUseRoom && !isPresentialOnly && !canManageRoom && (
                      <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-5 py-4 text-sm font-semibold text-amber-100">
                        Seu perfil pode ver a reunião, mas a sala não está
                        disponível neste momento.
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative border-t border-white/10 bg-white/[0.04] p-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                        Status Da Sala
                      </p>
                      <p className="mt-1 font-bold text-white">
                        {roomStatus
                          ? roomStatusLabels[roomStatus] || roomStatus
                          : "Sala EloGest"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                        Aberta Em
                      </p>
                      <p className="mt-1 font-bold text-white">
                        {formatDateTime(
                          meeting.meetingRoom?.openedAt ||
                            meeting.room?.openedAt,
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                        Encerrada Em
                      </p>
                      <p className="mt-1 font-bold text-white">
                        {formatDateTime(
                          meeting.meetingRoom?.closedAt ||
                            meeting.room?.closedAt,
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              </div>

              <AgendaRegistrationPanel
                meetingId={meeting.id}
                items={meeting.agendaItems || []}
                canEdit={Boolean(meeting.isCurrentUserRecordKeeper) && presenceConfirmed}
                onSaved={() => loadMeeting({ silent: true })}
              />
            </div>

            <aside className="min-w-0 space-y-6">
              <div className="min-w-0 overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.07] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Informações Da Reunião
                  </h2>
                  <p className="mt-1 text-sm font-medium leading-6 text-white/55">
                    Dados principais para acompanhamento da reunião.
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  <InfoPill label="Formato" value={modeLabels[mode] || mode} />

                  <InfoPill
                    label="Local"
                    value={
                      meeting.location ||
                      meeting.meetingRoom?.location ||
                      "Não informado"
                    }
                  />

                  {meeting.meetingRoom?.accessInstructions && (
                    <div className="rounded-2xl border border-white/14 bg-white/10 p-4 text-white">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">
                        Instruções De Acesso
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-white/82">
                        {meeting.meetingRoom.accessInstructions}
                      </p>
                    </div>
                  )}

                  {meeting.myParticipant?.status && (
                    <div
                      className={[
                        "rounded-2xl border p-4 text-sm font-bold",
                        getParticipantStatusClass(meeting.myParticipant.status),
                      ].join(" ")}
                    >
                      Minha presença:{" "}
                      {participantStatusLabels[meeting.myParticipant.status] ||
                        meeting.myParticipant.status}
                    </div>
                  )}
                </div>
              </div>


              <div className="min-w-0 overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.07] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                <h2 className="text-lg font-bold text-white">Participantes</h2>
                <p className="mt-1 text-sm font-medium leading-6 text-white/55">
                  {participantsSummary.total} participante(s),{" "}
                  {participantsSummary.confirmed} confirmado(s),{" "}
                  {participantsSummary.pending} pendente(s),{" "}
                  {participantsSummary.declined} recusado(s).
                </p>

                {consolidatedParticipants.length > 0 ? (
                  <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                    {consolidatedParticipants.map((participant) => (
                      <div
                        key={participant.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">
                              {participant.name}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-white/45">
                              {participant.roles.join(" e ")}
                            </p>
                          </div>

                          <span
                            className={[
                              "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold",
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
                  <p className="mt-4 rounded-2xl border border-dashed border-white/12 bg-white/[0.04] p-4 text-sm font-semibold text-white/60">
                    Nenhum participante listado.
                  </p>
                )}
              </div>
            </aside>
          </section>
        </div>
      </main>
    </CouncilPortalShell>
  );
}


type AgendaRegistrationPanelProps = {
  meetingId: string;
  items: NonNullable<PortalCouncilMeetingRoom["agendaItems"]>;
  canEdit: boolean;
  onSaved: () => Promise<void> | void;
};

function buildAgendaItemForm(
  item: NonNullable<PortalCouncilMeetingRoom["agendaItems"]>[number],
): AgendaItemForm {
  return {
    status: item.status || "OPEN",
    discussionNotes: item.discussionNotes || "",
    decision: item.decision || "",
    responsibleName: item.responsibleName || "",
    dueDate: formatInputDate(item.dueDate),
  };
}

function buildAgendaForms(
  items: NonNullable<PortalCouncilMeetingRoom["agendaItems"]>,
) {
  return items.reduce<Record<string, AgendaItemForm>>((acc, item) => {
    acc[item.id] = buildAgendaItemForm(item);
    return acc;
  }, {});
}

function AgendaRegistrationPanel({
  meetingId,
  items,
  canEdit,
  onSaved,
}: AgendaRegistrationPanelProps) {
  const [forms, setForms] = useState<Record<string, AgendaItemForm>>(() =>
    buildAgendaForms(items),
  );
  const [expandedItemId, setExpandedItemId] = useState<string | null>(
    items[0]?.id ?? null,
  );
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [successItemId, setSuccessItemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setForms(buildAgendaForms(items));
    setExpandedItemId((current) => {
      if (current && items.some((item) => item.id === current)) {
        return current;
      }

      return items[0]?.id ?? null;
    });
  }, [items]);

  function updateAgendaForm(
    itemId: string,
    key: keyof AgendaItemForm,
    value: string,
  ) {
    setForms((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || {
          status: "PENDING",
          discussionNotes: "",
          decision: "",
          responsibleName: "",
          dueDate: "",
        }),
        [key]: value,
      },
    }));
  }

  async function saveAgendaItem(itemId: string) {
    const form = forms[itemId];

    if (!form || !canEdit) {
      return;
    }

    setSavingItemId(itemId);
    setSuccessItemId(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/portal/reunioes-conselho/${meetingId}/pautas/${itemId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: form.status || "PENDING",
            discussionNotes: form.discussionNotes.trim() || null,
            decision: form.decision.trim() || null,
            responsibleName: form.responsibleName.trim() || null,
            dueDate: form.dueDate || null,
          }),
        },
      );

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar o registro da pauta.");
      }

      setSuccessItemId(itemId);
      await onSaved();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível salvar o registro da pauta.";

      setErrorMessage(message);
    } finally {
      setSavingItemId(null);
    }
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.07] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Registro Por Pauta</h2>
          <p className="mt-1 text-sm font-medium leading-6 text-white/55">
            Expanda apenas a pauta em discussão para registrar debate, decisão,
            responsável e prazo sem criar uma rolagem extensa.
          </p>
        </div>

        <span
          className={[
            "inline-flex w-fit rounded-full border px-3 py-1 text-xs font-bold",
            canEdit
              ? "border-[#8ED08E]/30 bg-[#8ED08E]/12 text-[#DDF6DF]"
              : "border-white/10 bg-white/10 text-white/58",
          ].join(" ")}
        >
          {canEdit ? "Você pode registrar" : "Somente leitura"}
        </span>
      </div>

      {errorMessage && (
        <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-950/35 px-4 py-3 text-sm font-semibold text-red-100">
          {errorMessage}
        </div>
      )}

      {items.length > 0 ? (
        <div className="mt-5 space-y-3">
          {items.map((item) => {
            const form = forms[item.id] || buildAgendaItemForm(item);
            const isSaving = savingItemId === item.id;
            const wasSaved = successItemId === item.id;
            const isExpanded = expandedItemId === item.id;
            const hasRegistration = Boolean(
              form.discussionNotes || form.decision || form.responsibleName || form.dueDate,
            );

            return (
              <article
                key={item.id}
                className={[
                  "min-w-0 overflow-hidden rounded-3xl border transition",
                  isExpanded
                    ? "border-[#8ED08E]/30 bg-white/[0.08] shadow-[0_20px_55px_rgba(0,0,0,0.18)]"
                    : "border-white/10 bg-white/[0.045] hover:border-white/18 hover:bg-white/[0.065]",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedItemId((current) =>
                      current === item.id ? null : item.id,
                    )
                  }
                  className="flex w-full min-w-0 items-start gap-4 px-4 py-4 text-left sm:px-5"
                  aria-expanded={isExpanded}
                >
                  <span
                    className={[
                      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold transition",
                      isExpanded
                        ? "bg-[#8ED08E] text-[#17211B]"
                        : "bg-[#8ED08E]/14 text-[#8ED08E]",
                    ].join(" ")}
                  >
                    {item.order}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        {item.title}
                      </span>

                      <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/65">
                        {agendaStatusLabels[form.status] || form.status || "Pendente"}
                      </span>

                      {hasRegistration && (
                        <span className="rounded-full border border-[#8ED08E]/20 bg-[#8ED08E]/10 px-2 py-0.5 text-[10px] font-bold text-[#DDF6DF]">
                          Com registro
                        </span>
                      )}
                    </span>

                    {item.description && (
                      <span className="mt-2 line-clamp-2 block text-xs font-medium leading-5 text-white/58">
                        {item.description}
                      </span>
                    )}
                  </span>

                  <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white/70 transition">
                    <svg
                      viewBox="0 0 24 24"
                      className={[
                        "h-4 w-4 transition-transform",
                        isExpanded ? "rotate-180" : "",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      <path
                        d="m6 9 6 6 6-6"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </svg>
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/10 px-4 pb-5 pt-4 sm:px-5">
                    <div className="grid gap-4">
                      <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/45">
                        Discussão Registrada
                        <textarea
                          value={form.discussionNotes}
                          onChange={(event) =>
                            updateAgendaForm(
                              item.id,
                              "discussionNotes",
                              event.target.value,
                            )
                          }
                          disabled={!canEdit || isSaving}
                          rows={5}
                          placeholder="Registre os principais pontos debatidos nesta pauta."
                          className="min-h-36 w-full resize-y rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none transition placeholder:text-white/28 focus:border-[#8ED08E]/50 focus:ring-4 focus:ring-[#8ED08E]/10 disabled:cursor-not-allowed disabled:opacity-70"
                        />
                      </label>

                      <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/45">
                        Decisão Tomada
                        <textarea
                          value={form.decision}
                          onChange={(event) =>
                            updateAgendaForm(item.id, "decision", event.target.value)
                          }
                          disabled={!canEdit || isSaving}
                          rows={4}
                          placeholder="Descreva a decisão ou encaminhamento aprovado."
                          className="min-h-32 w-full resize-y rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-semibold normal-case tracking-normal text-white outline-none transition placeholder:text-white/28 focus:border-[#8ED08E]/50 focus:ring-4 focus:ring-[#8ED08E]/10 disabled:cursor-not-allowed disabled:opacity-70"
                        />
                      </label>

                      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/45">
                          Responsável Pela Ação
                          <input
                            type="text"
                            value={form.responsibleName}
                            onChange={(event) =>
                              updateAgendaForm(
                                item.id,
                                "responsibleName",
                                event.target.value,
                              )
                            }
                            disabled={!canEdit || isSaving}
                            placeholder="Ex.: Síndico, administradora, conselheiro ou fornecedor"
                            className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-white/[0.08] px-4 text-sm font-semibold normal-case tracking-normal text-white outline-none transition placeholder:text-white/28 focus:border-[#8ED08E]/50 focus:ring-4 focus:ring-[#8ED08E]/10 disabled:cursor-not-allowed disabled:opacity-70"
                          />
                        </label>

                        <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/45">
                          Prazo
                          <input
                            type="date"
                            value={form.dueDate}
                            onChange={(event) =>
                              updateAgendaForm(item.id, "dueDate", event.target.value)
                            }
                            disabled={!canEdit || isSaving}
                            className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-white/[0.08] px-4 text-sm font-semibold normal-case tracking-normal text-white outline-none transition focus:border-[#8ED08E]/50 focus:ring-4 focus:ring-[#8ED08E]/10 disabled:cursor-not-allowed disabled:opacity-70"
                          />
                        </label>
                      </div>

                      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(220px,280px)_minmax(180px,220px)] sm:items-end">
                        <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/45">
                          Status Da Pauta
                          <select
                            value={form.status || "PENDING"}
                            onChange={(event) =>
                              updateAgendaForm(item.id, "status", event.target.value)
                            }
                            disabled={!canEdit || isSaving}
                            className="h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-[#1B261D] px-4 text-sm font-semibold normal-case tracking-normal text-white outline-none transition focus:border-[#8ED08E]/50 focus:ring-4 focus:ring-[#8ED08E]/10 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {agendaStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => void saveAgendaItem(item.id)}
                            disabled={isSaving}
                            className="h-12 w-full rounded-2xl bg-[#8ED08E] px-5 text-sm font-bold text-[#17211B] transition hover:bg-[#A6E0A6] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSaving ? "Salvando..." : "Salvar Pauta"}
                          </button>
                        ) : null}
                      </div>

                      {wasSaved && (
                        <p className="rounded-2xl border border-[#8ED08E]/25 bg-[#8ED08E]/10 px-4 py-3 text-xs font-bold text-[#DDF6DF]">
                          Registro da pauta salvo com sucesso.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-white/12 bg-white/[0.04] p-4 text-sm font-semibold text-white/60">
          Nenhum item de pauta cadastrado.
        </p>
      )}
    </div>
  );
}
