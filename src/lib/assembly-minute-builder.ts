import {
  AssemblyAgendaItemType,
  AssemblyAttachmentScope,
  AssemblyEligibilityStatus,
  AssemblyRepresentationStatus,
  AssemblyResultStatus,
  AssemblyStatus,
  AssemblyType,
  AssemblyVoteOrigin,
  AssemblyVoteVisibility,
  MeetingMode,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";

/* =========================================================
   ELOGEST — ETAPA 52.2
   GERADOR ESTRUTURADO DA MINUTA DA ATA

   Arquivo:
   src/lib/assembly-minute-builder.ts

   Objetivo:
   - Montar uma minuta confiável com base exclusiva nos dados
     oficiais persistidos na assembleia.
   - Funcionar sem provedor externo de inteligência artificial.
   - Produzir snapshot estruturado para auditoria e versionamento.
   - Preparar uma base segura para a camada opcional de IA.

   Regras:
   - Não publica a ata.
   - Não altera votos, quórum ou resultados.
   - Não utiliza observações internas da administradora no texto.
   - Exige resultados oficialmente publicados antes da geração.
   ========================================================= */

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

const assemblyMinuteSourceSelect = {
  id: true,
  administratorId: true,
  condominiumId: true,
  title: true,
  description: true,
  type: true,
  status: true,
  mode: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  votingStartsAt: true,
  votingEndsAt: true,
  openedAt: true,
  closedAt: true,
  resultsPublishedAt: true,
  convocationPublishedAt: true,
  location: true,
  externalMeetingUrl: true,
  accessInstructions: true,
  convocationText: true,
  eligibilitySnapshotAt: true,
  allowVoteChange: true,
  createdAt: true,
  updatedAt: true,
  condominium: {
    select: {
      id: true,
      name: true,
      legalName: true,
      cnpj: true,
      address: true,
      number: true,
      complement: true,
      district: true,
      city: true,
      state: true,
    },
  },
  administrator: {
    select: {
      id: true,
      name: true,
    },
  },
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  resultsPublishedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  convocationPublishedByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  eligibleUnits: {
    orderBy: [
      {
        snapshotBlock: "asc",
      },
      {
        snapshotUnitNumber: "asc",
      },
    ],
    select: {
      id: true,
      unitId: true,
      snapshotBlock: true,
      snapshotUnitNumber: true,
      status: true,
      blockedReason: true,
      votingWeight: true,
    },
  },
  agendaItems: {
    orderBy: {
      order: "asc",
    },
    select: {
      id: true,
      order: true,
      title: true,
      description: true,
      type: true,
      status: true,
      voteVisibility: true,
      quorumRuleType: true,
      minimumParticipationPct: true,
      minimumApprovalPct: true,
      customRuleDescription: true,
      votingStartsAt: true,
      votingEndsAt: true,
      resultStatus: true,
      resultSummary: true,
      resultValidatedAt: true,
      deferredAt: true,
      deferredReason: true,
      deferredNotes: true,
      originAgendaItemId: true,
      options: {
        orderBy: {
          order: "asc",
        },
        select: {
          id: true,
          label: true,
          description: true,
          order: true,
          isAbstention: true,
        },
      },
      votes: {
        select: {
          id: true,
          eligibleUnitId: true,
          unitId: true,
          origin: true,
          version: true,
          submittedAt: true,
          updatedAt: true,
          representationId: true,
          eligibleUnit: {
            select: {
              votingWeight: true,
              snapshotBlock: true,
              snapshotUnitNumber: true,
            },
          },
          options: {
            select: {
              option: {
                select: {
                  id: true,
                  label: true,
                  isAbstention: true,
                },
              },
            },
          },
        },
      },
      attachments: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          scope: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          url: true,
          description: true,
          createdAt: true,
        },
      },
    },
  },
  representations: {
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      unitId: true,
      status: true,
      validFrom: true,
      validUntil: true,
      documentUrl: true,
      documentName: true,
      notes: true,
      metadata: true,
      createdAt: true,
      revokedAt: true,
      revokedReason: true,
      unit: {
        select: {
          id: true,
          block: true,
          unitNumber: true,
        },
      },
      grantorUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      representativeUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      externalRepresentativeName: true,
      externalRepresentativeEmail: true,
      externalRepresentativePhone: true,
      externalRepresentativeDocument: true,
    },
  },
  attachments: {
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      agendaItemId: true,
      scope: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      url: true,
      description: true,
      createdAt: true,
    },
  },
} satisfies Prisma.AssemblySelect;

type AssemblyMinuteSource = Prisma.AssemblyGetPayload<{
  select: typeof assemblyMinuteSourceSelect;
}>;

type StructuredWarningCode =
  | "MISSING_CONVOCATION_TEXT"
  | "MISSING_SCHEDULED_START"
  | "MISSING_ELIGIBILITY_SNAPSHOT"
  | "NO_ELIGIBLE_UNITS"
  | "NO_AGENDA_ITEMS"
  | "AGENDA_ITEM_WITHOUT_RESULT_SUMMARY"
  | "AGENDA_ITEM_REQUIRES_REVIEW"
  | "ACTIVE_REPRESENTATION_WITHOUT_DOCUMENT"
  | "NO_RESULTS_PUBLISHED_BY_USER";

export type StructuredAssemblyMinuteWarning = {
  code: StructuredWarningCode;
  message: string;
  agendaItemId?: string;
  representationId?: string;
};

export type StructuredAssemblyMinuteOptionSnapshot = {
  optionId: string;
  label: string;
  isAbstention: boolean;
  votes: number;
  weight: number;
};

export type StructuredAssemblyMinuteNominalVoteSnapshot = {
  voteId: string;
  unitLabel: string;
  votingWeight: number;
  origin: AssemblyVoteOrigin;
  representationId: string | null;
  optionLabels: string[];
  submittedAt: string;
  updatedAt: string;
};

export type StructuredAssemblyMinuteAgendaSnapshot = {
  agendaItemId: string;
  order: number;
  title: string;
  description: string | null;
  type: AssemblyAgendaItemType;
  status: string;
  voteVisibility: AssemblyVoteVisibility;
  resultStatus: AssemblyResultStatus;
  resultSummary: string | null;
  resultValidatedAt: string | null;
  votingStartsAt: string | null;
  votingEndsAt: string | null;
  quorumRuleType: string;
  minimumParticipationPct: number | null;
  minimumApprovalPct: number | null;
  customRuleDescription: string | null;
  deferredAt: string | null;
  deferredReason: string | null;
  deferredNotes: string | null;
  originAgendaItemId: string | null;
  participatingUnits: number;
  participatingWeight: number;
  abstentionUnits: number;
  abstentionWeight: number;
  validWeight: number;
  options: StructuredAssemblyMinuteOptionSnapshot[];
  nominalVotes: StructuredAssemblyMinuteNominalVoteSnapshot[];
  attachments: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    description: string | null;
  }>;
};

export type StructuredAssemblyMinuteSourceSnapshot = {
  generatedAt: string;
  sourceType: "ASSEMBLY_STRUCTURED_MINUTE";
  assembly: {
    id: string;
    administratorId: string;
    condominiumId: string;
    title: string;
    description: string | null;
    type: AssemblyType;
    status: AssemblyStatus;
    mode: MeetingMode;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    votingStartsAt: string | null;
    votingEndsAt: string | null;
    openedAt: string | null;
    closedAt: string | null;
    resultsPublishedAt: string | null;
    convocationPublishedAt: string | null;
    location: string | null;
    externalMeetingUrl: string | null;
    accessInstructions: string | null;
    convocationText: string | null;
    eligibilitySnapshotAt: string | null;
    allowVoteChange: boolean;
  };
  administrator: {
    id: string;
    name: string;
  };
  condominium: {
    id: string;
    name: string;
    legalName: string | null;
    cnpj: string | null;
    address: string | null;
  };
  eligibleUnits: {
    total: number;
    eligible: number;
    blocked: number;
    totalEligibleWeight: number;
  };
  participation: {
    participatingUnits: number;
    participatingWeight: number;
  };
  agendaItems: StructuredAssemblyMinuteAgendaSnapshot[];
  representations: Array<{
    id: string;
    unitLabel: string;
    status: AssemblyRepresentationStatus;
    grantorName: string | null;
    representativeName: string | null;
    representativeEmail: string | null;
    validFrom: string | null;
    validUntil: string | null;
    documentUrl: string | null;
    documentName: string | null;
    createdAt: string;
    revokedAt: string | null;
    revokedReason: string | null;
  }>;
  attachments: Array<{
    id: string;
    agendaItemId: string | null;
    scope: AssemblyAttachmentScope;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
    description: string | null;
    createdAt: string;
  }>;
  publication: {
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
    convocationPublishedBy: {
      id: string;
      name: string;
      email: string;
    } | null;
    resultsPublishedBy: {
      id: string;
      name: string;
      email: string;
    } | null;
  };
};

export type StructuredAssemblyMinuteDraft = {
  title: string;
  executiveSummary: string;
  content: string;
  warnings: StructuredAssemblyMinuteWarning[];
  sourceSnapshot: StructuredAssemblyMinuteSourceSnapshot;
  metadata: {
    generator: "assembly-minute-builder";
    generatorVersion: "52.8.1";
    generationMode: "STRUCTURED";
    timeZone: string;
  };
};

export class AssemblyMinuteBuilderError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AssemblyMinuteBuilderError";
    this.status = status;
  }
}

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined,
) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateToIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "Não Informado";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: DEFAULT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 6) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatPercentage(value: number) {
  return `${formatNumber(value, 2)}%`;
}

function percentage(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return round((part / total) * 100, 4);
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string) {
  return parts.filter((item): item is string => Boolean(item)).join(separator);
}

function formatAddress(
  condominium: StructuredAssemblyMinuteSourceSnapshot["condominium"],
) {
  return condominium.address || "Não Informado";
}

function formatUnitLabel(params: {
  block: string | null | undefined;
  unitNumber: string;
}) {
  return params.block
    ? `Bloco ${params.block} — Unidade ${params.unitNumber}`
    : `Unidade ${params.unitNumber}`;
}

function assemblyTypeLabel(value: AssemblyType) {
  const labels: Record<AssemblyType, string> = {
    ORDINARY: "Ordinária",
    EXTRAORDINARY: "Extraordinária",
    SPECIAL: "Especial",
    OTHER: "Outra",
  };

  return labels[value];
}

function meetingModeLabel(value: MeetingMode) {
  const labels: Record<MeetingMode, string> = {
    PRESENTIAL: "Presencial",
    ONLINE: "On-line",
    HYBRID: "Híbrida",
  };

  return labels[value];
}

function agendaItemTypeLabel(value: AssemblyAgendaItemType) {
  const labels: Record<AssemblyAgendaItemType, string> = {
    INFORMATIVE: "Informativa",
    APPROVE_REJECT_ABSTAIN: "Aprovar, Rejeitar Ou Abster-se",
    YES_NO_ABSTAIN: "Sim, Não Ou Abster-se",
    SINGLE_CHOICE: "Escolha Única",
    MULTIPLE_CHOICE: "Múltipla Escolha",
  };

  return labels[value];
}

function resultStatusLabel(value: AssemblyResultStatus) {
  const labels: Record<AssemblyResultStatus, string> = {
    PENDING: "Pendente",
    APPROVED: "Aprovada",
    REJECTED: "Rejeitada",
    NO_QUORUM: "Sem Quórum",
    INFORMATIONAL: "Informativa",
    MANUAL_REVIEW: "Revisão Necessária",
    DEFERRED: "Encaminhada Para Nova Deliberação",
    CANCELED: "Cancelada",
  };

  return labels[value];
}

function deferredReasonLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    TIE: "Empate",
    NO_QUORUM: "Sem Quórum",
    BUDGET_REVIEW: "Revisão Orçamentária",
    MORE_INFORMATION: "Necessidade De Informações Adicionais",
    POSTPONE: "Adiamento",
    OTHER: "Outro Motivo",
  };

  const normalized = normalizeNullableString(value);

  if (!normalized) {
    return "Motivo Não Informado";
  }

  return labels[normalized] || normalized;
}

function deferredReasonNarrative(value: string | null | undefined) {
  const narratives: Record<string, string> = {
    TIE: "permaneceu pendente em razão de empate na votação",
    NO_QUORUM: "não alcançou o quórum necessário",
    BUDGET_REVIEW: "depende de revisão orçamentária antes de nova deliberação",
    MORE_INFORMATION:
      "depende da apresentação de informações adicionais antes de nova deliberação",
    POSTPONE: "foi adiada para deliberação futura",
    OTHER: "foi encaminhada para nova deliberação",
  };

  const normalized = normalizeNullableString(value);

  if (!normalized) {
    return "foi encaminhada para nova deliberação";
  }

  return narratives[normalized] || "foi encaminhada para nova deliberação";
}

function voteVisibilityLabel(value: AssemblyVoteVisibility) {
  const labels: Record<AssemblyVoteVisibility, string> = {
    CONSOLIDATED: "Resultado Consolidado",
    NOMINAL_BY_UNIT: "Votação Nominal Por Unidade",
    SECRET: "Votação Sigilosa",
  };

  return labels[value];
}

function voteOriginLabel(value: AssemblyVoteOrigin) {
  const labels: Record<AssemblyVoteOrigin, string> = {
    DIRECT_UNIT_LINK: "Voto Direto",
    PROXY_REPRESENTATION: "Procuração",
    AUTHORIZED_LINK: "Vínculo Autorizado",
    ADMINISTRATIVE_IMPORT: "Importação Administrativa",
  };

  return labels[value];
}

function attachmentScopeLabel(value: AssemblyAttachmentScope) {
  const labels: Record<AssemblyAttachmentScope, string> = {
    CONVOCATION: "Convocação",
    AGENDA_ITEM: "Pauta",
    RESULT: "Resultado",
    OTHER: "Outro Documento",
  };

  return labels[value];
}

function buildCondominiumAddress(condominium: AssemblyMinuteSource["condominium"]) {
  const street = joinNonEmpty(
    [condominium.address, condominium.number],
    ", ",
  );

  const locality = joinNonEmpty(
    [condominium.district, condominium.city, condominium.state],
    " — ",
  );

  return joinNonEmpty(
    [street, condominium.complement, locality],
    " — ",
  ) || null;
}

function buildAgendaSnapshot(
  item: AssemblyMinuteSource["agendaItems"][number],
): StructuredAssemblyMinuteAgendaSnapshot {
  const participatingUnitIds = new Set<string>();
  const abstentionUnitIds = new Set<string>();
  const unitWeightByEligibleUnitId = new Map<string, number>();

  const optionMap = new Map<
    string,
    StructuredAssemblyMinuteOptionSnapshot
  >();

  for (const option of item.options) {
    optionMap.set(option.id, {
      optionId: option.id,
      label: option.label,
      isAbstention: option.isAbstention,
      votes: 0,
      weight: 0,
    });
  }

  for (const vote of item.votes) {
    const weight = decimalToNumber(vote.eligibleUnit.votingWeight);

    participatingUnitIds.add(vote.eligibleUnitId);
    unitWeightByEligibleUnitId.set(vote.eligibleUnitId, weight);

    for (const selected of vote.options) {
      const tally = optionMap.get(selected.option.id);
      if (!tally) continue;

      tally.votes += 1;
      tally.weight = round(tally.weight + weight);

      if (selected.option.isAbstention) {
        abstentionUnitIds.add(vote.eligibleUnitId);
      }
    }
  }

  const participatingWeight = round(
    Array.from(participatingUnitIds).reduce(
      (sum, eligibleUnitId) =>
        sum + (unitWeightByEligibleUnitId.get(eligibleUnitId) || 0),
      0,
    ),
  );

  const abstentionWeight = round(
    Array.from(abstentionUnitIds).reduce(
      (sum, eligibleUnitId) =>
        sum + (unitWeightByEligibleUnitId.get(eligibleUnitId) || 0),
      0,
    ),
  );

  const nominalVotes = item.votes
    .map((vote) => ({
      voteId: vote.id,
      unitLabel: formatUnitLabel({
        block: vote.eligibleUnit.snapshotBlock,
        unitNumber: vote.eligibleUnit.snapshotUnitNumber,
      }),
      votingWeight: decimalToNumber(vote.eligibleUnit.votingWeight),
      origin: vote.origin,
      representationId: vote.representationId,
      optionLabels: vote.options.map((selected) => selected.option.label),
      submittedAt: vote.submittedAt.toISOString(),
      updatedAt: vote.updatedAt.toISOString(),
    }))
    .sort((left, right) =>
      left.unitLabel.localeCompare(right.unitLabel, "pt-BR"),
    );

  return {
    agendaItemId: item.id,
    order: item.order,
    title: item.title,
    description: item.description,
    type: item.type,
    status: item.status,
    voteVisibility: item.voteVisibility,
    resultStatus: item.resultStatus,
    resultSummary: item.resultSummary,
    resultValidatedAt: dateToIso(item.resultValidatedAt),
    votingStartsAt: dateToIso(item.votingStartsAt),
    votingEndsAt: dateToIso(item.votingEndsAt),
    quorumRuleType: item.quorumRuleType,
    minimumParticipationPct:
      item.minimumParticipationPct === null
        ? null
        : decimalToNumber(item.minimumParticipationPct),
    minimumApprovalPct:
      item.minimumApprovalPct === null
        ? null
        : decimalToNumber(item.minimumApprovalPct),
    customRuleDescription: item.customRuleDescription,
    deferredAt: dateToIso(item.deferredAt),
    deferredReason: item.deferredReason,
    deferredNotes: item.deferredNotes,
    originAgendaItemId: item.originAgendaItemId,
    participatingUnits: participatingUnitIds.size,
    participatingWeight,
    abstentionUnits: abstentionUnitIds.size,
    abstentionWeight,
    validWeight: round(participatingWeight - abstentionWeight),
    options: Array.from(optionMap.values()),
    nominalVotes,
    attachments: item.attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url: attachment.url,
      description: attachment.description,
    })),
  };
}

function buildWarnings(params: {
  assembly: AssemblyMinuteSource;
  agendaItems: StructuredAssemblyMinuteAgendaSnapshot[];
}) {
  const { assembly, agendaItems } = params;
  const warnings: StructuredAssemblyMinuteWarning[] = [];

  if (!normalizeNullableString(assembly.convocationText)) {
    warnings.push({
      code: "MISSING_CONVOCATION_TEXT",
      message:
        "A assembleia não possui texto de convocação registrado. Revise a introdução da ata.",
    });
  }

  if (!assembly.scheduledStartAt) {
    warnings.push({
      code: "MISSING_SCHEDULED_START",
      message:
        "A data de início programada da assembleia não está preenchida.",
    });
  }

  if (!assembly.eligibilitySnapshotAt) {
    warnings.push({
      code: "MISSING_ELIGIBILITY_SNAPSHOT",
      message:
        "A fotografia das unidades aptas não possui data registrada.",
    });
  }

  const eligibleUnits = assembly.eligibleUnits.filter(
    (unit) => unit.status === AssemblyEligibilityStatus.ELIGIBLE,
  );

  if (eligibleUnits.length === 0) {
    warnings.push({
      code: "NO_ELIGIBLE_UNITS",
      message: "A assembleia não possui unidades aptas registradas.",
    });
  }

  if (agendaItems.length === 0) {
    warnings.push({
      code: "NO_AGENDA_ITEMS",
      message: "A assembleia não possui pautas registradas.",
    });
  }

  for (const item of agendaItems) {
    if (!normalizeNullableString(item.resultSummary)) {
      warnings.push({
        code: "AGENDA_ITEM_WITHOUT_RESULT_SUMMARY",
        agendaItemId: item.agendaItemId,
        message: `A pauta “${item.title}” não possui resumo oficial do resultado.`,
      });
    }

    if (
      item.resultStatus === AssemblyResultStatus.MANUAL_REVIEW ||
      item.resultStatus === AssemblyResultStatus.PENDING
    ) {
      warnings.push({
        code: "AGENDA_ITEM_REQUIRES_REVIEW",
        agendaItemId: item.agendaItemId,
        message: `A pauta “${item.title}” ainda exige revisão antes da publicação da ata.`,
      });
    }
  }

  for (const representation of assembly.representations) {
    if (
      representation.status === AssemblyRepresentationStatus.ACTIVE &&
      !representation.documentUrl
    ) {
      warnings.push({
        code: "ACTIVE_REPRESENTATION_WITHOUT_DOCUMENT",
        representationId: representation.id,
        message:
          "Existe uma procuração ativa sem documento comprobatório anexado.",
      });
    }
  }

  if (!assembly.resultsPublishedByUser) {
    warnings.push({
      code: "NO_RESULTS_PUBLISHED_BY_USER",
      message:
        "Os resultados não possuem responsável pela publicação identificado.",
    });
  }

  return warnings;
}

function buildSnapshot(assembly: AssemblyMinuteSource) {
  const eligibleUnits = assembly.eligibleUnits.filter(
    (unit) => unit.status === AssemblyEligibilityStatus.ELIGIBLE,
  );

  const blockedUnits = assembly.eligibleUnits.filter(
    (unit) => unit.status === AssemblyEligibilityStatus.BLOCKED,
  );

  const totalEligibleWeight = round(
    eligibleUnits.reduce(
      (sum, unit) => sum + decimalToNumber(unit.votingWeight),
      0,
    ),
  );

  const agendaItems = assembly.agendaItems.map(buildAgendaSnapshot);

  const participatingUnitIds = new Set<string>();

  for (const agendaItem of assembly.agendaItems) {
    for (const vote of agendaItem.votes) {
      participatingUnitIds.add(vote.eligibleUnitId);
    }
  }

  const participatingWeight = round(
    eligibleUnits
      .filter((unit) => participatingUnitIds.has(unit.id))
      .reduce(
        (sum, unit) => sum + decimalToNumber(unit.votingWeight),
        0,
      ),
  );

  const sourceSnapshot: StructuredAssemblyMinuteSourceSnapshot = {
    generatedAt: new Date().toISOString(),
    sourceType: "ASSEMBLY_STRUCTURED_MINUTE",
    assembly: {
      id: assembly.id,
      administratorId: assembly.administratorId,
      condominiumId: assembly.condominiumId,
      title: assembly.title,
      description: assembly.description,
      type: assembly.type,
      status: assembly.status,
      mode: assembly.mode,
      scheduledStartAt: dateToIso(assembly.scheduledStartAt),
      scheduledEndAt: dateToIso(assembly.scheduledEndAt),
      votingStartsAt: dateToIso(assembly.votingStartsAt),
      votingEndsAt: dateToIso(assembly.votingEndsAt),
      openedAt: dateToIso(assembly.openedAt),
      closedAt: dateToIso(assembly.closedAt),
      resultsPublishedAt: dateToIso(assembly.resultsPublishedAt),
      convocationPublishedAt: dateToIso(assembly.convocationPublishedAt),
      location: assembly.location,
      externalMeetingUrl: assembly.externalMeetingUrl,
      accessInstructions: assembly.accessInstructions,
      convocationText: assembly.convocationText,
      eligibilitySnapshotAt: dateToIso(assembly.eligibilitySnapshotAt),
      allowVoteChange: assembly.allowVoteChange,
    },
    administrator: {
      id: assembly.administrator.id,
      name: assembly.administrator.name,
    },
    condominium: {
      id: assembly.condominium.id,
      name: assembly.condominium.name,
      legalName: assembly.condominium.legalName,
      cnpj: assembly.condominium.cnpj,
      address: buildCondominiumAddress(assembly.condominium),
    },
    eligibleUnits: {
      total: assembly.eligibleUnits.length,
      eligible: eligibleUnits.length,
      blocked: blockedUnits.length,
      totalEligibleWeight,
    },
    participation: {
      participatingUnits: participatingUnitIds.size,
      participatingWeight,
    },
    agendaItems,
    representations: assembly.representations.map((representation) => {
      const metadata =
        representation.metadata &&
        typeof representation.metadata === "object" &&
        !Array.isArray(representation.metadata)
          ? (representation.metadata as Record<string, unknown>)
          : {};

      const externalGrantorName = normalizeNullableString(
        metadata.externalGrantorName,
      );

      return {
        id: representation.id,
        unitLabel: formatUnitLabel({
          block: representation.unit.block,
          unitNumber: representation.unit.unitNumber,
        }),
        status: representation.status,
        grantorName: representation.grantorUser?.name || externalGrantorName,
        representativeName:
          representation.representativeUser?.name ||
          representation.externalRepresentativeName,
        representativeEmail:
          representation.representativeUser?.email ||
          representation.externalRepresentativeEmail,
        validFrom: dateToIso(representation.validFrom),
        validUntil: dateToIso(representation.validUntil),
        documentUrl: representation.documentUrl,
        documentName: representation.documentName,
        createdAt: representation.createdAt.toISOString(),
        revokedAt: dateToIso(representation.revokedAt),
        revokedReason: representation.revokedReason,
      };
    }),
    attachments: assembly.attachments.map((attachment) => ({
      id: attachment.id,
      agendaItemId: attachment.agendaItemId,
      scope: attachment.scope,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url: attachment.url,
      description: attachment.description,
      createdAt: attachment.createdAt.toISOString(),
    })),
    publication: {
      createdBy: assembly.createdByUser,
      convocationPublishedBy: assembly.convocationPublishedByUser,
      resultsPublishedBy: assembly.resultsPublishedByUser,
    },
  };

  return sourceSnapshot;
}

function buildExecutiveSummary(
  snapshot: StructuredAssemblyMinuteSourceSnapshot,
) {
  // ETAPA 52.2.1 — Os conjuntos recebem explicitamente o enum completo.
  // Isso evita que o TypeScript restrinja o parâmetro de `.includes()`
  // apenas aos literais presentes no array e rejeite `item.resultStatus`.
  const consolidatedResultStatuses = new Set<AssemblyResultStatus>([
    AssemblyResultStatus.APPROVED,
    AssemblyResultStatus.REJECTED,
    AssemblyResultStatus.INFORMATIONAL,
  ]);

  const reviewRequiredResultStatuses = new Set<AssemblyResultStatus>([
    AssemblyResultStatus.PENDING,
    AssemblyResultStatus.MANUAL_REVIEW,
    AssemblyResultStatus.NO_QUORUM,
  ]);

  const resolvedItems = snapshot.agendaItems.filter((item) =>
    consolidatedResultStatuses.has(item.resultStatus),
  );

  const deferredItems = snapshot.agendaItems.filter(
    (item) => item.resultStatus === AssemblyResultStatus.DEFERRED,
  );

  const reviewItems = snapshot.agendaItems.filter((item) =>
    reviewRequiredResultStatuses.has(item.resultStatus),
  );

  return [
    `A assembleia ${assemblyTypeLabel(snapshot.assembly.type).toLocaleLowerCase("pt-BR")} do condomínio ${snapshot.condominium.name} possui ${snapshot.agendaItems.length} pauta(s) registrada(s).`,
    `Foram consideradas ${snapshot.eligibleUnits.eligible} unidade(s) apta(s), com participação identificada de ${snapshot.participation.participatingUnits} unidade(s).`,
    `${resolvedItems.length} pauta(s) possuem encaminhamento consolidado, ${deferredItems.length} foram encaminhada(s) para nova deliberação e ${reviewItems.length} exigem atenção na revisão da minuta.`,
  ].join(" ");
}

function buildIdentificationSection(
  snapshot: StructuredAssemblyMinuteSourceSnapshot,
) {
  return [
    "## 1. Identificação Da Assembleia",
    "",
    `**Condomínio:** ${snapshot.condominium.name}`,
    `**Razão Social:** ${snapshot.condominium.legalName || "Não Informada"}`,
    `**CNPJ:** ${snapshot.condominium.cnpj || "Não Informado"}`,
    `**Endereço:** ${formatAddress(snapshot.condominium)}`,
    `**Tipo De Assembleia:** ${assemblyTypeLabel(snapshot.assembly.type)}`,
    `**Modalidade:** ${meetingModeLabel(snapshot.assembly.mode)}`,
    `**Título:** ${snapshot.assembly.title}`,
    `**Início Programado:** ${formatDateTime(snapshot.assembly.scheduledStartAt ? new Date(snapshot.assembly.scheduledStartAt) : null)}`,
    `**Término Programado:** ${formatDateTime(snapshot.assembly.scheduledEndAt ? new Date(snapshot.assembly.scheduledEndAt) : null)}`,
    `**Abertura Registrada:** ${formatDateTime(snapshot.assembly.openedAt ? new Date(snapshot.assembly.openedAt) : null)}`,
    `**Encerramento Registrado:** ${formatDateTime(snapshot.assembly.closedAt ? new Date(snapshot.assembly.closedAt) : null)}`,
    `**Local:** ${snapshot.assembly.location || "Não Informado"}`,
    "",
  ].join("\n");
}

function buildConvocationSection(
  snapshot: StructuredAssemblyMinuteSourceSnapshot,
) {
  return [
    "## 2. Convocação",
    "",
    `**Publicação Da Convocação:** ${formatDateTime(snapshot.assembly.convocationPublishedAt ? new Date(snapshot.assembly.convocationPublishedAt) : null)}`,
    "",
    snapshot.assembly.convocationText ||
      "O texto da convocação não foi registrado no sistema.",
    "",
  ].join("\n");
}

function buildParticipationSection(
  snapshot: StructuredAssemblyMinuteSourceSnapshot,
) {
  const participationPct = percentage(
    snapshot.participation.participatingWeight,
    snapshot.eligibleUnits.totalEligibleWeight,
  );

  const activeRepresentations = snapshot.representations.filter(
    (representation) =>
      representation.status === AssemblyRepresentationStatus.ACTIVE,
  );

  const lines = [
    "## 3. Participação E Representações",
    "",
    `**Unidades Registradas Na Fotografia:** ${snapshot.eligibleUnits.total}`,
    `**Unidades Aptas:** ${snapshot.eligibleUnits.eligible}`,
    `**Unidades Bloqueadas:** ${snapshot.eligibleUnits.blocked}`,
    `**Peso Total Das Unidades Aptas:** ${formatNumber(snapshot.eligibleUnits.totalEligibleWeight)}`,
    `**Unidades Com Participação Identificada:** ${snapshot.participation.participatingUnits}`,
    `**Peso Participante Identificado:** ${formatNumber(snapshot.participation.participatingWeight)}`,
    `**Participação Pelo Peso Das Unidades Aptas:** ${formatPercentage(participationPct)}`,
    `**Procurações Ativas Registradas:** ${activeRepresentations.length}`,
    "",
  ];

  if (activeRepresentations.length === 0) {
    lines.push("Não foram registradas procurações ativas para esta assembleia.", "");
    return lines.join("\n");
  }

  lines.push("### Procurações Ativas", "");

  for (const representation of activeRepresentations) {
    lines.push(
      `- **${representation.unitLabel}:** ${representation.grantorName || "Concedente Não Informado"} representado(a) por ${representation.representativeName || "Representante Não Informado"}${representation.documentName ? ` — documento: ${representation.documentName}` : ""}.`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function buildAgendaSection(
  snapshot: StructuredAssemblyMinuteSourceSnapshot,
) {
  const lines = ["## 4. Pautas E Deliberações", ""];

  if (snapshot.agendaItems.length === 0) {
    lines.push("Não há pautas registradas para esta assembleia.", "");
    return lines.join("\n");
  }

  for (const item of snapshot.agendaItems) {
    const participationPct = percentage(
      item.participatingWeight,
      snapshot.eligibleUnits.totalEligibleWeight,
    );

    lines.push(
      `### ${item.order}. ${item.title}`,
      "",
      `**Tipo:** ${agendaItemTypeLabel(item.type)}`,
      `**Transparência Da Votação:** ${voteVisibilityLabel(item.voteVisibility)}`,
      `**Situação Do Resultado:** ${resultStatusLabel(item.resultStatus)}`,
    );

    if (item.description) {
      lines.push("", item.description);
    }

    lines.push(
      "",
      `**Unidades Participantes:** ${item.participatingUnits}`,
      `**Peso Participante:** ${formatNumber(item.participatingWeight)}`,
      `**Participação Em Relação Ao Peso Apto:** ${formatPercentage(participationPct)}`,
      `**Abstenções:** ${item.abstentionUnits} unidade(s), com peso ${formatNumber(item.abstentionWeight)}`,
      `**Peso Dos Votos Válidos:** ${formatNumber(item.validWeight)}`,
      "",
    );

    if (item.options.length > 0) {
      lines.push("**Apuração Por Opção:**");

      for (const option of item.options) {
        lines.push(
          `- ${option.label}: ${option.votes} voto(s), com peso ${formatNumber(option.weight)}${option.isAbstention ? " — abstenção" : ""}.`,
        );
      }

      lines.push("");
    }

    if (
      item.voteVisibility === AssemblyVoteVisibility.NOMINAL_BY_UNIT &&
      item.nominalVotes.length > 0
    ) {
      lines.push("**Detalhamento Nominal Por Unidade:**");

      for (const vote of item.nominalVotes) {
        lines.push(
          `- ${vote.unitLabel}: ${vote.optionLabels.join(", ") || "Sem Opção Registrada"} — peso ${formatNumber(vote.votingWeight)} — ${voteOriginLabel(vote.origin)}.`,
        );
      }

      lines.push("");
    } else if (item.voteVisibility === AssemblyVoteVisibility.SECRET) {
      lines.push(
        "**Observação De Privacidade:** esta pauta foi configurada como votação sigilosa. A ata apresenta somente o resultado consolidado.",
        "",
      );
    }

    lines.push(
      "**Encaminhamento Oficial:**",
      item.resultSummary ||
        "O resumo oficial do resultado ainda não foi registrado.",
      "",
    );

    if (item.resultStatus === AssemblyResultStatus.DEFERRED) {
      lines.push(
        `**Encaminhamento Para Nova Deliberação:** ${deferredReasonLabel(item.deferredReason)}${item.deferredNotes ? ` — ${item.deferredNotes}` : ""}.`,
        "",
      );
    }
  }

  return lines.join("\n");
}

function buildAttachmentsSection(
  snapshot: StructuredAssemblyMinuteSourceSnapshot,
) {
  const lines = ["## 5. Documentos Oficiais", ""];

  if (snapshot.attachments.length === 0) {
    lines.push("Não foram anexados documentos oficiais à assembleia.", "");
    return lines.join("\n");
  }

  for (const attachment of snapshot.attachments) {
    lines.push(
      `- **${attachmentScopeLabel(attachment.scope)}:** ${attachment.originalName}${attachment.description ? ` — ${attachment.description}` : ""}.`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function buildPendingItemsSection(
  snapshot: StructuredAssemblyMinuteSourceSnapshot,
) {
  const deferredItems = snapshot.agendaItems.filter(
    (item) => item.resultStatus === AssemblyResultStatus.DEFERRED,
  );

  const lines = ["## 6. Pendências Para Deliberação Futura", ""];

  if (deferredItems.length === 0) {
    lines.push(
      "Não foram registradas pautas encaminhadas para uma próxima assembleia.",
      "",
    );

    return lines.join("\n");
  }

  for (const item of deferredItems) {
    lines.push(
      `- **${item.title}:** ${deferredReasonNarrative(item.deferredReason)}${item.deferredNotes ? ` — ${item.deferredNotes}` : ""}.`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function buildClosureSection(
  snapshot: StructuredAssemblyMinuteSourceSnapshot,
) {
  return [
    "## 7. Encerramento",
    "",
    `A assembleia foi encerrada em ${formatDateTime(snapshot.assembly.closedAt ? new Date(snapshot.assembly.closedAt) : null)}. Os resultados foram publicados em ${formatDateTime(snapshot.assembly.resultsPublishedAt ? new Date(snapshot.assembly.resultsPublishedAt) : null)}.`,
    "",
    "Esta minuta foi gerada automaticamente a partir dos registros oficiais disponíveis no EloGest e deverá ser revisada antes de sua aprovação e publicação como ata oficial.",
    "",
  ].join("\n");
}

function buildContent(snapshot: StructuredAssemblyMinuteSourceSnapshot) {
  return [
    `# Ata Da Assembleia — ${snapshot.condominium.name}`,
    "",
    buildIdentificationSection(snapshot),
    buildConvocationSection(snapshot),
    buildParticipationSection(snapshot),
    buildAgendaSection(snapshot),
    buildAttachmentsSection(snapshot),
    buildPendingItemsSection(snapshot),
    buildClosureSection(snapshot),
  ].join("\n");
}

function assertAssemblyReadyForStructuredMinute(
  assembly: AssemblyMinuteSource,
) {
  if (
    assembly.status !== AssemblyStatus.RESULTS_PUBLISHED ||
    !assembly.resultsPublishedAt
  ) {
    throw new AssemblyMinuteBuilderError(
      "Publique os resultados da assembleia antes de gerar a minuta da ata.",
      403,
    );
  }
}

async function loadAssemblyMinuteSource(params: {
  assemblyId: string;
  administratorId: string;
}) {
  return db.assembly.findFirst({
    where: {
      id: params.assemblyId,
      administratorId: params.administratorId,
    },
    select: assemblyMinuteSourceSelect,
  });
}

export async function buildStructuredAssemblyMinute(params: {
  assemblyId: string;
  administratorId: string;
}): Promise<StructuredAssemblyMinuteDraft> {
  const assembly = await loadAssemblyMinuteSource(params);

  if (!assembly) {
    throw new AssemblyMinuteBuilderError(
      "Assembleia não encontrada na carteira ativa da administradora.",
      404,
    );
  }

  assertAssemblyReadyForStructuredMinute(assembly);

  const sourceSnapshot = buildSnapshot(assembly);
  const warnings = buildWarnings({
    assembly,
    agendaItems: sourceSnapshot.agendaItems,
  });

  return {
    title: `Ata Da Assembleia — ${assembly.condominium.name}`,
    executiveSummary: buildExecutiveSummary(sourceSnapshot),
    content: buildContent(sourceSnapshot),
    warnings,
    sourceSnapshot,
    metadata: {
      generator: "assembly-minute-builder",
      generatorVersion: "52.8.1",
      generationMode: "STRUCTURED",
      timeZone: DEFAULT_TIME_ZONE,
    },
  };
}
