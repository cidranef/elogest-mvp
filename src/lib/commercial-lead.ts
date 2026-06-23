import type {
  CommercialLeadPriority,
  CommercialLeadStage,
  OnboardingRequestStatus,
} from "@prisma/client";

export const COMMERCIAL_STAGE_OPTIONS: Array<{
  value: CommercialLeadStage;
  label: string;
}> = [
  { value: "NEW", label: "Novo Lead" },
  { value: "CONTACT_PENDING", label: "Contato Pendente" },
  { value: "CONTACTED", label: "Contato Realizado" },
  { value: "DIAGNOSIS_SENT", label: "Diagnóstico Enviado" },
  { value: "DIAGNOSIS_RECEIVED", label: "Diagnóstico Respondido" },
  { value: "QUALIFIED", label: "Qualificado" },
  { value: "DEMO_SCHEDULED", label: "Demonstração Agendada" },
  { value: "DEMO_COMPLETED", label: "Demonstração Realizada" },
  { value: "PILOT_PROPOSED", label: "Piloto Proposto" },
  { value: "PILOT_ACTIVE", label: "Piloto Ativo" },
  { value: "PROPOSAL_SENT", label: "Proposta Enviada" },
  { value: "NEGOTIATION", label: "Negociação" },
  { value: "CONVERTED", label: "Convertido" },
  { value: "LOST", label: "Perdido" },
  { value: "FOLLOW_UP", label: "Acompanhamento Futuro" },
];

export const COMMERCIAL_PRIORITY_OPTIONS: Array<{
  value: CommercialLeadPriority;
  label: string;
}> = [
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Média" },
  { value: "HIGH", label: "Alta" },
  { value: "STRATEGIC", label: "Estratégica" },
];

export const ONBOARDING_STATUS_LABELS: Record<OnboardingRequestStatus, string> = {
  PENDING_REVIEW: "Aguardando Revisão",
  IN_CONTACT: "Em Contato",
  APPROVED: "Aprovado",
  CONVERTED: "Convertido",
  REJECTED: "Recusado",
};

export function commercialStageLabel(value: CommercialLeadStage) {
  return COMMERCIAL_STAGE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function commercialPriorityLabel(value: CommercialLeadPriority) {
  return COMMERCIAL_PRIORITY_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function scoreClassification(score: number) {
  if (score >= 43) return "Oportunidade Estratégica";
  if (score >= 36) return "Alta Prioridade";
  if (score >= 26) return "Oportunidade Qualificada";
  if (score >= 16) return "Em Desenvolvimento";
  return "Baixa Prioridade";
}

export function clampCommercialScore(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(50, Math.round(parsed)));
}
