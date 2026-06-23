import type { CommercialQualificationClassification } from "@prisma/client";

export const QUALIFICATION_CRITERIA = [
  ["painScore", "Dor Clara E Relevante"],
  ["urgencyScore", "Urgência"],
  ["productFitScore", "Aderência Aos Módulos"],
  ["authorityScore", "Participação Do Decisor"],
  ["implementationScore", "Capacidade De Implantação"],
  ["financialScore", "Capacidade Financeira"],
  ["expansionScore", "Potencial De Expansão"],
  ["strategicScore", "Potencial Estratégico"],
  ["pilotScore", "Disponibilidade Para Piloto"],
  ["engagementScore", "Engajamento Comercial"],
] as const;

export function clampQualificationScore(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(5, Math.round(number)));
}

export function qualificationClassification(score: number): CommercialQualificationClassification {
  if (score >= 43) return "STRATEGIC";
  if (score >= 36) return "HIGH_PRIORITY";
  if (score >= 26) return "QUALIFIED";
  if (score >= 16) return "DEVELOPING";
  return "LOW_PRIORITY";
}

export function qualificationClassificationLabel(value: CommercialQualificationClassification) {
  return {
    LOW_PRIORITY: "Baixa Prioridade",
    DEVELOPING: "Em Desenvolvimento",
    QUALIFIED: "Oportunidade Qualificada",
    HIGH_PRIORITY: "Alta Prioridade",
    STRATEGIC: "Oportunidade Estratégica",
  }[value];
}

export function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 50);
}
