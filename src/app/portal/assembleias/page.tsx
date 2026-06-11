"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PortalContextGuard from "@/components/PortalContextGuard";
import PortalShell from "@/components/PortalShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ETAPA 51.8.1 — PORTAL DE ASSEMBLEIAS

   Primeira entrega do portal:
   - listagem das assembleias publicadas;
   - visão geral da convocação;
   - documentos oficiais;
   - pautas;
   - unidades representáveis pelo usuário;
   - indicação das pendências de votação.

   Próximo bloco:
   - envio e alteração de votos pelo celular.
   ========================================================= */

type AssemblyStatus =
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "RESULTS_PUBLISHED";

type MeetingMode = "PRESENTIAL" | "ONLINE" | "HYBRID";
type AgendaItemType =
  | "INFORMATIVE"
  | "APPROVE_REJECT_ABSTAIN"
  | "YES_NO_ABSTAIN"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE";

type VotingOrigin =
  | "DIRECT_UNIT_LINK"
  | "PROXY_REPRESENTATION"
  | "AUTHORIZED_LINK"
  | "ADMINISTRATIVE_IMPORT";
type VoteVisibility = "CONSOLIDATED" | "NOMINAL_BY_UNIT" | "SECRET";

interface VotingUnit {
  eligibleUnitId: string;
  unitId: string;
  block?: string | null;
  unitNumber: string;
  votingWeight: string;
  origin: VotingOrigin;
  representationId?: string | null;
}

interface PortalAssemblyListItem {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  status: AssemblyStatus;
  mode: MeetingMode;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  votingStartsAt?: string | null;
  votingEndsAt?: string | null;
  convocationPublishedAt?: string | null;
  allowVoteChange: boolean;
  condominium?: {
    id: string;
    name: string;
  } | null;
  votingUnits: VotingUnit[];
  pendingVotes: number;
  votingOpen: boolean;
  canParticipate: boolean;
  _count?: {
    agendaItems?: number;
    attachments?: number;
  };
}

interface ListResponse {
  kpis?: {
    total?: number;
    totalPending?: number;
    open?: number;
    scheduled?: number;
  };
  assemblies?: PortalAssemblyListItem[];
  error?: string;
}

interface AttachmentItem {
  id: string;
  scope?: string | null;
  originalName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  url: string;
  description?: string | null;
}

interface AgendaOptionItem {
  id: string;
  label: string;
  description?: string | null;
  order: number;
  isAbstention: boolean;
}

interface PublicResultOptionItem {
  optionId: string;
  label: string;
  isAbstention: boolean;
  votes: number;
  weight: number;
}

interface PublicNominalVoteItem {
  voteId: string;
  unitLabel: string;
  votingWeight: number;
  origin: VotingOrigin;
  optionLabels: string[];
  submittedAt: string;
}

interface PublicAgendaResult {
  voteVisibility: VoteVisibility;
  participatingUnits: number;
  participatingWeight: number;
  abstentionUnits: number;
  abstentionWeight: number;
  validWeight: number;
  options: PublicResultOptionItem[];
  nominalVotes: PublicNominalVoteItem[];
}

interface AgendaItem {
  id: string;
  order: number;
  title: string;
  description?: string | null;
  type: AgendaItemType;
  status: string;
  voteVisibility: VoteVisibility;
  quorumRuleType: string;
  customRuleDescription?: string | null;
  minimumParticipationPct?: string | number | null;
  minimumApprovalPct?: string | number | null;
  resultStatus?: string | null;
  resultSummary?: string | null;
  resultValidatedAt?: string | null;
  deferredReason?: string | null;
  deferredNotes?: string | null;
  originAgendaItem?: {
    id: string;
    title: string;
    assembly?: {
      id: string;
      title: string;
    } | null;
  } | null;
  options: AgendaOptionItem[];
  attachments: AttachmentItem[];
  publicResult?: PublicAgendaResult | null;
}

interface SubmittedVote {
  id: string;
  agendaItemId: string;
  eligibleUnitId: string;
  origin: string;
  version: number;
  submittedAt: string;
  options: Array<{ optionId: string }>;
}

interface PortalAssemblyDetail {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  status: AssemblyStatus;
  mode: MeetingMode;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  votingStartsAt?: string | null;
  votingEndsAt?: string | null;
  location?: string | null;
  externalMeetingUrl?: string | null;
  accessInstructions?: string | null;
  convocationText?: string | null;
  convocationPublishedAt?: string | null;
  resultsPublishedAt?: string | null;
  allowVoteChange: boolean;
  condominium?: {
    id: string;
    name: string;
  } | null;
  agendaItems: AgendaItem[];
  attachments: AttachmentItem[];
  votes: SubmittedVote[];
  votingUnits: VotingUnit[];
  votingOpen: boolean;
  canParticipate: boolean;
}

interface DetailResponse {
  assembly?: PortalAssemblyDetail;
  error?: string;
}

function getErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const payload = data as { error?: string; message?: string };
    return payload.error || payload.message || fallback;
  }

  return fallback;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    SCHEDULED: "Agendada",
    OPEN: "Em votação",
    CLOSED: "Encerrada",
    RESULTS_PUBLISHED: "Resultados publicados",
  };

  return labels[status || ""] || status || "-";
}

function statusClass(status?: string | null) {
  const classes: Record<string, string> = {
    SCHEDULED: "border-blue-200 bg-blue-50 text-blue-700",
    OPEN: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    CLOSED: "border-slate-200 bg-slate-50 text-slate-700",
    RESULTS_PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  return classes[status || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function modeLabel(mode?: string | null) {
  const labels: Record<string, string> = {
    PRESENTIAL: "Presencial",
    ONLINE: "Virtual",
    HYBRID: "Híbrida",
  };

  return labels[mode || ""] || mode || "-";
}

function agendaTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    INFORMATIVE: "Informativa",
    APPROVE_REJECT_ABSTAIN: "Aprovar, rejeitar ou abster-se",
    YES_NO_ABSTAIN: "Sim, não ou abster-se",
    SINGLE_CHOICE: "Escolha única",
    MULTIPLE_CHOICE: "Múltipla escolha",
  };

  return labels[type || ""] || type || "-";
}


function resultStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    PENDING: "Pendente",
    APPROVED: "Aprovada",
    REJECTED: "Rejeitada",
    NO_QUORUM: "Sem Quórum",
    INFORMATIONAL: "Informativa",
    MANUAL_REVIEW: "Revisão Manual",
    DEFERRED: "Pendente Para Nova Deliberação",
    CANCELED: "Cancelada",
  };

  return labels[status || ""] || status || "-";
}

function resultStatusClass(status?: string | null) {
  const classes: Record<string, string> = {
    APPROVED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    REJECTED: "border-red-200 bg-red-50 text-red-700",
    NO_QUORUM: "border-amber-200 bg-amber-50 text-amber-800",
    INFORMATIONAL: "border-blue-200 bg-blue-50 text-blue-700",
    MANUAL_REVIEW: "border-violet-200 bg-violet-50 text-violet-700",
    DEFERRED: "border-amber-200 bg-amber-50 text-amber-800",
    PENDING: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    CANCELED: "border-red-200 bg-red-50 text-red-700",
  };

  return classes[status || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function originLabel(origin?: VotingOrigin | null) {
  const labels: Record<VotingOrigin, string> = {
    DIRECT_UNIT_LINK: "Vínculo Direto Com A Unidade",
    PROXY_REPRESENTATION: "Procuração Vigente",
    AUTHORIZED_LINK: "Vínculo Autorizado",
    ADMINISTRATIVE_IMPORT: "Importação Administrativa",
  };

  return origin ? labels[origin] : "Origem Não Informada";
}

function voteVisibilityLabel(value?: VoteVisibility | null) {
  const labels: Record<VoteVisibility, string> = {
    CONSOLIDATED: "Resultado Consolidado",
    NOMINAL_BY_UNIT: "Votação Nominal Por Unidade",
    SECRET: "Votação Sigilosa",
  };

  return value ? labels[value] : "Resultado Consolidado";
}

function voteVisibilityDescription(value?: VoteVisibility | null) {
  const descriptions: Record<VoteVisibility, string> = {
    CONSOLIDATED:
      "A divulgação apresenta totais, pesos e resultado, sem identificar individualmente as unidades.",
    NOMINAL_BY_UNIT:
      "A divulgação apresenta o resultado consolidado e o voto registrado por unidade, sem expor o nome da pessoa responsável.",
    SECRET:
      "A divulgação apresenta somente o resultado consolidado. A identificação individual permanece restrita à auditoria autorizada.",
  };

  return value ? descriptions[value] : descriptions.CONSOLIDATED;
}

function formatVotingWeight(value?: number | string | null) {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) return "-";

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 6,
  }).format(numericValue);
}

function unitLabel(unit?: VotingUnit | null) {
  if (!unit) return "Unidade";
  return `${unit.block ? `${unit.block} - ` : ""}${unit.unitNumber}`;
}


function getPortalAttachmentHref(params: {
  assemblyId: string;
  attachmentId: string;
}) {
  return `/api/portal/assembleias/${encodeURIComponent(params.assemblyId)}/anexos/${encodeURIComponent(params.attachmentId)}`;
}

function formatFileSize(sizeBytes?: number | null) {
  const value = Number(sizeBytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function excerpt(value?: string | null, maxLength = 180) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Sem descrição informada.";
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength).trim()}...`;
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-[22px] border border-[#DDE5DF] bg-white p-4 shadow-[0_14px_42px_rgba(23,33,27,0.04)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium leading-5 text-[#5E6B63]">
        {description}
      </p>
    </div>
  );
}

function PortalAssembleiasPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAssemblyId = searchParams.get("assemblyId") || "";
  const lastHandledRequestedAssemblyIdRef = useRef("");
  const requestedAssemblyIdRef = useRef(requestedAssemblyId);
  const selectedAssemblyIdRef = useRef(requestedAssemblyId);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [assemblies, setAssemblies] = useState<PortalAssemblyListItem[]>([]);
  const [selectedAssembly, setSelectedAssembly] = useState<PortalAssemblyDetail | null>(null);
  const [selectedAssemblyId, setSelectedAssemblyId] = useState(requestedAssemblyId);
  const [kpis, setKpis] = useState({ total: 0, totalPending: 0, open: 0, scheduled: 0 });

  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [voteSaving, setVoteSaving] = useState(false);
  const [selectedVoteUnitId, setSelectedVoteUnitId] = useState("");
  const [voteSelections, setVoteSelections] = useState<Record<string, string[]>>({});
  const [voteChangeReason, setVoteChangeReason] = useState("");

  const loadDetail = useCallback(async (assemblyId: string) => {
    if (!assemblyId) {
      setSelectedAssembly(null);
      return;
    }

    try {
      setDetailLoading(true);
      setError("");

      const response = await fetch(`/api/portal/assembleias/${assemblyId}`, {
        cache: "no-store",
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        setSelectedAssembly(null);
        setError(getErrorMessage(data, "Erro ao carregar assembleia."));
        return;
      }

      const payload = data as DetailResponse;
      selectedAssemblyIdRef.current = assemblyId;
      setSelectedAssembly(payload.assembly || null);
      setSelectedAssemblyId(assemblyId);
    } catch (err) {
      console.error(err);
      setSelectedAssembly(null);
      setError("Erro ao carregar assembleia.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const selectAssembly = useCallback((assemblyId: string) => {
    if (!assemblyId) return;

    // ETAPA 51.9.3.1 — a seleção manual é aplicada imediatamente.
    // O ref evita que a atualização da query string dispare uma nova
    // carga concorrente do mesmo detalhe.
    selectedAssemblyIdRef.current = assemblyId;
    lastHandledRequestedAssemblyIdRef.current = assemblyId;

    router.replace(
      `/portal/assembleias?assemblyId=${encodeURIComponent(assemblyId)}`,
      { scroll: false },
    );

    void loadDetail(assemblyId);
  }, [loadDetail, router]);

  const loadAssemblies = useCallback(async (
    { showLoading = true }: { showLoading?: boolean } = {},
  ) => {
    try {
      if (showLoading) setLoading(true);
      setError("");

      const response = await fetch("/api/portal/assembleias", {
        cache: "no-store",
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        setAssemblies([]);
        setError(getErrorMessage(data, "Erro ao carregar assembleias."));
        return;
      }

      const payload = data as ListResponse;
      const nextAssemblies = Array.isArray(payload.assemblies)
        ? payload.assemblies
        : [];

      setAssemblies(nextAssemblies);
      setKpis({
        total: payload.kpis?.total ?? 0,
        totalPending: payload.kpis?.totalPending ?? 0,
        open: payload.kpis?.open ?? 0,
        scheduled: payload.kpis?.scheduled ?? 0,
      });

      // ETAPA 51.9.1 — o parâmetro assemblyId é usado apenas como
      // seleção inicial. Depois que a pessoa escolhe outro card, a
      // seleção manual deve prevalecer para evitar retornar à
      // assembleia aberta pelo sino ou pelo e-mail.
      const targetId =
        requestedAssemblyIdRef.current ||
        selectedAssemblyIdRef.current ||
        nextAssemblies[0]?.id ||
        "";

      if (targetId) {
        await loadDetail(targetId);
      }
    } catch (err) {
      console.error(err);
      setAssemblies([]);
      setError("Erro ao carregar assembleias.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [loadDetail]);

  useEffect(() => {
    requestedAssemblyIdRef.current = requestedAssemblyId;

    if (!requestedAssemblyId) return;
    if (lastHandledRequestedAssemblyIdRef.current === requestedAssemblyId) return;

    // ETAPA 51.9.3.1 — uma nova notificação pode alterar apenas a
    // query string enquanto a página permanece montada. Nesse caso,
    // carregamos somente o detalhe indicado, sem reiniciar a listagem
    // completa nem exibir novamente a tela global de transição.
    lastHandledRequestedAssemblyIdRef.current = requestedAssemblyId;
    void loadDetail(requestedAssemblyId);
  }, [loadDetail, requestedAssemblyId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAssemblies();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAssemblies]);

  const submittedVoteKeys = useMemo(() => {
    return new Set(
      (selectedAssembly?.votes || []).map(
        (vote) => `${vote.agendaItemId}:${vote.eligibleUnitId}`,
      ),
    );
  }, [selectedAssembly]);

  const pendingVotes = useMemo(() => {
    if (!selectedAssembly) return 0;

    const deliberativeItems = selectedAssembly.agendaItems.filter(
      (item) => item.type !== "INFORMATIVE",
    );

    let pending = 0;

    for (const agendaItem of deliberativeItems) {
      for (const unit of selectedAssembly.votingUnits) {
        if (!submittedVoteKeys.has(`${agendaItem.id}:${unit.eligibleUnitId}`)) {
          pending += 1;
        }
      }
    }

    return pending;
  }, [selectedAssembly, submittedVoteKeys]);

  const selectedVoteUnit = useMemo(() => {
    return (
      selectedAssembly?.votingUnits.find(
        (unit) => unit.eligibleUnitId === selectedVoteUnitId,
      ) || null
    );
  }, [selectedAssembly, selectedVoteUnitId]);

  const deliberativeItems = useMemo(() => {
    return (selectedAssembly?.agendaItems || []).filter(
      (item) => item.type !== "INFORMATIVE",
    );
  }, [selectedAssembly]);

  const existingVotesForSelectedUnit = useMemo(() => {
    return (selectedAssembly?.votes || []).filter(
      (vote) => vote.eligibleUnitId === selectedVoteUnitId,
    );
  }, [selectedAssembly, selectedVoteUnitId]);

  const hasExistingVotesForSelectedUnit =
    existingVotesForSelectedUnit.length > 0;

  function openVoteModal(unit: VotingUnit) {
    if (!selectedAssembly?.votingOpen) {
      alert("A votação ainda não está aberta neste momento.");
      return;
    }

    const selections: Record<string, string[]> = {};

    for (const vote of selectedAssembly.votes) {
      if (vote.eligibleUnitId !== unit.eligibleUnitId) continue;

      selections[vote.agendaItemId] = vote.options.map(
        (option) => option.optionId,
      );
    }

    setSelectedVoteUnitId(unit.eligibleUnitId);
    setVoteSelections(selections);
    setVoteChangeReason("");
    setVoteModalOpen(true);
  }

  function toggleVoteOption(params: {
    agendaItem: AgendaItem;
    optionId: string;
  }) {
    setVoteSelections((previous) => {
      const current = previous[params.agendaItem.id] || [];

      if (params.agendaItem.type === "MULTIPLE_CHOICE") {
        const selectedOption = params.agendaItem.options.find(
          (option) => option.id === params.optionId,
        );
        const abstentionOptionIds = new Set(
          params.agendaItem.options
            .filter((option) => option.isAbstention)
            .map((option) => option.id),
        );

        if (selectedOption?.isAbstention) {
          return {
            ...previous,
            [params.agendaItem.id]: current.includes(params.optionId)
              ? []
              : [params.optionId],
          };
        }

        const choicesWithoutAbstention = current.filter(
          (item) => !abstentionOptionIds.has(item),
        );

        return {
          ...previous,
          [params.agendaItem.id]: choicesWithoutAbstention.includes(params.optionId)
            ? choicesWithoutAbstention.filter((item) => item !== params.optionId)
            : [...choicesWithoutAbstention, params.optionId],
        };
      }

      return {
        ...previous,
        [params.agendaItem.id]: [params.optionId],
      };
    });
  }

  async function handleSubmitVotes() {
    if (!selectedAssembly || !selectedVoteUnitId) {
      alert("Selecione uma unidade para votar.");
      return;
    }

    if (!selectedAssembly.votingOpen) {
      alert("A votação não está aberta neste momento.");
      return;
    }

    if (deliberativeItems.length === 0) {
      alert("Esta assembleia não possui pautas deliberativas.");
      return;
    }

    for (const item of deliberativeItems) {
      const optionIds = voteSelections[item.id] || [];

      if (item.type === "MULTIPLE_CHOICE") {
        if (optionIds.length === 0) {
          alert(`Selecione ao menos uma opção na pauta "${item.title}".`);
          return;
        }
      } else if (optionIds.length !== 1) {
        alert(`Selecione uma opção na pauta "${item.title}".`);
        return;
      }
    }

    if (
      hasExistingVotesForSelectedUnit &&
      selectedAssembly.allowVoteChange &&
      !voteChangeReason.trim()
    ) {
      alert("Informe o motivo da alteração do voto.");
      return;
    }

    if (
      hasExistingVotesForSelectedUnit &&
      !selectedAssembly.allowVoteChange
    ) {
      alert("Esta assembleia não permite alterar votos já registrados.");
      return;
    }

    const confirmation = hasExistingVotesForSelectedUnit
      ? "Confirmar a alteração do voto desta unidade? O histórico anterior será preservado."
      : "Confirmar o voto desta unidade?";

    if (!confirm(confirmation)) return;

    try {
      setVoteSaving(true);
      setError("");

      const response = await fetch(
        `/api/portal/assembleias/${selectedAssembly.id}/votos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eligibleUnitId: selectedVoteUnitId,
            changeReason: voteChangeReason.trim() || null,
            answers: deliberativeItems.map((item) => ({
              agendaItemId: item.id,
              optionIds: voteSelections[item.id] || [],
            })),
          }),
        },
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        alert(getErrorMessage(data, "Erro ao registrar voto."));
        return;
      }

      const payload = data as { message?: string };
      alert(payload.message || "Voto registrado com sucesso.");
      setVoteModalOpen(false);
      setVoteChangeReason("");
      await loadAssemblies({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar voto.");
    } finally {
      setVoteSaving(false);
    }
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando Assembleias"
        description="Preparando convocações, pautas e documentos disponíveis no portal..."
      />
    );
  }

  return (
    <PortalContextGuard
      fallbackTitle="Assembleias indisponíveis neste perfil de acesso"
      fallbackDescription="O módulo de assembleias é destinado aos perfis vinculados ao portal condominial."
    >
      <PortalShell
        current="assembleias"
        title="Assembleias"
        description="Consulte convocações, documentos oficiais e acompanhe suas pendências de votação."
      >
        <div className="space-y-6">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              Governança deliberativa
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Assembleias E Votação Pelo Celular
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
              Consulte convocações oficiais, documentos e pautas. As unidades que você pode representar ficam identificadas de forma transparente antes da votação.
            </p>
          </header>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Assembleias" value={kpis.total} description="Convocações disponíveis no portal." />
            <StatCard label="Em Votação" value={kpis.open} description="Assembleias atualmente abertas." />
            <StatCard label="Agendadas" value={kpis.scheduled} description="Convocações aguardando abertura." />
            <StatCard label="Pendências" value={kpis.totalPending} description="Assembleias com votos pendentes." />
          </section>

          {assemblies.length === 0 ? (
            <section className="rounded-[30px] border border-dashed border-[#CFE6D4] bg-white p-10 text-center shadow-sm">
              <h2 className="text-xl font-semibold text-[#17211B]">Nenhuma assembleia disponível</h2>
              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                Quando uma convocação for publicada para este condomínio, ela aparecerá aqui.
              </p>
            </section>
          ) : (
            <section className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
              <div className="space-y-3">
                {assemblies.map((assembly) => {
                  const selected = assembly.id === selectedAssemblyId;

                  return (
                    <button
                      key={assembly.id}
                      type="button"
                      onClick={() => selectAssembly(assembly.id)}
                      className={[
                        "w-full rounded-[26px] border p-5 text-left shadow-sm transition",
                        selected
                          ? "border-[#8ED08E] bg-[#EAF7EE]"
                          : "border-[#DDE5DF] bg-white hover:border-[#8ED08E]",
                      ].join(" ")}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                            {assembly.condominium?.name || "Condomínio"}
                          </p>
                          <h2 className="mt-2 text-lg font-semibold tracking-tight text-[#17211B]">
                            {assembly.title}
                          </h2>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(assembly.status)}`}>
                          {statusLabel(assembly.status)}
                        </span>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
                        {excerpt(assembly.description)}
                      </p>

                      <div className="mt-4 grid gap-2 text-xs font-semibold text-[#5E6B63] sm:grid-cols-2">
                        <span>Assembleia: {formatDateTime(assembly.scheduledStartAt)}</span>
                        <span>Modalidade: {modeLabel(assembly.mode)}</span>
                        <span>Unidades: {assembly.votingUnits.length}</span>
                        <span>Pendências: {assembly.pendingVotes}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div>
                {detailLoading ? (
                  <section className="rounded-[30px] border border-[#DDE5DF] bg-white p-8 text-sm font-semibold text-[#5E6B63] shadow-sm">
                    Carregando detalhe da assembleia...
                  </section>
                ) : selectedAssembly ? (
                  <section className="space-y-5 rounded-[30px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)] md:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                          Convocação oficial
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                          {selectedAssembly.title}
                        </h2>
                        <p className="mt-2 text-sm text-[#5E6B63]">
                          {selectedAssembly.condominium?.name || "Condomínio"} · {modeLabel(selectedAssembly.mode)}
                        </p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(selectedAssembly.status)}`}>
                        {statusLabel(selectedAssembly.status)}
                      </span>
                    </div>

                    <div className="grid gap-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm text-[#5E6B63] sm:grid-cols-2">
                      <p><strong className="text-[#17211B]">Assembleia:</strong> {formatDateTime(selectedAssembly.scheduledStartAt)}</p>
                      <p><strong className="text-[#17211B]">Encerramento:</strong> {formatDateTime(selectedAssembly.scheduledEndAt)}</p>
                      <p><strong className="text-[#17211B]">Início Da Votação:</strong> {formatDateTime(selectedAssembly.votingStartsAt)}</p>
                      <p><strong className="text-[#17211B]">Fim Da Votação:</strong> {formatDateTime(selectedAssembly.votingEndsAt)}</p>
                      <p><strong className="text-[#17211B]">Local:</strong> {selectedAssembly.location || "Não informado"}</p>
                      <p><strong className="text-[#17211B]">Pendências:</strong> {pendingVotes}</p>
                    </div>

                    <article className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4">
                      <h3 className="text-sm font-bold text-[#256D3C]">Texto Da Convocação</h3>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#375744]">
                        {selectedAssembly.convocationText || "Texto não informado."}
                      </p>
                    </article>

                    <article>
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">Participação</p>
                          <h3 className="mt-1 text-lg font-semibold text-[#17211B]">Unidades Que Você Pode Representar</h3>
                        </div>
                        {selectedAssembly.votingOpen && pendingVotes > 0 && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                            {pendingVotes} voto(s) pendente(s)
                          </span>
                        )}
                      </div>

                      {selectedAssembly.votingUnits.length === 0 ? (
                        <p className="mt-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm leading-6 text-[#5E6B63]">
                          Este perfil pode consultar a assembleia, mas não possui unidade habilitada para votar. Caso exista uma procuração válida, solicite o registro à administradora.
                        </p>
                      ) : (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {selectedAssembly.votingUnits.map((unit) => {
                            const unitVotes = selectedAssembly.votes.filter(
                              (vote) => vote.eligibleUnitId === unit.eligibleUnitId,
                            );
                            const hasVote = unitVotes.length > 0;

                            return (
                              <div key={unit.eligibleUnitId} className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                                <p className="text-sm font-bold text-[#17211B]">{unitLabel(unit)}</p>
                                <p className="mt-1 text-xs font-semibold text-[#5E6B63]">{originLabel(unit.origin)}</p>
                                <p className="mt-2 text-xs text-[#7A877F]">Peso do voto: {unit.votingWeight}</p>

                                {hasVote && (
                                  <p className="mt-3 text-xs font-semibold text-[#256D3C]">
                                    Voto registrado nesta unidade.
                                  </p>
                                )}

                                {selectedAssembly.votingOpen && (
                                  <button
                                    type="button"
                                    onClick={() => openVoteModal(unit)}
                                    className="mt-4 inline-flex h-10 items-center rounded-xl bg-[#256D3C] px-4 text-xs font-bold text-white transition hover:bg-[#1E5A32]"
                                  >
                                    {hasVote ? "Consultar Ou Alterar Voto" : "Votar Agora"}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>

                    <article>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">Documentos</p>
                      <h3 className="mt-1 text-lg font-semibold text-[#17211B]">Arquivos Oficiais</h3>

                      {selectedAssembly.attachments.length === 0 ? (
                        <p className="mt-3 text-sm text-[#5E6B63]">Nenhum documento geral disponível.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {selectedAssembly.attachments.map((attachment) => (
                            <a
                              key={attachment.id}
                              href={getPortalAttachmentHref({
                                assemblyId: selectedAssembly.id,
                                attachmentId: attachment.id,
                              })}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between gap-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-semibold text-[#256D3C] transition hover:border-[#8ED08E] hover:bg-[#EAF7EE]"
                            >
                              <span className="min-w-0 truncate">{attachment.originalName}</span>
                              <span className="shrink-0 text-xs text-[#5E6B63]">{formatFileSize(attachment.sizeBytes)}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </article>

                    <article>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">Pautas</p>
                      <h3 className="mt-1 text-lg font-semibold text-[#17211B]">Deliberações E Itens Informativos</h3>

                      <div className="mt-3 space-y-3">
                        {selectedAssembly.agendaItems.map((item) => (
                          <div key={item.id} className="rounded-2xl border border-[#DDE5DF] bg-white p-4 shadow-sm">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">Pauta {item.order}</p>
                            <h4 className="mt-1 text-base font-semibold text-[#17211B]">{item.title}</h4>
                            <p className="mt-2 text-sm leading-6 text-[#5E6B63]">{excerpt(item.description, 260)}</p>

                            {item.originAgendaItem?.assembly && (
                              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold leading-5 text-blue-800">
                                Pauta retomada da assembleia “{item.originAgendaItem.assembly.title}”.
                              </div>
                            )}

                            {selectedAssembly.status === "RESULTS_PUBLISHED" && item.resultStatus && (
                              <div className="mt-3 space-y-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                                    Resultado Oficial
                                  </p>
                                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${resultStatusClass(item.resultStatus)}`}>
                                    {resultStatusLabel(item.resultStatus)}
                                  </span>
                                </div>

                                <p className="text-sm font-medium leading-6 text-[#5E6B63]">
                                  {item.resultSummary || "Resultado publicado pela administradora."}
                                </p>

                                <div className="rounded-xl border border-[#DDE5DF] bg-white p-3">
                                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                                    Transparência Da Votação
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-[#17211B]">
                                    {voteVisibilityLabel(item.voteVisibility)}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-[#5E6B63]">
                                    {voteVisibilityDescription(item.voteVisibility)}
                                  </p>
                                </div>

                                {item.publicResult && (
                                  <div className="space-y-3">
                                    <div className="grid gap-2 text-xs font-semibold text-[#5E6B63] sm:grid-cols-2">
                                      <span>Unidades Participantes: {item.publicResult.participatingUnits}</span>
                                      <span>Peso Participante: {formatVotingWeight(item.publicResult.participatingWeight)}</span>
                                      <span>Abstenções: {item.publicResult.abstentionUnits}</span>
                                      <span>Peso Válido: {formatVotingWeight(item.publicResult.validWeight)}</span>
                                    </div>

                                    {item.publicResult.options.length > 0 && (
                                      <div className="overflow-hidden rounded-xl border border-[#DDE5DF] bg-white">
                                        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[#DDE5DF] bg-[#F6F8F7] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#7A877F]">
                                          <span>Opção</span>
                                          <span>Votos</span>
                                          <span>Peso</span>
                                        </div>
                                        {item.publicResult.options.map((option) => (
                                          <div
                                            key={option.optionId}
                                            className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[#EEF2EF] px-3 py-2 text-xs font-semibold text-[#5E6B63] last:border-b-0"
                                          >
                                            <span>{option.label}{option.isAbstention ? " · Abstenção" : ""}</span>
                                            <span>{option.votes}</span>
                                            <span>{formatVotingWeight(option.weight)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {item.voteVisibility === "NOMINAL_BY_UNIT" &&
                                      item.publicResult.nominalVotes.length > 0 && (
                                        <div className="overflow-hidden rounded-xl border border-[#DDE5DF] bg-white">
                                          <div className="border-b border-[#DDE5DF] bg-[#F6F8F7] px-3 py-2">
                                            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7A877F]">
                                              Detalhamento Nominal Por Unidade
                                            </p>
                                          </div>
                                          {item.publicResult.nominalVotes.map((vote) => (
                                            <div
                                              key={vote.voteId}
                                              className="grid gap-1 border-b border-[#EEF2EF] px-3 py-3 text-xs font-semibold text-[#5E6B63] last:border-b-0 sm:grid-cols-[1fr_auto_auto]"
                                            >
                                              <span>{vote.unitLabel}</span>
                                              <span>{vote.optionLabels.join(", ") || "Sem Opção Registrada"}</span>
                                              <span>
                                                {formatVotingWeight(vote.votingWeight)} · {originLabel(vote.origin)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                                {agendaTypeLabel(item.type)}
                              </span>
                              {item.options.map((option) => (
                                <span key={option.id} className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                                  {option.label}
                                </span>
                              ))}
                            </div>

                            {item.attachments.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {item.attachments.map((attachment) => (
                                  <a
                                    key={attachment.id}
                                    href={getPortalAttachmentHref({
                                      assemblyId: selectedAssembly.id,
                                      attachmentId: attachment.id,
                                    })}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block text-xs font-semibold text-[#256D3C] hover:underline"
                                  >
                                    Documento: {attachment.originalName}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </article>

                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                      <strong>Votação auditável:</strong> cada resposta é registrada por unidade e pauta. Quando a alteração estiver liberada pela assembleia, a nova versão preservará o histórico anterior.
                    </div>

                    {selectedAssembly.externalMeetingUrl && (
                      <Link
                        href={selectedAssembly.externalMeetingUrl}
                        target="_blank"
                        className="inline-flex h-11 items-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E5A32]"
                      >
                        Acessar Reunião
                      </Link>
                    )}
                  </section>
                ) : (
                  <section className="rounded-[30px] border border-[#DDE5DF] bg-white p-8 text-sm text-[#5E6B63] shadow-sm">
                    Selecione uma assembleia para consultar os detalhes.
                  </section>
                )}
              </div>
            </section>
          )}

        {voteModalOpen && selectedAssembly && selectedVoteUnit && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17211B]/60 p-4">
            <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-2xl md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
                    Votação Pelo Celular
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#17211B]">
                    Confirmar Voto Da Unidade {unitLabel(selectedVoteUnit)}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                    Origem do direito: {originLabel(selectedVoteUnit.origin)}. Revise cada pauta antes de confirmar.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setVoteModalOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#DDE5DF] text-lg font-bold text-[#5E6B63] transition hover:bg-[#F6F8F7]"
                  aria-label="Fechar votação"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {deliberativeItems.map((item) => {
                  const selectedOptions = voteSelections[item.id] || [];
                  const multiple = item.type === "MULTIPLE_CHOICE";

                  return (
                    <section
                      key={item.id}
                      className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                        Pauta {item.order}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-[#17211B]">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                        {excerpt(item.description, 260)}
                      </p>
                      <p className="mt-3 text-xs font-semibold text-[#256D3C]">
                        {multiple
                          ? "Selecione uma ou mais opções."
                          : "Selecione uma opção."}
                      </p>

                      <div className="mt-3 grid gap-2">
                        {item.options.map((option) => {
                          const checked = selectedOptions.includes(option.id);

                          return (
                            <label
                              key={option.id}
                              className={[
                                "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm transition",
                                checked
                                  ? "border-[#8ED08E] bg-[#EAF7EE] text-[#256D3C]"
                                  : "border-[#DDE5DF] bg-white text-[#5E6B63] hover:border-[#8ED08E]",
                              ].join(" ")}
                            >
                              <input
                                type={multiple ? "checkbox" : "radio"}
                                name={`agenda-${item.id}`}
                                checked={checked}
                                onChange={() =>
                                  toggleVoteOption({
                                    agendaItem: item,
                                    optionId: option.id,
                                  })
                                }
                                className="mt-0.5"
                              />
                              <span>
                                <strong className="block text-[#17211B]">
                                  {option.label}
                                </strong>
                                {option.description && (
                                  <span className="mt-1 block text-xs leading-5 text-[#5E6B63]">
                                    {option.description}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>

              {hasExistingVotesForSelectedUnit && selectedAssembly.allowVoteChange && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <label className="text-sm font-semibold text-amber-900">
                    Motivo Da Alteração
                  </label>
                  <textarea
                    value={voteChangeReason}
                    onChange={(event) => setVoteChangeReason(event.target.value)}
                    rows={3}
                    placeholder="Descreva brevemente por que o voto será alterado."
                    className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-[#17211B] outline-none transition focus:border-amber-400"
                  />
                </div>
              )}

              {hasExistingVotesForSelectedUnit && !selectedAssembly.allowVoteChange && (
                <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                  O voto desta unidade já foi registrado e esta assembleia não permite alterações.
                </div>
              )}

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setVoteModalOpen(false)}
                  className="inline-flex h-11 items-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63] transition hover:bg-[#F6F8F7]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmitVotes()}
                  disabled={
                    voteSaving ||
                    (hasExistingVotesForSelectedUnit &&
                      !selectedAssembly.allowVoteChange)
                  }
                  className="inline-flex h-11 items-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E5A32] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {voteSaving
                    ? "Registrando..."
                    : hasExistingVotesForSelectedUnit
                      ? "Confirmar Alteração"
                      : "Confirmar Voto"}
                </button>
              </div>
            </div>
          </div>
        )}

        </div>
      </PortalShell>
    </PortalContextGuard>
  );
}

export default function PortalAssembleiasPage() {
  return (
    <Suspense
      fallback={
        <EloGestLoadingScreen
          title="Carregando Assembleias"
          description="Preparando convocações, pautas e documentos disponíveis no portal..."
        />
      }
    >
      <PortalAssembleiasPageContent />
    </Suspense>
  );
}
