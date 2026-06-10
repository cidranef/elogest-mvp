"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";

/* =========================================================
   ADMIN - DETALHE DA REUNIÃO DE CONSELHO

   Arquivo:
   src/app/admin/reunioes-conselho/[id]/page.tsx

   ETAPA 49 — REUNIÕES DE CONSELHO

   Objetivo:
   - Exibir o detalhe operacional da reunião de conselho.
   - Editar dados básicos enquanto a reunião estiver aberta para edição.
   - Controlar status: agendar, iniciar, concluir e cancelar.
   - Exibir Sala De Reunião EloGest, participantes, pautas e histórico.

   Segurança:
   - A proteção real permanece nas APIs.
   - Esta página consome /api/admin/reunioes-conselho/[id].
   - Reuniões concluídas, canceladas ou arquivadas não recebem edição comum.
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
  discussionNotes?: string | null;
  decision: string | null;
  responsibleUserId: string | null;
  responsibleName?: string | null;
  dueDate: string | null;
};

type AttachmentItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  description: string | null;
  createdAt: string;
  uploadedByUser: UserSummary | null;
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
  participants: CouncilParticipant[];
  agendaItems: AgendaItem[];
  attachments: AttachmentItem[];
  logs: LogItem[];
  createdByUser: UserSummary | null;
};

type MeetingResponse = {
  meeting?: CouncilMeeting;
  message?: string;
  error?: string;
};

type UpdateMeetingForm = {
  title: string;
  description: string;
  condominiumId: string;
  status: CouncilMeetingStatus;
  mode: MeetingMode;
  scheduledStartAt: string;
  scheduledEndAt: string;
  location: string;
  accessInstructions: string;
  summary: string;
  decisions: string;
  nextSteps: string;
  internalNotes: string;
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

const AGENDA_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  IN_DISCUSSION: "Em Discussão",
  DECIDED: "Decidida",
  IN_EXECUTION: "Em Execução",
  RESOLVED: "Resolvida",
  POSTPONED: "Adiada",
  CANCELED: "Cancelada",
};

function getStatusLabel(status: CouncilMeetingStatus) {
  return STATUS_LABELS[status] ?? status;
}

function getModeLabel(mode: MeetingMode) {
  return MODE_LABELS[mode] ?? mode;
}

function getRoomStatusLabel(status: MeetingRoomStatus) {
  return ROOM_STATUS_LABELS[status] ?? status;
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

function formatDateOnly(value: string | null) {
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

function getAgendaStatusLabel(status?: string | null) {
  if (!status) {
    return "Pendente";
  }

  return AGENDA_STATUS_LABELS[status] ?? status;
}

function toInputDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function getDisplayName(user: UserSummary | null) {
  if (!user) {
    return "Usuário não identificado";
  }

  return user.name || user.email;
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

function canEditMeeting(status: CouncilMeetingStatus) {
  return status === "DRAFT" || status === "SCHEDULED" || status === "IN_PROGRESS";
}

function canDeleteMeeting(status: CouncilMeetingStatus) {
  return status === "DRAFT";
}

function buildFormFromMeeting(meeting: CouncilMeeting): UpdateMeetingForm {
  return {
    title: meeting.title,
    description: meeting.description ?? "",
    condominiumId: meeting.condominium?.id ?? "",
    status: meeting.status,
    mode: meeting.mode,
    scheduledStartAt: toInputDateTime(meeting.scheduledStartAt),
    scheduledEndAt: toInputDateTime(meeting.scheduledEndAt),
    location: meeting.location ?? "",
    accessInstructions: meeting.meetingRoom?.accessInstructions ?? "",
    summary: meeting.summary ?? "",
    decisions: meeting.decisions ?? "",
    nextSteps: meeting.nextSteps ?? "",
    internalNotes: meeting.internalNotes ?? "",
  };
}

function getActionMessage(status: CouncilMeetingStatus) {
  const labels: Record<CouncilMeetingStatus, string> = {
    DRAFT: "Reunião salva como rascunho.",
    SCHEDULED: "Reunião agendada com sucesso.",
    IN_PROGRESS: "Reunião iniciada. A Sala De Reunião EloGest foi aberta.",
    COMPLETED: "Reunião marcada como realizada.",
    CANCELED: "Reunião cancelada com preservação do histórico.",
    ARCHIVED: "Reunião arquivada.",
  };

  return labels[status] ?? "Status da reunião atualizado.";
}


type ConsolidatedParticipant = {
  id: string;
  name: string;
  roles: string[];
  status: string;
  labels: string[];
  entriesCount: number;
  joinedAt?: string | null;
};

const PARTICIPANT_STATUS_PRIORITY: Record<string, number> = {
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

function getParticipantStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    INVITED: "Convite pendente",
    CONFIRMED: "Presença confirmada",
    DECLINED: "Presença recusada",
    ATTENDED: "Participou",
    ABSENT: "Ausente",
  };

  return labels[status || ""] || status || "Pendente";
}

function getBestParticipantStatus(statuses: Array<string | null | undefined>) {
  const validStatuses = statuses.filter((item): item is string => Boolean(item));

  if (validStatuses.length === 0) {
    return "INVITED";
  }

  return validStatuses.sort(
    (a, b) =>
      (PARTICIPANT_STATUS_PRIORITY[b] ?? 0) -
      (PARTICIPANT_STATUS_PRIORITY[a] ?? 0),
  )[0];
}

function addUniqueValue(list: string[], value?: string | null) {
  const trimmed = String(value || "").trim();

  if (trimmed && !list.includes(trimmed)) {
    list.push(trimmed);
  }
}

function consolidateCouncilParticipants(
  participants: CouncilParticipant[],
): ConsolidatedParticipant[] {
  const grouped = new Map<
    string,
    {
      id: string;
      name: string;
      roles: string[];
      labels: string[];
      statuses: string[];
      entriesCount: number;
    }
  >();

  participants.forEach((participant) => {
    const userKey = participant.user?.id || participant.id;
    const current =
      grouped.get(userKey) ||
      {
        id: userKey,
        name: getDisplayName(participant.user),
        roles: [],
        labels: [],
        statuses: [],
        entriesCount: 0,
      };

    addUniqueValue(current.roles, getParticipantRoleLabel(participant.role));
    addUniqueValue(current.labels, participant.userAccess?.label);
    addUniqueValue(current.statuses, participant.status);
    current.entriesCount += 1;

    grouped.set(userKey, current);
  });

  return Array.from(grouped.values()).map((item) => ({
    id: item.id,
    name: item.name,
    roles: item.roles,
    labels: item.labels,
    status: getBestParticipantStatus(item.statuses),
    entriesCount: item.entriesCount,
  }));
}

function consolidateRoomParticipants(
  participants: RoomParticipant[],
): ConsolidatedParticipant[] {
  const grouped = new Map<
    string,
    {
      id: string;
      name: string;
      roles: string[];
      labels: string[];
      statuses: string[];
      entriesCount: number;
      joinedAt?: string | null;
    }
  >();

  participants.forEach((participant) => {
    const userKey = participant.user?.id || participant.id;
    const current =
      grouped.get(userKey) ||
      {
        id: userKey,
        name: getDisplayName(participant.user),
        roles: [],
        labels: [],
        statuses: [],
        entriesCount: 0,
        joinedAt: participant.joinedAt,
      };

    addUniqueValue(current.roles, getParticipantRoleLabel(participant.role));
    addUniqueValue(current.labels, participant.userAccess?.label);
    addUniqueValue(current.statuses, participant.status);

    if (!current.joinedAt && participant.joinedAt) {
      current.joinedAt = participant.joinedAt;
    }

    current.entriesCount += 1;

    grouped.set(userKey, current);
  });

  return Array.from(grouped.values()).map((item) => ({
    id: item.id,
    name: item.name,
    roles: item.roles,
    labels: item.labels,
    status: getBestParticipantStatus(item.statuses),
    entriesCount: item.entriesCount,
    joinedAt: item.joinedAt || null,
  }));
}

export default function AdminCouncilMeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params?.id;

  const [meeting, setMeeting] = useState<CouncilMeeting | null>(null);
  const [form, setForm] = useState<UpdateMeetingForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "agenda" | "participants" | "history">("overview");

  const editable = meeting ? canEditMeeting(meeting.status) : false;
  const canDelete = meeting ? canDeleteMeeting(meeting.status) : false;

  const roomStatusLabel = useMemo(() => {
    if (!meeting?.meetingRoom) {
      return "Sala não criada";
    }

    return getRoomStatusLabel(meeting.meetingRoom.status);
  }, [meeting]);

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
          getErrorMessage(data, "Não foi possível carregar a reunião de conselho."),
        );
      }

      setMeeting(data.meeting);
      setForm(buildFormFromMeeting(data.meeting));
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível carregar a reunião de conselho.";

      setError(message);
      setMeeting(null);
      setForm(null);
    } finally {
      setIsLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void fetchMeeting();
  }, [fetchMeeting]);

  function updateForm<K extends keyof UpdateMeetingForm>(
    key: K,
    value: UpdateMeetingForm[K],
  ) {
    setForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [key]: value,
      };
    });
  }

  function buildPayload(nextStatus?: CouncilMeetingStatus) {
    if (!form) {
      return null;
    }

    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      condominiumId: form.condominiumId,
      status: nextStatus ?? form.status,
      mode: form.mode,
      scheduledStartAt: form.scheduledStartAt || null,
      scheduledEndAt: form.scheduledEndAt || null,
      location: form.location.trim() || null,
      accessInstructions: form.accessInstructions.trim() || null,
      summary: form.summary.trim() || null,
      decisions: form.decisions.trim() || null,
      nextSteps: form.nextSteps.trim() || null,
      internalNotes: form.internalNotes.trim() || null,
    };
  }

  async function saveMeeting(nextStatus?: CouncilMeetingStatus) {
    if (!meetingId || !form) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    if (!form.title.trim()) {
      setError("Informe um título para a reunião.");
      return;
    }

    if ((nextStatus ?? form.status) === "SCHEDULED" && !form.scheduledStartAt) {
      setError("Informe a data e horário para agendar a reunião.");
      return;
    }

    if ((form.mode === "PRESENTIAL" || form.mode === "HYBRID") && !form.location.trim()) {
      setError("Informe o local da reunião presencial ou híbrida.");
      return;
    }

    const payload = buildPayload(nextStatus);

    if (!payload) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/reunioes-conselho/${meetingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as MeetingResponse;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Não foi possível atualizar a reunião de conselho."),
        );
      }

      setSuccessMessage(
        data.message ?? (nextStatus ? getActionMessage(nextStatus) : "Reunião atualizada com sucesso."),
      );

      await fetchMeeting();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível atualizar a reunião de conselho.";

      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveMeeting();
  }

  async function handleDelete() {
    if (!meetingId || !meeting || !canDelete) {
      return;
    }

    const confirmed = window.confirm(
      "Remover esta reunião em rascunho? A sala vinculada também será removida.",
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/reunioes-conselho/${meetingId}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as MeetingResponse;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Não foi possível remover a reunião de conselho."),
        );
      }

      router.push("/admin/reunioes-conselho");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível remover a reunião de conselho.";

      setError(message);
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <AdminShell current="reunioes-conselho">
        <div className="min-h-screen bg-[#F6FAF7] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-3xl border border-[#DDEBDD] bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-[#617066]">Carregando reunião de conselho...</p>
        </div>
      </div>
      </AdminShell>
    );
  }

  if (!meeting || !form) {
    return (
      <AdminShell current="reunioes-conselho">
        <div className="min-h-screen bg-[#F6FAF7] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-3xl border border-[#F0C7C7] bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-[#9A2D2D]">
            {error ?? "Reunião de conselho não encontrada."}
          </p>
          <Link
            href="/admin/reunioes-conselho"
            className="mt-5 inline-flex rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1F5E34]"
          >
            Voltar Para Reuniões
          </Link>
        </div>
      </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell current="reunioes-conselho">
        <div className="min-h-screen bg-[#F6FAF7] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-[#DDEBDD] bg-white shadow-sm">
          <div className="border-b border-[#E5EFE6] bg-gradient-to-br from-[#FFFFFF] to-[#EAF7EE] p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <Link
                  href="/admin/reunioes-conselho"
                  className="text-sm font-semibold text-[#256D3C] transition hover:text-[#1F5E34]"
                >
                  ← Voltar Para Reuniões De Conselho
                </Link>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#EAF7EE] px-3 py-1 text-xs font-bold text-[#256D3C]">
                    {getStatusLabel(meeting.status)}
                  </span>
                  <span className="rounded-full bg-[#F0F4F1] px-3 py-1 text-xs font-semibold text-[#4B5B4F]">
                    {getModeLabel(meeting.mode)}
                  </span>
                  <span className="rounded-full bg-[#F7F3E8] px-3 py-1 text-xs font-semibold text-[#7A5A1E]">
                    Sala EloGest: {roomStatusLabel}
                  </span>
                </div>

                <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#17211B] sm:text-3xl">
                  {meeting.title}
                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#4B5B4F]">
                  {meeting.description || "Reunião de conselho criada para organizar pauta, participantes, decisões e histórico de governança."}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <Link
                  href={`/admin/reunioes-conselho/${meeting.id}/sala`}
                  className="rounded-2xl bg-[#17211B] px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#243427]"
                >
                  Abrir Sala EloGest
                </Link>

                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={isDeleting}
                    className="rounded-2xl border border-[#F0C7C7] px-5 py-3 text-sm font-semibold text-[#9A2D2D] transition hover:bg-[#FFF6F6] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? "Removendo..." : "Remover Rascunho"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-4">
            <InfoCard label="Condomínio" value={meeting.condominium?.name ?? "Não informado"} />
            <InfoCard label="Início Previsto" value={formatDateTime(meeting.scheduledStartAt)} />
            <InfoCard label="Término Previsto" value={formatDateTime(meeting.scheduledEndAt)} />
            <InfoCard label="Participantes" value={`${consolidateCouncilParticipants(meeting.participants).length} participante(s)`} />
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

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <form
            onSubmit={(event) => void handleSave(event)}
            className="rounded-3xl border border-[#DDEBDD] bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-4 border-b border-[#E5EFE6] pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#17211B]">Dados Da Reunião</h2>
                <p className="mt-1 text-sm leading-6 text-[#617066]">
                  Ajuste os dados principais enquanto a reunião ainda estiver aberta para edição.
                </p>
              </div>

              {!editable ? (
                <span className="rounded-full bg-[#F7F3E8] px-3 py-1 text-xs font-bold text-[#7A5A1E]">
                  Histórico preservado
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                Título
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  disabled={!editable}
                  className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                Descrição
                <textarea
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  disabled={!editable}
                  rows={3}
                  className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => updateForm("status", event.target.value as CouncilMeetingStatus)}
                    disabled={!editable}
                    className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                  >
                    <option value="DRAFT">Rascunho</option>
                    <option value="SCHEDULED">Agendada</option>
                    <option value="IN_PROGRESS">Em Andamento</option>
                    <option value="COMPLETED">Realizada</option>
                    <option value="CANCELED">Cancelada</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                  Formato
                  <select
                    value={form.mode}
                    onChange={(event) => updateForm("mode", event.target.value as MeetingMode)}
                    disabled={!editable}
                    className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                  >
                    <option value="ONLINE">Online</option>
                    <option value="PRESENTIAL">Presencial</option>
                    <option value="HYBRID">Híbrida</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                  Início Previsto
                  <input
                    type="datetime-local"
                    value={form.scheduledStartAt}
                    onChange={(event) => updateForm("scheduledStartAt", event.target.value)}
                    disabled={!editable}
                    className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                  Término Previsto
                  <input
                    type="datetime-local"
                    value={form.scheduledEndAt}
                    onChange={(event) => updateForm("scheduledEndAt", event.target.value)}
                    disabled={!editable}
                    className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                Local Presencial
                <input
                  type="text"
                  value={form.location}
                  onChange={(event) => updateForm("location", event.target.value)}
                  disabled={!editable}
                  placeholder="Ex.: Salão de festas, sala da administradora ou auditório"
                  className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                Instruções De Acesso À Sala
                <textarea
                  value={form.accessInstructions}
                  onChange={(event) => updateForm("accessInstructions", event.target.value)}
                  disabled={!editable}
                  rows={3}
                  placeholder="Ex.: entrar 5 minutos antes, manter microfone fechado, identificar-se com nome completo."
                  className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                  Resumo Da Reunião
                  <textarea
                    value={form.summary}
                    onChange={(event) => updateForm("summary", event.target.value)}
                    disabled={!editable}
                    rows={4}
                    className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                  />
                </label>

                <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                  Decisões E Encaminhamentos
                  <textarea
                    value={form.decisions}
                    onChange={(event) => updateForm("decisions", event.target.value)}
                    disabled={!editable}
                    rows={4}
                    className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                Próximos Passos
                <textarea
                  value={form.nextSteps}
                  onChange={(event) => updateForm("nextSteps", event.target.value)}
                  disabled={!editable}
                  rows={3}
                  className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                Observações Internas
                <textarea
                  value={form.internalNotes}
                  onChange={(event) => updateForm("internalNotes", event.target.value)}
                  disabled={!editable}
                  rows={3}
                  className="rounded-2xl border border-[#DDEBDD] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8ED08E] focus:ring-4 focus:ring-[#8ED08E]/20 disabled:bg-[#F4F7F5]"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-[#E5EFE6] pt-5 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="submit"
                disabled={!editable || isSaving}
                className="rounded-2xl border border-[#256D3C] px-5 py-3 text-sm font-semibold text-[#256D3C] transition hover:bg-[#EAF7EE] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Salvando..." : "Salvar Alterações"}
              </button>

              {meeting.status === "DRAFT" ? (
                <button
                  type="button"
                  onClick={() => void saveMeeting("SCHEDULED")}
                  disabled={isSaving}
                  className="rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1F5E34] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Agendar
                </button>
              ) : null}

              {(meeting.status === "DRAFT" || meeting.status === "SCHEDULED") ? (
                <button
                  type="button"
                  onClick={() => void saveMeeting("IN_PROGRESS")}
                  disabled={isSaving}
                  className="rounded-2xl bg-[#17211B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243427] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Iniciar Reunião
                </button>
              ) : null}

              {meeting.status === "IN_PROGRESS" ? (
                <button
                  type="button"
                  onClick={() => void saveMeeting("COMPLETED")}
                  disabled={isSaving}
                  className="rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1F5E34] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Marcar Como Realizada
                </button>
              ) : null}

              {editable ? (
                <button
                  type="button"
                  onClick={() => void saveMeeting("CANCELED")}
                  disabled={isSaving}
                  className="rounded-2xl border border-[#F0C7C7] px-5 py-3 text-sm font-semibold text-[#9A2D2D] transition hover:bg-[#FFF6F6] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>

          <aside className="flex flex-col gap-6">
            <section className="rounded-3xl border border-[#DDEBDD] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#17211B]">Sala De Reunião EloGest</h2>
              <p className="mt-2 text-sm leading-6 text-[#617066]">
                Esta sala é a base central da plataforma para reuniões de conselho e ficará preparada para Assembleias.
              </p>

              <div className="mt-5 grid gap-3">
                <InfoRow label="Status Da Sala" value={roomStatusLabel} />
                <InfoRow label="Formato" value={getModeLabel(meeting.meetingRoom?.mode ?? meeting.mode)} />
                <InfoRow label="Provedor" value={meeting.meetingRoom?.provider ?? "Interno Pendente"} />
                <InfoRow label="Aberta Em" value={formatDateTime(meeting.meetingRoom?.openedAt ?? null)} />
                <InfoRow label="Encerrada Em" value={formatDateTime(meeting.meetingRoom?.closedAt ?? null)} />
              </div>

              <Link
                href={`/admin/reunioes-conselho/${meeting.id}/sala`}
                className="mt-5 inline-flex w-full justify-center rounded-2xl bg-[#17211B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243427]"
              >
                Entrar Na Sala EloGest
              </Link>
            </section>

            <section className="rounded-3xl border border-[#DDEBDD] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[#17211B]">Resumo Rápido</h2>
              <div className="mt-5 grid gap-3">
                <InfoRow label="Criada Por" value={getDisplayName(meeting.createdByUser)} />
                <InfoRow label="Criada Em" value={formatDateTime(meeting.createdAt)} />
                <InfoRow label="Última Atualização" value={formatDateTime(meeting.updatedAt)} />
                <InfoRow label="Itens De Pauta" value={`${meeting.agendaItems.length}`} />
                <InfoRow label="Anexos" value={`${meeting.attachments.length}`} />
              </div>
            </section>
          </aside>
        </section>

        <section className="rounded-3xl border border-[#DDEBDD] bg-white shadow-sm">
          <div className="flex flex-wrap gap-2 border-b border-[#E5EFE6] p-4">
            <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
              Visão Geral
            </TabButton>
            <TabButton active={activeTab === "agenda"} onClick={() => setActiveTab("agenda")}>
              Pauta
            </TabButton>
            <TabButton active={activeTab === "participants"} onClick={() => setActiveTab("participants")}>
              Participantes
            </TabButton>
            <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")}>
              Histórico
            </TabButton>
          </div>

          <div className="p-6">
            {activeTab === "overview" ? (
              <OverviewTab meeting={meeting} />
            ) : null}

            {activeTab === "agenda" ? (
              <AgendaTab items={meeting.agendaItems} />
            ) : null}

            {activeTab === "participants" ? (
              <ParticipantsTab participants={meeting.participants} roomParticipants={meeting.meetingRoom?.participants ?? []} />
            ) : null}

            {activeTab === "history" ? (
              <HistoryTab meetingLogs={meeting.logs} roomLogs={meeting.meetingRoom?.logs ?? []} />
            ) : null}
          </div>
        </section>
      </div>
    </div>
      </AdminShell>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E1EBE3] bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7A877F]">{label}</p>
      <p className="mt-2 text-sm font-bold text-[#17211B]">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#E1EBE3] bg-[#F8FCF9] px-4 py-3">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">{label}</span>
      <span className="text-right text-sm font-semibold text-[#17211B]">{value}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-[#256D3C] text-white shadow-sm"
          : "border border-[#DDEBDD] text-[#4B5B4F] hover:bg-[#EAF7EE] hover:text-[#256D3C]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function OverviewTab({ meeting }: { meeting: CouncilMeeting }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <TextPanel title="Resumo" value={meeting.summary} fallback="Ainda não há resumo registrado para esta reunião." />
      <TextPanel title="Decisões" value={meeting.decisions} fallback="As decisões poderão ser registradas durante ou após a reunião." />
      <TextPanel title="Próximos Passos" value={meeting.nextSteps} fallback="Nenhum próximo passo registrado até o momento." />
      <div className="lg:col-span-3">
        <TextPanel title="Observações Internas" value={meeting.internalNotes} fallback="Nenhuma observação interna registrada." />
      </div>
    </div>
  );
}

function TextPanel({
  title,
  value,
  fallback,
}: {
  title: string;
  value: string | null;
  fallback: string;
}) {
  return (
    <article className="rounded-3xl border border-[#E1EBE3] bg-[#F8FCF9] p-5">
      <h3 className="text-sm font-bold text-[#17211B]">{title}</h3>
      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#617066]">
        {value || fallback}
      </p>
    </article>
  );
}

function AgendaTab({ items }: { items: AgendaItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nenhuma pauta cadastrada"
        description="A pauta inicial pode ser cadastrada na criação da reunião. A edição avançada da pauta será tratada em um bloco próprio da Etapa 49."
      />
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const hasRegistro = Boolean(
          item.discussionNotes ||
            item.decision ||
            item.responsibleName ||
            item.dueDate,
        );

        return (
          <article
            key={item.id}
            className="rounded-3xl border border-[#E1EBE3] bg-[#F8FCF9] p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7A877F]">
                  Pauta {item.order}
                </p>
                <h3 className="mt-1 text-base font-bold text-[#17211B]">
                  {item.title}
                </h3>
              </div>

              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#4B5B4F]">
                {getAgendaStatusLabel(item.status)}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#617066]">
              {item.description || "Sem descrição detalhada."}
            </p>

            <div className="mt-4 rounded-3xl border border-[#DDEBDD] bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                    Registro Da Pauta
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                    Informações registradas pelo responsável durante a reunião.
                  </p>
                </div>

                {!hasRegistro ? (
                  <span className="rounded-full bg-[#F7F3E8] px-3 py-1 text-xs font-bold text-[#7A5A1E]">
                    Aguardando Registro
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4">
                <RegistroPautaItem
                  label="Discussão Registrada"
                  value={item.discussionNotes}
                  fallback="Nenhuma discussão registrada para esta pauta."
                />

                <RegistroPautaItem
                  label="Decisão Tomada"
                  value={item.decision}
                  fallback="Nenhuma decisão registrada para esta pauta."
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <RegistroPautaItem
                    label="Responsável Pela Ação"
                    value={item.responsibleName}
                    fallback="Sem responsável definido."
                  />

                  <RegistroPautaItem
                    label="Prazo"
                    value={item.dueDate ? formatDateOnly(item.dueDate) : null}
                    fallback="Sem prazo definido."
                  />
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function RegistroPautaItem({
  label,
  value,
  fallback,
}: {
  label: string;
  value?: string | null;
  fallback: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E1EBE3] bg-[#FBFDFB] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[#344338]">
        {value || fallback}
      </p>
    </div>
  );
}

function ParticipantsTab({
  participants,
  roomParticipants,
}: {
  participants: CouncilParticipant[];
  roomParticipants: RoomParticipant[];
}) {
  const consolidatedParticipants = consolidateCouncilParticipants(participants);
  const consolidatedRoomParticipants = consolidateRoomParticipants(roomParticipants);

  if (
    consolidatedParticipants.length === 0 &&
    consolidatedRoomParticipants.length === 0
  ) {
    return (
      <EmptyState
        title="Nenhum participante cadastrado"
        description="Os participantes serão exibidos por pessoa. Quando o mesmo usuário tiver mais de um papel, como Síndico e Conselheiro, ele aparecerá em uma única linha."
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ParticipantList
        title="Participantes Da Reunião"
        participants={consolidatedParticipants}
      />
      <RoomParticipantList
        title="Participantes Da Sala"
        participants={consolidatedRoomParticipants}
      />
    </div>
  );
}

function ParticipantList({
  title,
  participants,
}: {
  title: string;
  participants: ConsolidatedParticipant[];
}) {
  return (
    <section className="rounded-3xl border border-[#E1EBE3] bg-[#F8FCF9] p-5">
      <h3 className="text-sm font-bold text-[#17211B]">{title}</h3>
      <div className="mt-4 space-y-3">
        {participants.length === 0 ? (
          <p className="text-sm text-[#617066]">Nenhum registro nesta lista.</p>
        ) : (
          participants.map((participant) => (
            <div key={participant.id} className="rounded-2xl bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-[#17211B]">
                    {participant.name}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#617066]">
                    {participant.roles.join(" e ")}
                  </p>
                  <p className="mt-1 text-xs text-[#7A877F]">
                    {participant.labels.length > 0
                      ? participant.labels.join(" • ")
                      : "Vínculo consolidado por pessoa"}
                  </p>
                </div>

                <span className="inline-flex w-fit rounded-full border border-[#DDEBDD] bg-[#F8FCF9] px-3 py-1 text-xs font-bold text-[#344338]">
                  {getParticipantStatusLabel(participant.status)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function RoomParticipantList({
  title,
  participants,
}: {
  title: string;
  participants: ConsolidatedParticipant[];
}) {
  return (
    <section className="rounded-3xl border border-[#E1EBE3] bg-[#F8FCF9] p-5">
      <h3 className="text-sm font-bold text-[#17211B]">{title}</h3>
      <div className="mt-4 space-y-3">
        {participants.length === 0 ? (
          <p className="text-sm text-[#617066]">Nenhum registro nesta lista.</p>
        ) : (
          participants.map((participant) => (
            <div key={participant.id} className="rounded-2xl bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-[#17211B]">
                    {participant.name}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#617066]">
                    {participant.roles.join(" e ")}
                  </p>
                  <p className="mt-1 text-xs text-[#7A877F]">
                    Entrada: {formatDateTime(participant.joinedAt || null)}
                  </p>
                </div>

                <span className="inline-flex w-fit rounded-full border border-[#DDEBDD] bg-[#F8FCF9] px-3 py-1 text-xs font-bold text-[#344338]">
                  {getParticipantStatusLabel(participant.status)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function HistoryTab({
  meetingLogs,
  roomLogs,
}: {
  meetingLogs: LogItem[];
  roomLogs: LogItem[];
}) {
  const logs = [
    ...meetingLogs.map((item) => ({ ...item, source: "Reunião" })),
    ...roomLogs.map((item) => ({ ...item, source: "Sala" })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (logs.length === 0) {
    return (
      <EmptyState
        title="Nenhum histórico registrado"
        description="As ações relevantes da reunião e da sala serão exibidas aqui."
      />
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <article key={`${log.source}-${log.id}`} className="rounded-3xl border border-[#E1EBE3] bg-[#F8FCF9] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7A877F]">
                {log.source} • {log.action}
              </p>
              <h3 className="mt-1 text-sm font-bold text-[#17211B]">
                {log.message || "Ação registrada no histórico."}
              </h3>
              <p className="mt-1 text-xs text-[#617066]">
                Por {getDisplayName(log.user)}
              </p>
            </div>
            <span className="text-xs font-semibold text-[#617066]">
              {formatDateTime(log.createdAt)}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[#CFE0D2] bg-[#F8FCF9] p-8 text-center">
      <h3 className="text-lg font-bold text-[#17211B]">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#617066]">
        {description}
      </p>
    </div>
  );
}
