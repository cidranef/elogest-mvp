import type {
  CommercialMeetingStatus,
  CommercialMeetingType,
} from "@prisma/client";

export const COMMERCIAL_MEETING_TYPE_LABELS: Record<
  CommercialMeetingType,
  string
> = {
  DISCOVERY: "Diagnóstico",
  DEMO_10: "Demonstração De 10 Minutos",
  DEMO_30: "Demonstração De 30 Minutos",
  DEMO_60: "Demonstração De 60 Minutos",
  PILOT_ALIGNMENT: "Alinhamento De Piloto",
  PROPOSAL: "Apresentação De Proposta",
  NEGOTIATION: "Negociação",
  INVESTMENT: "Conversa Estratégica Ou Investimento",
  FOLLOW_UP: "Acompanhamento",
  OTHER: "Outro",
};

export const COMMERCIAL_MEETING_STATUS_LABELS: Record<
  CommercialMeetingStatus,
  string
> = {
  SCHEDULED: "Agendada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  NO_SHOW: "Não Compareceu",
};

export const COMMERCIAL_MODULE_OPTIONS = [
  "Condomínios, Unidades E Moradores",
  "Chamados",
  "Fornecedores",
  "Comunicados",
  "Reuniões De Conselho",
  "Enquetes",
  "Assembleias E Votação",
  "Ata Com IA",
  "Financeiro",
  "Relatórios Gerenciais",
  "IA Operacional",
  "Portal",
] as const;

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
}
