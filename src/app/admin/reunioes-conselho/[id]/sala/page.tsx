"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import AdminShell from "@/components/AdminShell";

/* =========================================================
   ADMIN - SALA DE REUNIÃO ELOGEST

   Arquivo:
   src/app/admin/reunioes-conselho/[id]/sala/page.tsx

   ETAPA 49 — REUNIÕES DE CONSELHO

   Objetivo:
   - Criar a experiência visual da Sala De Reunião EloGest.
   - Manter a reunião dentro da plataforma, mesmo que o provedor
     de câmera/vídeo seja plugado posteriormente.
   - Preparar a mesma base visual/funcional para Assembleias futuras.

   Importante:
   - Esta tela não implementa ainda um provedor de vídeo real.
   - O espaço central foi preparado para receber iframe/SDK futuro.
   - Abrir/encerrar sala usa APIs próprias da sala, atualizando
     MeetingRoom, CouncilMeeting e respectivos históricos.
   - A proteção real permanece na API.
   ========================================================= */

type CouncilMeetingStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED"
  | "ARCHIVED";

type MeetingMode = "ONLINE" | "PRESENTIAL" | "HYBRID";

type MeetingRoomStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "CANCELED"
  | "ARCHIVED";

type UserSummary = {
  id: string;
  name: string | null;
  email: string;
};

type UserAccessSummary = {
  id: string;
  role: string;
  label: string | null;
};

type CouncilParticipant = {
  id: string;
  role: string;
  status: string;
  confirmedAt: string | null;
  attendedAt: string | null;
  notes: string | null;
  user: UserSummary | null;
  userAccess: UserAccessSummary | null;
};

type RoomParticipant = {
  id: string;
  role: string;
  status: string;
  joinedAt: string | null;
  leftAt: string | null;
  user: UserSummary | null;
  userAccess: UserAccessSummary | null;
};

type AgendaItem = {
  id: string;
  order: number;
  title: string;
  description: string | null;
  status: string;
  decision: string | null;
  responsibleUserId: string | null;
  dueDate: string | null;
};

type LogItem = {
  id: string;
  action: string;
  message: string | null;
  metadata: unknown;
  createdAt: string;
  user: UserSummary | null;
};

type MeetingRoom = {
  id: string;
  type: string;
  mode: MeetingMode;
  status: MeetingRoomStatus;
  provider: string;
  providerMeetingId: string | null;
  providerJoinUrl: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  openedAt: string | null;
  closedAt: string | null;
  canceledAt: string | null;
  location: string | null;
  accessInstructions: string | null;
  participants: RoomParticipant[];
  logs: LogItem[];
};

type CouncilMeeting = {
  id: string;
  title: string;
  description: string | null;
  status: CouncilMeetingStatus;
  mode: MeetingMode;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  location: string | null;
  summary: string | null;
  decisions: string | null;
  nextSteps: string | null;
  internalNotes: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
  condominium: {
    id: string;
    name: string;
  } | null;
  meetingRoom: MeetingRoom | null;
  recordKeeperUserId: string | null;
  recordKeeperParticipantId: string | null;
  recordKeeperAssignedAt: string | null;
  recordKeeperUser: UserSummary | null;
  recordKeeperParticipant: CouncilParticipant | null;
  participants: CouncilParticipant[];
  agendaItems: AgendaItem[];
  logs: LogItem[];
  createdByUser: UserSummary | null;
};

type MeetingResponse = {
  meeting?: CouncilMeeting;
  message?: string;
  error?: string;
};

const STATUS_LABELS: Record<CouncilMeetingStatus, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  IN_PROGRESS: "Em Andamento",
  COMPLETED: "Realizada",
  CANCELED: "Cancelada",
  ARCHIVED: "Arquivada",
};

const MODE_LABELS: Record<MeetingMode, string> = {
  ONLINE: "Online",
  PRESENTIAL: "Presencial",
  HYBRID: "Híbrida",
};

const ROOM_STATUS_LABELS: Record<MeetingRoomStatus, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendada",
  OPEN: "Aberta",
  CLOSED: "Encerrada",
  CANCELED: "Cancelada",
  ARCHIVED: "Arquivada",
};

function getStatusLabel(status: CouncilMeetingStatus) {
  return STATUS_LABELS[status] ?? status;
}

function getModeLabel(mode: MeetingMode) {
  return MODE_LABELS[mode] ?? mode;
}

function getRoomStatusLabel(status?: MeetingRoomStatus | null) {
  if (!status) {
    return "Sala não criada";
  }

  return ROOM_STATUS_LABELS[status] ?? status;
}

function getDisplayName(user: UserSummary | null) {
  if (!user) {
    return "Usuário não identificado";
  }

  return user.name || user.email;
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

function getErrorMessage(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value) {
    const errorValue = (value as { error?: unknown }).error;

    if (typeof errorValue === "string" && errorValue.trim().length > 0) {
      return errorValue;
    }
  }

  return fallback;
}

function getProviderLabel(provider?: string | null) {
  const labels: Record<string, string> = {
    INTERNAL_PENDING: "EloGest — Provedor Pendente",
    ELOGEST_INTERNAL: "EloGest Interno",
    GOOGLE_MEET: "Google Meet",
    ZOOM: "Zoom",
    TEAMS: "Microsoft Teams",
    JITSI: "Jitsi",
    DAILY: "Daily",
    WHEREBY: "Whereby",
    OTHER: "Outro Provedor",
  };

  if (!provider) {
    return "EloGest — Provedor Pendente";
  }

  return labels[provider] ?? provider;
}

function getRoleLabel(role?: string | null) {
  const labels: Record<string, string> = {
    ADMINISTRADORA: "Administradora",
    SINDICO: "Síndico",
    CONSELHEIRO: "Conselheiro",
    MORADOR: "Morador",
    PROPRIETARIO: "Proprietário",
  };

  return role ? labels[role] ?? role : "Participante";
}

function getParticipantRolePriority(role?: string | null) {
  if (role === "SINDICO") return 1;
  if (role === "CONSELHEIRO") return 2;
  if (role === "ADMINISTRADORA") return 3;

  return 99;
}

type ConsolidatedCouncilParticipant = CouncilParticipant & {
  roles: string[];
  roleLabels: string[];
  participantIds: string[];
};

function consolidateCouncilParticipants(
  participants: CouncilParticipant[],
): ConsolidatedCouncilParticipant[] {
  const byUser = new Map<string, ConsolidatedCouncilParticipant>();

  for (const participant of participants) {
    const key = participant.user?.id || participant.id;
    const role = participant.role || participant.userAccess?.role || "PARTICIPANTE";
    const current = byUser.get(key);

    if (!current) {
      byUser.set(key, {
        ...participant,
        roles: [role],
        roleLabels: [getRoleLabel(role)],
        participantIds: [participant.id],
      });
      continue;
    }

    if (!current.roles.includes(role)) {
      current.roles.push(role);
      current.roleLabels.push(getRoleLabel(role));
    }

    if (!current.participantIds.includes(participant.id)) {
      current.participantIds.push(participant.id);
    }

    if (
      getParticipantRolePriority(role) <
      getParticipantRolePriority(current.role)
    ) {
      current.id = participant.id;
      current.role = participant.role;
      current.status = participant.status;
      current.confirmedAt = participant.confirmedAt;
      current.attendedAt = participant.attendedAt;
      current.notes = participant.notes;
      current.userAccess = participant.userAccess;
    }
  }

  return Array.from(byUser.values()).sort((a, b) =>
    getDisplayName(a.user).localeCompare(getDisplayName(b.user), "pt-BR"),
  );
}


export default function AdminCouncilMeetingRoomPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params?.id;

  const [meeting, setMeeting] = useState<CouncilMeeting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [recordKeeperParticipantId, setRecordKeeperParticipantId] = useState("");
  const [isAssigningRecordKeeper, setIsAssigningRecordKeeper] = useState(false);
  const [activePanel, setActivePanel] = useState<"agenda" | "participants" | "history">("agenda");

  const room = meeting?.meetingRoom ?? null;
  const isRoomOpen = meeting?.status === "IN_PROGRESS" || room?.status === "OPEN";
  const isRoomClosed = meeting?.status === "COMPLETED" || room?.status === "CLOSED";
  const isRoomCanceled = meeting?.status === "CANCELED" || room?.status === "CANCELED";

  const canOpenRoom = meeting
    ? meeting.status === "DRAFT" || meeting.status === "SCHEDULED"
    : false;

  const canCloseRoom = meeting ? meeting.status === "IN_PROGRESS" : false;

  const consolidatedParticipants = useMemo(() => {
    return consolidateCouncilParticipants(meeting?.participants ?? []);
  }, [meeting?.participants]);

  const currentRecordKeeperName = meeting?.recordKeeperUser
    ? getDisplayName(meeting.recordKeeperUser)
    : meeting?.recordKeeperParticipant?.user
      ? getDisplayName(meeting.recordKeeperParticipant.user)
      : null;

  const canAssignRecordKeeper = meeting
    ? meeting.status === "DRAFT" ||
      meeting.status === "SCHEDULED" ||
      meeting.status === "IN_PROGRESS"
    : false;

  const roomStatusLabel = useMemo(() => {
    return getRoomStatusLabel(room?.status);
  }, [room?.status]);

  const fetchMeeting = useCallback(async () => {
    if (!meetingId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/reunioes-conselho/${meetingId}`, {
        cache: "no-store",
      });

      const data = (await response.json()) as MeetingResponse;

      if (!response.ok || !data.meeting) {
        throw new Error(
          getErrorMessage(data, "Não foi possível carregar a Sala De Reunião EloGest."),
        );
      }

      setMeeting(data.meeting);
      setRecordKeeperParticipantId(
        data.meeting.recordKeeperParticipantId ||
          data.meeting.recordKeeperParticipant?.id ||
          "",
      );
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível carregar a Sala De Reunião EloGest.";

      setMeeting(null);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void fetchMeeting();
  }, [fetchMeeting]);

  async function updateRoom(action: "abrir" | "encerrar") {
    if (!meetingId || !meeting) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        `/api/admin/reunioes-conselho/${meetingId}/sala/${action}`,
        {
          method: "POST",
        },
      );

      const data = (await response.json()) as MeetingResponse;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Não foi possível atualizar a Sala De Reunião EloGest."),
        );
      }

      setSuccessMessage(
        data.message ??
          (action === "abrir"
            ? "Sala De Reunião EloGest aberta com sucesso."
            : "Sala De Reunião EloGest encerrada com sucesso."),
      );

      if (data.meeting) {
        setMeeting(data.meeting);
      } else {
        await fetchMeeting();
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível atualizar a Sala De Reunião EloGest.";

      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function assignRecordKeeper() {
    if (!meetingId || !meeting) {
      return;
    }

    if (!recordKeeperParticipantId) {
      setError("Selecione o responsável pelo registro da reunião.");
      return;
    }

    setIsAssigningRecordKeeper(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/reunioes-conselho/${meetingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "SET_RECORD_KEEPER",
          recordKeeperParticipantId,
        }),
      });

      const data = (await response.json()) as MeetingResponse;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            data,
            "Não foi possível definir o responsável pelo registro.",
          ),
        );
      }

      setSuccessMessage(
        data.message || "Responsável pelo registro definido com sucesso.",
      );

      if (data.meeting) {
        setMeeting(data.meeting);
        setRecordKeeperParticipantId(
          data.meeting.recordKeeperParticipantId ||
            data.meeting.recordKeeperParticipant?.id ||
            "",
        );
      } else {
        await fetchMeeting();
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível definir o responsável pelo registro.";

      setError(message);
    } finally {
      setIsAssigningRecordKeeper(false);
    }
  }


  if (isLoading) {
    return (
      <RoomShell>
        <div className="rounded-3xl border border-[#DDEBDD] bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-[#617066]">
            Carregando Sala De Reunião EloGest...
          </p>
        </div>
      </RoomShell>
    );
  }

  if (!meeting) {
    return (
      <RoomShell>
        <div className="rounded-3xl border border-[#F0C7C7] bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-[#9A2D2D]">
            {error ?? "Sala De Reunião EloGest não encontrada."}
          </p>

          <Link
            href="/admin/reunioes-conselho"
            className="mt-5 inline-flex rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1F5E34]"
          >
            Voltar Para Reuniões
          </Link>
        </div>
      </RoomShell>
    );
  }

  return (
    <RoomShell>
      <section className="overflow-hidden rounded-[32px] border border-[#DDEBDD] bg-white shadow-sm">
        <div className="border-b border-[#E5EFE6] bg-gradient-to-br from-[#17211B] via-[#1E3323] to-[#256D3C] p-6 text-white">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <Link
                href={`/admin/reunioes-conselho/${meeting.id}`}
                className="text-sm font-semibold text-[#BFE6C8] transition hover:text-white"
              >
                ← Voltar Para Detalhe Da Reunião
              </Link>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <StatusBadge>{getStatusLabel(meeting.status)}</StatusBadge>
                <StatusBadge>{getModeLabel(meeting.mode)}</StatusBadge>
                <StatusBadge>Sala {roomStatusLabel}</StatusBadge>
              </div>

              <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                Sala Da Reunião De Conselho
              </h1>

              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/75">
                {meeting.title} — {meeting.condominium?.name ?? "Condomínio não informado"}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[360px]">
              <HeaderInfo label="Início Previsto" value={formatDateTime(meeting.scheduledStartAt)} />
              <HeaderInfo label="Término Previsto" value={formatDateTime(meeting.scheduledEndAt)} />
            </div>
          </div>
        </div>

        {successMessage ? (
          <div className="border-b border-[#BFE6C8] bg-[#F0FBF2] px-6 py-4 text-sm font-medium text-[#256D3C]">
            {successMessage}
          </div>
        ) : null}

        {error ? (
          <div className="border-b border-[#F0C7C7] bg-[#FFF6F6] px-6 py-4 text-sm font-medium text-[#9A2D2D]">
            {error}
          </div>
        ) : null}

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="border-b border-[#E5EFE6] p-5 xl:border-b-0 xl:border-r">
            <VideoStage
              meeting={meeting}
              isRoomOpen={isRoomOpen}
              isRoomClosed={isRoomClosed}
              isRoomCanceled={isRoomCanceled}
            />

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <RoomMetric label="Provedor" value={getProviderLabel(room?.provider)} />
              <RoomMetric label="Aberta Em" value={formatDateTime(room?.openedAt ?? null)} />
              <RoomMetric label="Encerrada Em" value={formatDateTime(room?.closedAt ?? null)} />
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-[#DDEBDD] bg-[#F8FCF9] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-[#17211B]">Controle Administrativo Da Sala</p>
                <p className="mt-1 text-sm leading-6 text-[#617066]">
                  Use estes comandos para abrir ou encerrar a sala dentro do fluxo da reunião.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {canOpenRoom ? (
                  <button
                    type="button"
                    onClick={() => void updateRoom("abrir")}
                    disabled={isSaving}
                    className="rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1F5E34] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Abrindo..." : "Abrir Sala"}
                  </button>
                ) : null}

                {canCloseRoom ? (
                  <button
                    type="button"
                    onClick={() => void updateRoom("encerrar")}
                    disabled={isSaving}
                    className="rounded-2xl bg-[#17211B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243427] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Encerrando..." : "Encerrar Sala"}
                  </button>
                ) : null}

                {!canOpenRoom && !canCloseRoom ? (
                  <span className="inline-flex items-center justify-center rounded-2xl border border-[#DDEBDD] bg-white px-5 py-3 text-sm font-semibold text-[#617066]">
                    Sem ação disponível
                  </span>
                ) : null}
              </div>
            </div>

            <RecordKeeperPanel
              participants={consolidatedParticipants}
              currentRecordKeeperName={currentRecordKeeperName}
              assignedAt={meeting.recordKeeperAssignedAt}
              selectedParticipantId={recordKeeperParticipantId}
              onChange={setRecordKeeperParticipantId}
              onSave={() => void assignRecordKeeper()}
              disabled={!canAssignRecordKeeper || isAssigningRecordKeeper}
              isSaving={isAssigningRecordKeeper}
            />
          </section>

          <aside className="bg-[#FBFDFB]">
            <div className="border-b border-[#E5EFE6] p-4">
              <div className="flex flex-wrap gap-2">
                <PanelButton active={activePanel === "agenda"} onClick={() => setActivePanel("agenda")}>
                  Pauta
                </PanelButton>
                <PanelButton active={activePanel === "participants"} onClick={() => setActivePanel("participants")}>
                  Participantes
                </PanelButton>
                <PanelButton active={activePanel === "history"} onClick={() => setActivePanel("history")}>
                  Histórico
                </PanelButton>
              </div>
            </div>

            <div className="max-h-[760px] overflow-y-auto p-5">
              {activePanel === "agenda" ? <AgendaPanel items={meeting.agendaItems} /> : null}
              {activePanel === "participants" ? (
                <ParticipantsPanel
                  participants={meeting.participants}
                  roomParticipants={room?.participants ?? []}
                />
              ) : null}
              {activePanel === "history" ? (
                <HistoryPanel meetingLogs={meeting.logs} roomLogs={room?.logs ?? []} />
              ) : null}
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <InfoPanel title="Instruções De Acesso">
          <p className="whitespace-pre-line text-sm leading-6 text-[#617066]">
            {room?.accessInstructions ||
              "A administradora poderá registrar orientações de acesso, conduta e participação para esta sala."}
          </p>
        </InfoPanel>

        <InfoPanel title="Local Presencial">
          <p className="text-sm leading-6 text-[#617066]">
            {meeting.location || room?.location || "Nenhum local presencial informado."}
          </p>
        </InfoPanel>

        <InfoPanel title="Base Para Assembleias">
          <p className="text-sm leading-6 text-[#617066]">
            Esta sala foi estruturada como base central e poderá ser reutilizada nas futuras Assembleias do EloGest.
          </p>
        </InfoPanel>
      </section>
    </RoomShell>
  );
}

function RoomShell({ children }: { children: ReactNode }) {
  return (
    <AdminShell current="reunioes-conselho">
      <div className="min-h-screen bg-[linear-gradient(135deg,#F6F8F7_0%,#FFFFFF_44%,#EAF7EE_120%)] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
      </div>
    </AdminShell>
  );
}

function StatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/12 px-3 py-1 text-xs font-bold text-white shadow-sm backdrop-blur">
      {children}
    </span>
  );
}

function HeaderInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">{label}</p>
      <p className="mt-2 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function VideoStage({
  meeting,
  isRoomOpen,
  isRoomClosed,
  isRoomCanceled,
}: {
  meeting: CouncilMeeting;
  isRoomOpen: boolean;
  isRoomClosed: boolean;
  isRoomCanceled: boolean;
}) {
  const stageMessage = (() => {
    if (isRoomCanceled) {
      return "Esta reunião foi cancelada. A sala permanece preservada apenas para consulta de histórico.";
    }

    if (isRoomClosed) {
      return "Esta sala já foi encerrada. O histórico, pauta e participantes permanecem disponíveis para conferência.";
    }

    if (isRoomOpen) {
      return "Sala aberta. O espaço abaixo receberá o componente de câmera/vídeo quando o provedor for definido.";
    }

    return "A sala será liberada pela administradora no horário da reunião.";
  })();

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-[#17211B]/10 bg-[#111A14] text-white shadow-[0_24px_80px_rgba(23,33,27,0.18)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.32),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(37,109,60,0.25),transparent_34%)]" />

      <div className="relative flex min-h-[460px] flex-col items-center justify-center p-6 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/12 bg-white/10 shadow-2xl backdrop-blur">
          <VideoIcon />
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8ED08E]">
          Sala De Reunião EloGest
        </p>

        <h2 className="mt-3 max-w-3xl text-2xl font-bold tracking-tight sm:text-3xl">
          {meeting.title}
        </h2>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">
          {stageMessage}
        </p>

        <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
          <StageChip label="Condomínio" value={meeting.condominium?.name ?? "Não informado"} />
          <StageChip label="Formato" value={getModeLabel(meeting.mode)} />
          <StageChip label="Status" value={getStatusLabel(meeting.status)} />
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-left backdrop-blur">
          <p className="text-sm font-semibold text-white">Espaço reservado para vídeo</p>
          <p className="mt-1 text-xs leading-5 text-white/55">
            Futuramente este bloco poderá receber Jitsi, Daily, Whereby, Google Meet, Zoom, Teams ou outro provedor homologado.
          </p>
        </div>
      </div>
    </div>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10 text-[#8ED08E]" aria-hidden="true">
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h7A2.5 2.5 0 0 1 16 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 15.5z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M16 10.5 20 8v8l-4-2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function StageChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 text-left backdrop-blur">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-2 truncate text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function RoomMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E1EBE3] bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7A877F]">{label}</p>
      <p className="mt-2 text-sm font-bold text-[#17211B]">{value}</p>
    </div>
  );
}

function PanelButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-[#256D3C] text-white shadow-sm"
          : "border border-[#DDEBDD] bg-white text-[#4B5B4F] hover:bg-[#EAF7EE] hover:text-[#256D3C]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}


function RecordKeeperPanel({
  participants,
  currentRecordKeeperName,
  assignedAt,
  selectedParticipantId,
  onChange,
  onSave,
  disabled,
  isSaving,
}: {
  participants: ConsolidatedCouncilParticipant[];
  currentRecordKeeperName: string | null;
  assignedAt?: string | null;
  selectedParticipantId: string;
  onChange: (value: string) => void;
  onSave: () => void;
  disabled: boolean;
  isSaving: boolean;
}) {
  return (
    <div className="mt-5 rounded-3xl border border-[#DDEBDD] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold text-[#17211B]">
            Responsável Pelo Registro
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#617066]">
            Defina quem ficará responsável por registrar discussões, decisões e
            encaminhamentos durante a reunião. Esta escolha ficará no histórico
            da reunião.
          </p>

          {currentRecordKeeperName ? (
            <div className="mt-3 rounded-2xl border border-[#BFE6C8] bg-[#F0FBF2] px-4 py-3 text-sm text-[#256D3C]">
              <strong>{currentRecordKeeperName}</strong> está responsável pelo
              registro
              {assignedAt ? ` desde ${formatDateTime(assignedAt)}.` : "."}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Nenhum responsável pelo registro foi definido ainda.
            </div>
          )}
        </div>

        <div className="grid w-full gap-2 lg:max-w-md">
          <label className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">
            Participante responsável
          </label>

          <select
            value={selectedParticipantId}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled || participants.length === 0}
            className="h-12 rounded-2xl border border-[#DDEBDD] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:cursor-not-allowed disabled:bg-[#F4F7F5] disabled:text-[#7A877F]"
          >
            <option value="">Selecione um participante</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {getDisplayName(participant.user)} —{" "}
                {participant.roleLabels.join(" e ")}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onSave}
            disabled={disabled || !selectedParticipantId}
            className="mt-2 rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1F5E34] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Salvando..." : "Definir Responsável"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgendaPanel({ items }: { items: AgendaItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nenhuma pauta cadastrada"
        description="A pauta poderá ser organizada no detalhe da reunião."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.id} className="rounded-3xl border border-[#E1EBE3] bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#EAF7EE] text-sm font-bold text-[#256D3C]">
              {item.order}
            </span>

            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-[#17211B]">{item.title}</h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#617066]">
                {item.description || "Sem descrição detalhada."}
              </p>

              {item.decision ? (
                <div className="mt-3 rounded-2xl border border-[#BFE6C8] bg-[#F8FCF9] p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Decisão</p>
                  <p className="mt-2 text-sm leading-6 text-[#344338]">{item.decision}</p>
                </div>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ParticipantsPanel({
  participants,
  roomParticipants,
}: {
  participants: CouncilParticipant[];
  roomParticipants: RoomParticipant[];
}) {
  if (participants.length === 0 && roomParticipants.length === 0) {
    return (
      <EmptyState
        title="Nenhum participante vinculado"
        description="Os participantes serão exibidos aqui quando forem adicionados à reunião."
      />
    );
  }

  if (participants.length > 0) {
    const consolidatedParticipants = consolidateCouncilParticipants(participants);

    return (
      <div className="space-y-3">
        {consolidatedParticipants.map((participant) => (
          <article
            key={participant.id}
            className="rounded-3xl border border-[#E1EBE3] bg-white p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF7EE] text-sm font-bold text-[#256D3C]">
                {getDisplayName(participant.user).slice(0, 1).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#17211B]">
                  {getDisplayName(participant.user)}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#617066]">
                  {participant.roleLabels.join(" e ")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <SmallBadge>{participant.status}</SmallBadge>
                  {participant.confirmedAt ? (
                    <SmallBadge>
                      Confirmado Em {formatDateTime(participant.confirmedAt)}
                    </SmallBadge>
                  ) : null}
                  {participant.attendedAt ? (
                    <SmallBadge>
                      Participou Em {formatDateTime(participant.attendedAt)}
                    </SmallBadge>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {roomParticipants.map((participant) => (
        <article
          key={participant.id}
          className="rounded-3xl border border-[#E1EBE3] bg-white p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF7EE] text-sm font-bold text-[#256D3C]">
              {getDisplayName(participant.user).slice(0, 1).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[#17211B]">
                {getDisplayName(participant.user)}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#617066]">
                {participant.userAccess?.label || getRoleLabel(participant.role)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <SmallBadge>{participant.status}</SmallBadge>
                {participant.joinedAt ? (
                  <SmallBadge>
                    Entrou Em {formatDateTime(participant.joinedAt)}
                  </SmallBadge>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function HistoryPanel({
  meetingLogs,
  roomLogs,
}: {
  meetingLogs: LogItem[];
  roomLogs: LogItem[];
}) {
  const logs = [...meetingLogs, ...roomLogs].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (logs.length === 0) {
    return (
      <EmptyState
        title="Histórico ainda vazio"
        description="As ações da reunião e da sala serão registradas aqui."
      />
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <article key={log.id} className="rounded-3xl border border-[#E1EBE3] bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#17211B]">{log.message || log.action}</p>
              <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                {getDisplayName(log.user)}
              </p>
            </div>
            <span className="shrink-0 text-right text-xs font-semibold text-[#7A877F]">
              {formatDateTime(log.createdAt)}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-3xl border border-[#DDEBDD] bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-[#17211B]">{title}</h2>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function SmallBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-[#F0F4F1] px-3 py-1 text-xs font-bold text-[#4B5B4F]">
      {children}
    </span>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[#C9D8CD] bg-white p-6 text-center">
      <p className="text-sm font-bold text-[#17211B]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#617066]">{description}</p>
    </div>
  );
}
