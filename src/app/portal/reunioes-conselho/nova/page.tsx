"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import PortalShell from "@/components/PortalShell";

/* =========================================================
   PORTAL - NOVA REUNIÃO DE CONSELHO

   Arquivo:
   src/app/portal/reunioes-conselho/nova/page.tsx

   ETAPA 49.8.2 — NOVA REUNIÃO PELO PORTAL

   Objetivo:
   - Permitir que Síndico ou Conselheiro crie reunião de conselho.
   - Permitir reaproveitar pendências abertas de reuniões anteriores.
   - A Administradora continua com criação própria pela área admin,
     mas não é obrigatória no fluxo natural do conselho.
   ========================================================= */

type MeetingMode = "ONLINE" | "PRESENTIAL" | "HYBRID";
type MeetingStatus = "DRAFT" | "SCHEDULED";

type PendingAgendaItem = {
  id: string;
  title: string;
  description?: string | null;
  discussionNotes?: string | null;
  decision?: string | null;
  responsibleName?: string | null;
  dueDate?: string | null;
  status?: string | null;
  meeting?: {
    id: string;
    title: string;
    scheduledStartAt?: string | null;
  } | null;
  councilMeeting?: {
    id: string;
    title: string;
    scheduledStartAt?: string | null;
  } | null;
  originMeeting?: {
    id: string;
    title: string;
    scheduledStartAt?: string | null;
  } | null;
};

type PendingResponse = {
  pendencias?: PendingAgendaItem[];
  pendingItems?: PendingAgendaItem[];
  items?: PendingAgendaItem[];
  agendaItems?: PendingAgendaItem[];
  error?: string;
};

type GovernanceParticipant = {
  userId: string;
  userAccessId?: string | null;
  role: string;
  label?: string | null;
  isCurrentUser?: boolean;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
};

type InviteCandidate = {
  userAccessId: string;
  userId: string;
  role?: string | null;
  label?: string | null;
  contextLabel?: string | null;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  resident?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  unit?: {
    id: string;
    block?: string | null;
    unitNumber?: string | null;
  } | null;
};

type CreationDataResponse = {
  participants?: GovernanceParticipant[];
  inviteCandidates?: InviteCandidate[];
  condominium?: {
    id: string;
    name: string;
  } | null;
  activeAccess?: {
    id: string;
    role: string;
    label?: string | null;
    condominiumName?: string | null;
  } | null;
  error?: string;
};

type CreateResponse = {
  meeting?: {
    id: string;
  };
  error?: string;
  message?: string;
};

type AgendaDraft = {
  id: string;
  title: string;
  description: string;
};

type FormState = {
  title: string;
  description: string;
  status: MeetingStatus;
  mode: MeetingMode;
  scheduledStartAt: string;
  scheduledEndAt: string;
  location: string;
  accessInstructions: string;
};

const emptyAgendaItem = (): AgendaDraft => ({
  id: crypto.randomUUID(),
  title: "",
  description: "",
});

function formatDate(value?: string | null) {
  if (!value) return "Sem data definida";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Sem data definida";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function normalizePendingItems(data: PendingResponse) {
  return (
    data.pendencias || data.pendingItems || data.items || data.agendaItems || []
  );
}

function getOriginMeeting(item: PendingAgendaItem) {
  return item.originMeeting || item.meeting || item.councilMeeting || null;
}

function getPendingStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    OPEN: "Aberta",
    DISCUSSED: "Em discussão",
    POSTPONED: "Adiada",
    APPROVED: "Resolvida",
    REJECTED: "Rejeitada",
    CANCELED: "Cancelada",
  };

  return labels[status || ""] || status || "Pendente";
}

function getParticipantName(participant: GovernanceParticipant) {
  return (
    participant.user?.name ||
    participant.user?.email ||
    participant.label ||
    "Participante"
  );
}

function getInviteCandidateName(candidate: InviteCandidate) {
  return (
    candidate.user?.name ||
    candidate.resident?.name ||
    candidate.user?.email ||
    candidate.resident?.email ||
    candidate.label ||
    "Convidado"
  );
}

function getInviteCandidateContext(candidate: InviteCandidate) {
  const unitLabel = candidate.unit
    ? [
        candidate.unit.block ? `Bloco ${candidate.unit.block}` : null,
        candidate.unit.unitNumber
          ? `Unidade ${candidate.unit.unitNumber}`
          : null,
      ]
        .filter(Boolean)
        .join(" / ")
    : null;

  return (
    unitLabel ||
    candidate.contextLabel ||
    candidate.label ||
    "Vínculo do condomínio"
  );
}

function getParticipantRoleLabel(role?: string | null) {
  const labels: Record<string, string> = {
    ADMINISTRADORA: "Administradora",
    SINDICO: "Síndico",
    CONSELHEIRO: "Conselheiro",
    MORADOR: "Morador",
    PROPRIETARIO: "Proprietário",
  };

  return labels[role || ""] || role || "Perfil";
}

export default function PortalNewCouncilMeetingPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);

  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    status: "SCHEDULED",
    mode: "ONLINE",
    scheduledStartAt: "",
    scheduledEndAt: "",
    location: "",
    accessInstructions: "",
  });
  const [agendaItems, setAgendaItems] = useState<AgendaDraft[]>([
    emptyAgendaItem(),
  ]);
  const [pendingItems, setPendingItems] = useState<PendingAgendaItem[]>([]);
  const [participants, setParticipants] = useState<GovernanceParticipant[]>([]);
  const [inviteCandidates, setInviteCandidates] = useState<InviteCandidate[]>(
    [],
  );
  const [selectedInviteAccessIds, setSelectedInviteAccessIds] = useState<
    string[]
  >([]);
  const [recordKeeperUserId, setRecordKeeperUserId] = useState("");
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [isLoadingCreationData, setIsLoadingCreationData] = useState(true);
  const [isLoadingPendencies, setIsLoadingPendencies] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedPendingCount = selectedPendingIds.length;

  const validAgendaItems = useMemo(() => {
    return agendaItems.filter((item) => item.title.trim().length >= 3);
  }, [agendaItems]);

  const selectedInviteCount = selectedInviteAccessIds.length;

  async function loadCreationData() {
    setIsLoadingCreationData(true);

    try {
      const response = await fetch("/api/portal/reunioes-conselho/nova", {
        cache: "no-store",
      });

      const data = (await response.json()) as CreationDataResponse;

      if (!response.ok) {
        setParticipants([]);
        setInviteCandidates([]);
        return;
      }

      const normalizedParticipants = data.participants || [];
      const automaticParticipantUserIds = new Set(
        normalizedParticipants.map((participant) => participant.userId),
      );
      const normalizedInviteCandidates = (data.inviteCandidates || []).filter(
        (candidate) => !automaticParticipantUserIds.has(candidate.userId),
      );

      setParticipants(normalizedParticipants);
      setInviteCandidates(normalizedInviteCandidates);

      const defaultRecordKeeper =
        normalizedParticipants.find(
          (participant) => participant.isCurrentUser,
        ) || normalizedParticipants[0];

      if (defaultRecordKeeper?.userId) {
        setRecordKeeperUserId(defaultRecordKeeper.userId);
      }
    } catch (requestError) {
      console.error(
        "Erro ao carregar participantes de governança:",
        requestError,
      );
      setParticipants([]);
      setInviteCandidates([]);
    } finally {
      setIsLoadingCreationData(false);
    }
  }

  async function loadPendencies() {
    setIsLoadingPendencies(true);

    try {
      const response = await fetch("/api/portal/reunioes-conselho/pendencias", {
        cache: "no-store",
      });

      const data = (await response.json()) as PendingResponse;

      if (!response.ok) {
        setPendingItems([]);
        return;
      }

      setPendingItems(normalizePendingItems(data));
    } catch (requestError) {
      console.error("Erro ao carregar pendências de conselho:", requestError);
      setPendingItems([]);
    } finally {
      setIsLoadingPendencies(false);
    }
  }

  useEffect(() => {
    void loadCreationData();
    void loadPendencies();
  }, []);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateAgendaItem(
    id: string,
    field: keyof AgendaDraft,
    value: string,
  ) {
    setAgendaItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  }

  function addAgendaItem() {
    setAgendaItems((current) => [...current, emptyAgendaItem()]);
  }

  function removeAgendaItem(id: string) {
    setAgendaItems((current) => {
      if (current.length <= 1) return current;
      return current.filter((item) => item.id !== id);
    });
  }

  function togglePending(id: string) {
    setSelectedPendingIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleInvite(userAccessId: string) {
    setSelectedInviteAccessIds((current) =>
      current.includes(userAccessId)
        ? current.filter((item) => item !== userAccessId)
        : [...current, userAccessId],
    );
  }

  function validateForm() {
    if (form.title.trim().length < 3) {
      return "Informe um título para a reunião.";
    }

    if (form.status === "SCHEDULED" && !form.scheduledStartAt) {
      return "Informe a data e o horário para agendar a reunião.";
    }

    if (
      form.scheduledStartAt &&
      form.scheduledEndAt &&
      new Date(form.scheduledEndAt) <= new Date(form.scheduledStartAt)
    ) {
      return "O término previsto deve ser posterior ao início previsto.";
    }

    if (
      (form.mode === "PRESENTIAL" || form.mode === "HYBRID") &&
      !form.location.trim()
    ) {
      return "Informe o local da reunião presencial ou híbrida.";
    }

    if (validAgendaItems.length === 0 && selectedPendingIds.length === 0) {
      return "Inclua ao menos uma pauta nova ou selecione uma pendência anterior.";
    }

    if (
      recordKeeperUserId &&
      !participants.some(
        (participant) => participant.userId === recordKeeperUserId,
      )
    ) {
      return "Selecione um responsável pelo registro que esteja entre os participantes da reunião.";
    }

    return null;
  }

  function handleCreateButtonClick() {
    if (isSaving || isLoadingCreationData || isLoadingPendencies) {
      return;
    }

    formRef.current?.requestSubmit();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setSuccessMessage(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/portal/reunioes-conselho/nova", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          status: form.status,
          mode: form.mode,
          scheduledStartAt: form.scheduledStartAt || null,
          scheduledEndAt: form.scheduledEndAt || null,
          location: form.location.trim() || null,
          accessInstructions: form.accessInstructions.trim() || null,
          recordKeeperUserId: recordKeeperUserId || null,
          invitedUserAccessIds: selectedInviteAccessIds,
          pendingAgendaItemIds: selectedPendingIds,
          agendaItems: validAgendaItems.map((item) => ({
            title: item.title.trim(),
            description: item.description.trim() || null,
          })),
        }),
      });

      const data = (await response.json()) as CreateResponse;

      if (!response.ok || !data.meeting?.id) {
        setError(data.error || "Não foi possível criar a reunião de conselho.");
        return;
      }

      setSuccessMessage(data.message || "Reunião criada com sucesso.");
      router.push(`/portal/reunioes-conselho/${data.meeting.id}`);
    } catch (requestError) {
      console.error("Erro ao criar reunião pelo portal:", requestError);
      setError("Não foi possível criar a reunião de conselho.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PortalShell current="reunioes-conselho">
      <main className="min-h-screen bg-[linear-gradient(135deg,#F6F8F7_0%,#FFFFFF_48%,#EAF7EE_130%)] px-4 py-6 text-[#17211B] sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <section className="rounded-[34px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_22px_70px_rgba(23,33,27,0.08)] backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#BFE8C4] bg-[#EAF7EE] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                  Reunião Pelo Portal
                </div>

                <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#17211B] sm:text-4xl">
                  Nova Reunião De Conselho
                </h1>

                <p className="mt-3 text-base font-medium leading-7 text-[#5E6B63]">
                  Organize a reunião do conselho, defina data, formato e pautas.
                  Pendências abertas de reuniões anteriores podem ser trazidas
                  para continuidade nesta nova reunião.
                </p>
              </div>

              <Link
                href="/portal/reunioes-conselho"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-bold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Voltar Para Reuniões
              </Link>
            </div>
          </section>

          {(error || successMessage) && (
            <section>
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

          <form
            ref={formRef}
            onSubmit={(event) => void handleSubmit(event)}
            className="grid gap-6 xl:grid-cols-[1fr_420px]"
          >
            <section className="space-y-6">
              <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-[#17211B]">
                  Dados Da Reunião
                </h2>
                <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                  A reunião será criada no condomínio do perfil de síndico ou
                  conselheiro vinculado ao seu acesso atual.
                </p>

                <div className="mt-5 grid gap-4">
                  <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                    Título
                    <input
                      type="text"
                      value={form.title}
                      onChange={(event) =>
                        updateForm("title", event.target.value)
                      }
                      placeholder="Ex.: Reunião mensal do conselho"
                      className="h-12 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                    Descrição
                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        updateForm("description", event.target.value)
                      }
                      rows={3}
                      placeholder="Informe o objetivo da reunião."
                      className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                      Status Inicial
                      <select
                        value={form.status}
                        onChange={(event) =>
                          updateForm(
                            "status",
                            event.target.value as MeetingStatus,
                          )
                        }
                        className="h-12 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                      >
                        <option value="SCHEDULED">Agendada</option>
                        <option value="DRAFT">Rascunho</option>
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                      Formato
                      <select
                        value={form.mode}
                        onChange={(event) =>
                          updateForm("mode", event.target.value as MeetingMode)
                        }
                        className="h-12 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
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
                        onChange={(event) =>
                          updateForm("scheduledStartAt", event.target.value)
                        }
                        className="h-12 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                      Término Previsto
                      <input
                        type="datetime-local"
                        value={form.scheduledEndAt}
                        onChange={(event) =>
                          updateForm("scheduledEndAt", event.target.value)
                        }
                        className="h-12 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                      />
                    </label>
                  </div>

                  <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                    Local Presencial
                    <input
                      type="text"
                      value={form.location}
                      onChange={(event) =>
                        updateForm("location", event.target.value)
                      }
                      placeholder="Obrigatório para reunião presencial ou híbrida"
                      className="h-12 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#344338]">
                    Instruções De Acesso À Sala
                    <textarea
                      value={form.accessInstructions}
                      onChange={(event) =>
                        updateForm("accessInstructions", event.target.value)
                      }
                      rows={3}
                      placeholder="Ex.: entrar 5 minutos antes, identificar-se com nome completo, manter microfone fechado."
                      className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </label>

                  <div className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-[#17211B]">
                          Responsável Pelo Registro
                        </h3>
                        <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                          Escolha quem ficará responsável por registrar as
                          discussões, decisões, responsáveis e prazos durante a
                          reunião.
                        </p>
                      </div>

                      {recordKeeperUserId && (
                        <span className="rounded-full bg-[#EAF7EE] px-3 py-1 text-xs font-bold text-[#256D3C]">
                          Definido
                        </span>
                      )}
                    </div>

                    <label className="mt-4 grid gap-2 text-sm font-semibold text-[#344338]">
                      Pessoa Responsável
                      <select
                        value={recordKeeperUserId}
                        onChange={(event) =>
                          setRecordKeeperUserId(event.target.value)
                        }
                        disabled={isLoadingCreationData}
                        className="h-12 rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">
                          {isLoadingCreationData
                            ? "Carregando participantes..."
                            : "Definir depois na sala"}
                        </option>

                        {participants.map((participant) => (
                          <option
                            key={participant.userId}
                            value={participant.userId}
                          >
                            {getParticipantName(participant)} —{" "}
                            {getParticipantRoleLabel(participant.role)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <p className="mt-3 text-xs font-semibold leading-5 text-[#7A877F]">
                      Os participantes naturais da reunião são o síndico e os
                      conselheiros ativos do condomínio. Convidados extras podem
                      ser selecionados abaixo e terão acesso apenas a esta
                      reunião.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-[#17211B]">
                      Convidados Extras
                    </h2>
                    <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                      Convide moradores ou proprietários para participar desta
                      reunião específica. Eles poderão visualizar a reunião,
                      confirmar presença e acessar a sala, mas não poderão
                      editar as pautas.
                    </p>
                  </div>

                  <span className="rounded-full bg-[#F1F5F2] px-3 py-1 text-xs font-bold text-[#5E6B63]">
                    {selectedInviteCount} selecionado(s)
                  </span>
                </div>

                {isLoadingCreationData ? (
                  <p className="mt-5 rounded-2xl border border-dashed border-[#C8D8CD] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#5E6B63]">
                    Carregando possíveis convidados...
                  </p>
                ) : inviteCandidates.length === 0 ? (
                  <p className="mt-5 rounded-2xl border border-dashed border-[#C8D8CD] bg-[#F9FBFA] p-4 text-sm font-semibold text-[#5E6B63]">
                    Nenhum morador ou proprietário ativo encontrado para convite
                    neste condomínio.
                  </p>
                ) : (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {inviteCandidates.map((candidate) => {
                      const checked = selectedInviteAccessIds.includes(
                        candidate.userAccessId,
                      );

                      return (
                        <label
                          key={candidate.userAccessId}
                          className={[
                            "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
                            checked
                              ? "border-[#8ED08E] bg-[#EAF7EE]"
                              : "border-[#DDE5DF] bg-[#F9FBFA] hover:border-[#BFE8C4] hover:bg-white",
                          ].join(" ")}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleInvite(candidate.userAccessId)
                            }
                            className="mt-1 h-4 w-4 rounded border-[#B9C8BD] text-[#256D3C] focus:ring-[#256D3C]"
                          />

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-[#17211B]">
                              {getInviteCandidateName(candidate)}
                            </span>
                            <span className="mt-1 block text-xs font-semibold leading-5 text-[#5E6B63]">
                              {getParticipantRoleLabel(candidate.role)} •{" "}
                              {getInviteCandidateContext(candidate)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-[#17211B]">
                      Pautas Novas
                    </h2>
                    <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                      Inclua os assuntos que serão debatidos nesta reunião.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={addAgendaItem}
                    className="rounded-2xl border border-[#BFE8C4] bg-[#EAF7EE] px-4 py-2 text-sm font-bold text-[#256D3C] transition hover:bg-[#DDF3E0]"
                  >
                    Adicionar Pauta
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  {agendaItems.map((item, index) => (
                    <article
                      key={item.id}
                      className="rounded-3xl border border-[#E1EBE3] bg-[#F9FBFA] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#EAF7EE] text-sm font-bold text-[#256D3C]">
                          {index + 1}
                        </span>

                        <button
                          type="button"
                          onClick={() => removeAgendaItem(item.id)}
                          disabled={agendaItems.length <= 1}
                          className="rounded-xl px-3 py-1 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Remover
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3">
                        <input
                          type="text"
                          value={item.title}
                          onChange={(event) =>
                            updateAgendaItem(
                              item.id,
                              "title",
                              event.target.value,
                            )
                          }
                          placeholder="Título da pauta"
                          className="h-12 rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                        />

                        <textarea
                          value={item.description}
                          onChange={(event) =>
                            updateAgendaItem(
                              item.id,
                              "description",
                              event.target.value,
                            )
                          }
                          rows={3}
                          placeholder="Descrição opcional da pauta"
                          className="rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-[#17211B]">
                  Pendências Anteriores
                </h2>
                <p className="mt-1 text-sm font-medium leading-6 text-[#5E6B63]">
                  Selecione pendências abertas para continuar a discussão nesta
                  reunião.
                </p>

                {isLoadingPendencies ? (
                  <div className="mt-5 space-y-3">
                    {[1, 2, 3].map((item) => (
                      <div
                        key={item}
                        className="h-24 animate-pulse rounded-2xl bg-[#F1F5F2]"
                      />
                    ))}
                  </div>
                ) : pendingItems.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-[#C9D8CD] bg-[#F9FBFA] p-5 text-sm font-semibold leading-6 text-[#5E6B63]">
                    Nenhuma pendência aberta encontrada para este condomínio.
                  </div>
                ) : (
                  <div className="mt-5 max-h-[540px] space-y-3 overflow-y-auto pr-1">
                    {pendingItems.map((item) => {
                      const origin = getOriginMeeting(item);
                      const selected = selectedPendingIds.includes(item.id);

                      return (
                        <label
                          key={item.id}
                          className={[
                            "block cursor-pointer rounded-3xl border p-4 transition",
                            selected
                              ? "border-[#8ED08E] bg-[#EAF7EE] shadow-sm"
                              : "border-[#E1EBE3] bg-[#F9FBFA] hover:border-[#BFE8C4]",
                          ].join(" ")}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => togglePending(item.id)}
                              className="mt-1 h-4 w-4 rounded border-[#B8C9BD] text-[#256D3C]"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#256D3C]">
                                  {getPendingStatusLabel(item.status)}
                                </span>

                                {item.dueDate && (
                                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#7A5A1E]">
                                    Prazo: {formatDate(item.dueDate)}
                                  </span>
                                )}
                              </div>

                              <p className="mt-3 text-sm font-bold leading-5 text-[#17211B]">
                                {item.title}
                              </p>

                              {item.decision && (
                                <p className="mt-2 line-clamp-3 text-xs font-semibold leading-5 text-[#4B5B4F]">
                                  {item.decision}
                                </p>
                              )}

                              <p className="mt-3 text-xs font-semibold leading-5 text-[#7A877F]">
                                Origem: {origin?.title || "Reunião anterior"} •{" "}
                                {formatDate(origin?.scheduledStartAt)}
                              </p>

                              {item.responsibleName && (
                                <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                                  Responsável: {item.responsibleName}
                                </p>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-[30px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-[#17211B]">
                  Resumo Da Criação
                </h2>

                <div className="mt-4 grid gap-3 text-sm font-semibold text-[#5E6B63]">
                  <div className="rounded-2xl bg-[#F9FBFA] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9AA7A0]">
                      Pautas Novas
                    </p>
                    <p className="mt-1 text-2xl font-bold text-[#17211B]">
                      {validAgendaItems.length}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#F9FBFA] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9AA7A0]">
                      Pendências Selecionadas
                    </p>
                    <p className="mt-1 text-2xl font-bold text-[#17211B]">
                      {selectedPendingCount}
                    </p>
                  </div>
                </div>

                {error && (
                  <div
                    aria-live="polite"
                    className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-800"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCreateButtonClick}
                  disabled={
                    isSaving || isLoadingCreationData || isLoadingPendencies
                  }
                  className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(37,109,60,0.24)] transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving
                    ? "Criando..."
                    : isLoadingCreationData || isLoadingPendencies
                      ? "Carregando dados..."
                      : "Criar Reunião"}
                </button>
              </div>
            </aside>
          </form>
        </div>
      </main>
    </PortalShell>
  );
}
