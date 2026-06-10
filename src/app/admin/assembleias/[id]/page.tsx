"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   DETALHE DA ASSEMBLEIA - PÁGINA ADMINISTRATIVA

   Arquivo:
   src/app/admin/assembleias/[id]/page.tsx

   ELOGEST — ETAPA 52.5.1

   Objetivo:
   - Exibir a visão operacional da assembleia.
   - Editar dados gerais durante a preparação.
   - Cadastrar, editar e remover pautas.
   - Configurar opções de voto e regras transparentes de quórum.
   - Exibir trilha inicial de auditoria.
   - Gerar e revisar fotografia de unidades elegíveis.
   - Bloquear, liberar, remover e ajustar peso de voto por unidade.
   - Cadastrar, editar, revogar e reativar procurações por unidade.

   ETAPA 51.6:
   - Convocação oficial;
   - Anexos gerais e vinculados a pautas;
   - Checklist mínimo;
   - Publicação formal com congelamento estrutural.

   ETAPA 51.7.1:
   - Corrigida sincronização das unidades aptas com o formulário de procurações.
   - Permitido registrar procurações enquanto a votação ainda estiver vigente.
   - Adicionado botão administrativo para envio manual de lembrete de votação.

   ETAPA 51.8.2.1:
   - Adicionado ciclo operacional da assembleia.
   - Administradora pode abrir assembleia agendada após publicar a convocação.
   - Administradora pode encerrar assembleia em andamento.
   - Abertura libera o portal para votação dentro da janela programada.
   - Encerramento bloqueia novos votos e preserva os registros existentes.

   Próximos blocos:
   - apuração administrativa;
   - publicação dos resultados.
   ========================================================= */

type AssemblyType = "ORDINARY" | "EXTRAORDINARY" | "SPECIAL" | "OTHER";
type AssemblyStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "RESULTS_PUBLISHED"
  | "CANCELED"
  | "ARCHIVED";
type MeetingMode = "PRESENTIAL" | "ONLINE" | "HYBRID";
type AgendaItemType =
  | "INFORMATIVE"
  | "APPROVE_REJECT_ABSTAIN"
  | "YES_NO_ABSTAIN"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE";
type QuorumRuleType =
  | "SIMPLE_MAJORITY"
  | "MINIMUM_PARTICIPATION"
  | "MINIMUM_APPROVAL"
  | "CUSTOM";

type VoteVisibility = "CONSOLIDATED" | "NOMINAL_BY_UNIT" | "SECRET";

type EligibilityStatus = "ELIGIBLE" | "BLOCKED";
type RepresentationStatus = "ACTIVE" | "REVOKED" | "EXPIRED";
type RepresentationType = "PROXY" | "AUTHORIZATION" | "OTHER";
type RepresentativeMode = "INTERNAL" | "EXTERNAL";
type GrantorMode = "INTERNAL" | "DOCUMENT_ONLY";

type TabKey = "overview" | "agenda" | "eligibility" | "representations" | "convocation" | "results" | "minute" | "voteAudit" | "audit";

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

interface Condominio {
  id: string;
  name: string;
}

interface AgendaOptionItem {
  id?: string;
  label: string;
  description?: string | null;
  order: number;
  isAbstention: boolean;
}

interface AgendaItem {
  id: string;
  order: number;
  title: string;
  description?: string | null;
  type: AgendaItemType;
  status: string;
  quorumRuleType: QuorumRuleType;
  voteVisibility: VoteVisibility;
  minimumParticipationPct?: string | number | null;
  minimumApprovalPct?: string | number | null;
  customRuleDescription?: string | null;
  votingStartsAt?: string | null;
  votingEndsAt?: string | null;
  resultStatus: string;
  options: AgendaOptionItem[];
  _count?: {
    votes?: number;
    attachments?: number;
  };
}

interface AssemblyLogItem {
  id: string;
  action: string;
  message?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}


interface UnitItem {
  id: string;
  block?: string | null;
  unitNumber: string;
  unitType?: string | null;
  status?: string | null;
}

interface EligibleUnitItem {
  id: string;
  assemblyId: string;
  unitId: string;
  snapshotBlock?: string | null;
  snapshotUnitNumber: string;
  status: EligibilityStatus;
  blockedReason?: string | null;
  votingWeight: string | number;
  unit?: UnitItem | null;
}

interface EligibilityMetrics {
  total: number;
  eligible: number;
  blocked: number;
  totalWeight: number;
  eligibleWeight: number;
}

interface EligibilityResponse {
  eligibleUnits?: EligibleUnitItem[];
  availableUnits?: UnitItem[];
  metrics?: EligibilityMetrics;
  snapshotAt?: string | null;
  canEdit?: boolean;
  message?: string;
  error?: string;
}

interface EligibleUnitFormState {
  unitId: string;
  status: EligibilityStatus;
  blockedReason: string;
  votingWeight: string;
}

interface CandidateAccessItem {
  id: string;
  role?: string | null;
  label?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
}

interface CandidateUserItem {
  id: string;
  name: string;
  email: string;
  accesses?: CandidateAccessItem[];
}

interface RepresentationMetadata {
  representationType?: RepresentationType | null;
  representativeMode?: RepresentativeMode | null;
  grantorMode?: GrantorMode | null;
  externalGrantorName?: string | null;
}

interface RepresentationItem {
  id: string;
  assemblyId: string;
  unitId: string;
  grantorUserId?: string | null;
  representativeUserId?: string | null;
  representativeAccessId?: string | null;
  externalRepresentativeName?: string | null;
  externalRepresentativeEmail?: string | null;
  externalRepresentativePhone?: string | null;
  externalRepresentativeDocument?: string | null;
  status: RepresentationStatus;
  validFrom?: string | null;
  validUntil?: string | null;
  documentUrl?: string | null;
  documentName?: string | null;
  notes?: string | null;
  metadata?: RepresentationMetadata | null;
  revokedAt?: string | null;
  revokedReason?: string | null;
  unit?: {
    id: string;
    block?: string | null;
    unitNumber?: string | null;
  } | null;
  grantorUser?: CandidateUserItem | null;
  representativeUser?: CandidateUserItem | null;
  representativeAccess?: CandidateAccessItem | null;
  createdByUser?: CandidateUserItem | null;
  revokedByUser?: CandidateUserItem | null;
  _count?: {
    votes?: number;
  };
}

interface RepresentationMetrics {
  total: number;
  active: number;
  revoked: number;
  expired: number;
}

interface RepresentationsResponse {
  representations?: RepresentationItem[];
  eligibleUnits?: EligibleUnitItem[];
  metrics?: RepresentationMetrics;
  canEdit?: boolean;
  message?: string;
  error?: string;
}

interface RepresentationCandidatesResponse {
  grantors?: CandidateUserItem[];
  representatives?: CandidateUserItem[];
  minimumRepresentativeQueryLength?: number;
  error?: string;
}

interface RepresentationFormState {
  eligibleUnitId: string;
  grantorMode: GrantorMode;
  grantorUserId: string;
  externalGrantorName: string;
  representativeMode: RepresentativeMode;
  representativeUserId: string;
  representativeAccessId: string;
  externalRepresentativeName: string;
  externalRepresentativeEmail: string;
  externalRepresentativePhone: string;
  externalRepresentativeDocument: string;
  representationType: RepresentationType;
  validFrom: string;
  validUntil: string;
  documentUrl: string;
  documentName: string;
  notes: string;
}


type AttachmentScope = "CONVOCATION" | "AGENDA_ITEM" | "RESULT" | "OTHER";
type AttachmentDocumentType = "NOTICE" | "SUPPORT" | "OTHER";

interface AssemblyAttachmentItem {
  id: string;
  assemblyId: string;
  agendaItemId?: string | null;
  scope: AttachmentScope;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  description?: string | null;
  metadata?: {
    documentType?: AttachmentDocumentType | null;
  } | null;
  createdAt: string;
  agendaItem?: {
    id: string;
    title: string;
    order: number;
  } | null;
  uploadedByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

interface AttachmentsResponse {
  attachments?: AssemblyAttachmentItem[];
  canEdit?: boolean;
  message?: string;
  error?: string;
}

interface ResultOptionTally {
  optionId: string;
  label: string;
  isAbstention: boolean;
  votes: number;
  weight: number;
  weightPctOfParticipation: number;
  weightPctOfValidVotes: number;
}

interface ResultAgendaTally {
  agendaItemId: string;
  order: number;
  title: string;
  type: AgendaItemType;
  quorumRuleType: QuorumRuleType;
  resultStatus: string;
  resultSummary: string;
  totalEligibleUnits: number;
  totalEligibleWeight: number;
  participatingUnits: number;
  participatingWeight: number;
  participationPct: number;
  abstentionUnits: number;
  abstentionWeight: number;
  validWeight: number;
  approvalPct: number;
  deferredReason?: string | null;
  deferredNotes?: string | null;
  options: ResultOptionTally[];
}

interface AssemblyTally {
  assemblyId: string;
  title: string;
  status: AssemblyStatus;
  resultsPublishedAt?: string | null;
  totalEligibleUnits: number;
  totalEligibleWeight: number;
  deliberativeAgendaItems: number;
  informationalAgendaItems: number;
  agendaItems: ResultAgendaTally[];
  blockingReasons: string[];
  canPublishResults: boolean;
}

interface TallyResponse {
  tally?: AssemblyTally;
  notifiedUsers?: number;
  message?: string;
  error?: string;
}

type VoteAuditOrigin =
  | "DIRECT_UNIT_LINK"
  | "PROXY_REPRESENTATION"
  | "AUTHORIZED_LINK"
  | "ADMINISTRATIVE_IMPORT";

interface VoteAuditUserItem {
  id: string;
  name?: string | null;
  email?: string | null;
}

interface VoteAuditRevisionItem {
  id: string;
  version: number;
  reason?: string | null;
  optionIds?: string[];
  optionLabels?: string[];
  createdAt: string;
  changedByUser?: VoteAuditUserItem | null;
}

interface VoteAuditItem {
  id: string;
  version: number;
  changed: boolean;
  origin: VoteAuditOrigin;
  originLabel: string;
  submittedAt: string;
  updatedAt: string;
  agendaItem: {
    id: string;
    order: number;
    title: string;
    voteVisibility: VoteVisibility;
  };
  eligibleUnit: {
    id: string;
    unitId: string;
    block?: string | null;
    unitNumber: string;
    label: string;
    votingWeight: string | number;
  };
  voter: VoteAuditUserItem;
  voterAccess?: {
    id: string;
    role?: string | null;
    label?: string | null;
  } | null;
  unitPersonLink?: {
    id: string;
    linkType?: string | null;
  } | null;
  representation?: {
    id: string;
    status?: string | null;
    documentUrl?: string | null;
    documentName?: string | null;
    representativeUser?: VoteAuditUserItem | null;
    externalRepresentativeName?: string | null;
    externalRepresentativeEmail?: string | null;
  } | null;
  options: Array<{
    id: string;
    label: string;
    isAbstention: boolean;
  }>;
  revisions: VoteAuditRevisionItem[];
}

interface VoteAuditAgendaItem {
  id: string;
  order: number;
  title: string;
  voteVisibility: VoteVisibility;
}

interface VoteAuditResponse {
  assembly?: {
    id: string;
    title: string;
    status: AssemblyStatus;
    resultsPublishedAt?: string | null;
  };
  agendaItems?: VoteAuditAgendaItem[];
  metrics?: {
    total: number;
    changed: number;
    byRepresentation: number;
    secret: number;
    nominal: number;
  };
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  votes?: VoteAuditItem[];
  error?: string;
  message?: string;
}

interface VoteAuditFilters {
  agendaItemId: string;
  origin: string;
  visibility: string;
  changedOnly: boolean;
  query: string;
}

const emptyVoteAuditFilters: VoteAuditFilters = {
  agendaItemId: "",
  origin: "",
  visibility: "",
  changedOnly: false,
  query: "",
};

const emptyVoteAuditMetrics = {
  total: 0,
  changed: 0,
  byRepresentation: 0,
  secret: 0,
  nominal: 0,
};

type AssemblyMinuteStatus =
  | "DRAFT"
  | "GENERATED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "ARCHIVED";

type AssemblyMinuteGenerationMode = "STRUCTURED" | "AI_ASSISTED" | "MANUAL";

type AssemblyMinuteVersionSource =
  | "STRUCTURED_GENERATION"
  | "AI_ASSISTED_GENERATION"
  | "MANUAL_REVISION"
  | "APPROVAL_SNAPSHOT"
  | "PUBLICATION_SNAPSHOT";

type AssemblyMinuteAction =
  | "GENERATE_STRUCTURED"
  | "REGENERATE_STRUCTURED"
  | "GENERATE_AI_ASSISTED"
  | "SUBMIT_FOR_REVIEW"
  | "MARK_REVIEWED"
  | "APPROVE"
  | "PUBLISH"
  | "ARCHIVE";

interface MinuteUserItem {
  id: string;
  name?: string | null;
  email?: string | null;
}

interface AssemblyMinuteVersionItem {
  id: string;
  version: number;
  source: AssemblyMinuteVersionSource;
  title: string;
  executiveSummary?: string | null;
  content: string;
  warnings?: unknown;
  metadata?: unknown;
  createdAt: string;
  createdByUser?: MinuteUserItem | null;
}

interface AssemblyMinuteLogItem {
  id: string;
  action: string;
  message?: string | null;
  metadata?: unknown;
  createdAt: string;
  user?: MinuteUserItem | null;
}

interface AssemblyMinuteItem {
  id: string;
  assemblyId: string;
  status: AssemblyMinuteStatus;
  generationMode: AssemblyMinuteGenerationMode;
  title: string;
  executiveSummary?: string | null;
  content: string;
  warnings?: unknown;
  metadata?: unknown;
  currentVersion: number;
  generatedAt?: string | null;
  generatedByUser?: MinuteUserItem | null;
  reviewedAt?: string | null;
  reviewedByUser?: MinuteUserItem | null;
  approvedAt?: string | null;
  approvedByUser?: MinuteUserItem | null;
  publishedAt?: string | null;
  publishedByUser?: MinuteUserItem | null;
  archivedAt?: string | null;
  archivedByUser?: MinuteUserItem | null;
  officialPdfUrl?: string | null;
  officialPdfName?: string | null;
  officialPdfMimeType?: string | null;
  officialPdfSizeBytes?: number | null;
  officialPdfHash?: string | null;
  officialPdfGeneratedAt?: string | null;
  versions: AssemblyMinuteVersionItem[];
  logs: AssemblyMinuteLogItem[];
}

interface AssemblyMinutePermissions {
  canGenerateStructuredMinute: boolean;
  canRegenerateStructuredMinute: boolean;
  canGenerateAiAssistedMinute: boolean;
  canEditMinute: boolean;
  canSubmitForReview: boolean;
  canMarkReviewed: boolean;
  canApproveMinute: boolean;
  canPublishMinute: boolean;
  canArchiveMinute: boolean;
}

interface AssemblyMinuteAiConfiguration {
  configured: boolean;
  provider: "OPENAI";
  model: string;
  promptVersion: string;
}

interface AssemblyMinuteResponse {
  minute?: AssemblyMinuteItem | null;
  permissions?: Partial<AssemblyMinutePermissions>;
  aiConfiguration?: Partial<AssemblyMinuteAiConfiguration>;
  message?: string;
  error?: string;
}

interface AssemblyMinuteFormState {
  title: string;
  executiveSummary: string;
  content: string;
}

const emptyMinutePermissions: AssemblyMinutePermissions = {
  canGenerateStructuredMinute: false,
  canRegenerateStructuredMinute: false,
  canGenerateAiAssistedMinute: false,
  canEditMinute: false,
  canSubmitForReview: false,
  canMarkReviewed: false,
  canApproveMinute: false,
  canPublishMinute: false,
  canArchiveMinute: false,
};

const emptyMinuteForm: AssemblyMinuteFormState = {
  title: "",
  executiveSummary: "",
  content: "",
};

const emptyMinuteAiConfiguration: AssemblyMinuteAiConfiguration = {
  configured: false,
  provider: "OPENAI",
  model: "gpt-5.4-mini",
  promptVersion: "assembly-minute-ai-52.6.0",
};

interface DeferAgendaFormState {
  agendaItemId: string;
  title: string;
  deferredReason: "TIE" | "NO_QUORUM" | "BUDGET_REVIEW" | "MORE_INFORMATION" | "POSTPONE" | "OTHER";
  deferredNotes: string;
}

const emptyDeferAgendaForm: DeferAgendaFormState = {
  agendaItemId: "",
  title: "",
  deferredReason: "TIE",
  deferredNotes: "",
};

interface AttachmentFormState {
  scope: AttachmentScope;
  documentType: AttachmentDocumentType;
  agendaItemId: string;
  description: string;
}

const emptyAttachmentForm: AttachmentFormState = {
  scope: "CONVOCATION",
  documentType: "NOTICE",
  agendaItemId: "",
  description: "",
};

interface VotingExtensionFormState {
  newVotingEndsAt: string;
  reason: string;
  notifyParticipants: boolean;
  extendSpecificAgendaItems: boolean;
}

const emptyVotingExtensionForm: VotingExtensionFormState = {
  newVotingEndsAt: "",
  reason: "",
  notifyParticipants: true,
  extendSpecificAgendaItems: false,
};

interface AssemblyDetail {
  id: string;
  title: string;
  description?: string | null;
  condominiumId: string;
  condominium?: Condominio | null;
  type: AssemblyType;
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
  internalNotes?: string | null;
  allowVoteChange: boolean;
  eligibilitySnapshotAt?: string | null;
  convocationPublishedAt?: string | null;
  resultsPublishedAt?: string | null;
  convocationPublishedByUserId?: string | null;
  convocationPublishedByUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  agendaItems: AgendaItem[];
  logs: AssemblyLogItem[];
  _count?: {
    agendaItems?: number;
    eligibleUnits?: number;
    votes?: number;
    attachments?: number;
    representations?: number;
    logs?: number;
    notifications?: number;
  };
}

interface AssemblyResponse {
  assembly?: AssemblyDetail;
  error?: string;
  message?: string;
}

interface GeneralFormState {
  title: string;
  description: string;
  condominiumId: string;
  type: AssemblyType;
  mode: MeetingMode;
  scheduledStartAt: string;
  scheduledEndAt: string;
  votingStartsAt: string;
  votingEndsAt: string;
  location: string;
  externalMeetingUrl: string;
  accessInstructions: string;
  convocationText: string;
  internalNotes: string;
  allowVoteChange: boolean;
}

interface AgendaOptionFormState {
  id?: string;
  label: string;
  description: string;
  isAbstention: boolean;
}

interface AgendaFormState {
  title: string;
  description: string;
  type: AgendaItemType;
  quorumRuleType: QuorumRuleType;
  voteVisibility: VoteVisibility;
  minimumParticipationPct: string;
  minimumApprovalPct: string;
  customRuleDescription: string;
  useAssemblyVotingWindow: boolean;
  votingStartsAt: string;
  votingEndsAt: string;
  allowAbstention: boolean;
  options: AgendaOptionFormState[];
}

const emptyAgendaForm: AgendaFormState = {
  title: "",
  description: "",
  type: "APPROVE_REJECT_ABSTAIN",
  quorumRuleType: "SIMPLE_MAJORITY",
  voteVisibility: "CONSOLIDATED",
  minimumParticipationPct: "",
  minimumApprovalPct: "",
  customRuleDescription: "",
  useAssemblyVotingWindow: true,
  votingStartsAt: "",
  votingEndsAt: "",
  allowAbstention: false,
  options: [],
};


const emptyEligibleUnitForm: EligibleUnitFormState = {
  unitId: "",
  status: "ELIGIBLE",
  blockedReason: "",
  votingWeight: "1",
};

const emptyEligibilityMetrics: EligibilityMetrics = {
  total: 0,
  eligible: 0,
  blocked: 0,
  totalWeight: 0,
  eligibleWeight: 0,
};

const emptyRepresentationMetrics: RepresentationMetrics = {
  total: 0,
  active: 0,
  revoked: 0,
  expired: 0,
};

const emptyRepresentationForm: RepresentationFormState = {
  eligibleUnitId: "",
  grantorMode: "INTERNAL",
  grantorUserId: "",
  externalGrantorName: "",
  representativeMode: "INTERNAL",
  representativeUserId: "",
  representativeAccessId: "",
  externalRepresentativeName: "",
  externalRepresentativeEmail: "",
  externalRepresentativePhone: "",
  externalRepresentativeDocument: "",
  representationType: "PROXY",
  validFrom: "",
  validUntil: "",
  documentUrl: "",
  documentName: "",
  notes: "",
};

function getApiErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const payload = data as ApiErrorResponse;
    return payload.error || payload.message || fallback;
  }
  return fallback;
}

async function readApiResponse(response: Response): Promise<unknown> {
  const rawText = await response.text();
  if (!rawText.trim()) return {};

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return {
      error:
        response.status === 404
          ? "A rota solicitada ainda não foi encontrada pelo Next.js. Confira os arquivos da Etapa 51.3 e reinicie o servidor local."
          : "A API retornou uma resposta inválida. Reinicie o servidor local e tente novamente.",
    };
  }
}

function normalizeDateTimeForApi(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
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


function formatVotingWeight(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "1";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 6,
  }).format(numericValue);
}

function representationStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    ACTIVE: "Ativa",
    REVOKED: "Revogada",
    EXPIRED: "Expirada",
  };
  return labels[status || ""] || status || "-";
}

function representationTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    PROXY: "Procuração",
    AUTHORIZATION: "Autorização específica",
    OTHER: "Outro instrumento",
  };
  return labels[type || ""] || type || "Procuração";
}

function candidateUserLabel(user?: CandidateUserItem | null) {
  if (!user) return "Pessoa não informada";
  return `${user.name}${user.email ? ` · ${user.email}` : ""}`;
}

function candidateAccessLabel(access?: CandidateAccessItem | null) {
  if (!access) return "Sem Perfil Específico";
  return access.label || access.role || "Perfil De Acesso";
}

function representativeDisplayName(item: RepresentationItem) {
  return item.representativeUser?.name || item.externalRepresentativeName || "Representante não informado";
}

function representativeDisplayDetail(item: RepresentationItem) {
  return (
    item.representativeAccess?.label ||
    item.representativeUser?.email ||
    item.externalRepresentativeEmail ||
    "Cadastro externo"
  );
}

function grantorDisplayName(item: RepresentationItem) {
  return item.grantorUser?.name || item.metadata?.externalGrantorName || "Conforme documento";
}

function representationIsExpired(item: RepresentationItem) {
  if (item.status === "EXPIRED") return true;
  if (item.status !== "ACTIVE" || !item.validUntil) return false;
  const validUntil = new Date(item.validUntil);
  return !Number.isNaN(validUntil.getTime()) && validUntil < new Date();
}


function attachmentScopeLabel(scope?: string | null) {
  const labels: Record<string, string> = {
    CONVOCATION: "Convocação",
    AGENDA_ITEM: "Pauta",
    RESULT: "Resultado",
    OTHER: "Outro",
  };
  return labels[scope || ""] || scope || "-";
}

function attachmentDocumentTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    NOTICE: "Edital",
    SUPPORT: "Documento De Apoio",
    OTHER: "Outro Documento",
  };
  return labels[type || ""] || type || "Outro Documento";
}

function formatFileSize(sizeBytes?: number | null) {
  const numericSize = Number(sizeBytes || 0);

  if (!Number.isFinite(numericSize) || numericSize <= 0) return "-";

  if (numericSize < 1024 * 1024) {
    return `${Math.max(1, Math.round(numericSize / 1024))} KB`;
  }

  return `${(numericSize / (1024 * 1024)).toFixed(2)} MB`;
}

function unitLabel(unit?: {
  block?: string | null;
  unitNumber?: string | null;
} | null) {
  if (!unit) return "Unidade";
  return `${unit.block ? `${unit.block} - ` : ""}${unit.unitNumber || "Unidade"}`;
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho",
    SCHEDULED: "Agendada",
    OPEN: "Em andamento",
    CLOSED: "Encerrada",
    RESULTS_PUBLISHED: "Resultados publicados",
    CANCELED: "Cancelada",
    ARCHIVED: "Arquivada",
  };
  return labels[status || ""] || status || "-";
}

function statusClass(status?: string | null) {
  const classes: Record<string, string> = {
    DRAFT: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    SCHEDULED: "border-blue-200 bg-blue-50 text-blue-700",
    OPEN: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    CLOSED: "border-violet-200 bg-violet-50 text-violet-700",
    RESULTS_PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    CANCELED: "border-red-200 bg-red-50 text-red-700",
    ARCHIVED: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return classes[status || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function typeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    ORDINARY: "Ordinária",
    EXTRAORDINARY: "Extraordinária",
    SPECIAL: "Especial",
    OTHER: "Outra",
  };
  return labels[type || ""] || type || "-";
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
    INFORMATIVE: "Somente informativa",
    APPROVE_REJECT_ABSTAIN: "Aprovar, rejeitar ou abster-se",
    YES_NO_ABSTAIN: "Sim, não ou abster-se",
    SINGLE_CHOICE: "Escolha única",
    MULTIPLE_CHOICE: "Múltipla escolha",
  };
  return labels[type || ""] || type || "-";
}

function quorumRuleLabel(type?: string | null) {
  const labels: Record<string, string> = {
    SIMPLE_MAJORITY: "Maioria simples dos votos válidos",
    MINIMUM_PARTICIPATION: "Participação mínima",
    MINIMUM_APPROVAL: "Aprovação mínima",
    CUSTOM: "Regra personalizada",
  };
  return labels[type || ""] || type || "-";
}


function voteVisibilityLabel(visibility?: string | null) {
  const labels: Record<string, string> = {
    CONSOLIDATED: "Resultado Consolidado",
    NOMINAL_BY_UNIT: "Votação Nominal Por Unidade",
    SECRET: "Votação Sigilosa",
  };

  return labels[visibility || ""] || visibility || "Resultado Consolidado";
}

function voteVisibilityDescription(visibility?: VoteVisibility | null) {
  const descriptions: Record<VoteVisibility, string> = {
    CONSOLIDATED:
      "A ata e o portal exibirão totais, pesos, quórum, abstenções e resultado, sem divulgar a escolha individual de cada unidade.",
    NOMINAL_BY_UNIT:
      "A ata e o portal poderão exibir o voto individual por unidade. O nome da pessoa responsável pelo registro permanece restrito à auditoria administrativa.",
    SECRET:
      "A ata e o portal exibirão somente o resultado consolidado. Os registros completos continuarão preservados na auditoria administrativa.",
  };

  return descriptions[visibility || "CONSOLIDATED"];
}


function voteAuditOriginLabel(origin?: string | null) {
  const labels: Record<string, string> = {
    DIRECT_UNIT_LINK: "Vínculo Direto Com A Unidade",
    PROXY_REPRESENTATION: "Procuração Vigente",
    AUTHORIZED_LINK: "Vínculo Autorizado",
    ADMINISTRATIVE_IMPORT: "Importação Administrativa",
  };

  return labels[origin || ""] || origin || "-";
}

function voteAuditUserLabel(user?: VoteAuditUserItem | null) {
  return user?.name || user?.email || "Pessoa Não Identificada";
}

function voteAuditAccessLabel(access?: VoteAuditItem["voterAccess"] | null) {
  return access?.label || access?.role || "Perfil Não Informado";
}

function voteAuditOptionsLabel(options?: VoteAuditItem["options"] | null) {
  if (!options || options.length === 0) return "Nenhuma opção registrada.";
  return options.map((option) => option.label).join(", ");
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

function formatResultPercent(value?: number | null) {
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0))}%`;
}


function minuteStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    DRAFT: "Rascunho",
    GENERATED: "Minuta Gerada",
    UNDER_REVIEW: "Em Revisão",
    APPROVED: "Aprovada",
    PUBLISHED: "Publicada",
    ARCHIVED: "Arquivada",
  };

  return labels[status || ""] || status || "-";
}

function minuteStatusClass(status?: string | null) {
  const classes: Record<string, string> = {
    DRAFT: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    GENERATED: "border-blue-200 bg-blue-50 text-blue-700",
    UNDER_REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
    APPROVED: "border-violet-200 bg-violet-50 text-violet-700",
    PUBLISHED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    ARCHIVED: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
  };

  return classes[status || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function minuteGenerationModeLabel(mode?: string | null) {
  const labels: Record<string, string> = {
    STRUCTURED: "Minuta Estruturada",
    AI_ASSISTED: "Texto Aprimorado Com IA",
    MANUAL: "Revisão Manual",
  };

  return labels[mode || ""] || mode || "-";
}

function minuteVersionSourceLabel(source?: string | null) {
  const labels: Record<string, string> = {
    STRUCTURED_GENERATION: "Geração Estruturada",
    AI_ASSISTED_GENERATION: "Aprimoramento Com IA",
    MANUAL_REVISION: "Revisão Manual",
    APPROVAL_SNAPSHOT: "Fotografia Da Aprovação",
    PUBLICATION_SNAPSHOT: "Fotografia Da Publicação",
  };

  return labels[source || ""] || source || "-";
}

function minuteLogActionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    CREATED: "Ata criada",
    STRUCTURED_GENERATED: "Minuta estruturada gerada",
    AI_GENERATED: "Texto aprimorado com IA",
    AI_FALLBACK_USED: "Geração estruturada utilizada como alternativa segura",
    REGENERATED: "Minuta estruturada regenerada",
    UPDATED: "Revisão manual salva",
    SUBMITTED_FOR_REVIEW: "Ata encaminhada para revisão",
    REVIEWED: "Revisão humana confirmada",
    APPROVED: "Ata aprovada",
    PUBLISHED: "Ata publicada oficialmente",
    ARCHIVED: "Ata arquivada",
    VERSION_CREATED: "Nova versão registrada",
    PDF_GENERATED: "Documento oficial gerado",
  };

  return labels[action || ""] || action || "-";
}

function minuteUserLabel(user?: MinuteUserItem | null, fallback = "-") {
  return user?.name || user?.email || fallback;
}

function normalizeMinuteWarnings(value: unknown) {
  if (!value) return [] as string[];

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();

        if (item && typeof item === "object") {
          const payload = item as Record<string, unknown>;
          const message =
            typeof payload.message === "string"
              ? payload.message
              : typeof payload.label === "string"
                ? payload.label
                : typeof payload.code === "string"
                  ? payload.code
                  : "";

          return message.trim();
        }

        return "";
      })
      .filter(Boolean);
  }

  if (typeof value === "string") return value.trim() ? [value.trim()] : [];

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        if (typeof item === "string") return item.trim();
        if (typeof item === "boolean" && item) return key;
        return "";
      })
      .filter(Boolean);
  }

  return [] as string[];
}

function minuteActionConfirmation(action: AssemblyMinuteAction) {
  const messages: Record<AssemblyMinuteAction, string> = {
    GENERATE_STRUCTURED:
      "Gerar a primeira minuta estruturada com os dados oficiais da assembleia?",
    REGENERATE_STRUCTURED:
      "Regenerar a minuta estruturada? A versão atual será preservada no histórico e a revisão formal deverá ser refeita.",
    GENERATE_AI_ASSISTED:
      "Aprimorar o texto com IA? A minuta atual será preservada no histórico e uma nova versão somente será criada se a resposta passar pelas validações de segurança.",
    SUBMIT_FOR_REVIEW:
      "Encaminhar esta minuta para revisão humana?",
    MARK_REVIEWED:
      "Confirmar que o conteúdo da ata foi revisado por uma pessoa responsável?",
    APPROVE:
      "Aprovar formalmente esta versão da ata? A aprovação será registrada no histórico.",
    PUBLISH:
      "Publicar oficialmente esta ata? Após a publicação, o conteúdo ficará congelado para edição.",
    ARCHIVE:
      "Arquivar esta ata publicada? O documento e todo o histórico continuarão preservados.",
  };

  return messages[action];
}

function logActionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    CREATED: "Assembleia criada",
    UPDATED: "Dados gerais atualizados",
    SCHEDULED: "Assembleia agendada",
    AGENDA_ITEM_ADDED: "Pauta adicionada",
    AGENDA_ITEM_UPDATED: "Pauta atualizada",
    AGENDA_ITEM_REMOVED: "Pauta removida",
    ELIGIBILITY_SNAPSHOT_CREATED: "Fotografia de elegibilidade criada",
    ELIGIBLE_UNIT_ADDED: "Unidade elegível adicionada",
    ELIGIBLE_UNIT_UPDATED: "Unidade elegível atualizada",
    ELIGIBLE_UNIT_BLOCKED: "Unidade bloqueada para votação",
    REPRESENTATION_ADDED: "Procuração cadastrada",
    REPRESENTATION_UPDATED: "Procuração atualizada",
    REPRESENTATION_REVOKED: "Procuração revogada",
    ATTACHMENT_ADDED: "Documento adicionado",
    ATTACHMENT_REMOVED: "Documento removido",
    OPENED: "Assembleia aberta",
    CLOSED: "Assembleia encerrada",
    VOTE_REGISTERED: "Voto registrado",
    VOTE_UPDATED: "Voto atualizado",
    RESULTS_PUBLISHED: "Resultados publicados",
    VOTING_DEADLINE_EXTENDED: "Prazo da votação prorrogado",
    VOTING_REOPENED: "Votação reaberta com prorrogação",
    AGENDA_ITEM_DEFERRED: "Pauta encaminhada para nova deliberação",
    AGENDA_ITEM_IMPORTED: "Pauta retomada de assembleia anterior",
  };
  return labels[action || ""] || action || "-";
}

function excerpt(value?: string | null, maxLength = 180) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Sem descrição informada.";
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength).trim()}...`;
}

function buildGeneralForm(assembly: AssemblyDetail): GeneralFormState {
  return {
    title: assembly.title,
    description: assembly.description || "",
    condominiumId: assembly.condominiumId,
    type: assembly.type,
    mode: assembly.mode,
    scheduledStartAt: toDateTimeLocalValue(assembly.scheduledStartAt),
    scheduledEndAt: toDateTimeLocalValue(assembly.scheduledEndAt),
    votingStartsAt: toDateTimeLocalValue(assembly.votingStartsAt),
    votingEndsAt: toDateTimeLocalValue(assembly.votingEndsAt),
    location: assembly.location || "",
    externalMeetingUrl: assembly.externalMeetingUrl || "",
    accessInstructions: assembly.accessInstructions || "",
    convocationText: assembly.convocationText || "",
    internalNotes: assembly.internalNotes || "",
    allowVoteChange: assembly.allowVoteChange,
  };
}

function buildAgendaForm(item?: AgendaItem | null): AgendaFormState {
  if (!item) return emptyAgendaForm;

  return {
    title: item.title,
    description: item.description || "",
    type: item.type,
    quorumRuleType: item.quorumRuleType,
    voteVisibility: item.voteVisibility || "CONSOLIDATED",
    minimumParticipationPct:
      item.minimumParticipationPct === null || item.minimumParticipationPct === undefined
        ? ""
        : String(item.minimumParticipationPct),
    minimumApprovalPct:
      item.minimumApprovalPct === null || item.minimumApprovalPct === undefined
        ? ""
        : String(item.minimumApprovalPct),
    customRuleDescription: item.customRuleDescription || "",
    useAssemblyVotingWindow: !item.votingStartsAt && !item.votingEndsAt,
    votingStartsAt: toDateTimeLocalValue(item.votingStartsAt),
    votingEndsAt: toDateTimeLocalValue(item.votingEndsAt),
    allowAbstention: item.options.some((option) => option.isAbstention),
    options: item.options
      .filter(
        (option) =>
          !(
            option.isAbstention &&
            option.label.trim().toLowerCase() === "abster-se"
          ),
      )
      .map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description || "",
        isAbstention: false,
      })),
  };
}

function getAgendaValidationMessage(form: AgendaFormState) {
  if (form.title.trim().length < 3) return "Informe um título com pelo menos 3 caracteres.";

  if (!form.useAssemblyVotingWindow) {
    if (!form.votingStartsAt || !form.votingEndsAt) {
      return "Informe o início e o fim da votação específica da pauta.";
    }

    const start = new Date(form.votingStartsAt);
    const end = new Date(form.votingEndsAt);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
      return "O fim da votação da pauta deve ser posterior ao início.";
    }
  }

  if (form.quorumRuleType === "MINIMUM_PARTICIPATION" && !form.minimumParticipationPct) {
    return "Informe o percentual mínimo de participação.";
  }

  if (form.quorumRuleType === "MINIMUM_APPROVAL" && !form.minimumApprovalPct) {
    return "Informe o percentual mínimo de aprovação.";
  }

  if (form.quorumRuleType === "CUSTOM" && !form.customRuleDescription.trim()) {
    return "Descreva a regra personalizada.";
  }

  if (form.type === "SINGLE_CHOICE" || form.type === "MULTIPLE_CHOICE") {
    const validOptions = form.options.map((option) => option.label.trim()).filter(Boolean);
    if (validOptions.length < 2) return "Informe pelo menos duas opções de voto.";
  }

  return "";
}

function StatCard({ label, value, description }: { label: string; value: number; description: string }) {
  return (
    <div className="rounded-[22px] border border-[#DDE5DF] bg-white p-4 shadow-[0_14px_42px_rgba(23,33,27,0.04)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">{value}</p>
      <p className="mt-1 text-xs font-medium leading-5 text-[#5E6B63]">{description}</p>
    </div>
  );
}

export default function AdminAssembleiaDetalhePage() {
  const params = useParams<{ id: string }>();
  const assemblyId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agendaSaving, setAgendaSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [assembly, setAssembly] = useState<AssemblyDetail | null>(null);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [generalModalOpen, setGeneralModalOpen] = useState(false);
  const [generalForm, setGeneralForm] = useState<GeneralFormState | null>(null);
  const [agendaModalOpen, setAgendaModalOpen] = useState(false);
  const [editingAgendaItem, setEditingAgendaItem] = useState<AgendaItem | null>(null);
  const [agendaForm, setAgendaForm] = useState<AgendaFormState>(emptyAgendaForm);

  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [eligibilitySaving, setEligibilitySaving] = useState(false);
  const [eligibleUnits, setEligibleUnits] = useState<EligibleUnitItem[]>([]);
  const [availableUnits, setAvailableUnits] = useState<UnitItem[]>([]);
  const [eligibilityMetrics, setEligibilityMetrics] =
    useState<EligibilityMetrics>(emptyEligibilityMetrics);
  const [eligibilitySnapshotAt, setEligibilitySnapshotAt] = useState<string | null>(null);
  const [eligibleUnitModalOpen, setEligibleUnitModalOpen] = useState(false);
  const [editingEligibleUnit, setEditingEligibleUnit] =
    useState<EligibleUnitItem | null>(null);
  const [eligibleUnitForm, setEligibleUnitForm] =
    useState<EligibleUnitFormState>(emptyEligibleUnitForm);

  const [representationsLoading, setRepresentationsLoading] = useState(true);
  const [representationSaving, setRepresentationSaving] = useState(false);
  const [representationDocumentUploading, setRepresentationDocumentUploading] = useState(false);
  const [representations, setRepresentations] = useState<RepresentationItem[]>([]);
  const [representationEligibleUnits, setRepresentationEligibleUnits] =
    useState<EligibleUnitItem[]>([]);
  const [candidateUsers, setCandidateUsers] = useState<CandidateUserItem[]>([]);
  const [grantorCandidates, setGrantorCandidates] = useState<CandidateUserItem[]>([]);
  const [representativeSearch, setRepresentativeSearch] = useState("");
  const [candidateSearchLoading, setCandidateSearchLoading] = useState(false);
  const [representationMetrics, setRepresentationMetrics] =
    useState<RepresentationMetrics>(emptyRepresentationMetrics);
  const [representationModalOpen, setRepresentationModalOpen] = useState(false);
  const [editingRepresentation, setEditingRepresentation] =
    useState<RepresentationItem | null>(null);
  const [representationForm, setRepresentationForm] =
    useState<RepresentationFormState>(emptyRepresentationForm);

  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const [publishingConvocation, setPublishingConvocation] = useState(false);
  const [sendingVotingReminder, setSendingVotingReminder] = useState(false);
  const [changingAssemblyStatus, setChangingAssemblyStatus] = useState(false);
  const [votingExtensionModalOpen, setVotingExtensionModalOpen] = useState(false);
  const [votingExtensionSaving, setVotingExtensionSaving] = useState(false);
  const [votingExtensionForm, setVotingExtensionForm] =
    useState<VotingExtensionFormState>(emptyVotingExtensionForm);
  const [attachments, setAttachments] = useState<AssemblyAttachmentItem[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentForm, setAttachmentForm] =
    useState<AttachmentFormState>(emptyAttachmentForm);

  const [tallyLoading, setTallyLoading] = useState(true);
  const [publishingResults, setPublishingResults] = useState(false);
  const [deferAgendaModalOpen, setDeferAgendaModalOpen] = useState(false);
  const [deferringAgendaItem, setDeferringAgendaItem] = useState(false);
  const [deferAgendaForm, setDeferAgendaForm] = useState<DeferAgendaFormState>(emptyDeferAgendaForm);
  const [tally, setTally] = useState<AssemblyTally | null>(null);

  // =========================================================
  // ETAPA 52.5.1.4 — AUDITORIA ADMINISTRATIVA DE VOTOS
  // =========================================================
  const [voteAuditLoading, setVoteAuditLoading] = useState(false);
  const [voteAuditItems, setVoteAuditItems] = useState<VoteAuditItem[]>([]);
  const [voteAuditAgendaItems, setVoteAuditAgendaItems] =
    useState<VoteAuditAgendaItem[]>([]);
  const [voteAuditMetrics, setVoteAuditMetrics] =
    useState(emptyVoteAuditMetrics);
  const [voteAuditFilters, setVoteAuditFilters] =
    useState<VoteAuditFilters>(emptyVoteAuditFilters);
  const [expandedVoteAuditId, setExpandedVoteAuditId] =
    useState<string | null>(null);


  // =========================================================
  // ETAPA 52.5 — ATA DA ASSEMBLEIA
  // =========================================================
  const [minuteLoading, setMinuteLoading] = useState(true);
  const [minuteSaving, setMinuteSaving] = useState(false);
  const [officialPdfSaving, setOfficialPdfSaving] = useState(false);
  const [minute, setMinute] = useState<AssemblyMinuteItem | null>(null);
  const [minutePermissions, setMinutePermissions] =
    useState<AssemblyMinutePermissions>(emptyMinutePermissions);
  const [minuteAiConfiguration, setMinuteAiConfiguration] =
    useState<AssemblyMinuteAiConfiguration>(emptyMinuteAiConfiguration);
  const [minuteForm, setMinuteForm] =
    useState<AssemblyMinuteFormState>(emptyMinuteForm);
  const [selectedMinuteVersionId, setSelectedMinuteVersionId] =
    useState<string | null>(null);

  const canEditStructure =
    !assembly?.convocationPublishedAt &&
    (assembly?.status === "DRAFT" || assembly?.status === "SCHEDULED");

  // ETAPA 51.7.1 — procurações não fazem parte do congelamento estrutural
  // da convocação. Elas podem ser registradas enquanto a votação estiver
  // vigente, inclusive após a publicação formal.
  const canManageRepresentations =
    Boolean(assembly) &&
    (assembly?.status === "DRAFT" ||
      assembly?.status === "SCHEDULED" ||
      assembly?.status === "OPEN") &&
    (!assembly?.votingEndsAt || new Date(assembly.votingEndsAt) > new Date());

  const loadAssembly = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    try {
      if (showLoading) setLoading(true);
      setError("");

      const res = await fetch(`/api/admin/assembleias/${assemblyId}`, {
        cache: "no-store",
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        setAssembly(null);
        setError(getApiErrorMessage(data, "Erro ao carregar assembleia."));
        return;
      }

      const payload = data as AssemblyResponse;
      setAssembly(payload.assembly || null);
    } catch (err) {
      console.error(err);
      setAssembly(null);
      setError("Erro ao carregar assembleia.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [assemblyId]);

  const loadCondominios = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/condominios", { cache: "no-store" });
      const data = await readApiResponse(res);

      if (!res.ok) {
        setCondominios([]);
        return;
      }

      // ETAPA 51.3 — CORREÇÃO DO SELECT DE CONDOMÍNIOS
      // A API administrativa pode devolver a lista diretamente ou
      // encapsulada em uma propriedade. O modal precisa aceitar os
      // dois formatos para não exibir o seletor vazio.
      if (Array.isArray(data)) {
        setCondominios(data as Condominio[]);
        return;
      }

      if (!data || typeof data !== "object") {
        setCondominios([]);
        return;
      }

      const payload = data as {
        condominiums?: unknown;
        condominios?: unknown;
        items?: unknown;
        data?: unknown;
      };

      const candidates = [
        payload.condominiums,
        payload.condominios,
        payload.items,
        payload.data,
      ];

      const list = candidates.find((item) => Array.isArray(item));
      setCondominios(Array.isArray(list) ? (list as Condominio[]) : []);
    } catch (err) {
      console.error(err);
      setCondominios([]);
    }
  }, []);

  const loadEligibility = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    try {
      if (showLoading) setEligibilityLoading(true);

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/unidades-elegiveis`,
        { cache: "no-store" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        setEligibleUnits([]);
        setAvailableUnits([]);
        setEligibilityMetrics(emptyEligibilityMetrics);
        setEligibilitySnapshotAt(null);
        setError(getApiErrorMessage(data, "Erro ao carregar unidades elegíveis."));
        return;
      }

      const payload = data as EligibilityResponse;
      setEligibleUnits(Array.isArray(payload.eligibleUnits) ? payload.eligibleUnits : []);
      setAvailableUnits(Array.isArray(payload.availableUnits) ? payload.availableUnits : []);
      setEligibilityMetrics(payload.metrics || emptyEligibilityMetrics);
      setEligibilitySnapshotAt(payload.snapshotAt || null);
    } catch (err) {
      console.error(err);
      setEligibleUnits([]);
      setAvailableUnits([]);
      setEligibilityMetrics(emptyEligibilityMetrics);
      setEligibilitySnapshotAt(null);
      setError("Erro ao carregar unidades elegíveis.");
    } finally {
      if (showLoading) setEligibilityLoading(false);
    }
  }, [assemblyId]);

  const loadRepresentations = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    try {
      if (showLoading) setRepresentationsLoading(true);

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/procuracoes`,
        { cache: "no-store" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        setRepresentations([]);
        setRepresentationEligibleUnits([]);
        setRepresentationMetrics(emptyRepresentationMetrics);
        setError(getApiErrorMessage(data, "Erro ao carregar procurações."));
        return;
      }

      const payload = data as RepresentationsResponse;
      setRepresentations(Array.isArray(payload.representations) ? payload.representations : []);
      setRepresentationEligibleUnits(Array.isArray(payload.eligibleUnits) ? payload.eligibleUnits : []);
      setRepresentationMetrics(payload.metrics || emptyRepresentationMetrics);
    } catch (err) {
      console.error(err);
      setRepresentations([]);
      setRepresentationEligibleUnits([]);
      setRepresentationMetrics(emptyRepresentationMetrics);
      setError("Erro ao carregar procurações.");
    } finally {
      if (showLoading) setRepresentationsLoading(false);
    }
  }, [assemblyId]);

  const loadRepresentationCandidates = useCallback(async (params: {
    eligibleUnitId: string;
    query?: string;
    selectedRepresentativeUserId?: string | null;
  }) => {
    try {
      setCandidateSearchLoading(true);

      const searchParams = new URLSearchParams();
      if (params.eligibleUnitId) searchParams.set("eligibleUnitId", params.eligibleUnitId);
      if (params.query?.trim()) searchParams.set("q", params.query.trim());
      if (params.selectedRepresentativeUserId) {
        searchParams.set("selectedRepresentativeUserId", params.selectedRepresentativeUserId);
      }

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/procuracoes/candidatos?${searchParams.toString()}`,
        { cache: "no-store" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        setGrantorCandidates([]);
        setCandidateUsers([]);
        setError(getApiErrorMessage(data, "Erro ao pesquisar candidatos para procuração."));
        return;
      }

      const payload = data as RepresentationCandidatesResponse;
      setGrantorCandidates(Array.isArray(payload.grantors) ? payload.grantors : []);
      setCandidateUsers(Array.isArray(payload.representatives) ? payload.representatives : []);
    } catch (err) {
      console.error(err);
      setGrantorCandidates([]);
      setCandidateUsers([]);
      setError("Erro ao pesquisar candidatos para procuração.");
    } finally {
      setCandidateSearchLoading(false);
    }
  }, [assemblyId]);


  const loadAttachments = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    try {
      if (showLoading) setAttachmentsLoading(true);

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/anexos`,
        { cache: "no-store" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        setAttachments([]);
        setError(getApiErrorMessage(data, "Erro ao carregar documentos da assembleia."));
        return;
      }

      const payload = data as AttachmentsResponse;
      setAttachments(Array.isArray(payload.attachments) ? payload.attachments : []);
    } catch (err) {
      console.error(err);
      setAttachments([]);
      setError("Erro ao carregar documentos da assembleia.");
    } finally {
      if (showLoading) setAttachmentsLoading(false);
    }
  }, [assemblyId]);

  const loadTally = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    try {
      if (showLoading) setTallyLoading(true);

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/apuracao`,
        { cache: "no-store" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        setTally(null);
        setError(getApiErrorMessage(data, "Erro ao carregar apuração da assembleia."));
        return;
      }

      const payload = data as TallyResponse;
      setTally(payload.tally || null);
    } catch (err) {
      console.error(err);
      setTally(null);
      setError("Erro ao carregar apuração da assembleia.");
    } finally {
      if (showLoading) setTallyLoading(false);
    }
  }, [assemblyId]);


  const loadVoteAudit = useCallback(async (
    {
      showLoading = true,
      filters = emptyVoteAuditFilters,
    }: {
      showLoading?: boolean;
      filters?: VoteAuditFilters;
    } = {},
  ) => {
    try {
      if (showLoading) setVoteAuditLoading(true);

      const searchParams = new URLSearchParams();

      if (filters.agendaItemId) searchParams.set("agendaItemId", filters.agendaItemId);
      if (filters.origin) searchParams.set("origin", filters.origin);
      if (filters.visibility) searchParams.set("visibility", filters.visibility);
      if (filters.changedOnly) searchParams.set("changedOnly", "true");
      if (filters.query.trim()) searchParams.set("q", filters.query.trim());

      const queryString = searchParams.toString();
      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/auditoria-votos${queryString ? `?${queryString}` : ""}`,
        { cache: "no-store" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        setVoteAuditItems([]);
        setVoteAuditAgendaItems([]);
        setVoteAuditMetrics(emptyVoteAuditMetrics);
        setError(getApiErrorMessage(data, "Erro ao carregar auditoria dos votos."));
        return;
      }

      const payload = data as VoteAuditResponse;
      setVoteAuditItems(Array.isArray(payload.votes) ? payload.votes : []);
      setVoteAuditAgendaItems(
        Array.isArray(payload.agendaItems) ? payload.agendaItems : [],
      );
      setVoteAuditMetrics(payload.metrics || emptyVoteAuditMetrics);
    } catch (err) {
      console.error(err);
      setVoteAuditItems([]);
      setVoteAuditAgendaItems([]);
      setVoteAuditMetrics(emptyVoteAuditMetrics);
      setError("Erro ao carregar auditoria dos votos.");
    } finally {
      if (showLoading) setVoteAuditLoading(false);
    }
  }, [assemblyId]);

  const loadMinute = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    try {
      if (showLoading) setMinuteLoading(true);

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/ata`,
        { cache: "no-store" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        setMinute(null);
        setMinutePermissions(emptyMinutePermissions);
        setMinuteAiConfiguration(emptyMinuteAiConfiguration);
        setMinuteForm(emptyMinuteForm);
        setSelectedMinuteVersionId(null);
        setError(getApiErrorMessage(data, "Erro ao carregar ata da assembleia."));
        return;
      }

      const payload = data as AssemblyMinuteResponse;
      const nextMinute = payload.minute || null;

      setMinute(nextMinute);
      setMinutePermissions({
        ...emptyMinutePermissions,
        ...(payload.permissions || {}),
      });
      setMinuteAiConfiguration({
        ...emptyMinuteAiConfiguration,
        ...(payload.aiConfiguration || {}),
      });

      setMinuteForm(
        nextMinute
          ? {
              title: nextMinute.title || "",
              executiveSummary: nextMinute.executiveSummary || "",
              content: nextMinute.content || "",
            }
          : emptyMinuteForm,
      );

      setSelectedMinuteVersionId((current) => {
        if (!nextMinute?.versions?.length) return null;
        if (current && nextMinute.versions.some((item) => item.id === current)) {
          return current;
        }
        return nextMinute.versions[0]?.id || null;
      });
    } catch (err) {
      console.error(err);
      setMinute(null);
      setMinutePermissions(emptyMinutePermissions);
      setMinuteForm(emptyMinuteForm);
      setSelectedMinuteVersionId(null);
      setError("Erro ao carregar ata da assembleia.");
    } finally {
      if (showLoading) setMinuteLoading(false);
    }
  }, [assemblyId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAssembly();
      void loadCondominios();
      void loadEligibility();
      void loadRepresentations();
      void loadAttachments();
      void loadTally();
      void loadMinute();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAssembly, loadCondominios, loadEligibility, loadRepresentations, loadAttachments, loadTally, loadMinute]);

  useEffect(() => {
    if (activeTab !== "voteAudit") return;

    const timeoutId = window.setTimeout(() => {
      setVoteAuditFilters(emptyVoteAuditFilters);
      void loadVoteAudit({ filters: emptyVoteAuditFilters });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, loadVoteAudit]);

  const metrics = useMemo(() => ({
    agendaItems: assembly?._count?.agendaItems ?? 0,
    eligibleUnits: eligibilityMetrics.eligible,
    representations: representationMetrics.active,
    votes: assembly?._count?.votes ?? 0,
    attachments: attachments.length,
    logs: assembly?._count?.logs ?? 0,
  }), [assembly, eligibilityMetrics.eligible, representationMetrics.active, attachments.length]);


  const selectedMinuteVersion = useMemo(
    () =>
      minute?.versions.find((item) => item.id === selectedMinuteVersionId) ||
      minute?.versions[0] ||
      null,
    [minute, selectedMinuteVersionId],
  );

  const minuteWarnings = useMemo(
    () => normalizeMinuteWarnings(minute?.warnings),
    [minute?.warnings],
  );

  function openGeneralModal() {
    if (!assembly) return;
    setGeneralForm(buildGeneralForm(assembly));
    setGeneralModalOpen(true);
  }

  function openCreateAgendaModal() {
    setEditingAgendaItem(null);
    setAgendaForm(emptyAgendaForm);
    setAgendaModalOpen(true);
  }

  function openEditAgendaModal(item: AgendaItem) {
    setEditingAgendaItem(item);
    setAgendaForm(buildAgendaForm(item));
    setAgendaModalOpen(true);
  }

  function updateGeneralForm<K extends keyof GeneralFormState>(key: K, value: GeneralFormState[K]) {
    setGeneralForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateAgendaForm<K extends keyof AgendaFormState>(key: K, value: AgendaFormState[K]) {
    setAgendaForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "type") {
        const type = value as AgendaItemType;
        if (type !== "SINGLE_CHOICE" && type !== "MULTIPLE_CHOICE") {
          next.options = [];
          next.allowAbstention = false;
        }
        if ((type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") && next.options.length < 2) {
          next.options = [
            { label: "", description: "", isAbstention: false },
            { label: "", description: "", isAbstention: false },
          ];
        }
      }

      if (key === "useAssemblyVotingWindow" && value === true) {
        next.votingStartsAt = "";
        next.votingEndsAt = "";
      }

      return next;
    });
  }

  function updateAgendaOption(index: number, key: keyof AgendaOptionFormState, value: string | boolean) {
    setAgendaForm((prev) => ({
      ...prev,
      options: prev.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [key]: value } : option,
      ),
    }));
  }

  function addAgendaOption() {
    setAgendaForm((prev) => ({
      ...prev,
      options:
        prev.options.length >= 20
          ? prev.options
          : [...prev.options, { label: "", description: "", isAbstention: false }],
    }));
  }

  function removeAgendaOption(index: number) {
    setAgendaForm((prev) => ({
      ...prev,
      options: prev.options.filter((_, optionIndex) => optionIndex !== index),
    }));
  }

  async function handleSaveGeneral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!generalForm) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/assembleias/${assemblyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...generalForm,
          scheduledStartAt: normalizeDateTimeForApi(generalForm.scheduledStartAt),
          scheduledEndAt: normalizeDateTimeForApi(generalForm.scheduledEndAt),
          votingStartsAt: normalizeDateTimeForApi(generalForm.votingStartsAt),
          votingEndsAt: normalizeDateTimeForApi(generalForm.votingEndsAt),
        }),
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar assembleia."));
        return;
      }

      const payload = data as AssemblyResponse;
      setAssembly(payload.assembly || null);
      setSuccess(payload.message || "Assembleia atualizada com sucesso.");
      setGeneralModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar assembleia.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAgenda(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationMessage = getAgendaValidationMessage(agendaForm);
    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    try {
      setAgendaSaving(true);
      setError("");
      setSuccess("");

      const endpoint = editingAgendaItem
        ? `/api/admin/assembleias/${assemblyId}/pautas/${editingAgendaItem.id}`
        : `/api/admin/assembleias/${assemblyId}/pautas`;

      const res = await fetch(endpoint, {
        method: editingAgendaItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...agendaForm,
          votingStartsAt: agendaForm.useAssemblyVotingWindow
            ? null
            : normalizeDateTimeForApi(agendaForm.votingStartsAt),
          votingEndsAt: agendaForm.useAssemblyVotingWindow
            ? null
            : normalizeDateTimeForApi(agendaForm.votingEndsAt),
          minimumParticipationPct: agendaForm.minimumParticipationPct || null,
          minimumApprovalPct: agendaForm.minimumApprovalPct || null,
          allowAbstention: agendaForm.allowAbstention,
          options: agendaForm.options.map((option, index) => ({
            id: option.id || null,
            label: option.label.trim(),
            description: option.description.trim() || null,
            isAbstention: option.isAbstention,
            order: index + 1,
          })),
        }),
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao salvar pauta."));
        return;
      }

      const payload = data as { message?: string };
      setSuccess(payload.message || "Pauta salva com sucesso.");
      setAgendaModalOpen(false);
      setEditingAgendaItem(null);
      setAgendaForm(emptyAgendaForm);
      await loadAssembly({ showLoading: false });
      setActiveTab("agenda");
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar pauta.");
    } finally {
      setAgendaSaving(false);
    }
  }

  async function handleDeleteAgenda(item: AgendaItem) {
    if (!confirm(`Remover a pauta "${item.title}"?`)) return;

    try {
      setAgendaSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/assembleias/${assemblyId}/pautas/${item.id}`, {
        method: "DELETE",
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao remover pauta."));
        return;
      }

      const payload = data as { message?: string };
      setSuccess(payload.message || "Pauta removida com sucesso.");
      await loadAssembly({ showLoading: false });
    } catch (err) {
      console.error(err);
      alert("Erro ao remover pauta.");
    } finally {
      setAgendaSaving(false);
    }
  }


  async function handleGenerateEligibilitySnapshot(regenerate: boolean) {
    const confirmation = regenerate
      ? "Regenerar a fotografia das unidades? Ajustes manuais atuais serão substituídos pelas unidades ativas do condomínio."
      : "Gerar a fotografia das unidades ativas do condomínio para esta assembleia?";

    if (!confirm(confirmation)) return;

    try {
      setEligibilitySaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/unidades-elegiveis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: regenerate ? "REGENERATE_SNAPSHOT" : "GENERATE_SNAPSHOT",
          }),
        },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao gerar fotografia das unidades."));
        return;
      }

      const payload = data as EligibilityResponse;
      setSuccess(payload.message || "Fotografia das unidades atualizada com sucesso.");
      await Promise.all([
        loadEligibility({ showLoading: false }),
        loadRepresentations({ showLoading: false }),
        loadAssembly({ showLoading: false }),
      ]);
      setActiveTab("eligibility");
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar fotografia das unidades.");
    } finally {
      setEligibilitySaving(false);
    }
  }

  function openAddEligibleUnitModal() {
    if (availableUnits.length === 0) {
      alert("Todas as unidades ativas do condomínio já fazem parte da fotografia.");
      return;
    }

    setEditingEligibleUnit(null);
    setEligibleUnitForm({
      ...emptyEligibleUnitForm,
      unitId: availableUnits[0]?.id || "",
    });
    setEligibleUnitModalOpen(true);
  }

  function openEditEligibleUnitModal(item: EligibleUnitItem) {
    setEditingEligibleUnit(item);
    setEligibleUnitForm({
      unitId: item.unitId,
      status: item.status,
      blockedReason: item.blockedReason || "",
      votingWeight: String(item.votingWeight),
    });
    setEligibleUnitModalOpen(true);
  }

  function updateEligibleUnitForm<K extends keyof EligibleUnitFormState>(
    key: K,
    value: EligibleUnitFormState[K],
  ) {
    setEligibleUnitForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveEligibleUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!eligibleUnitForm.unitId) {
      alert("Selecione uma unidade.");
      return;
    }

    if (
      eligibleUnitForm.status === "BLOCKED" &&
      !eligibleUnitForm.blockedReason.trim()
    ) {
      alert("Informe o motivo do bloqueio.");
      return;
    }

    try {
      setEligibilitySaving(true);
      setError("");
      setSuccess("");

      const endpoint = editingEligibleUnit
        ? `/api/admin/assembleias/${assemblyId}/unidades-elegiveis/${editingEligibleUnit.id}`
        : `/api/admin/assembleias/${assemblyId}/unidades-elegiveis`;

      const res = await fetch(endpoint, {
        method: editingEligibleUnit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingEligibleUnit
            ? {
                status: eligibleUnitForm.status,
                blockedReason: eligibleUnitForm.blockedReason.trim() || null,
                votingWeight: eligibleUnitForm.votingWeight,
              }
            : {
                action: "ADD_UNIT",
                unitId: eligibleUnitForm.unitId,
                votingWeight: eligibleUnitForm.votingWeight,
              },
        ),
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao salvar unidade elegível."));
        return;
      }

      const payload = data as EligibilityResponse;
      setSuccess(payload.message || "Unidade elegível atualizada com sucesso.");
      setEligibleUnitModalOpen(false);
      setEditingEligibleUnit(null);
      setEligibleUnitForm(emptyEligibleUnitForm);
      await Promise.all([
        loadEligibility({ showLoading: false }),
        loadRepresentations({ showLoading: false }),
        loadAssembly({ showLoading: false }),
      ]);
      setActiveTab("eligibility");
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar unidade elegível.");
    } finally {
      setEligibilitySaving(false);
    }
  }

  async function handleDeleteEligibleUnit(item: EligibleUnitItem) {
    if (!confirm(`Remover a unidade "${unitLabel({
      block: item.snapshotBlock,
      unitNumber: item.snapshotUnitNumber,
    })}" da fotografia de elegibilidade?`)) {
      return;
    }

    try {
      setEligibilitySaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/unidades-elegiveis/${item.id}`,
        { method: "DELETE" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao remover unidade elegível."));
        return;
      }

      const payload = data as EligibilityResponse;
      setSuccess(payload.message || "Unidade removida da fotografia.");
      await Promise.all([
        loadEligibility({ showLoading: false }),
        loadRepresentations({ showLoading: false }),
        loadAssembly({ showLoading: false }),
      ]);
      setActiveTab("eligibility");
    } catch (err) {
      console.error(err);
      alert("Erro ao remover unidade elegível.");
    } finally {
      setEligibilitySaving(false);
    }
  }


  function openCreateRepresentationModal() {
    // ETAPA 51.7.1 — usa a lista específica de procurações quando já
    // sincronizada e adota a fotografia vigente como fallback seguro.
    // Isso evita falso aviso logo após gerar a fotografia.
    const availableRepresentationUnits =
      representationEligibleUnits.length > 0
        ? representationEligibleUnits
        : eligibleUnits.filter((item) => item.status === "ELIGIBLE");

    if (availableRepresentationUnits.length === 0) {
      alert("Gere a fotografia e mantenha pelo menos uma unidade apta antes de cadastrar procurações.");
      return;
    }

    const eligibleUnitId = availableRepresentationUnits[0]?.id || "";

    setEditingRepresentation(null);
    setRepresentativeSearch("");
    setCandidateUsers([]);
    setGrantorCandidates([]);
    setRepresentationForm({
      ...emptyRepresentationForm,
      eligibleUnitId,
    });
    setRepresentationModalOpen(true);
    void loadRepresentationCandidates({ eligibleUnitId });
  }

  function openEditRepresentationModal(item: RepresentationItem) {
    const eligibleUnit = representationEligibleUnits.find(
      (unit) => unit.unitId === item.unitId,
    );
    const representativeMode = item.metadata?.representativeMode ||
      (item.representativeUserId ? "INTERNAL" : "EXTERNAL");
    const grantorMode = item.metadata?.grantorMode ||
      (item.grantorUserId ? "INTERNAL" : "DOCUMENT_ONLY");
    const eligibleUnitId = eligibleUnit?.id || "";

    setEditingRepresentation(item);
    setRepresentativeSearch("");
    setCandidateUsers(item.representativeUser ? [item.representativeUser] : []);
    setGrantorCandidates(item.grantorUser ? [item.grantorUser] : []);
    setRepresentationForm({
      eligibleUnitId,
      grantorMode,
      grantorUserId: item.grantorUserId || "",
      externalGrantorName: item.metadata?.externalGrantorName || "",
      representativeMode,
      representativeUserId: item.representativeUserId || "",
      representativeAccessId: item.representativeAccessId || "",
      externalRepresentativeName: item.externalRepresentativeName || "",
      externalRepresentativeEmail: item.externalRepresentativeEmail || "",
      externalRepresentativePhone: item.externalRepresentativePhone || "",
      externalRepresentativeDocument: item.externalRepresentativeDocument || "",
      representationType: item.metadata?.representationType || "PROXY",
      validFrom: toDateTimeLocalValue(item.validFrom),
      validUntil: toDateTimeLocalValue(item.validUntil),
      documentUrl: item.documentUrl || "",
      documentName: item.documentName || "",
      notes: item.notes || "",
    });
    setRepresentationModalOpen(true);
    void loadRepresentationCandidates({
      eligibleUnitId,
      selectedRepresentativeUserId: item.representativeUserId,
    });
  }

  function updateRepresentationForm<K extends keyof RepresentationFormState>(
    key: K,
    value: RepresentationFormState[K],
  ) {
    setRepresentationForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "representativeUserId") {
        const user = candidateUsers.find((item) => item.id === value);
        next.representativeAccessId = user?.accesses?.[0]?.id || "";
      }

      if (key === "eligibleUnitId") {
        next.grantorUserId = "";
      }

      if (key === "representativeMode") {
        next.representativeUserId = "";
        next.representativeAccessId = "";
        next.externalRepresentativeName = "";
        next.externalRepresentativeEmail = "";
        next.externalRepresentativePhone = "";
        next.externalRepresentativeDocument = "";
      }

      if (key === "grantorMode") {
        next.grantorUserId = "";
        next.externalGrantorName = "";
      }

      return next;
    });

    if (key === "eligibleUnitId") {
      void loadRepresentationCandidates({
        eligibleUnitId: String(value),
        query: representativeSearch,
        selectedRepresentativeUserId: representationForm.representativeUserId,
      });
    }
  }

  function handleRepresentativeSearch() {
    if (representativeSearch.trim().length < 2) {
      alert("Digite pelo menos 2 caracteres para pesquisar o representante.");
      return;
    }

    void loadRepresentationCandidates({
      eligibleUnitId: representationForm.eligibleUnitId,
      query: representativeSearch,
      selectedRepresentativeUserId: representationForm.representativeUserId,
    });
  }

  function selectInternalRepresentative(user: CandidateUserItem) {
    setRepresentationForm((prev) => ({
      ...prev,
      representativeUserId: user.id,
      representativeAccessId: "",
    }));
  }

  async function deleteUploadedRepresentationDocument(documentUrl: string) {
    if (!documentUrl) return;

    try {
      await fetch(
        `/api/admin/assembleias/${assemblyId}/procuracoes/upload`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentUrl }),
        },
      );
    } catch (err) {
      console.error("Erro ao remover arquivo temporário da procuração:", err);
    }
  }

  async function handleRepresentationDocumentUpload(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) return;

    const previousDocumentUrl = representationForm.documentUrl;

    try {
      setRepresentationDocumentUploading(true);
      setError("");

      const body = new FormData();
      body.append("file", file);

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/procuracoes/upload`,
        {
          method: "POST",
          body,
        },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao enviar documento comprobatório."));
        return;
      }

      const payload = data as {
        documentUrl?: string;
        documentName?: string;
      };

      if (!payload.documentUrl || !payload.documentName) {
        alert("A API não retornou os dados do documento enviado.");
        return;
      }

      setRepresentationForm((prev) => ({
        ...prev,
        documentUrl: payload.documentUrl || "",
        documentName: payload.documentName || "",
      }));

      if (previousDocumentUrl && previousDocumentUrl !== payload.documentUrl) {
        await deleteUploadedRepresentationDocument(previousDocumentUrl);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar documento comprobatório.");
    } finally {
      setRepresentationDocumentUploading(false);
    }
  }

  async function handleRemoveRepresentationDocument() {
    const documentUrl = representationForm.documentUrl;

    if (!documentUrl) return;

    if (!confirm("Remover o documento comprobatório enviado?")) return;

    setRepresentationDocumentUploading(true);

    try {
      await deleteUploadedRepresentationDocument(documentUrl);
      setRepresentationForm((prev) => ({
        ...prev,
        documentUrl: "",
        documentName: "",
      }));
    } finally {
      setRepresentationDocumentUploading(false);
    }
  }

  async function handleSaveRepresentation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!representationForm.eligibleUnitId) {
      alert("Selecione a unidade representada.");
      return;
    }

    if (representationForm.grantorMode === "INTERNAL" && !representationForm.grantorUserId) {
      alert("Selecione o concedente vinculado à unidade representada.");
      return;
    }

    if (
      representationForm.grantorMode === "DOCUMENT_ONLY" &&
      representationForm.externalGrantorName.trim().length < 3
    ) {
      alert("Informe o nome do concedente descrito no documento comprobatório.");
      return;
    }

    if (
      representationForm.representativeMode === "INTERNAL" &&
      !representationForm.representativeUserId
    ) {
      alert("Pesquise e selecione o representante autorizado.");
      return;
    }

    if (
      representationForm.representativeMode === "EXTERNAL" &&
      (!representationForm.externalRepresentativeName.trim() ||
        !representationForm.externalRepresentativeEmail.trim())
    ) {
      alert("Informe nome e e-mail do representante externo.");
      return;
    }

    try {
      setRepresentationSaving(true);
      setError("");
      setSuccess("");

      const endpoint = editingRepresentation
        ? `/api/admin/assembleias/${assemblyId}/procuracoes/${editingRepresentation.id}`
        : `/api/admin/assembleias/${assemblyId}/procuracoes`;

      const res = await fetch(endpoint, {
        method: editingRepresentation ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingRepresentation ? "UPDATE" : undefined,
          ...representationForm,
          validFrom: normalizeDateTimeForApi(representationForm.validFrom),
          validUntil: normalizeDateTimeForApi(representationForm.validUntil),
          grantorUserId: representationForm.grantorUserId || null,
          externalGrantorName: representationForm.externalGrantorName.trim() || null,
          representativeUserId: representationForm.representativeUserId || null,
          representativeAccessId: representationForm.representativeAccessId || null,
          externalRepresentativeName: representationForm.externalRepresentativeName.trim() || null,
          externalRepresentativeEmail: representationForm.externalRepresentativeEmail.trim() || null,
          externalRepresentativePhone: representationForm.externalRepresentativePhone.trim() || null,
          externalRepresentativeDocument: representationForm.externalRepresentativeDocument.trim() || null,
          documentUrl: representationForm.documentUrl.trim() || null,
          documentName: representationForm.documentName.trim() || null,
          notes: representationForm.notes.trim() || null,
        }),
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao salvar procuração."));
        return;
      }

      const payload = data as RepresentationsResponse;
      setSuccess(payload.message || "Procuração salva com sucesso.");
      setRepresentationModalOpen(false);
      setEditingRepresentation(null);
      setRepresentationForm(emptyRepresentationForm);
      setRepresentativeSearch("");
      setCandidateUsers([]);
      setGrantorCandidates([]);
      await Promise.all([
        loadRepresentations({ showLoading: false }),
        loadAssembly({ showLoading: false }),
      ]);
      setActiveTab("representations");
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar procuração.");
    } finally {
      setRepresentationSaving(false);
    }
  }

  async function handleRepresentationAction(
    item: RepresentationItem,
    action: "REVOKE" | "REACTIVATE",
  ) {
    const revokedReason =
      action === "REVOKE"
        ? prompt("Informe o motivo da revogação:")
        : null;

    if (action === "REVOKE" && (!revokedReason || revokedReason.trim().length < 3)) {
      alert("Informe um motivo válido para revogar a procuração.");
      return;
    }

    const confirmation =
      action === "REVOKE"
        ? "Revogar esta procuração? O histórico será preservado."
        : "Reativar esta procuração?";

    if (!confirm(confirmation)) return;

    try {
      setRepresentationSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/procuracoes/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            revokedReason: revokedReason?.trim() || null,
          }),
        },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao atualizar procuração."));
        return;
      }

      const payload = data as RepresentationsResponse;
      setSuccess(payload.message || "Procuração atualizada com sucesso.");
      await Promise.all([
        loadRepresentations({ showLoading: false }),
        loadAssembly({ showLoading: false }),
      ]);
      setActiveTab("representations");
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar procuração.");
    } finally {
      setRepresentationSaving(false);
    }
  }


  function updateAttachmentForm<K extends keyof AttachmentFormState>(
    key: K,
    value: AttachmentFormState[K],
  ) {
    setAttachmentForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "scope" && value !== "AGENDA_ITEM") {
        next.agendaItemId = "";
      }

      return next;
    });
  }

  async function handleAttachmentUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!attachmentFile) {
      alert("Selecione um documento para enviar.");
      return;
    }

    if (attachmentForm.scope === "AGENDA_ITEM" && !attachmentForm.agendaItemId) {
      alert("Selecione a pauta relacionada ao documento.");
      return;
    }

    try {
      setAttachmentSaving(true);
      setError("");
      setSuccess("");

      const body = new FormData();
      body.append("file", attachmentFile);
      body.append("scope", attachmentForm.scope);
      body.append("documentType", attachmentForm.documentType);
      body.append("description", attachmentForm.description.trim());

      if (attachmentForm.agendaItemId) {
        body.append("agendaItemId", attachmentForm.agendaItemId);
      }

      const res = await fetch(`/api/admin/assembleias/${assemblyId}/anexos`, {
        method: "POST",
        body,
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao adicionar documento."));
        return;
      }

      const payload = data as AttachmentsResponse;
      setSuccess(payload.message || "Documento adicionado com sucesso.");
      setAttachmentForm(emptyAttachmentForm);
      setAttachmentFile(null);

      await Promise.all([
        loadAttachments({ showLoading: false }),
        loadAssembly({ showLoading: false }),
      ]);

      setActiveTab("convocation");
    } catch (err) {
      console.error(err);
      alert("Erro ao adicionar documento.");
    } finally {
      setAttachmentSaving(false);
    }
  }

  async function handleDeleteAttachment(item: AssemblyAttachmentItem) {
    if (!confirm(`Remover o documento "${item.originalName}"?`)) return;

    try {
      setAttachmentSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/anexos/${item.id}`,
        { method: "DELETE" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao remover documento."));
        return;
      }

      const payload = data as AttachmentsResponse;
      setSuccess(payload.message || "Documento removido com sucesso.");

      await Promise.all([
        loadAttachments({ showLoading: false }),
        loadAssembly({ showLoading: false }),
      ]);

      setActiveTab("convocation");
    } catch (err) {
      console.error(err);
      alert("Erro ao remover documento.");
    } finally {
      setAttachmentSaving(false);
    }
  }

  async function handlePublishConvocation() {
    if (
      !confirm(
        "Publicar a convocação oficial? Após a publicação, pautas, unidades aptas, procurações e documentos estruturais serão congelados.",
      )
    ) {
      return;
    }

    try {
      setPublishingConvocation(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/publicar-convocacao`,
        { method: "POST" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao publicar convocação."));
        return;
      }

      const payload = data as AssemblyResponse;
      setSuccess(payload.message || "Convocação publicada com sucesso.");

      await Promise.all([
        loadAssembly({ showLoading: false }),
        loadAttachments({ showLoading: false }),
      ]);

      setActiveTab("convocation");
    } catch (err) {
      console.error(err);
      alert("Erro ao publicar convocação.");
    } finally {
      setPublishingConvocation(false);
    }
  }

  async function handleSendVotingReminder() {
    if (!assembly?.convocationPublishedAt) {
      alert("Publique a convocação antes de enviar lembretes de votação.");
      return;
    }

    if (
      !confirm(
        "Enviar lembrete de votação para os usuários com participação pendente nesta assembleia?",
      )
    ) {
      return;
    }

    try {
      setSendingVotingReminder(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/lembrete`,
        { method: "POST" },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao enviar lembrete de votação."));
        return;
      }

      const payload = data as {
        message?: string;
        notifiedUsers?: number;
        processedRecipients?: number;
      };

      const notifiedUsers =
        payload.notifiedUsers ?? payload.processedRecipients ?? 0;

      setSuccess(
        payload.message ||
          `${notifiedUsers} usuário(s) notificado(s) sobre a votação pendente.`,
      );

      await loadAssembly({ showLoading: false });
      setActiveTab("convocation");
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar lembrete de votação.");
    } finally {
      setSendingVotingReminder(false);
    }
  }


  function openDeferAgendaModal(item: ResultAgendaTally) {
    setDeferAgendaForm({
      agendaItemId: item.agendaItemId,
      title: item.title,
      deferredReason: item.resultStatus === "NO_QUORUM" ? "NO_QUORUM" : "TIE",
      deferredNotes: "",
    });
    setDeferAgendaModalOpen(true);
  }

  async function handleDeferAgendaItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deferAgendaForm.agendaItemId) return;

    try {
      setDeferringAgendaItem(true);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/assembleias/${assemblyId}/apuracao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DEFER_AGENDA_ITEM",
          agendaItemId: deferAgendaForm.agendaItemId,
          deferredReason: deferAgendaForm.deferredReason,
          deferredNotes: deferAgendaForm.deferredNotes.trim() || null,
        }),
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao encaminhar pauta para nova deliberação."));
        return;
      }

      const payload = data as TallyResponse;
      setTally(payload.tally || null);
      setSuccess(payload.message || "Pauta encaminhada para nova deliberação.");
      setDeferAgendaModalOpen(false);
      setDeferAgendaForm(emptyDeferAgendaForm);

      await Promise.all([
        loadAssembly({ showLoading: false }),
        loadTally({ showLoading: false }),
      ]);
      setActiveTab("results");
    } catch (err) {
      console.error(err);
      alert("Erro ao encaminhar pauta para nova deliberação.");
    } finally {
      setDeferringAgendaItem(false);
    }
  }

  async function handlePublishResults() {
    if (!assembly) return;

    if (
      !confirm(
        "Publicar os resultados oficiais desta assembleia? Após a publicação, a apuração ficará disponível no portal e não poderá mais ser reaberta.",
      )
    ) {
      return;
    }

    try {
      setPublishingResults(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/apuracao`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "PUBLISH_RESULTS" }),
        },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao publicar resultados."));
        return;
      }

      const payload = data as TallyResponse;
      setTally(payload.tally || null);
      setSuccess(
        payload.message ||
          "Resultados oficiais publicados com sucesso.",
      );

      await Promise.all([
        loadAssembly({ showLoading: false }),
        loadTally({ showLoading: false }),
        // ETAPA 52.5.1.2 — após publicar os resultados, recarrega
        // imediatamente as permissões da ata para liberar a geração
        // da minuta estruturada sem exigir atualização manual da página.
        loadMinute({ showLoading: false }),
      ]);

      setActiveTab("results");
    } catch (err) {
      console.error(err);
      alert("Erro ao publicar resultados.");
    } finally {
      setPublishingResults(false);
    }
  }


  async function handleAssemblyOperationalAction(action: "OPEN" | "CLOSE") {
    const confirmation =
      action === "OPEN"
        ? "Abrir esta assembleia? A votação ficará disponível no portal dentro da janela programada."
        : "Encerrar esta assembleia? Novos votos serão bloqueados imediatamente e os registros existentes permanecerão preservados.";

    if (!confirm(confirmation)) return;

    try {
      setChangingAssemblyStatus(true);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/assembleias/${assemblyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(
          getApiErrorMessage(
            data,
            action === "OPEN"
              ? "Erro ao abrir assembleia."
              : "Erro ao encerrar assembleia.",
          ),
        );
        return;
      }

      const payload = data as AssemblyResponse;
      setAssembly(payload.assembly || null);
      setSuccess(
        payload.message ||
          (action === "OPEN"
            ? "Assembleia aberta com sucesso."
            : "Assembleia encerrada com sucesso."),
      );

      await Promise.all([
        loadAssembly({ showLoading: false }),
        loadRepresentations({ showLoading: false }),
        loadTally({ showLoading: false }),
      ]);

      setActiveTab(action === "CLOSE" ? "results" : "overview");
    } catch (err) {
      console.error(err);
      alert(
        action === "OPEN"
          ? "Erro ao abrir assembleia."
          : "Erro ao encerrar assembleia.",
      );
    } finally {
      setChangingAssemblyStatus(false);
    }
  }


  function openVotingExtensionModal() {
    if (!assembly?.votingEndsAt) {
      alert("Defina o prazo atual da votação antes de prorrogá-lo.");
      return;
    }

    const currentDeadline = new Date(assembly.votingEndsAt);
    const nextDeadline = new Date(currentDeadline.getTime() + 60 * 60 * 1000);

    setVotingExtensionForm({
      newVotingEndsAt: toDateTimeLocalValue(nextDeadline.toISOString()),
      reason: "",
      notifyParticipants: true,
      extendSpecificAgendaItems: false,
    });
    setVotingExtensionModalOpen(true);
  }

  function updateVotingExtensionForm<K extends keyof VotingExtensionFormState>(
    key: K,
    value: VotingExtensionFormState[K],
  ) {
    setVotingExtensionForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleExtendVoting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!assembly) return;

    if (!votingExtensionForm.newVotingEndsAt) {
      alert("Informe o novo prazo final da votação.");
      return;
    }

    if (votingExtensionForm.reason.trim().length < 3) {
      alert("Informe o motivo da prorrogação com pelo menos 3 caracteres.");
      return;
    }

    const reopening = assembly.status === "CLOSED";

    if (
      !confirm(
        reopening
          ? "Reabrir a votação com novo prazo final? Os votos anteriores permanecerão preservados e os participantes poderão votar novamente nas pendências válidas."
          : "Prorrogar o prazo final da votação? A estrutura da assembleia e os votos já registrados permanecerão preservados.",
      )
    ) {
      return;
    }

    try {
      setVotingExtensionSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/assembleias/${assemblyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: reopening ? "REOPEN_VOTING" : "EXTEND_VOTING",
          newVotingEndsAt: normalizeDateTimeForApi(votingExtensionForm.newVotingEndsAt),
          reason: votingExtensionForm.reason.trim(),
          notifyParticipants: votingExtensionForm.notifyParticipants,
          extendSpecificAgendaItems: votingExtensionForm.extendSpecificAgendaItems,
        }),
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao prorrogar a votação."));
        return;
      }

      const payload = data as AssemblyResponse & {
        warnings?: string[];
        notifiedUsers?: number;
      };

      setAssembly(payload.assembly || null);
      setVotingExtensionModalOpen(false);
      setVotingExtensionForm(emptyVotingExtensionForm);

      const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
      const notificationText = votingExtensionForm.notifyParticipants
        ? ` ${payload.notifiedUsers ?? 0} usuário(s) interno(s) foram notificado(s).`
        : "";
      const warningText = warnings.length > 0 ? ` Atenção: ${warnings.join(" ")}` : "";

      setSuccess(
        `${payload.message || "Prazo da votação atualizado com sucesso."}${notificationText}${warningText}`,
      );

      await Promise.all([
        loadAssembly({ showLoading: false }),
        loadRepresentations({ showLoading: false }),
      ]);

      setActiveTab("overview");
    } catch (err) {
      console.error(err);
      alert("Erro ao prorrogar a votação.");
    } finally {
      setVotingExtensionSaving(false);
    }
  }


  function updateMinuteForm<K extends keyof AssemblyMinuteFormState>(
    key: K,
    value: AssemblyMinuteFormState[K],
  ) {
    setMinuteForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleMinuteAction(action: AssemblyMinuteAction) {
    if (!confirm(minuteActionConfirmation(action))) return;

    try {
      setMinuteSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/assembleias/${assemblyId}/ata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao processar ata da assembleia."));
        return;
      }

      const payload = data as AssemblyMinuteResponse;
      setSuccess(payload.message || "Ata atualizada com sucesso.");
      await loadMinute({ showLoading: false });
      setActiveTab("minute");
    } catch (err) {
      console.error(err);
      alert("Erro ao processar ata da assembleia.");
    } finally {
      setMinuteSaving(false);
    }
  }

  async function handleGenerateOfficialPdf() {
    if (
      !confirm(
        "Gerar o PDF oficial da ata publicada? O documento receberá hash de integridade e ficará disponível para download administrativo.",
      )
    ) {
      return;
    }

    try {
      setOfficialPdfSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(
        `/api/admin/assembleias/${assemblyId}/ata/pdf`,
        {
          method: "POST",
        },
      );
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao gerar PDF oficial da ata."));
        return;
      }

      const payload = data as {
        message?: string;
      };

      setSuccess(payload.message || "PDF oficial da ata gerado com sucesso.");
      await loadMinute({ showLoading: false });
      setActiveTab("minute");
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar PDF oficial da ata.");
    } finally {
      setOfficialPdfSaving(false);
    }
  }


  async function handleSaveMinuteRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (minuteForm.title.trim().length < 3) {
      alert("Informe um título com pelo menos 3 caracteres.");
      return;
    }

    if (minuteForm.content.trim().length < 20) {
      alert("A ata precisa possuir um conteúdo revisado antes de salvar.");
      return;
    }

    if (
      !confirm(
        "Salvar esta revisão manual como uma nova versão da ata? A versão anterior permanecerá preservada no histórico.",
      )
    ) {
      return;
    }

    try {
      setMinuteSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/admin/assembleias/${assemblyId}/ata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: minuteForm.title.trim(),
          executiveSummary: minuteForm.executiveSummary.trim() || null,
          content: minuteForm.content.trim(),
        }),
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        alert(getApiErrorMessage(data, "Erro ao salvar revisão manual da ata."));
        return;
      }

      const payload = data as AssemblyMinuteResponse;
      setSuccess(payload.message || "Revisão manual salva com sucesso.");
      await loadMinute({ showLoading: false });
      setActiveTab("minute");
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar revisão manual da ata.");
    } finally {
      setMinuteSaving(false);
    }
  }



  if (loading) return <EloGestLoadingScreen />;

  if (!assembly) {
    return (
      <AdminContextGuard>
        <AdminShell current="assembleias">
          <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">
            {error || "Assembleia não encontrada."}
          </div>
          <Link href="/admin/assembleias" className="mt-4 inline-flex h-11 items-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#256D3C]">
            Voltar Para Assembleias
          </Link>
        </AdminShell>
      </AdminContextGuard>
    );
  }

  return (
    <AdminContextGuard>
      <AdminShell
        current="assembleias"
        actions={
          <Link href="/admin/assembleias" className="inline-flex h-11 items-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#256D3C] transition hover:border-[#256D3C]">
            Voltar
          </Link>
        }
      >
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">Governança deliberativa</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B]">{assembly.title}</h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-[#5E6B63]">
              {assembly.condominium?.name || "Condomínio"} · {typeLabel(assembly.type)} · {modeLabel(assembly.mode)}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className={`rounded-full border px-4 py-2 text-xs font-bold ${statusClass(assembly.status)}`}>
              {statusLabel(assembly.status)}
            </span>

            {assembly.status === "SCHEDULED" && assembly.convocationPublishedAt && (
              <button
                type="button"
                onClick={() => void handleAssemblyOperationalAction("OPEN")}
                disabled={changingAssemblyStatus}
                className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#174B2A] disabled:opacity-50"
              >
                {changingAssemblyStatus ? "Abrindo..." : "Abrir Assembleia"}
              </button>
            )}

            {(assembly.status === "SCHEDULED" || assembly.status === "OPEN") &&
              assembly.convocationPublishedAt && (
                <button
                  type="button"
                  onClick={openVotingExtensionModal}
                  disabled={votingExtensionSaving}
                  className="h-11 rounded-2xl border border-blue-200 bg-blue-50 px-5 text-sm font-semibold text-blue-700 transition hover:border-blue-300 disabled:opacity-50"
                >
                  Prorrogar Votação
                </button>
              )}

            {assembly.status === "OPEN" && (
              <button
                type="button"
                onClick={() => void handleAssemblyOperationalAction("CLOSE")}
                disabled={changingAssemblyStatus}
                className="h-11 rounded-2xl border border-red-200 bg-red-50 px-5 text-sm font-semibold text-red-700 transition hover:border-red-300 disabled:opacity-50"
              >
                {changingAssemblyStatus ? "Encerrando..." : "Encerrar Assembleia"}
              </button>
            )}

            {assembly.status === "CLOSED" && !assembly.resultsPublishedAt && (
              <button
                type="button"
                onClick={openVotingExtensionModal}
                disabled={votingExtensionSaving}
                className="h-11 rounded-2xl border border-amber-200 bg-amber-50 px-5 text-sm font-semibold text-amber-800 transition hover:border-amber-300 disabled:opacity-50"
              >
                Reabrir Votação
              </button>
            )}
          </div>
        </section>

        {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
        {success && <div className="mt-5 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-3 text-sm font-semibold text-[#256D3C]">{success}</div>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Pautas" value={metrics.agendaItems} description="Itens da deliberação." />
          <StatCard label="Unidades aptas" value={metrics.eligibleUnits} description="Fotografia vigente para votação." />
          <StatCard label="Procurações" value={metrics.representations} description="Representações registradas." />
          <StatCard label="Votos" value={metrics.votes} description="Registros por unidade e pauta." />
          <StatCard label="Anexos" value={metrics.attachments} description="Documentos oficiais." />
          <StatCard label="Histórico" value={metrics.logs} description="Eventos auditáveis." />
        </section>

        <section className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-[#DDE5DF] bg-white p-2 shadow-[0_14px_42px_rgba(23,33,27,0.04)]">
          {([
            ["overview", "Visão geral"],
            ["agenda", `Pautas (${metrics.agendaItems})`],
            ["eligibility", `Unidades Aptas (${eligibilityMetrics.eligible})`],
            ["representations", `Procurações (${representationMetrics.active})`],
            ["convocation", `Convocação E Anexos (${metrics.attachments})`],
            ["results", "Apuração"],
            ["minute", minute ? `Ata (${minute.currentVersion})` : "Ata Da Assembleia"],
            ["voteAudit", `Auditoria De Votos (${metrics.votes})`],
            ["audit", `Histórico (${metrics.logs})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`h-10 rounded-xl px-4 text-sm font-semibold transition ${activeTab === key ? "bg-[#256D3C] text-white" : "text-[#5E6B63] hover:bg-[#F6F8F7]"}`}
            >
              {label}
            </button>
          ))}
        </section>

        {activeTab === "overview" && (
          <section className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Dados gerais</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">Base da convocação</h2>
                </div>
                {canEditStructure && (
                  <button type="button" onClick={openGeneralModal} className="h-10 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 text-sm font-semibold text-[#256D3C] transition hover:border-[#256D3C]">
                    Editar Dados
                  </button>
                )}
              </div>

              <div className="mt-5 grid gap-4 rounded-2xl bg-[#F9FBFA] p-4 text-sm sm:grid-cols-2">
                <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Início previsto</p><p className="mt-1 font-semibold text-[#17211B]">{formatDateTime(assembly.scheduledStartAt)}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Encerramento previsto</p><p className="mt-1 font-semibold text-[#17211B]">{formatDateTime(assembly.scheduledEndAt)}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Início da votação</p><p className="mt-1 font-semibold text-[#17211B]">{formatDateTime(assembly.votingStartsAt)}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Fim da votação</p><p className="mt-1 font-semibold text-[#17211B]">{formatDateTime(assembly.votingEndsAt)}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Local presencial</p><p className="mt-1 font-semibold text-[#17211B]">{assembly.location || "-"}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Alteração de voto</p><p className="mt-1 font-semibold text-[#17211B]">{assembly.allowVoteChange ? "Permitida enquanto aberta" : "Não permitida"}</p></div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Descrição</p>
                <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">{excerpt(assembly.description, 700)}</p>
              </div>

              <div className="mt-5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Texto da convocação</p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-[#5E6B63]">{assembly.convocationText || "Ainda não informado."}</p>
              </div>
            </article>

            <aside className="space-y-5">
              <article className="rounded-[28px] border border-[#CFE6D4] bg-[#EAF7EE] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Próxima preparação</p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-[#17211B]">Unidades elegíveis e procurações</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-[#256D3C]">
                  A fotografia das unidades aptas e o controle de procurações já podem ser revisados. Finalize a convocação oficial e os anexos antes de publicar.
                </p>
              </article>

              <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">Preparação mínima</p>
                <div className="mt-4 space-y-3 text-sm font-semibold text-[#5E6B63]">
                  <p>{metrics.agendaItems > 0 ? "✓" : "○"} Cadastrar pelo menos uma pauta</p>
                  <p>{metrics.eligibleUnits > 0 ? "✓" : "○"} Gerar fotografia de unidades aptas</p>
                  <p>{assembly.convocationText ? "✓" : "○"} Revisar texto da convocação</p>
                  <p>{metrics.attachments > 0 ? "✓" : "○"} Anexar documentos quando necessário</p>
                </div>
              </article>
            </aside>
          </section>
        )}

        {activeTab === "agenda" && (
          <section className="mt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Pautas da assembleia</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">Deliberações e itens informativos</h2>
                <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                  Cada pauta possui regra transparente, tipo de voto e opções próprias. Alterações estruturais ficam bloqueadas após a abertura.
                </p>
              </div>
              {canEditStructure && (
                <button type="button" onClick={openCreateAgendaModal} className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#174B2A]">
                  Nova Pauta
                </button>
              )}
            </div>

            {assembly.agendaItems.length === 0 ? (
              <div className="mt-5 rounded-[28px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#EAF7EE] text-2xl">☑</div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">Nenhuma pauta cadastrada</h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
                  Cadastre os assuntos que serão apresentados ou submetidos à votação formal.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {assembly.agendaItems.map((item) => (
                  <article key={item.id} className="rounded-[26px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">Pauta {item.order}</p>
                        <h3 className="mt-2 text-lg font-semibold tracking-tight text-[#17211B]">{item.title}</h3>
                        <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">{excerpt(item.description)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canEditStructure && (
                          <button type="button" onClick={() => openEditAgendaModal(item)} className="h-9 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-3 text-xs font-bold text-[#256D3C]">
                            Editar
                          </button>
                        )}
                        {canEditStructure && (
                          <button type="button" onClick={() => void handleDeleteAgenda(item)} className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700">
                            Remover
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 rounded-2xl bg-[#F9FBFA] p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                      <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Tipo</p><p className="mt-1 font-semibold text-[#17211B]">{agendaTypeLabel(item.type)}</p></div>
                      <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Regra</p><p className="mt-1 font-semibold text-[#17211B]">{quorumRuleLabel(item.quorumRuleType)}</p></div>
                      <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Transparência</p><p className="mt-1 font-semibold text-[#17211B]">{voteVisibilityLabel(item.voteVisibility)}</p></div>
                      <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Registros</p><p className="mt-1 font-semibold text-[#17211B]">{item._count?.votes ?? 0} votos · {item._count?.attachments ?? 0} anexos</p></div>
                    </div>

                    {item.options.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.options.map((option) => (
                          <span key={option.id || `${item.id}-${option.order}`} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${option.isAbstention ? "border-amber-200 bg-amber-50 text-amber-700" : "border-[#DDE5DF] bg-white text-[#5E6B63]"}`}>
                            {option.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}


        {activeTab === "eligibility" && (
          <section className="mt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                  Fotografia de elegibilidade
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">
                  Unidades Aptas Para Votação
                </h2>
                <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                  A fotografia preserva o quórum da assembleia mesmo que o cadastro
                  das unidades seja alterado posteriormente. Ajustes ficam bloqueados
                  após a abertura.
                </p>
                <p className="mt-2 text-xs font-bold text-[#7A877F]">
                  Última fotografia: {formatDateTime(eligibilitySnapshotAt)}
                </p>
              </div>

              {canEditStructure && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleGenerateEligibilitySnapshot(eligibleUnits.length > 0)}
                    disabled={eligibilitySaving}
                    className="h-11 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 text-sm font-semibold text-[#256D3C] transition hover:border-[#256D3C] disabled:opacity-50"
                  >
                    {eligibleUnits.length > 0 ? "Regenerar Fotografia" : "Gerar Fotografia"}
                  </button>

                  <button
                    type="button"
                    onClick={openAddEligibleUnitModal}
                    disabled={eligibilitySaving}
                    className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#174B2A] disabled:opacity-50"
                  >
                    Adicionar Unidade
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Total"
                value={eligibilityMetrics.total}
                description="Unidades na fotografia."
              />
              <StatCard
                label="Aptas"
                value={eligibilityMetrics.eligible}
                description="Liberadas para votação."
              />
              <StatCard
                label="Bloqueadas"
                value={eligibilityMetrics.blocked}
                description="Com justificativa registrada."
              />
              <StatCard
                label="Peso Apto"
                value={Number(eligibilityMetrics.eligibleWeight.toFixed(2))}
                description="Peso válido para quórum."
              />
              <StatCard
                label="Disponíveis"
                value={availableUnits.length}
                description="Ativas fora da fotografia."
              />
            </div>

            {eligibilityLoading ? (
              <div className="mt-5 rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center text-sm font-semibold text-[#5E6B63]">
                Carregando unidades elegíveis...
              </div>
            ) : eligibleUnits.length === 0 ? (
              <div className="mt-5 rounded-[28px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#EAF7EE] text-2xl">
                  🏢
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">
                  Fotografia ainda não gerada
                </h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
                  Gere a fotografia para incluir automaticamente todas as unidades
                  ativas do condomínio. Depois será possível bloquear, liberar,
                  remover ou ajustar o peso de cada unidade.
                </p>
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#F9FBFA] text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                      <tr>
                        <th className="px-5 py-4">Unidade</th>
                        <th className="px-5 py-4">Tipo</th>
                        <th className="px-5 py-4">Situação</th>
                        <th className="px-5 py-4">Peso</th>
                        <th className="px-5 py-4">Observação</th>
                        <th className="px-5 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligibleUnits.map((item) => (
                        <tr key={item.id} className="border-t border-[#EEF2EF]">
                          <td className="px-5 py-4 font-semibold text-[#17211B]">
                            {unitLabel({
                              block: item.snapshotBlock,
                              unitNumber: item.snapshotUnitNumber,
                            })}
                          </td>
                          <td className="px-5 py-4 font-medium text-[#5E6B63]">
                            {item.unit?.unitType || "-"}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                                item.status === "ELIGIBLE"
                                  ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                                  : "border-red-200 bg-red-50 text-red-700"
                              }`}
                            >
                              {item.status === "ELIGIBLE" ? "Apta" : "Bloqueada"}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-semibold text-[#17211B]">
                            {formatVotingWeight(item.votingWeight)}
                          </td>
                          <td className="max-w-xs px-5 py-4 text-xs font-medium leading-5 text-[#5E6B63]">
                            {item.blockedReason || "-"}
                          </td>
                          <td className="px-5 py-4">
                            {canEditStructure ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditEligibleUnitModal(item)}
                                  className="h-9 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-3 text-xs font-bold text-[#256D3C]"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteEligibleUnit(item)}
                                  className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700"
                                >
                                  Remover
                                </button>
                              </div>
                            ) : (
                              <p className="text-right text-xs font-semibold text-[#7A877F]">
                                Bloqueado após abertura
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}


        {activeTab === "representations" && (
          <section className="mt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                  Representação formal
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">
                  Procurações Por Unidade
                </h2>
                <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                  Cada procuração autoriza uma pessoa a representar uma unidade
                  específica nesta assembleia. Revogações preservam o histórico.
                </p>
              </div>

              {canManageRepresentations && (
                <button
                  type="button"
                  onClick={openCreateRepresentationModal}
                  disabled={representationSaving || representationDocumentUploading}
                  className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#174B2A] disabled:opacity-50"
                >
                  Nova Procuração
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total" value={representationMetrics.total} description="Registros preservados." />
              <StatCard label="Ativas" value={representationMetrics.active} description="Autorizam representação." />
              <StatCard label="Revogadas" value={representationMetrics.revoked} description="Histórico mantido." />
              <StatCard label="Expiradas" value={representationMetrics.expired} description="Vigência encerrada." />
            </div>

            {representationsLoading ? (
              <div className="mt-5 rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center text-sm font-semibold text-[#5E6B63]">
                Carregando procurações...
              </div>
            ) : representations.length === 0 ? (
              <div className="mt-5 rounded-[28px] border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#EAF7EE] text-2xl">
                  📄
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">
                  Nenhuma procuração cadastrada
                </h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-[#5E6B63]">
                  Cadastre somente quando uma pessoa precisar representar formalmente
                  uma unidade durante a votação.
                </p>
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#F9FBFA] text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                      <tr>
                        <th className="px-5 py-4">Unidade</th>
                        <th className="px-5 py-4">Representante</th>
                        <th className="px-5 py-4">Concedente</th>
                        <th className="px-5 py-4">Instrumento</th>
                        <th className="px-5 py-4">Vigência</th>
                        <th className="px-5 py-4">Situação</th>
                        <th className="px-5 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {representations.map((item) => {
                        const expired = representationIsExpired(item);
                        const effectiveStatus = expired ? "EXPIRED" : item.status;

                        return (
                          <tr key={item.id} className="border-t border-[#EEF2EF]">
                            <td className="px-5 py-4 font-semibold text-[#17211B]">
                              {unitLabel(item.unit)}
                            </td>
                            <td className="px-5 py-4">
                              <p className="font-semibold text-[#17211B]">
                                {representativeDisplayName(item)}
                              </p>
                              <p className="mt-1 text-xs font-medium text-[#7A877F]">
                                {representativeDisplayDetail(item)}
                              </p>
                            </td>
                            <td className="px-5 py-4 font-medium text-[#5E6B63]">
                              {grantorDisplayName(item)}
                            </td>
                            <td className="px-5 py-4 font-medium text-[#5E6B63]">
                              <p>{representationTypeLabel(item.metadata?.representationType)}</p>
                              {item.documentUrl && (
                                <a
                                  href={item.documentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-flex text-xs font-bold text-[#256D3C] underline"
                                >
                                  Abrir Documento
                                </a>
                              )}
                            </td>
                            <td className="px-5 py-4 text-xs font-medium leading-5 text-[#5E6B63]">
                              {formatDateTime(item.validFrom)}<br />até {formatDateTime(item.validUntil)}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                                  effectiveStatus === "ACTIVE"
                                    ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                                    : effectiveStatus === "REVOKED"
                                      ? "border-red-200 bg-red-50 text-red-700"
                                      : "border-amber-200 bg-amber-50 text-amber-700"
                                }`}
                              >
                                {representationStatusLabel(effectiveStatus)}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              {canManageRepresentations ? (
                                <div className="flex justify-end gap-2">
                                  {item.status === "ACTIVE" && !expired && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => openEditRepresentationModal(item)}
                                        className="h-9 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-3 text-xs font-bold text-[#256D3C]"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleRepresentationAction(item, "REVOKE")}
                                        className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700"
                                      >
                                        Revogar
                                      </button>
                                    </>
                                  )}
                                  {item.status !== "ACTIVE" && (
                                    <button
                                      type="button"
                                      onClick={() => void handleRepresentationAction(item, "REACTIVATE")}
                                      className="h-9 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-3 text-xs font-bold text-[#256D3C]"
                                    >
                                      Reativar
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <p className="text-right text-xs font-semibold text-[#7A877F]">
                                  Bloqueado após encerramento da votação
                                </p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}


        {activeTab === "convocation" && (
          <section className="mt-6 space-y-5">
            <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                    Convocação oficial
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">
                    Preparação, Documentos E Publicação
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                    Revise o checklist, inclua o edital e os documentos de apoio.
                    Após a publicação, a estrutura da assembleia será congelada
                    para preservar a rastreabilidade.
                  </p>
                </div>

                {assembly.convocationPublishedAt ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-2 text-xs font-bold text-[#256D3C]">
                      Convocação Publicada
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleSendVotingReminder()}
                      disabled={sendingVotingReminder}
                      className="h-11 rounded-2xl border border-[#CFE6D4] bg-white px-4 text-sm font-semibold text-[#256D3C] transition hover:border-[#256D3C] disabled:opacity-50"
                    >
                      {sendingVotingReminder
                        ? "Enviando Lembrete..."
                        : "Enviar Lembrete De Votação"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handlePublishConvocation()}
                    disabled={publishingConvocation}
                    className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#174B2A] disabled:opacity-50"
                  >
                    {publishingConvocation ? "Publicando..." : "Publicar Convocação"}
                  </button>
                )}
              </div>

              {assembly.convocationPublishedAt && (
                <div className="mt-5 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-3 text-sm font-semibold leading-6 text-[#256D3C]">
                  Publicada em {formatDateTime(assembly.convocationPublishedAt)}
                  {assembly.convocationPublishedByUser?.name
                    ? ` por ${assembly.convocationPublishedByUser.name}`
                    : ""}. Pautas, unidades aptas e documentos estruturais
                  estão congelados. Procurações podem continuar sendo registradas
                  enquanto a votação estiver vigente.
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  [Boolean(assembly.scheduledStartAt), "Data Da Assembleia"],
                  [Boolean(assembly.votingStartsAt && assembly.votingEndsAt), "Prazo De Votação"],
                  [assembly.agendaItems.length > 0, "Pelo Menos Uma Pauta"],
                  [eligibilityMetrics.eligible > 0, "Unidades Aptas"],
                  [Boolean(assembly.convocationText?.trim()), "Texto Da Convocação"],
                  [
                    attachments.some(
                      (item) =>
                        item.scope === "CONVOCATION" &&
                        item.metadata?.documentType === "NOTICE",
                    ),
                    "Edital Anexado",
                  ],
                ].map(([completed, label]) => (
                  <div
                    key={String(label)}
                    className={`rounded-2xl border p-4 ${
                      completed
                        ? "border-[#CFE6D4] bg-[#EAF7EE]"
                        : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${
                      completed ? "text-[#256D3C]" : "text-amber-700"
                    }`}>
                      {completed ? "✓" : "○"} {String(label)}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            {canEditStructure && (
              <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                  Novo Documento
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-[#17211B]">
                  Adicionar Anexo Oficial
                </h3>

                <form
                  onSubmit={(event) => void handleAttachmentUpload(event)}
                  className="mt-5 grid gap-4 md:grid-cols-2"
                >
                  <label className="block text-sm font-semibold text-[#17211B]">
                    Classificação
                    <select
                      value={attachmentForm.documentType}
                      onChange={(event) =>
                        updateAttachmentForm(
                          "documentType",
                          event.target.value as AttachmentDocumentType,
                        )
                      }
                      className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm outline-none focus:border-[#256D3C]"
                    >
                      <option value="NOTICE">Edital</option>
                      <option value="SUPPORT">Documento De Apoio</option>
                      <option value="OTHER">Outro Documento</option>
                    </select>
                  </label>

                  <label className="block text-sm font-semibold text-[#17211B]">
                    Escopo
                    <select
                      value={attachmentForm.scope}
                      onChange={(event) =>
                        updateAttachmentForm(
                          "scope",
                          event.target.value as AttachmentScope,
                        )
                      }
                      className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm outline-none focus:border-[#256D3C]"
                    >
                      <option value="CONVOCATION">Convocação Geral</option>
                      <option value="AGENDA_ITEM">Pauta Específica</option>
                      <option value="OTHER">Outro Documento</option>
                    </select>
                  </label>

                  {attachmentForm.scope === "AGENDA_ITEM" && (
                    <label className="block text-sm font-semibold text-[#17211B] md:col-span-2">
                      Pauta Relacionada
                      <select
                        value={attachmentForm.agendaItemId}
                        onChange={(event) =>
                          updateAttachmentForm("agendaItemId", event.target.value)
                        }
                        className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm outline-none focus:border-[#256D3C]"
                      >
                        <option value="">Selecione A Pauta</option>
                        {assembly.agendaItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            Pauta {item.order} — {item.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="block text-sm font-semibold text-[#17211B] md:col-span-2">
                    Descrição Opcional
                    <input
                      value={attachmentForm.description}
                      onChange={(event) =>
                        updateAttachmentForm("description", event.target.value)
                      }
                      placeholder="Ex.: Edital oficial assinado pela administradora"
                      className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm outline-none focus:border-[#256D3C]"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-[#17211B] md:col-span-2">
                    Arquivo
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={(event) =>
                        setAttachmentFile(event.target.files?.[0] || null)
                      }
                      className="mt-2 block w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm"
                    />
                    <span className="mt-2 block text-xs font-medium text-[#7A877F]">
                      PDF ou imagem legível. Tamanho máximo: 10 MB.
                    </span>
                  </label>

                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={attachmentSaving}
                      className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {attachmentSaving ? "Enviando..." : "Adicionar Documento"}
                    </button>
                  </div>
                </form>
              </article>
            )}

            <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                Documentos Oficiais
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-[#17211B]">
                Anexos Da Assembleia
              </h3>

              {attachmentsLoading ? (
                <p className="mt-5 text-sm font-semibold text-[#5E6B63]">
                  Carregando documentos...
                </p>
              ) : attachments.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-6 text-center text-sm font-medium text-[#5E6B63]">
                  Nenhum documento oficial foi anexado.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {attachments.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#17211B]">
                          {item.originalName}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                          {attachmentDocumentTypeLabel(item.metadata?.documentType)}
                          {" · "}
                          {attachmentScopeLabel(item.scope)}
                          {item.agendaItem
                            ? ` · Pauta ${item.agendaItem.order}: ${item.agendaItem.title}`
                            : ""}
                          {" · "}
                          {formatFileSize(item.sizeBytes)}
                        </p>
                        {item.description && (
                          <p className="mt-2 text-sm font-medium text-[#5E6B63]">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-3 text-xs font-bold text-[#256D3C]"
                        >
                          Visualizar
                        </a>

                        {canEditStructure && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteAttachment(item)}
                            disabled={attachmentSaving}
                            className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 disabled:opacity-50"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        )}

        {activeTab === "results" && (
          <section className="mt-6 space-y-5">
            <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                    Apuração Administrativa
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">
                    Resultado Por Pauta
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                    A apuração considera a fotografia das unidades aptas, o peso de cada unidade, a versão vigente do voto, as abstenções e a regra de quórum configurada para cada pauta.
                  </p>
                </div>

                {assembly.status === "CLOSED" && !assembly.resultsPublishedAt && (
                  <button
                    type="button"
                    onClick={() => void handlePublishResults()}
                    disabled={publishingResults || !tally?.canPublishResults}
                    className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {publishingResults ? "Publicando..." : "Publicar Resultados"}
                  </button>
                )}

                {assembly.status === "RESULTS_PUBLISHED" && (
                  <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-2 text-xs font-bold text-[#256D3C]">
                    Resultados Publicados
                  </span>
                )}
              </div>

              {tallyLoading ? (
                <p className="mt-5 text-sm font-semibold text-[#5E6B63]">
                  Calculando apuração...
                </p>
              ) : !tally ? (
                <p className="mt-5 text-sm font-semibold text-red-700">
                  Não foi possível carregar a apuração.
                </p>
              ) : (
                <>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">Unidades Aptas</p>
                      <p className="mt-2 text-2xl font-semibold text-[#17211B]">{tally.totalEligibleUnits}</p>
                    </div>
                    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">Peso Elegível</p>
                      <p className="mt-2 text-2xl font-semibold text-[#17211B]">{formatVotingWeight(tally.totalEligibleWeight)}</p>
                    </div>
                    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">Pautas Deliberativas</p>
                      <p className="mt-2 text-2xl font-semibold text-[#17211B]">{tally.deliberativeAgendaItems}</p>
                    </div>
                    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">Itens Informativos</p>
                      <p className="mt-2 text-2xl font-semibold text-[#17211B]">{tally.informationalAgendaItems}</p>
                    </div>
                  </div>

                  {/* ETAPA 51.9.4 — após a publicação oficial, o selo verde já
                      comunica o estado final. As razões de bloqueio servem apenas
                      para orientar ações pendentes antes da publicação. */}
                  {!assembly.resultsPublishedAt &&
                    assembly.status !== "RESULTS_PUBLISHED" &&
                    tally.blockingReasons.length > 0 && (
                      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
                        {tally.blockingReasons.map((reason) => (
                          <p key={reason}>• {reason}</p>
                        ))}
                      </div>
                    )}
                </>
              )}
            </article>

            {!tallyLoading && tally?.agendaItems.map((item) => (
              <article
                key={item.agendaItemId}
                className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-[0_14px_42px_rgba(23,33,27,0.04)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                      Pauta {item.order}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-[#17211B]">
                      {item.title}
                    </h3>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${resultStatusClass(item.resultStatus)}`}>
                    {resultStatusLabel(item.resultStatus)}
                  </span>
                </div>

                <p className="mt-3 text-sm font-medium leading-6 text-[#5E6B63]">
                  {item.resultSummary}
                </p>

                {!assembly.resultsPublishedAt &&
                  assembly.status === "CLOSED" &&
                  (item.resultStatus === "MANUAL_REVIEW" || item.resultStatus === "NO_QUORUM") && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-900">
                        Esta pauta ainda não possui uma conclusão publicável.
                      </p>
                      <p className="mt-1 text-xs font-medium leading-5 text-amber-800">
                        Encaminhe o tema para uma assembleia futura para preservar a pendência e liberar a publicação dos demais resultados.
                      </p>
                      <button
                        type="button"
                        onClick={() => openDeferAgendaModal(item)}
                        className="mt-3 h-10 rounded-xl bg-amber-700 px-4 text-sm font-semibold text-white transition hover:bg-amber-800"
                      >
                        Levar Para Próxima Assembleia
                      </button>
                    </div>
                  )}

                {item.type !== "INFORMATIVE" && (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-2xl bg-[#F9FBFA] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Participação</p>
                        <p className="mt-1 text-sm font-semibold text-[#17211B]">{item.participatingUnits} unidade(s)</p>
                      </div>
                      <div className="rounded-2xl bg-[#F9FBFA] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Peso Participante</p>
                        <p className="mt-1 text-sm font-semibold text-[#17211B]">{formatVotingWeight(item.participatingWeight)}</p>
                      </div>
                      <div className="rounded-2xl bg-[#F9FBFA] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Participação</p>
                        <p className="mt-1 text-sm font-semibold text-[#17211B]">{formatResultPercent(item.participationPct)}</p>
                      </div>
                      <div className="rounded-2xl bg-[#F9FBFA] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Abstenções</p>
                        <p className="mt-1 text-sm font-semibold text-[#17211B]">{formatVotingWeight(item.abstentionWeight)}</p>
                      </div>
                      <div className="rounded-2xl bg-[#F9FBFA] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Votos Válidos</p>
                        <p className="mt-1 text-sm font-semibold text-[#17211B]">{formatVotingWeight(item.validWeight)}</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {item.options.map((option) => (
                        <div key={option.optionId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-[#17211B]">{option.label}</p>
                            <p className="mt-1 text-xs font-medium text-[#7A877F]">
                              {option.votes} registro(s){option.isAbstention ? " · Abstenção" : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-[#17211B]">Peso {formatVotingWeight(option.weight)}</p>
                            <p className="mt-1 text-xs font-medium text-[#7A877F]">
                              {option.isAbstention
                                ? `${formatResultPercent(option.weightPctOfParticipation)} da participação`
                                : `${formatResultPercent(option.weightPctOfValidVotes)} dos votos válidos`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </article>
            ))}
          </section>
        )}


        {activeTab === "minute" && (
          <section className="mt-6 space-y-5">
            <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                    Documento Oficial Da Assembleia
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">
                    Ata Da Assembleia
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                    A minuta é construída com os dados oficiais já registrados. A publicação depende de revisão humana, aprovação formal e ação administrativa explícita.
                  </p>
                </div>

                {minute && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${minuteStatusClass(minute.status)}`}>
                      {minuteStatusLabel(minute.status)}
                    </span>
                    <span className="rounded-full border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-1 text-xs font-bold text-[#5E6B63]">
                      Versão {minute.currentVersion}
                    </span>
                  </div>
                )}
              </div>

              {minuteLoading ? (
                <p className="mt-5 text-sm font-semibold text-[#5E6B63]">
                  Carregando ata...
                </p>
              ) : !minute ? (
                <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-5">
                  <p className="text-sm font-semibold text-[#17211B]">
                    Nenhuma minuta foi gerada para esta assembleia.
                  </p>
                  <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#5E6B63]">
                    A geração estruturada é liberada depois da publicação oficial dos resultados. O EloGest utilizará exclusivamente os dados consolidados da assembleia e manterá uma fotografia auditável da origem do texto.
                  </p>

                  {minutePermissions.canGenerateStructuredMinute ? (
                    <button
                      type="button"
                      onClick={() => void handleMinuteAction("GENERATE_STRUCTURED")}
                      disabled={minuteSaving}
                      className="mt-4 h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#174B2A] disabled:opacity-50"
                    >
                      {minuteSaving ? "Gerando..." : "Gerar Minuta Estruturada"}
                    </button>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
                      Publique os resultados da assembleia para liberar a geração da ata.
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {minutePermissions.canRegenerateStructuredMinute && (
                      <button
                        type="button"
                        onClick={() => void handleMinuteAction("REGENERATE_STRUCTURED")}
                        disabled={minuteSaving}
                        className="h-10 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 text-sm font-semibold text-[#256D3C] transition hover:border-[#256D3C] disabled:opacity-50"
                      >
                        Regenerar Minuta
                      </button>
                    )}

                    {minutePermissions.canGenerateAiAssistedMinute && (
                      <button
                        type="button"
                        onClick={() => void handleMinuteAction("GENERATE_AI_ASSISTED")}
                        disabled={minuteSaving}
                        className="h-10 rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-700 transition hover:border-violet-300 disabled:opacity-50"
                      >
                        Aprimorar Texto Com IA
                      </button>
                    )}

                    {minutePermissions.canSubmitForReview && (
                      <button
                        type="button"
                        onClick={() => void handleMinuteAction("SUBMIT_FOR_REVIEW")}
                        disabled={minuteSaving}
                        className="h-10 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:border-blue-300 disabled:opacity-50"
                      >
                        Encaminhar Para Revisão
                      </button>
                    )}

                    {minutePermissions.canMarkReviewed && (
                      <button
                        type="button"
                        onClick={() => void handleMinuteAction("MARK_REVIEWED")}
                        disabled={minuteSaving}
                        className="h-10 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 transition hover:border-amber-300 disabled:opacity-50"
                      >
                        Confirmar Revisão Humana
                      </button>
                    )}

                    {minutePermissions.canApproveMinute && (
                      <button
                        type="button"
                        onClick={() => void handleMinuteAction("APPROVE")}
                        disabled={minuteSaving}
                        className="h-10 rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-700 transition hover:border-violet-300 disabled:opacity-50"
                      >
                        Aprovar Ata
                      </button>
                    )}

                    {minutePermissions.canPublishMinute && (
                      <button
                        type="button"
                        onClick={() => void handleMinuteAction("PUBLISH")}
                        disabled={minuteSaving}
                        className="h-10 rounded-xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#174B2A] disabled:opacity-50"
                      >
                        Publicar Ata Oficial
                      </button>
                    )}

                    {minute.status === "PUBLISHED" && !minute.officialPdfUrl && (
                      <button
                        type="button"
                        onClick={() => void handleGenerateOfficialPdf()}
                        disabled={minuteSaving || officialPdfSaving}
                        className="h-10 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 text-sm font-semibold text-[#256D3C] transition hover:border-[#256D3C] disabled:opacity-50"
                      >
                        {officialPdfSaving ? "Gerando PDF..." : "Gerar PDF Oficial"}
                      </button>
                    )}

                    {minute.officialPdfUrl && (
                      <a
                        href={minute.officialPdfUrl}
                        className="inline-flex h-10 items-center rounded-xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#174B2A]"
                      >
                        Baixar PDF Oficial
                      </a>
                    )}

                    {minutePermissions.canArchiveMinute && (
                      <button
                        type="button"
                        onClick={() => void handleMinuteAction("ARCHIVE")}
                        disabled={minuteSaving || officialPdfSaving}
                        className="h-10 rounded-xl border border-[#DDE5DF] bg-[#F6F8F7] px-4 text-sm font-semibold text-[#5E6B63] transition hover:border-[#AEBBB4] disabled:opacity-50"
                      >
                        Arquivar Ata
                      </button>
                    )}
                  </div>

                  {!minuteAiConfiguration.configured && minutePermissions.canEditMinute && (
                    <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium leading-6 text-blue-800">
                      O aprimoramento opcional com IA ainda não está configurado neste ambiente. A minuta estruturada, a revisão manual e a publicação oficial continuam funcionando normalmente.
                    </div>
                  )}

                  {minuteAiConfiguration.configured && minutePermissions.canEditMinute && (
                    <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium leading-6 text-violet-800">
                      A IA atua somente como assistente de redação. Ela recebe o texto público seguro da minuta, não acessa a auditoria administrativa e nunca publica a ata automaticamente.
                    </div>
                  )}

                  {minute.officialPdfUrl && (
                    <div className="mt-4 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#174B2A]">
                            PDF Oficial Disponível
                          </p>
                          <p className="mt-1 text-xs font-medium leading-5 text-[#256D3C]">
                            O arquivo foi gerado após a publicação formal da ata e possui hash SHA-256 registrado para verificação de integridade.
                          </p>
                        </div>
                        <a
                          href={minute.officialPdfUrl}
                          className="inline-flex h-9 items-center rounded-xl bg-[#256D3C] px-4 text-xs font-semibold text-white transition hover:bg-[#174B2A]"
                        >
                          Baixar PDF
                        </a>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs font-medium text-[#256D3C] md:grid-cols-2">
                        <p>
                          <strong>Arquivo:</strong> {minute.officialPdfName || "-"}
                        </p>
                        <p>
                          <strong>Tamanho:</strong> {formatFileSize(minute.officialPdfSizeBytes)}
                        </p>
                        <p>
                          <strong>Gerado Em:</strong> {formatDateTime(minute.officialPdfGeneratedAt)}
                        </p>
                        <p className="break-all">
                          <strong>Hash SHA-256:</strong> {minute.officialPdfHash || "-"}
                        </p>
                      </div>
                    </div>
                  )}

                  {minuteWarnings.length > 0 && (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-sm font-semibold text-amber-900">
                        Pontos Para Conferência Antes Da Aprovação
                      </p>
                      <div className="mt-2 space-y-1">
                        {minuteWarnings.map((warning, index) => (
                          <p key={`${warning}-${index}`} className="text-sm font-medium leading-6 text-amber-800">
                            • {warning}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </article>

            {!minuteLoading && minute && (
              <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <form
                  onSubmit={handleSaveMinuteRevision}
                  className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                        Revisão Manual Obrigatória
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-[#17211B]">
                        Conteúdo Da Ata
                      </h3>
                    </div>
                    <span className="rounded-full border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-1 text-xs font-bold text-[#5E6B63]">
                      {minuteGenerationModeLabel(minute.generationMode)}
                    </span>
                  </div>

                  <label className="mt-5 block">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                      Título Da Ata
                    </span>
                    <input
                      value={minuteForm.title}
                      onChange={(event) => updateMinuteForm("title", event.target.value)}
                      disabled={!minutePermissions.canEditMinute || minuteSaving}
                      className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                      Resumo Executivo
                    </span>
                    <textarea
                      value={minuteForm.executiveSummary}
                      onChange={(event) => updateMinuteForm("executiveSummary", event.target.value)}
                      disabled={!minutePermissions.canEditMinute || minuteSaving}
                      rows={5}
                      className="mt-2 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium leading-6 text-[#17211B] outline-none transition focus:border-[#256D3C] disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                      Texto Integral
                    </span>
                    <textarea
                      value={minuteForm.content}
                      onChange={(event) => updateMinuteForm("content", event.target.value)}
                      disabled={!minutePermissions.canEditMinute || minuteSaving}
                      rows={30}
                      className="mt-2 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium leading-6 text-[#17211B] outline-none transition focus:border-[#256D3C] disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </label>

                  {minutePermissions.canEditMinute ? (
                    <button
                      type="submit"
                      disabled={minuteSaving}
                      className="mt-4 h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#174B2A] disabled:opacity-50"
                    >
                      {minuteSaving ? "Salvando..." : "Salvar Nova Versão"}
                    </button>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-3 text-sm font-semibold leading-6 text-[#256D3C]">
                      O conteúdo foi congelado após a publicação oficial. O histórico permanece disponível para consulta.
                    </div>
                  )}
                </form>

                <div className="space-y-5">
                  <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                      Controle Formal
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-[#17211B]">
                      Responsáveis E Marcos
                    </h3>

                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl bg-[#F9FBFA] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Geração</p>
                        <p className="mt-1 text-sm font-semibold text-[#17211B]">{formatDateTime(minute.generatedAt)}</p>
                        <p className="mt-1 text-xs font-medium text-[#5E6B63]">{minuteUserLabel(minute.generatedByUser)}</p>
                      </div>
                      <div className="rounded-2xl bg-[#F9FBFA] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Revisão Humana</p>
                        <p className="mt-1 text-sm font-semibold text-[#17211B]">{formatDateTime(minute.reviewedAt)}</p>
                        <p className="mt-1 text-xs font-medium text-[#5E6B63]">{minuteUserLabel(minute.reviewedByUser)}</p>
                      </div>
                      <div className="rounded-2xl bg-[#F9FBFA] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Aprovação</p>
                        <p className="mt-1 text-sm font-semibold text-[#17211B]">{formatDateTime(minute.approvedAt)}</p>
                        <p className="mt-1 text-xs font-medium text-[#5E6B63]">{minuteUserLabel(minute.approvedByUser)}</p>
                      </div>
                      <div className="rounded-2xl bg-[#F9FBFA] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A877F]">Publicação Oficial</p>
                        <p className="mt-1 text-sm font-semibold text-[#17211B]">{formatDateTime(minute.publishedAt)}</p>
                        <p className="mt-1 text-xs font-medium text-[#5E6B63]">{minuteUserLabel(minute.publishedByUser)}</p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                      Histórico De Versões
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-[#17211B]">
                      Fotografias Preservadas
                    </h3>

                    <div className="mt-4 space-y-2">
                      {minute.versions.length === 0 ? (
                        <p className="text-sm font-medium text-[#5E6B63]">
                          Nenhuma versão localizada.
                        </p>
                      ) : (
                        minute.versions.map((version) => (
                          <button
                            key={version.id}
                            type="button"
                            onClick={() => setSelectedMinuteVersionId(version.id)}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                              selectedMinuteVersion?.id === version.id
                                ? "border-[#256D3C] bg-[#EAF7EE]"
                                : "border-[#DDE5DF] bg-[#F9FBFA] hover:border-[#AEBBB4]"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-[#17211B]">
                                Versão {version.version}
                              </p>
                              <p className="text-xs font-bold text-[#7A877F]">
                                {formatDateTime(version.createdAt)}
                              </p>
                            </div>
                            <p className="mt-1 text-xs font-semibold text-[#256D3C]">
                              {minuteVersionSourceLabel(version.source)}
                            </p>
                            <p className="mt-1 text-xs font-medium text-[#5E6B63]">
                              {minuteUserLabel(version.createdByUser)}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </article>
                </div>
              </div>
            )}

            {!minuteLoading && selectedMinuteVersion && (
              <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                      Consulta De Versão Preservada
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-[#17211B]">
                      Versão {selectedMinuteVersion.version} · {minuteVersionSourceLabel(selectedMinuteVersion.source)}
                    </h3>
                  </div>
                  <p className="text-xs font-bold text-[#7A877F]">
                    {formatDateTime(selectedMinuteVersion.createdAt)}
                  </p>
                </div>

                {selectedMinuteVersion.executiveSummary && (
                  <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                      Resumo Executivo
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-[#5E6B63]">
                      {selectedMinuteVersion.executiveSummary}
                    </p>
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-[#17211B]">
                    {selectedMinuteVersion.content}
                  </p>
                </div>
              </article>
            )}

            {!minuteLoading && minute && (
              <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                  Histórico Da Ata
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[#17211B]">
                  Trilha De Auditoria Do Documento
                </h3>

                <div className="mt-4 space-y-3">
                  {minute.logs.length === 0 ? (
                    <p className="text-sm font-medium text-[#5E6B63]">
                      Nenhum registro encontrado.
                    </p>
                  ) : (
                    minute.logs.map((log) => (
                      <div key={log.id} className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[#17211B]">
                            {minuteLogActionLabel(log.action)}
                          </p>
                          <p className="text-xs font-bold text-[#7A877F]">
                            {formatDateTime(log.createdAt)}
                          </p>
                        </div>
                        <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">
                          {log.message || "Registro administrativo da ata."}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-[#7A877F]">
                          {minuteUserLabel(log.user, "Sistema")}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </article>
            )}
          </section>
        )}




        {activeTab === "voteAudit" && (
          <section className="mt-6 space-y-5">
            <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                Área Restrita Da Administradora
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">
                Auditoria Administrativa De Votos
              </h2>
              <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-[#5E6B63]">
                Esta área preserva a rastreabilidade integral dos votos para conferência, contestação e segurança jurídica. A modalidade de transparência da pauta controla apenas a divulgação pública no portal e na ata.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard label="Votos Vigentes" value={voteAuditMetrics.total} description="Registros atuais por unidade e pauta." />
                <StatCard label="Alterados" value={voteAuditMetrics.changed} description="Votos com versões anteriores preservadas." />
                <StatCard label="Por Procuração" value={voteAuditMetrics.byRepresentation} description="Registros com representação formal." />
                <StatCard label="Nominais" value={voteAuditMetrics.nominal} description="Votos em pautas nominais por unidade." />
                <StatCard label="Sigilosos" value={voteAuditMetrics.secret} description="Visíveis somente na auditoria interna." />
              </div>
            </article>

            <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                    Filtros De Conferência
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[#17211B]">
                    Localize Um Registro Específico
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVoteAuditFilters(emptyVoteAuditFilters);
                    void loadVoteAudit({ filters: emptyVoteAuditFilters });
                  }}
                  className="h-10 rounded-2xl border border-[#DDE5DF] bg-white px-4 text-xs font-bold text-[#5E6B63] transition hover:border-[#256D3C]"
                >
                  Limpar Filtros
                </button>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1.15fr_1fr_1fr_1fr_auto]">
                <input
                  value={voteAuditFilters.query}
                  onChange={(event) =>
                    setVoteAuditFilters((previous) => ({
                      ...previous,
                      query: event.target.value,
                    }))
                  }
                  placeholder="Pessoa, e-mail, bloco ou unidade"
                  className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                />

                <select
                  value={voteAuditFilters.agendaItemId}
                  onChange={(event) =>
                    setVoteAuditFilters((previous) => ({
                      ...previous,
                      agendaItemId: event.target.value,
                    }))
                  }
                  className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="">Todas As Pautas</option>
                  {voteAuditAgendaItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.order}. {item.title}
                    </option>
                  ))}
                </select>

                <select
                  value={voteAuditFilters.origin}
                  onChange={(event) =>
                    setVoteAuditFilters((previous) => ({
                      ...previous,
                      origin: event.target.value,
                    }))
                  }
                  className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="">Todas As Origens</option>
                  <option value="DIRECT_UNIT_LINK">Vínculo Direto Com A Unidade</option>
                  <option value="PROXY_REPRESENTATION">Procuração Vigente</option>
                  <option value="AUTHORIZED_LINK">Vínculo Autorizado</option>
                  <option value="ADMINISTRATIVE_IMPORT">Importação Administrativa</option>
                </select>

                <select
                  value={voteAuditFilters.visibility}
                  onChange={(event) =>
                    setVoteAuditFilters((previous) => ({
                      ...previous,
                      visibility: event.target.value,
                    }))
                  }
                  className="h-11 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                >
                  <option value="">Todas As Modalidades</option>
                  <option value="CONSOLIDATED">Resultado Consolidado</option>
                  <option value="NOMINAL_BY_UNIT">Votação Nominal Por Unidade</option>
                  <option value="SECRET">Votação Sigilosa</option>
                </select>

                <button
                  type="button"
                  onClick={() => void loadVoteAudit({ filters: voteAuditFilters })}
                  disabled={voteAuditLoading}
                  className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {voteAuditLoading ? "Carregando..." : "Aplicar Filtros"}
                </button>
              </div>

              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                <input
                  type="checkbox"
                  checked={voteAuditFilters.changedOnly}
                  onChange={(event) =>
                    setVoteAuditFilters((previous) => ({
                      ...previous,
                      changedOnly: event.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <strong className="block text-sm text-[#17211B]">
                    Exibir Somente Votos Alterados
                  </strong>
                  <span className="mt-1 block text-xs font-medium leading-5 text-[#7A877F]">
                    Mostra apenas registros que possuem versões anteriores preservadas.
                  </span>
                </span>
              </label>
            </article>

            <article className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                    Registros Vigentes
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[#17211B]">
                    Votos Por Unidade E Pauta
                  </h3>
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                  {voteAuditItems.length} Registro(s) Exibido(s)
                </p>
              </div>

              {voteAuditLoading ? (
                <p className="mt-5 text-sm font-semibold text-[#5E6B63]">
                  Carregando auditoria dos votos...
                </p>
              ) : voteAuditItems.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-[#CFE6D4] bg-[#F9FBFA] p-6 text-sm font-semibold text-[#5E6B63]">
                  Nenhum voto encontrado para os filtros selecionados.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {voteAuditItems.map((item) => {
                    const expanded = expandedVoteAuditId === item.id;
                    const representationName =
                      item.representation?.representativeUser?.name ||
                      item.representation?.externalRepresentativeName ||
                      null;

                    return (
                      <div key={item.id} className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#256D3C]">
                              Pauta {item.agendaItem.order}
                            </p>
                            <h4 className="mt-1 text-base font-semibold text-[#17211B]">
                              {item.agendaItem.title}
                            </h4>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-bold text-[#5E6B63]">
                              {voteVisibilityLabel(item.agendaItem.voteVisibility)}
                            </span>
                            {item.changed && (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                                Alterado · Versão {item.version}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#7A877F]">Unidade</p>
                            <p className="mt-1 font-semibold text-[#17211B]">{item.eligibleUnit.label}</p>
                            <p className="mt-1 text-xs font-medium text-[#7A877F]">Peso: {formatVotingWeight(item.eligibleUnit.votingWeight)}</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#7A877F]">Voto Vigente</p>
                            <p className="mt-1 font-semibold text-[#17211B]">{voteAuditOptionsLabel(item.options)}</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#7A877F]">Registrado Por</p>
                            <p className="mt-1 font-semibold text-[#17211B]">{voteAuditUserLabel(item.voter)}</p>
                            <p className="mt-1 text-xs font-medium text-[#7A877F]">{voteAuditAccessLabel(item.voterAccess)}</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#7A877F]">Origem</p>
                            <p className="mt-1 font-semibold text-[#17211B]">{voteAuditOriginLabel(item.origin)}</p>
                            <p className="mt-1 text-xs font-medium text-[#7A877F]">{formatDateTime(item.submittedAt)}</p>
                          </div>
                        </div>

                        {representationName && (
                          <div className="mt-4 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-3 text-sm font-semibold leading-6 text-[#256D3C]">
                            Representante autorizado: {representationName}
                            {item.representation?.documentName ? ` · Documento: ${item.representation.documentName}` : ""}
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-[#7A877F]">
                            Registro atual: {formatDateTime(item.updatedAt)}
                          </p>
                          <button
                            type="button"
                            onClick={() => setExpandedVoteAuditId(expanded ? null : item.id)}
                            className="h-9 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 text-xs font-bold text-[#256D3C]"
                          >
                            {expanded ? "Ocultar Histórico" : `Ver Histórico (${item.revisions.length})`}
                          </button>
                        </div>

                        {expanded && (
                          <div className="mt-4 space-y-3 border-t border-[#DDE5DF] pt-4">
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#256D3C]">
                              Histórico De Versões
                            </p>
                            {item.revisions.map((revision) => (
                              <div key={revision.id} className="rounded-xl border border-[#DDE5DF] bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-[#17211B]">
                                    Versão {revision.version}
                                  </p>
                                  <p className="text-xs font-bold text-[#7A877F]">
                                    {formatDateTime(revision.createdAt)}
                                  </p>
                                </div>
                                <p className="mt-2 text-sm font-medium text-[#5E6B63]">
                                  Opções: {revision.optionLabels?.join(", ") || "Snapshot preservado."}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                                  Responsável: {voteAuditUserLabel(revision.changedByUser)}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                                  Motivo: {revision.reason || "Registro inicial do voto."}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          </section>
        )}


        {activeTab === "audit" && (
          <section className="mt-6 rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Histórico da assembleia</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">Trilha de auditoria</h2>
            <div className="mt-5 space-y-3">
              {assembly.logs.length === 0 ? (
                <p className="text-sm font-medium text-[#5E6B63]">Nenhum registro encontrado.</p>
              ) : (
                assembly.logs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#17211B]">{logActionLabel(log.action)}</p>
                      <p className="text-xs font-bold text-[#7A877F]">{formatDateTime(log.createdAt)}</p>
                    </div>
                    <p className="mt-2 text-sm font-medium leading-6 text-[#5E6B63]">{log.message || "Registro administrativo."}</p>
                    <p className="mt-2 text-xs font-semibold text-[#7A877F]">{log.user?.name || log.user?.email || "Sistema"}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        )}



        {representationModalOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17211B]/62 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[30px] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                    Representação formal
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {editingRepresentation ? "Editar Procuração" : "Nova Procuração"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => !representationSaving && setRepresentationModalOpen(false)}
                  className="h-10 w-10 rounded-2xl border border-[#DDE5DF] text-lg font-bold text-[#5E6B63]"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-3 text-sm font-semibold leading-6 text-[#256D3C]">
                O representante receberá autorização para votar por esta unidade somente nesta assembleia. O concedente é filtrado pela unidade selecionada. O perfil existente do representante serve apenas como apoio de identificação e acesso.
              </div>

              <form onSubmit={handleSaveRepresentation} className="mt-6 grid gap-4 md:grid-cols-2">
                <label>
                  <span className="text-sm font-semibold text-[#17211B]">Unidade Representada</span>
                  <select
                    value={representationForm.eligibleUnitId}
                    onChange={(e) => updateRepresentationForm("eligibleUnitId", e.target.value)}
                    className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  >
                    {representationEligibleUnits.map((item) => (
                      <option key={item.id} value={item.id}>
                        {unitLabel({
                          block: item.snapshotBlock,
                          unitNumber: item.snapshotUnitNumber,
                        })}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="text-sm font-semibold text-[#17211B]">Tipo De Representação</span>
                  <select
                    value={representationForm.representationType}
                    onChange={(e) => updateRepresentationForm("representationType", e.target.value as RepresentationType)}
                    className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  >
                    <option value="PROXY">Procuração</option>
                    <option value="AUTHORIZATION">Autorização Específica</option>
                    <option value="OTHER">Outro Instrumento</option>
                  </select>
                </label>

                <div className="md:col-span-2 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <p className="text-sm font-semibold text-[#17211B]">Concedente Da Representação</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-[#7A877F]">
                    A lista interna mostra somente pessoas vinculadas à unidade selecionada com permissão de voto.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateRepresentationForm("grantorMode", "INTERNAL")}
                      className={`h-10 rounded-xl border px-4 text-xs font-bold ${representationForm.grantorMode === "INTERNAL" ? "border-[#256D3C] bg-[#EAF7EE] text-[#256D3C]" : "border-[#DDE5DF] bg-white text-[#5E6B63]"}`}
                    >
                      Pessoa Vinculada À Unidade
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRepresentationForm("grantorMode", "DOCUMENT_ONLY")}
                      className={`h-10 rounded-xl border px-4 text-xs font-bold ${representationForm.grantorMode === "DOCUMENT_ONLY" ? "border-[#256D3C] bg-[#EAF7EE] text-[#256D3C]" : "border-[#DDE5DF] bg-white text-[#5E6B63]"}`}
                    >
                      Conforme Documento Externo
                    </button>
                  </div>

                  {representationForm.grantorMode === "INTERNAL" ? (
                    <label className="mt-4 block">
                      <span className="text-sm font-semibold text-[#17211B]">Concedente</span>
                      <select
                        value={representationForm.grantorUserId}
                        onChange={(e) => updateRepresentationForm("grantorUserId", e.target.value)}
                        className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                      >
                        <option value="">Selecione O Concedente</option>
                        {grantorCandidates.map((item) => (
                          <option key={item.id} value={item.id}>{candidateUserLabel(item)}</option>
                        ))}
                      </select>
                      {grantorCandidates.length === 0 && (
                        <p className="mt-2 text-xs font-semibold text-amber-700">
                          Nenhum concedente interno apto foi encontrado para esta unidade. Utilize a opção conforme documento externo quando aplicável.
                        </p>
                      )}
                    </label>
                  ) : (
                    <label className="mt-4 block">
                      <span className="text-sm font-semibold text-[#17211B]">Nome Do Concedente Conforme Documento</span>
                      <input
                        value={representationForm.externalGrantorName}
                        onChange={(e) => updateRepresentationForm("externalGrantorName", e.target.value)}
                        className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                        placeholder="Nome completo"
                      />
                    </label>
                  )}
                </div>

                <div className="md:col-span-2 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <p className="text-sm font-semibold text-[#17211B]">Representante Autorizado</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-[#7A877F]">
                    Pesquise uma pessoa já cadastrada no EloGest ou registre um representante externo.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateRepresentationForm("representativeMode", "INTERNAL")}
                      className={`h-10 rounded-xl border px-4 text-xs font-bold ${representationForm.representativeMode === "INTERNAL" ? "border-[#256D3C] bg-[#EAF7EE] text-[#256D3C]" : "border-[#DDE5DF] bg-white text-[#5E6B63]"}`}
                    >
                      Pessoa Já Cadastrada
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRepresentationForm("representativeMode", "EXTERNAL")}
                      className={`h-10 rounded-xl border px-4 text-xs font-bold ${representationForm.representativeMode === "EXTERNAL" ? "border-[#256D3C] bg-[#EAF7EE] text-[#256D3C]" : "border-[#DDE5DF] bg-white text-[#5E6B63]"}`}
                    >
                      Cadastrar Representante Externo
                    </button>
                  </div>

                  {representationForm.representativeMode === "INTERNAL" ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input
                          value={representativeSearch}
                          onChange={(e) => setRepresentativeSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleRepresentativeSearch();
                            }
                          }}
                          className="h-11 rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                          placeholder="Buscar por nome ou e-mail..."
                        />
                        <button
                          type="button"
                          onClick={handleRepresentativeSearch}
                          disabled={candidateSearchLoading}
                          className="h-11 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 text-sm font-semibold text-[#256D3C] disabled:opacity-50"
                        >
                          {candidateSearchLoading ? "Buscando..." : "Buscar"}
                        </button>
                      </div>

                      {candidateUsers.length > 0 && (
                        <div className="max-h-44 space-y-2 overflow-y-auto rounded-2xl border border-[#DDE5DF] bg-white p-2">
                          {candidateUsers.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => selectInternalRepresentative(item)}
                              className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition ${representationForm.representativeUserId === item.id ? "bg-[#EAF7EE]" : "hover:bg-[#F9FBFA]"}`}
                            >
                              <span>
                                <span className="block text-sm font-semibold text-[#17211B]">{item.name}</span>
                                <span className="mt-1 block text-xs font-medium text-[#7A877F]">{item.email}</span>
                              </span>
                              <span className="text-xs font-bold text-[#256D3C]">
                                {representationForm.representativeUserId === item.id
                                  ? "Selecionado"
                                  : "Selecionar"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {representationForm.representativeUserId && (
                        <div className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#256D3C]">
                            Representante Selecionado
                          </p>
                          <p className="mt-2 text-sm font-semibold text-[#17211B]">
                            {candidateUserLabel(
                              candidateUsers.find(
                                (item) => item.id === representationForm.representativeUserId,
                              ),
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setRepresentationForm((prev) => ({
                                ...prev,
                                representativeUserId: "",
                                representativeAccessId: "",
                              }))
                            }
                            className="mt-3 h-9 rounded-xl border border-[#CFE6D4] bg-white px-3 text-xs font-bold text-[#256D3C]"
                          >
                            Trocar Representante
                          </button>
                        </div>
                      )}

                      <label className="block">
                        <span className="text-sm font-semibold text-[#17211B]">Perfil Existente Do Representante</span>
                        <select
                          value={representationForm.representativeAccessId}
                          onChange={(e) => updateRepresentationForm("representativeAccessId", e.target.value)}
                          className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                        >
                          <option value="">Sem Perfil Específico</option>
                          {(candidateUsers.find((item) => item.id === representationForm.representativeUserId)?.accesses || []).map((access) => (
                            <option key={access.id} value={access.id}>
                              {candidateAccessLabel(access)}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs font-medium text-[#7A877F]">
                          Este campo é opcional. A autorização decorre da procuração vinculada à unidade, não do perfil pré-existente.
                        </p>
                      </label>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label>
                        <span className="text-sm font-semibold text-[#17211B]">Nome Completo</span>
                        <input
                          value={representationForm.externalRepresentativeName}
                          onChange={(e) => updateRepresentationForm("externalRepresentativeName", e.target.value)}
                          className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                        />
                      </label>
                      <label>
                        <span className="text-sm font-semibold text-[#17211B]">E-mail</span>
                        <input
                          type="email"
                          value={representationForm.externalRepresentativeEmail}
                          onChange={(e) => updateRepresentationForm("externalRepresentativeEmail", e.target.value)}
                          className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                        />
                      </label>
                      <label>
                        <span className="text-sm font-semibold text-[#17211B]">Telefone</span>
                        <input
                          value={representationForm.externalRepresentativePhone}
                          onChange={(e) => updateRepresentationForm("externalRepresentativePhone", e.target.value)}
                          className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                          placeholder="Opcional"
                        />
                      </label>
                      <label>
                        <span className="text-sm font-semibold text-[#17211B]">Documento De Identificação</span>
                        <input
                          value={representationForm.externalRepresentativeDocument}
                          onChange={(e) => updateRepresentationForm("externalRepresentativeDocument", e.target.value)}
                          className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                          placeholder="Opcional"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#17211B]">
                        Documento Comprobatório
                      </p>
                      <p className="mt-1 text-xs font-medium leading-5 text-[#7A877F]">
                        Envie um arquivo PDF ou uma imagem legível. Tamanho máximo: 10 MB.
                      </p>
                    </div>

                    <label className={`inline-flex h-10 cursor-pointer items-center rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 text-xs font-bold text-[#256D3C] ${representationDocumentUploading ? "pointer-events-none opacity-50" : ""}`}>
                      {representationDocumentUploading
                        ? "Enviando..."
                        : representationForm.documentUrl
                          ? "Substituir Documento"
                          : "Selecionar Documento"}
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                        onChange={(event) => void handleRepresentationDocumentUpload(event)}
                        className="hidden"
                        disabled={representationDocumentUploading}
                      />
                    </label>
                  </div>

                  {representationForm.documentUrl ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#CFE6D4] bg-white p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#17211B]">
                          {representationForm.documentName || "Documento Comprobatório"}
                        </p>
                        <a
                          href={representationForm.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex text-xs font-bold text-[#256D3C] underline underline-offset-2"
                        >
                          Visualizar Documento
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemoveRepresentationDocument()}
                        disabled={representationDocumentUploading}
                        className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 disabled:opacity-50"
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs font-semibold text-[#7A877F]">
                      Nenhum documento enviado.
                    </p>
                  )}
                </div>

                <label>
                  <span className="text-sm font-semibold text-[#17211B]">Início Da Vigência</span>
                  <input
                    type="datetime-local"
                    value={representationForm.validFrom}
                    onChange={(e) => updateRepresentationForm("validFrom", e.target.value)}
                    className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  />
                </label>

                <label>
                  <span className="text-sm font-semibold text-[#17211B]">Fim Da Vigência</span>
                  <input
                    type="datetime-local"
                    value={representationForm.validUntil}
                    onChange={(e) => updateRepresentationForm("validUntil", e.target.value)}
                    className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="text-sm font-semibold text-[#17211B]">Observações</span>
                  <textarea
                    value={representationForm.notes}
                    onChange={(e) => updateRepresentationForm("notes", e.target.value)}
                    className="mt-2 min-h-24 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium outline-none focus:border-[#256D3C]"
                  />
                </label>

                <div className="md:col-span-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => !representationSaving && setRepresentationModalOpen(false)}
                    className="h-11 rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={representationSaving || representationDocumentUploading}
                    className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {representationDocumentUploading ? "Enviando Documento..." : representationSaving ? "Salvando..." : "Salvar Procuração"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {eligibleUnitModalOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17211B]/62 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-[30px] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                    Fotografia de elegibilidade
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {editingEligibleUnit ? "Editar Unidade" : "Adicionar Unidade"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => !eligibilitySaving && setEligibleUnitModalOpen(false)}
                  className="h-10 w-10 rounded-2xl border border-[#DDE5DF] text-lg font-bold text-[#5E6B63]"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSaveEligibleUnit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-[#17211B]">Unidade</span>
                  {editingEligibleUnit ? (
                    <div className="mt-2 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-semibold text-[#17211B]">
                      {unitLabel({
                        block: editingEligibleUnit.snapshotBlock,
                        unitNumber: editingEligibleUnit.snapshotUnitNumber,
                      })}
                    </div>
                  ) : (
                    <select
                      value={eligibleUnitForm.unitId}
                      onChange={(event) => updateEligibleUnitForm("unitId", event.target.value)}
                      className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                    >
                      {availableUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unitLabel(unit)}
                        </option>
                      ))}
                    </select>
                  )}
                </label>

                {editingEligibleUnit && (
                  <label className="block">
                    <span className="text-sm font-semibold text-[#17211B]">Situação</span>
                    <select
                      value={eligibleUnitForm.status}
                      onChange={(event) =>
                        updateEligibleUnitForm("status", event.target.value as EligibilityStatus)
                      }
                      className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                    >
                      <option value="ELIGIBLE">Apta Para Votação</option>
                      <option value="BLOCKED">Bloqueada</option>
                    </select>
                  </label>
                )}

                <label className="block">
                  <span className="text-sm font-semibold text-[#17211B]">Peso Do Voto</span>
                  <input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={eligibleUnitForm.votingWeight}
                    onChange={(event) =>
                      updateEligibleUnitForm("votingWeight", event.target.value)
                    }
                    className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  />
                  <p className="mt-2 text-xs font-medium leading-5 text-[#7A877F]">
                    Mantenha 1 para voto unitário. O campo permite evolução futura
                    para fração ideal.
                  </p>
                </label>

                {editingEligibleUnit && eligibleUnitForm.status === "BLOCKED" && (
                  <label className="block">
                    <span className="text-sm font-semibold text-[#17211B]">
                      Motivo Do Bloqueio
                    </span>
                    <textarea
                      value={eligibleUnitForm.blockedReason}
                      onChange={(event) =>
                        updateEligibleUnitForm("blockedReason", event.target.value)
                      }
                      className="mt-2 min-h-24 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium outline-none focus:border-[#256D3C]"
                      placeholder="Descreva a justificativa administrativa."
                    />
                  </label>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => !eligibilitySaving && setEligibleUnitModalOpen(false)}
                    className="h-11 rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={eligibilitySaving}
                    className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {eligibilitySaving ? "Salvando..." : "Salvar Unidade"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deferAgendaModalOpen && (
          <div className="fixed inset-0 z-[98] flex items-center justify-center bg-[#17211B]/62 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[30px] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Continuidade Da Deliberação</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">Levar Para Próxima Assembleia</h2>
                  <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                    A pauta ficará memorizada como pendência do condomínio e será sugerida durante a criação da próxima assembleia.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !deferringAgendaItem && setDeferAgendaModalOpen(false)}
                  className="h-10 w-10 rounded-2xl border border-[#DDE5DF] text-lg font-bold text-[#5E6B63]"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleDeferAgendaItem} className="mt-6 space-y-4">
                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">Pauta</p>
                  <p className="mt-2 text-sm font-semibold text-[#17211B]">{deferAgendaForm.title}</p>
                </div>

                <label className="block">
                  <span className="text-sm font-semibold text-[#17211B]">Motivo Do Encaminhamento</span>
                  <select
                    value={deferAgendaForm.deferredReason}
                    onChange={(event) => setDeferAgendaForm((current) => ({
                      ...current,
                      deferredReason: event.target.value as DeferAgendaFormState["deferredReason"],
                    }))}
                    className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  >
                    <option value="TIE">Empate</option>
                    <option value="NO_QUORUM">Ausência De Quórum</option>
                    <option value="BUDGET_REVIEW">Necessidade De Orçamento</option>
                    <option value="MORE_INFORMATION">Necessidade De Informações Complementares</option>
                    <option value="POSTPONE">Decisão De Adiar A Deliberação</option>
                    <option value="OTHER">Outro Motivo</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-[#17211B]">Observação Complementar</span>
                  <textarea
                    value={deferAgendaForm.deferredNotes}
                    onChange={(event) => setDeferAgendaForm((current) => ({
                      ...current,
                      deferredNotes: event.target.value,
                    }))}
                    className="mt-2 min-h-24 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium outline-none focus:border-[#256D3C]"
                    placeholder="Registre informações úteis para a próxima deliberação."
                  />
                </label>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => !deferringAgendaItem && setDeferAgendaModalOpen(false)}
                    className="h-11 rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={deferringAgendaItem}
                    className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {deferringAgendaItem ? "Salvando..." : "Confirmar Encaminhamento"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {votingExtensionModalOpen && assembly && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[#17211B]/62 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[30px] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Prazo da votação</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
                    {assembly.status === "CLOSED" ? "Reabrir Votação Com Prorrogação" : "Prorrogar Votação"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                    As pautas que usam o prazo geral acompanham a prorrogação automaticamente. Você também pode optar por ampliar as pautas com prazo específico. Unidades aptas, pesos e votos já registrados permanecem preservados.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !votingExtensionSaving && setVotingExtensionModalOpen(false)}
                  className="h-10 w-10 rounded-2xl border border-[#DDE5DF] text-lg font-bold text-[#5E6B63]"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleExtendVoting} className="mt-6 space-y-4">
                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">Prazo Atual</p>
                  <p className="mt-2 text-sm font-semibold text-[#17211B]">{formatDateTime(assembly.votingEndsAt)}</p>
                </div>

                <label className="block">
                  <span className="text-sm font-semibold text-[#17211B]">Novo Prazo Final Da Votação</span>
                  <input
                    type="datetime-local"
                    value={votingExtensionForm.newVotingEndsAt}
                    onChange={(event) => updateVotingExtensionForm("newVotingEndsAt", event.target.value)}
                    className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-[#17211B]">Motivo Da Prorrogação</span>
                  <textarea
                    value={votingExtensionForm.reason}
                    onChange={(event) => updateVotingExtensionForm("reason", event.target.value)}
                    className="mt-2 min-h-24 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium outline-none focus:border-[#256D3C]"
                    placeholder="Ex.: ampliar o prazo para permitir maior participação das unidades elegíveis."
                  />
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <input
                    type="checkbox"
                    checked={votingExtensionForm.extendSpecificAgendaItems}
                    onChange={(event) => updateVotingExtensionForm("extendSpecificAgendaItems", event.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <strong className="block text-sm text-blue-800">Prorrogar Também Pautas Com Prazo Específico</strong>
                    <span className="mt-1 block text-xs leading-5 text-blue-700">
                      Pautas que usam o prazo geral já acompanham a nova data automaticamente. Marque esta opção para ampliar também as pautas específicas que terminariam antes do novo prazo.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4">
                  <input
                    type="checkbox"
                    checked={votingExtensionForm.notifyParticipants}
                    onChange={(event) => updateVotingExtensionForm("notifyParticipants", event.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <strong className="block text-sm text-[#256D3C]">Notificar Participantes</strong>
                    <span className="mt-1 block text-xs leading-5 text-[#5E6B63]">Envie uma notificação interna e e-mail com o novo prazo final da votação.</span>
                  </span>
                </label>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => !votingExtensionSaving && setVotingExtensionModalOpen(false)}
                    className="h-11 rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={votingExtensionSaving}
                    className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {votingExtensionSaving
                      ? "Salvando..."
                      : assembly.status === "CLOSED"
                        ? "Reabrir Votação"
                        : "Prorrogar Votação"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {generalModalOpen && generalForm && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17211B]/62 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[30px] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Dados gerais</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">Editar Assembleia</h2></div>
                <button type="button" onClick={() => !saving && setGeneralModalOpen(false)} className="h-10 w-10 rounded-2xl border border-[#DDE5DF] text-lg font-bold text-[#5E6B63]">×</button>
              </div>
              <form onSubmit={handleSaveGeneral} className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="md:col-span-2"><span className="text-sm font-semibold text-[#17211B]">Título</span><input value={generalForm.title} onChange={(e) => updateGeneralForm("title", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Condomínio</span><select value={generalForm.condominiumId} onChange={(e) => updateGeneralForm("condominiumId", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]">{condominios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Tipo</span><select value={generalForm.type} onChange={(e) => updateGeneralForm("type", e.target.value as AssemblyType)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"><option value="ORDINARY">Ordinária</option><option value="EXTRAORDINARY">Extraordinária</option><option value="SPECIAL">Especial</option><option value="OTHER">Outra</option></select></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Modalidade</span><select value={generalForm.mode} onChange={(e) => updateGeneralForm("mode", e.target.value as MeetingMode)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"><option value="PRESENTIAL">Presencial</option><option value="ONLINE">Virtual</option><option value="HYBRID">Híbrida</option></select></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Início previsto</span><input type="datetime-local" value={generalForm.scheduledStartAt} onChange={(e) => updateGeneralForm("scheduledStartAt", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Encerramento previsto</span><input type="datetime-local" value={generalForm.scheduledEndAt} onChange={(e) => updateGeneralForm("scheduledEndAt", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Início da votação</span><input type="datetime-local" value={generalForm.votingStartsAt} onChange={(e) => updateGeneralForm("votingStartsAt", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Fim da votação</span><input type="datetime-local" value={generalForm.votingEndsAt} onChange={(e) => updateGeneralForm("votingEndsAt", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Local</span><input value={generalForm.location} onChange={(e) => updateGeneralForm("location", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Link da reunião</span><input value={generalForm.externalMeetingUrl} onChange={(e) => updateGeneralForm("externalMeetingUrl", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                <label className="md:col-span-2"><span className="text-sm font-semibold text-[#17211B]">Descrição</span><textarea value={generalForm.description} onChange={(e) => updateGeneralForm("description", e.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium outline-none focus:border-[#256D3C]" /></label>
                <label className="md:col-span-2"><span className="text-sm font-semibold text-[#17211B]">Texto da convocação</span><textarea value={generalForm.convocationText} onChange={(e) => updateGeneralForm("convocationText", e.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium outline-none focus:border-[#256D3C]" /></label>
                <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"><input type="checkbox" checked={generalForm.allowVoteChange} onChange={(e) => updateGeneralForm("allowVoteChange", e.target.checked)} className="mt-1 h-4 w-4" /><span className="text-sm font-semibold text-[#17211B]">Permitir alteração do voto enquanto a assembleia estiver aberta</span></label>
                <div className="md:col-span-2 flex justify-end gap-3"><button type="button" onClick={() => !saving && setGeneralModalOpen(false)} className="h-11 rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63]">Cancelar</button><button type="submit" disabled={saving} className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Salvando..." : "Salvar Alterações"}</button></div>
              </form>
            </div>
          </div>
        )}

        {agendaModalOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#17211B]/62 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[30px] bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">Pauta da assembleia</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">{editingAgendaItem ? "Editar Pauta" : "Nova Pauta"}</h2></div><button type="button" onClick={() => !agendaSaving && setAgendaModalOpen(false)} className="h-10 w-10 rounded-2xl border border-[#DDE5DF] text-lg font-bold text-[#5E6B63]">×</button></div>
              <form onSubmit={handleSaveAgenda} className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="md:col-span-2"><span className="text-sm font-semibold text-[#17211B]">Título</span><input value={agendaForm.title} onChange={(e) => updateAgendaForm("title", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" placeholder="Ex.: Aprovação do orçamento anual" /></label>
                <label className="md:col-span-2"><span className="text-sm font-semibold text-[#17211B]">Descrição</span><textarea value={agendaForm.description} onChange={(e) => updateAgendaForm("description", e.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium outline-none focus:border-[#256D3C]" /></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Tipo da pauta</span><select value={agendaForm.type} onChange={(e) => updateAgendaForm("type", e.target.value as AgendaItemType)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"><option value="INFORMATIVE">Somente informativa</option><option value="APPROVE_REJECT_ABSTAIN">Aprovar, rejeitar ou abster-se</option><option value="YES_NO_ABSTAIN">Sim, não ou abster-se</option><option value="SINGLE_CHOICE">Escolha única</option><option value="MULTIPLE_CHOICE">Múltipla escolha</option></select></label>
                <label><span className="text-sm font-semibold text-[#17211B]">Regra de quórum</span><select value={agendaForm.quorumRuleType} onChange={(e) => updateAgendaForm("quorumRuleType", e.target.value as QuorumRuleType)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"><option value="SIMPLE_MAJORITY">Maioria simples dos votos válidos</option><option value="MINIMUM_PARTICIPATION">Participação mínima</option><option value="MINIMUM_APPROVAL">Aprovação mínima</option><option value="CUSTOM">Regra personalizada</option></select></label>
                <label className="md:col-span-2">
                  <span className="text-sm font-semibold text-[#17211B]">Transparência Da Votação</span>
                  <select
                    value={agendaForm.voteVisibility}
                    onChange={(e) => updateAgendaForm("voteVisibility", e.target.value as VoteVisibility)}
                    className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]"
                  >
                    <option value="CONSOLIDATED">Resultado Consolidado</option>
                    <option value="NOMINAL_BY_UNIT">Votação Nominal Por Unidade</option>
                    <option value="SECRET">Votação Sigilosa</option>
                  </select>
                  <span className="mt-2 block rounded-xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-2 text-xs font-medium leading-5 text-[#5E6B63]">
                    {voteVisibilityDescription(agendaForm.voteVisibility)}
                  </span>
                </label>
                {agendaForm.quorumRuleType === "MINIMUM_PARTICIPATION" && <label><span className="text-sm font-semibold text-[#17211B]">Participação mínima (%)</span><input type="number" min="0" max="100" step="0.01" value={agendaForm.minimumParticipationPct} onChange={(e) => updateAgendaForm("minimumParticipationPct", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>}
                {agendaForm.quorumRuleType === "MINIMUM_APPROVAL" && <label><span className="text-sm font-semibold text-[#17211B]">Aprovação mínima (%)</span><input type="number" min="0" max="100" step="0.01" value={agendaForm.minimumApprovalPct} onChange={(e) => updateAgendaForm("minimumApprovalPct", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>}
                {agendaForm.quorumRuleType === "CUSTOM" && <label className="md:col-span-2"><span className="text-sm font-semibold text-[#17211B]">Descrição da regra personalizada</span><textarea value={agendaForm.customRuleDescription} onChange={(e) => updateAgendaForm("customRuleDescription", e.target.value)} className="mt-2 min-h-20 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-medium outline-none focus:border-[#256D3C]" /></label>}
                <div className="md:col-span-2 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <p className="text-sm font-semibold text-[#17211B]">Prazo Da Votação Da Pauta</p>
                  <p className="mt-1 text-xs leading-5 text-[#7A877F]">
                    Por padrão, a pauta acompanha automaticamente o prazo geral da assembleia, inclusive quando houver prorrogação.
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="flex items-start gap-3 rounded-xl border border-[#CFE6D4] bg-white p-3">
                      <input
                        type="radio"
                        name="agendaVotingWindow"
                        checked={agendaForm.useAssemblyVotingWindow}
                        onChange={() => updateAgendaForm("useAssemblyVotingWindow", true)}
                        className="mt-1"
                      />
                      <span>
                        <strong className="block text-sm text-[#256D3C]">Usar O Prazo Geral Da Assembleia</strong>
                        <span className="mt-1 block text-xs leading-5 text-[#5E6B63]">Recomendado para a maioria das pautas.</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-[#DDE5DF] bg-white p-3">
                      <input
                        type="radio"
                        name="agendaVotingWindow"
                        checked={!agendaForm.useAssemblyVotingWindow}
                        onChange={() => updateAgendaForm("useAssemblyVotingWindow", false)}
                        className="mt-1"
                      />
                      <span>
                        <strong className="block text-sm text-[#17211B]">Definir Prazo Específico Para Esta Pauta</strong>
                        <span className="mt-1 block text-xs leading-5 text-[#5E6B63]">Use somente quando a pauta precisar de uma janela própria.</span>
                      </span>
                    </label>
                  </div>
                </div>
                {!agendaForm.useAssemblyVotingWindow && (
                  <>
                    <label><span className="text-sm font-semibold text-[#17211B]">Início Da Votação Da Pauta</span><input type="datetime-local" value={agendaForm.votingStartsAt} onChange={(e) => updateAgendaForm("votingStartsAt", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                    <label><span className="text-sm font-semibold text-[#17211B]">Fim Da Votação Da Pauta</span><input type="datetime-local" value={agendaForm.votingEndsAt} onChange={(e) => updateAgendaForm("votingEndsAt", e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" /></label>
                  </>
                )}

                {(agendaForm.type === "SINGLE_CHOICE" || agendaForm.type === "MULTIPLE_CHOICE") && (
                  <div className="md:col-span-2 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[#17211B]">Opções de voto</p><p className="mt-1 text-xs font-medium text-[#7A877F]">Cadastre de 2 a 20 alternativas.</p></div><button type="button" onClick={addAgendaOption} className="h-9 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-3 text-xs font-bold text-[#256D3C]">Adicionar Opção</button></div>
                    <div className="mt-4 space-y-3">
                      {agendaForm.options.map((option, index) => (
                        <div key={`${option.id || "new"}-${index}`} className="grid gap-2 rounded-xl border border-[#DDE5DF] bg-white p-3 md:grid-cols-[1fr_1fr_auto]">
                          <input value={option.label} onChange={(e) => updateAgendaOption(index, "label", e.target.value)} className="h-10 rounded-xl border border-[#DDE5DF] px-3 text-sm font-semibold outline-none focus:border-[#256D3C]" placeholder={`Opção ${index + 1}`} />
                          <input value={option.description} onChange={(e) => updateAgendaOption(index, "description", e.target.value)} className="h-10 rounded-xl border border-[#DDE5DF] px-3 text-sm font-medium outline-none focus:border-[#256D3C]" placeholder="Descrição opcional" />
                          <button type="button" onClick={() => removeAgendaOption(index)} className="h-10 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700">Remover</button>
                        </div>
                      ))}
                    </div>
                    <label className="mt-4 flex items-start gap-3 rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] p-4">
                      <input
                        type="checkbox"
                        checked={agendaForm.allowAbstention}
                        onChange={(e) => updateAgendaForm("allowAbstention", e.target.checked)}
                        className="mt-1 h-4 w-4"
                      />
                      <span>
                        <strong className="block text-sm text-[#256D3C]">Permitir Opção De Abstenção</strong>
                        <span className="mt-1 block text-xs leading-5 text-[#5E6B63]">
                          Quando habilitada, a opção fixa “Abster-se” será incluída automaticamente para os participantes. A abstenção conta como participação, mas não entra no cálculo dos votos válidos.
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                {(agendaForm.type === "APPROVE_REJECT_ABSTAIN" || agendaForm.type === "YES_NO_ABSTAIN") && (
                  <p className="md:col-span-2 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-3 text-sm font-semibold leading-6 text-[#256D3C]">
                    Este tipo de pauta já inclui automaticamente a opção “Abster-se”.
                  </p>
                )}

                {getAgendaValidationMessage(agendaForm) && <p className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{getAgendaValidationMessage(agendaForm)}</p>}
                <div className="md:col-span-2 flex justify-end gap-3"><button type="button" onClick={() => !agendaSaving && setAgendaModalOpen(false)} className="h-11 rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#5E6B63]">Cancelar</button><button type="submit" disabled={agendaSaving || Boolean(getAgendaValidationMessage(agendaForm))} className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white disabled:opacity-50">{agendaSaving ? "Salvando..." : "Salvar Pauta"}</button></div>
              </form>
            </div>
          </div>
        )}
      </AdminShell>
    </AdminContextGuard>
  );
}
