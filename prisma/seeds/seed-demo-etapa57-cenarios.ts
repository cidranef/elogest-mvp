import "dotenv/config";

import {
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementTargetScope,
  AnnouncementType,
  AssemblyAgendaItemStatus,
  AssemblyAgendaItemType,
  AssemblyQuorumRuleType,
  AssemblyResultStatus,
  AssemblyStatus,
  AssemblyType,
  CouncilAgendaItemStatus,
  CouncilMeetingStatus,
  FinancialEntryOrigin,
  FinancialEntryStatus,
  FinancialEntryType,
  MeetingMode,
  PollResultVisibility,
  PollStatus,
  PollTargetScope,
  PollType,
  TicketPriority,
  TicketScope,
  TicketStatus,
} from "@prisma/client";
import { db } from "../../src/lib/db";

/* =========================================================
   ELOGEST — ETAPA 57.2
   SEED COMERCIAL IDempotente — CENÁRIOS DOS MÓDULOS

   Pré-requisito:
   - seed-demo-etapa57.ts executado com sucesso.

   Cria/atualiza:
   - chamados em diferentes fases;
   - comunicados publicados e agendados;
   - reunião de conselho com pautas;
   - enquetes publicada e encerrada;
   - assembleias agendada e com resultados publicados;
   - categorias e lançamentos financeiros;
   - logs demonstrativos da IA Operacional.

   Não remove dados e não afeta outras administradoras.
   ========================================================= */

const DEMO_ADMIN_CNPJ = "98000000000100";
const ADMIN_EMAIL = "administradora.demo@example.invalid";
const SYNDIC_EMAIL = "sindico.demo@example.invalid";
const COUNCIL_EMAIL = "conselheiro.demo@example.invalid";
const OWNER_EMAIL = "proprietario.demo@example.invalid";
const RESIDENT_EMAIL = "morador.demo@example.invalid";

const DEMO_MARKER = "[DEMO ELOGEST]";
const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number, hour = 12) {
  const date = new Date(NOW.getTime() + days * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function monthCompetence(offset = 0) {
  const date = new Date(NOW);
  return new Date(date.getFullYear(), date.getMonth() + offset, 1, 12, 0, 0);
}

async function requireBase() {
  const administrator = await db.administrator.findUnique({
    where: { cnpj: DEMO_ADMIN_CNPJ },
    select: {
      id: true,
      name: true,
      isDemo: true,
      demoProtectionEnabled: true,
    },
  });

  if (!administrator) {
    throw new Error(
      "Administradora Demo não encontrada. Execute primeiro prisma/seeds/seed-demo-etapa57.ts.",
    );
  }

  if (!administrator.isDemo) {
    throw new Error(
      "A administradora localizada não está marcada como demo. Execução interrompida.",
    );
  }

  const users = await db.user.findMany({
    where: {
      email: {
        in: [
          ADMIN_EMAIL,
          SYNDIC_EMAIL,
          COUNCIL_EMAIL,
          OWNER_EMAIL,
          RESIDENT_EMAIL,
        ],
      },
    },
    select: {
      id: true,
      email: true,
      residentId: true,
      condominiumId: true,
    },
  });

  const byEmail = new Map(users.map((user) => [user.email, user]));

  for (const email of [
    ADMIN_EMAIL,
    SYNDIC_EMAIL,
    COUNCIL_EMAIL,
    OWNER_EMAIL,
    RESIDENT_EMAIL,
  ]) {
    if (!byEmail.has(email)) {
      throw new Error(`Usuário demo não encontrado: ${email}`);
    }
  }

  const condominiums = await db.condominium.findMany({
    where: { administratorId: administrator.id },
    select: { id: true, name: true },
  });

  const byName = new Map(
    condominiums.map((condominium) => [condominium.name, condominium]),
  );

  for (const name of [
    "Residencial Aurora",
    "Edifício Horizonte",
    "Condomínio Vila Verde",
  ]) {
    if (!byName.has(name)) {
      throw new Error(`Condomínio demo não encontrado: ${name}`);
    }
  }

  return {
    administrator,
    users: byEmail,
    condominiums: byName,
  };
}

async function upsertTicket(params: {
  condominiumId: string;
  unitId?: string | null;
  residentId?: string | null;
  createdByUserId: string;
  assignedToUserId?: string | null;
  title: string;
  description: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  openedAt: Date;
  firstResponseAt?: Date | null;
  resolvedAt?: Date | null;
}) {
  const existing = await db.ticket.findFirst({
    where: {
      condominiumId: params.condominiumId,
      title: params.title,
    },
    select: { id: true },
  });

  const data = {
    condominiumId: params.condominiumId,
    unitId: params.unitId ?? null,
    residentId: params.residentId ?? null,
    scope: params.unitId ? TicketScope.UNIT : TicketScope.CONDOMINIUM,
    title: params.title,
    description: params.description,
    category: params.category,
    priority: params.priority,
    status: params.status,
    openedAt: params.openedAt,
    firstResponseAt: params.firstResponseAt ?? null,
    resolvedAt: params.resolvedAt ?? null,
    closedAt: params.resolvedAt ?? null,
    createdByUserId: params.createdByUserId,
    assignedToUserId: params.assignedToUserId ?? null,
  };

  if (existing) {
    return db.ticket.update({
      where: { id: existing.id },
      data,
    });
  }

  return db.ticket.create({ data });
}

async function upsertAnnouncement(params: {
  administratorId: string;
  condominiumId: string;
  createdByUserId: string;
  title: string;
  content: string;
  type: AnnouncementType;
  status: AnnouncementStatus;
  priority: AnnouncementPriority;
  publishAt?: Date | null;
  publishedAt?: Date | null;
  eventStartAt?: Date | null;
  eventEndAt?: Date | null;
  expiresAt?: Date | null;
}) {
  const existing = await db.announcement.findFirst({
    where: {
      administratorId: params.administratorId,
      condominiumId: params.condominiumId,
      title: params.title,
    },
    select: { id: true },
  });

  const data = {
    administratorId: params.administratorId,
    condominiumId: params.condominiumId,
    title: params.title,
    content: params.content,
    type: params.type,
    status: params.status,
    priority: params.priority,
    targetScope: AnnouncementTargetScope.CONDOMINIUM,
    publishAt: params.publishAt ?? null,
    publishedAt: params.publishedAt ?? null,
    eventStartAt: params.eventStartAt ?? null,
    eventEndAt: params.eventEndAt ?? null,
    expiresAt: params.expiresAt ?? null,
    requireReadingConfirmation: true,
    createdByUserId: params.createdByUserId,
  };

  if (existing) {
    return db.announcement.update({
      where: { id: existing.id },
      data,
    });
  }

  return db.announcement.create({ data });
}

async function upsertPoll(params: {
  administratorId: string;
  condominiumId: string;
  createdByUserId: string;
  title: string;
  description: string;
  type: PollType;
  status: PollStatus;
  startsAt: Date;
  endsAt: Date;
  publishedAt: Date;
  closedAt?: Date | null;
  resultsPublishedAt?: Date | null;
  options: string[];
}) {
  const existing = await db.poll.findFirst({
    where: {
      administratorId: params.administratorId,
      condominiumId: params.condominiumId,
      title: params.title,
    },
    select: { id: true },
  });

  const pollData = {
    administratorId: params.administratorId,
    condominiumId: params.condominiumId,
    title: params.title,
    description: params.description,
    type: params.type,
    status: params.status,
    targetScope: PollTargetScope.CONDOMINIUM,
    resultVisibility: PollResultVisibility.PARTICIPANTS_AFTER_CLOSED,
    startsAt: params.startsAt,
    endsAt: params.endsAt,
    publishedAt: params.publishedAt,
    closedAt: params.closedAt ?? null,
    resultsPublishedAt: params.resultsPublishedAt ?? null,
    resultsPublishedByUserId: params.resultsPublishedAt
      ? params.createdByUserId
      : null,
    allowResponseUpdate: true,
    anonymousResults: true,
    requireEligibleVoter: false,
    createdByUserId: params.createdByUserId,
    metadata: {
      demo: true,
      marker: DEMO_MARKER,
    },
  };

  const poll = existing
    ? await db.poll.update({
        where: { id: existing.id },
        data: pollData,
      })
    : await db.poll.create({ data: pollData });

  for (const [index, label] of params.options.entries()) {
    const option = await db.pollOption.findFirst({
      where: { pollId: poll.id, label },
      select: { id: true },
    });

    const optionData = {
      pollId: poll.id,
      label,
      order: index + 1,
      isActive: true,
      metadata: {
        demo: true,
        marker: DEMO_MARKER,
      },
    };

    if (option) {
      await db.pollOption.update({
        where: { id: option.id },
        data: optionData,
      });
    } else {
      await db.pollOption.create({ data: optionData });
    }
  }

  return poll;
}

async function upsertCouncilMeeting(params: {
  administratorId: string;
  condominiumId: string;
  createdByUserId: string;
  recordKeeperUserId: string;
}) {
  const title = "Reunião Do Conselho — Planejamento Do Segundo Semestre";

  const existing = await db.councilMeeting.findFirst({
    where: {
      administratorId: params.administratorId,
      condominiumId: params.condominiumId,
      title,
    },
    select: { id: true },
  });

  const data = {
    administratorId: params.administratorId,
    condominiumId: params.condominiumId,
    title,
    description:
      "Reunião demonstrativa para priorização de manutenção, segurança e comunicação com moradores.",
    status: CouncilMeetingStatus.COMPLETED,
    mode: MeetingMode.HYBRID,
    scheduledStartAt: daysFromNow(-18, 19),
    scheduledEndAt: daysFromNow(-18, 21),
    completedAt: daysFromNow(-18, 21),
    location: "Salão De Reuniões E Sala EloGest",
    summary:
      "O conselho definiu prioridades para manutenção preventiva, iluminação e comunicação.",
    decisions:
      "Aprovada vistoria hidráulica e orçamento para modernização da iluminação.",
    nextSteps:
      "Solicitar três propostas e apresentar comparação na próxima reunião.",
    internalNotes: `${DEMO_MARKER} cenário comercial.`,
    createdByUserId: params.createdByUserId,
    recordKeeperUserId: params.recordKeeperUserId,
    recordKeeperAssignedAt: daysFromNow(-18, 19),
    metadata: {
      demo: true,
      marker: DEMO_MARKER,
    },
  };

  const meeting = existing
    ? await db.councilMeeting.update({
        where: { id: existing.id },
        data,
      })
    : await db.councilMeeting.create({ data });

  const agenda = [
    {
      order: 1,
      title: "Vistoria Preventiva Da Rede Hidráulica",
      description: "Avaliação das prumadas e pontos com maior recorrência.",
      status: CouncilAgendaItemStatus.APPROVED,
      discussionNotes:
        "O histórico de chamados indica aumento de ocorrências no bloco B.",
      decision: "Contratar vistoria técnica preventiva.",
      responsibleName: "Carlos Mendes",
      dueDate: daysFromNow(12),
    },
    {
      order: 2,
      title: "Modernização Da Iluminação Das Garagens",
      description: "Comparação entre luminárias convencionais e LED.",
      status: CouncilAgendaItemStatus.DISCUSSED,
      discussionNotes:
        "Solicitar estimativa de economia e prazo de retorno do investimento.",
      decision: "Coletar três propostas antes da aprovação final.",
      responsibleName: "Renata Alves",
      dueDate: daysFromNow(20),
    },
  ];

  for (const item of agenda) {
    const existingItem = await db.councilMeetingAgendaItem.findFirst({
      where: {
        councilMeetingId: meeting.id,
        title: item.title,
      },
      select: { id: true },
    });

    const itemData = {
      councilMeetingId: meeting.id,
      ...item,
      metadata: {
        demo: true,
        marker: DEMO_MARKER,
      },
    };

    if (existingItem) {
      await db.councilMeetingAgendaItem.update({
        where: { id: existingItem.id },
        data: itemData,
      });
    } else {
      await db.councilMeetingAgendaItem.create({ data: itemData });
    }
  }

  return meeting;
}

async function upsertAssembly(params: {
  administratorId: string;
  condominiumId: string;
  createdByUserId: string;
  title: string;
  description: string;
  status: AssemblyStatus;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  resultsPublished: boolean;
}) {
  const existing = await db.assembly.findFirst({
    where: {
      administratorId: params.administratorId,
      condominiumId: params.condominiumId,
      title: params.title,
    },
    select: { id: true },
  });

  const resultDate = params.resultsPublished ? daysFromNow(-28, 22) : null;

  const data = {
    administratorId: params.administratorId,
    condominiumId: params.condominiumId,
    title: params.title,
    description: params.description,
    type: AssemblyType.ORDINARY,
    status: params.status,
    mode: MeetingMode.HYBRID,
    scheduledStartAt: params.scheduledStartAt,
    scheduledEndAt: params.scheduledEndAt,
    votingStartsAt: params.scheduledStartAt,
    votingEndsAt: params.scheduledEndAt,
    openedAt: params.resultsPublished ? daysFromNow(-28, 19) : null,
    closedAt: params.resultsPublished ? daysFromNow(-28, 21) : null,
    resultsPublishedAt: resultDate,
    convocationPublishedAt: params.resultsPublished
      ? daysFromNow(-45, 10)
      : daysFromNow(-3, 10),
    convocationPublishedByUserId: params.createdByUserId,
    location: "Salão De Festas E Sala De Assembleia EloGest",
    accessInstructions:
      "Participação presencial ou pelo portal, conforme vínculo ativo.",
    convocationText:
      "Convocação demonstrativa com pautas, prazos e orientações para votação.",
    allowVoteChange: true,
    eligibilitySnapshotAt: params.resultsPublished
      ? daysFromNow(-28, 18)
      : null,
    createdByUserId: params.createdByUserId,
    resultsPublishedByUserId: params.resultsPublished
      ? params.createdByUserId
      : null,
    metadata: {
      demo: true,
      marker: DEMO_MARKER,
    },
  };

  const assembly = existing
    ? await db.assembly.update({
        where: { id: existing.id },
        data,
      })
    : await db.assembly.create({ data });

  const agendaItems = params.resultsPublished
    ? [
        {
          order: 1,
          title: "Aprovação Das Contas Do Período",
          description: "Apresentação do resumo financeiro e parecer do conselho.",
          type: AssemblyAgendaItemType.APPROVE_REJECT_ABSTAIN,
          status: AssemblyAgendaItemStatus.RESULT_VALIDATED,
          resultStatus: AssemblyResultStatus.APPROVED,
          resultSummary:
            "Contas aprovadas pela maioria dos votos válidos.",
          resultValidatedAt: resultDate,
          options: [
            { label: "Aprovar", isAbstention: false },
            { label: "Rejeitar", isAbstention: false },
            { label: "Abster-se", isAbstention: true },
          ],
        },
        {
          order: 2,
          title: "Modernização Do Sistema De Controle De Acesso",
          description: "Deliberação sobre implantação por etapas.",
          type: AssemblyAgendaItemType.YES_NO_ABSTAIN,
          status: AssemblyAgendaItemStatus.RESULT_VALIDATED,
          resultStatus: AssemblyResultStatus.APPROVED,
          resultSummary:
            "Implantação aprovada com execução em duas etapas.",
          resultValidatedAt: resultDate,
          options: [
            { label: "Sim", isAbstention: false },
            { label: "Não", isAbstention: false },
            { label: "Abster-se", isAbstention: true },
          ],
        },
      ]
    : [
        {
          order: 1,
          title: "Previsão Orçamentária Do Próximo Exercício",
          description: "Apresentação e deliberação da previsão anual.",
          type: AssemblyAgendaItemType.APPROVE_REJECT_ABSTAIN,
          status: AssemblyAgendaItemStatus.DRAFT,
          resultStatus: AssemblyResultStatus.PENDING,
          resultSummary: null,
          resultValidatedAt: null,
          options: [
            { label: "Aprovar", isAbstention: false },
            { label: "Rejeitar", isAbstention: false },
            { label: "Abster-se", isAbstention: true },
          ],
        },
      ];

  for (const agenda of agendaItems) {
    const existingAgenda = await db.assemblyAgendaItem.findFirst({
      where: {
        assemblyId: assembly.id,
        title: agenda.title,
      },
      select: { id: true },
    });

    const agendaData = {
      assemblyId: assembly.id,
      order: agenda.order,
      title: agenda.title,
      description: agenda.description,
      type: agenda.type,
      status: agenda.status,
      quorumRuleType: AssemblyQuorumRuleType.SIMPLE_MAJORITY,
      votingStartsAt: params.scheduledStartAt,
      votingEndsAt: params.scheduledEndAt,
      resultStatus: agenda.resultStatus,
      resultSummary: agenda.resultSummary,
      resultValidatedAt: agenda.resultValidatedAt,
      metadata: {
        demo: true,
        marker: DEMO_MARKER,
      },
    };

    const agendaItem = existingAgenda
      ? await db.assemblyAgendaItem.update({
          where: { id: existingAgenda.id },
          data: agendaData,
        })
      : await db.assemblyAgendaItem.create({ data: agendaData });

    for (const [index, option] of agenda.options.entries()) {
      const existingOption = await db.assemblyAgendaOption.findFirst({
        where: {
          agendaItemId: agendaItem.id,
          label: option.label,
        },
        select: { id: true },
      });

      const optionData = {
        agendaItemId: agendaItem.id,
        label: option.label,
        order: index + 1,
        isAbstention: option.isAbstention,
        metadata: {
          demo: true,
          marker: DEMO_MARKER,
        },
      };

      if (existingOption) {
        await db.assemblyAgendaOption.update({
          where: { id: existingOption.id },
          data: optionData,
        });
      } else {
        await db.assemblyAgendaOption.create({ data: optionData });
      }
    }
  }

  return assembly;
}

async function upsertFinancialCategory(params: {
  administratorId: string;
  type: FinancialEntryType;
  name: string;
  description: string;
  sortOrder: number;
}) {
  return db.financialCategory.upsert({
    where: {
      administratorId_type_name: {
        administratorId: params.administratorId,
        type: params.type,
        name: params.name,
      },
    },
    update: {
      description: params.description,
      status: "ACTIVE",
      isDefault: true,
      sortOrder: params.sortOrder,
      metadata: {
        demo: true,
        marker: DEMO_MARKER,
      },
    },
    create: {
      administratorId: params.administratorId,
      type: params.type,
      name: params.name,
      description: params.description,
      status: "ACTIVE",
      isDefault: true,
      sortOrder: params.sortOrder,
      metadata: {
        demo: true,
        marker: DEMO_MARKER,
      },
    },
  });
}

async function upsertFinancialEntry(params: {
  administratorId: string;
  condominiumId: string;
  unitId?: string | null;
  providerId?: string | null;
  categoryId: string;
  createdByUserId: string;
  type: FinancialEntryType;
  status: FinancialEntryStatus;
  description: string;
  competence: Date;
  dueDate: Date;
  valueCents: number;
}) {
  const existing = await db.financialEntry.findFirst({
    where: {
      administratorId: params.administratorId,
      condominiumId: params.condominiumId,
      description: params.description,
      competence: params.competence,
    },
    select: { id: true },
  });

  const data = {
    administratorId: params.administratorId,
    condominiumId: params.condominiumId,
    unitId: params.unitId ?? null,
    providerId: params.providerId ?? null,
    categoryId: params.categoryId,
    type: params.type,
    origin: FinancialEntryOrigin.MANUAL,
    status: params.status,
    description: params.description,
    competence: params.competence,
    dueDate: params.dueDate,
    valueCents: params.valueCents,
    notes: `${DEMO_MARKER} lançamento fictício para apresentação.`,
    metadata: {
      demo: true,
      marker: DEMO_MARKER,
    },
    createdByUserId: params.createdByUserId,
  };

  if (existing) {
    return db.financialEntry.update({
      where: { id: existing.id },
      data,
    });
  }

  return db.financialEntry.create({ data });
}

async function upsertAiLog(params: {
  administratorId: string;
  userId: string;
  module: string;
  action: string;
  entityType: string;
  outputPreview: string;
}) {
  const existing = await db.aiOperationLog.findFirst({
    where: {
      administratorId: params.administratorId,
      module: params.module,
      action: params.action,
      entityType: params.entityType,
      outputPreview: params.outputPreview,
    },
    select: { id: true },
  });

  const data = {
    administratorId: params.administratorId,
    userId: params.userId,
    module: params.module,
    action: params.action,
    entityType: params.entityType,
    promptVersion: "demo-v1",
    status: "SUCCESS",
    outputPreview: params.outputPreview,
  };

  if (existing) {
    return db.aiOperationLog.update({
      where: { id: existing.id },
      data,
    });
  }

  return db.aiOperationLog.create({ data });
}

async function main() {
  console.log("=========================================================");
  console.log("ELOGEST — ETAPA 57.2");
  console.log("Seed Comercial Idempotente — Cenários Dos Módulos");
  console.log("=========================================================");

  const { administrator, users, condominiums } = await requireBase();

  const admin = users.get(ADMIN_EMAIL)!;
  const syndic = users.get(SYNDIC_EMAIL)!;
  const council = users.get(COUNCIL_EMAIL)!;
  const owner = users.get(OWNER_EMAIL)!;
  const resident = users.get(RESIDENT_EMAIL)!;

  const aurora = condominiums.get("Residencial Aurora")!;
  const horizonte = condominiums.get("Edifício Horizonte")!;
  const vilaVerde = condominiums.get("Condomínio Vila Verde")!;

  const auroraUnits = await db.unit.findMany({
    where: { condominiumId: aurora.id },
    orderBy: [{ block: "asc" }, { unitNumber: "asc" }],
  });

  const horizonteUnits = await db.unit.findMany({
    where: { condominiumId: horizonte.id },
    orderBy: [{ block: "asc" }, { unitNumber: "asc" }],
  });

  const vilaVerdeUnits = await db.unit.findMany({
    where: { condominiumId: vilaVerde.id },
    orderBy: [{ block: "asc" }, { unitNumber: "asc" }],
  });

  if (
    auroraUnits.length < 4 ||
    horizonteUnits.length < 4 ||
    vilaVerdeUnits.length < 4
  ) {
    throw new Error("As unidades da base demo estão incompletas.");
  }

  await upsertTicket({
    condominiumId: aurora.id,
    unitId: auroraUnits[0].id,
    residentId: syndic.residentId,
    createdByUserId: syndic.id,
    assignedToUserId: admin.id,
    title: "Vazamento Intermitente No Banheiro Social",
    description:
      "Morador relata umidade próxima ao shaft. Solicita avaliação preventiva antes do agravamento.",
    category: "Hidráulica",
    priority: TicketPriority.HIGH,
    status: TicketStatus.IN_PROGRESS,
    openedAt: daysFromNow(-4, 9),
    firstResponseAt: daysFromNow(-4, 10),
  });

  await upsertTicket({
    condominiumId: aurora.id,
    createdByUserId: syndic.id,
    assignedToUserId: admin.id,
    title: "Iluminação Da Garagem Com Pontos Apagados",
    description:
      "Foram identificadas luminárias apagadas nas vagas próximas ao bloco B.",
    category: "Elétrica",
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.OPEN,
    openedAt: daysFromNow(-1, 8),
  });

  await upsertTicket({
    condominiumId: vilaVerde.id,
    unitId: vilaVerdeUnits[1].id,
    residentId: resident.residentId,
    createdByUserId: resident.id,
    assignedToUserId: admin.id,
    title: "Interfone Da Casa 02 Sem Áudio",
    description:
      "O equipamento recebe chamadas, mas não transmite áudio para a portaria.",
    category: "Interfonia",
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.RESOLVED,
    openedAt: daysFromNow(-12, 11),
    firstResponseAt: daysFromNow(-12, 12),
    resolvedAt: daysFromNow(-10, 16),
  });

  await upsertAnnouncement({
    administratorId: administrator.id,
    condominiumId: aurora.id,
    createdByUserId: admin.id,
    title: "Manutenção Preventiva Da Caixa D'Água",
    content:
      "A limpeza e inspeção da caixa d'água ocorrerão na próxima terça-feira. Poderá haver interrupção temporária no abastecimento entre 9h e 13h.",
    type: AnnouncementType.MAINTENANCE,
    status: AnnouncementStatus.PUBLISHED,
    priority: AnnouncementPriority.HIGH,
    publishedAt: daysFromNow(-2, 10),
    eventStartAt: daysFromNow(5, 9),
    eventEndAt: daysFromNow(5, 13),
    expiresAt: daysFromNow(6, 23),
  });

  await upsertAnnouncement({
    administratorId: administrator.id,
    condominiumId: horizonte.id,
    createdByUserId: admin.id,
    title: "Simulado De Evacuação E Orientação De Segurança",
    content:
      "Será realizado um simulado com orientação da equipe de segurança. A participação de moradores e ocupantes é recomendada.",
    type: AnnouncementType.SECURITY,
    status: AnnouncementStatus.SCHEDULED,
    priority: AnnouncementPriority.NORMAL,
    publishAt: daysFromNow(2, 9),
    eventStartAt: daysFromNow(10, 10),
    eventEndAt: daysFromNow(10, 11),
    expiresAt: daysFromNow(11, 23),
  });

  await upsertCouncilMeeting({
    administratorId: administrator.id,
    condominiumId: aurora.id,
    createdByUserId: syndic.id,
    recordKeeperUserId: council.id,
  });

  await upsertPoll({
    administratorId: administrator.id,
    condominiumId: aurora.id,
    createdByUserId: admin.id,
    title: "Preferência De Horário Para Manutenção Das Áreas Comuns",
    description:
      "Consulta para definir o período com menor impacto aos moradores.",
    type: PollType.SINGLE_CHOICE,
    status: PollStatus.PUBLISHED,
    startsAt: daysFromNow(-2, 8),
    endsAt: daysFromNow(6, 20),
    publishedAt: daysFromNow(-2, 8),
    options: ["Manhã", "Início Da Tarde", "Final Da Tarde"],
  });

  await upsertPoll({
    administratorId: administrator.id,
    condominiumId: horizonte.id,
    createdByUserId: admin.id,
    title: "Avaliação Do Novo Controle De Acesso",
    description:
      "Pesquisa demonstrativa sobre a experiência dos usuários após a implantação.",
    type: PollType.YES_NO,
    status: PollStatus.CLOSED,
    startsAt: daysFromNow(-24, 8),
    endsAt: daysFromNow(-15, 20),
    publishedAt: daysFromNow(-24, 8),
    closedAt: daysFromNow(-15, 20),
    resultsPublishedAt: daysFromNow(-14, 10),
    options: ["Satisfeito", "Precisa De Ajustes"],
  });

  await upsertAssembly({
    administratorId: administrator.id,
    condominiumId: aurora.id,
    createdByUserId: admin.id,
    title: "Assembleia Geral Ordinária — Prestação De Contas",
    description:
      "Assembleia demonstrativa concluída, com resultados oficiais publicados.",
    status: AssemblyStatus.RESULTS_PUBLISHED,
    scheduledStartAt: daysFromNow(-28, 19),
    scheduledEndAt: daysFromNow(-28, 21),
    resultsPublished: true,
  });

  await upsertAssembly({
    administratorId: administrator.id,
    condominiumId: vilaVerde.id,
    createdByUserId: admin.id,
    title: "Assembleia Geral Ordinária — Previsão Orçamentária",
    description:
      "Assembleia demonstrativa agendada para apresentação da previsão anual.",
    status: AssemblyStatus.SCHEDULED,
    scheduledStartAt: daysFromNow(14, 19),
    scheduledEndAt: daysFromNow(14, 21),
    resultsPublished: false,
  });

  const revenueCategory = await upsertFinancialCategory({
    administratorId: administrator.id,
    type: FinancialEntryType.REVENUE,
    name: "Mensalidades Condominiais",
    description: "Receitas recorrentes por unidade.",
    sortOrder: 10,
  });

  const expenseCategory = await upsertFinancialCategory({
    administratorId: administrator.id,
    type: FinancialEntryType.EXPENSE,
    name: "Manutenção Predial",
    description: "Despesas com manutenção preventiva e corretiva.",
    sortOrder: 20,
  });

  const provider = await db.provider.findFirst({
    where: {
      createdByAdministratorId: administrator.id,
      primaryCategory: "Manutenção Predial",
    },
    select: { id: true },
  });

  await upsertFinancialEntry({
    administratorId: administrator.id,
    condominiumId: aurora.id,
    unitId: auroraUnits[0].id,
    categoryId: revenueCategory.id,
    createdByUserId: admin.id,
    type: FinancialEntryType.REVENUE,
    status: FinancialEntryStatus.PAID,
    description: "Mensalidade — Unidade A 101",
    competence: monthCompetence(0),
    dueDate: daysFromNow(-8, 12),
    valueCents: 68500,
  });

  await upsertFinancialEntry({
    administratorId: administrator.id,
    condominiumId: aurora.id,
    unitId: auroraUnits[1].id,
    categoryId: revenueCategory.id,
    createdByUserId: admin.id,
    type: FinancialEntryType.REVENUE,
    status: FinancialEntryStatus.OVERDUE,
    description: "Mensalidade — Unidade A 102",
    competence: monthCompetence(0),
    dueDate: daysFromNow(-8, 12),
    valueCents: 68500,
  });

  await upsertFinancialEntry({
    administratorId: administrator.id,
    condominiumId: horizonte.id,
    unitId: horizonteUnits[2].id,
    categoryId: revenueCategory.id,
    createdByUserId: admin.id,
    type: FinancialEntryType.REVENUE,
    status: FinancialEntryStatus.OPEN,
    description: "Mensalidade — Unidade 41",
    competence: monthCompetence(1),
    dueDate: daysFromNow(18, 12),
    valueCents: 92000,
  });

  await upsertFinancialEntry({
    administratorId: administrator.id,
    condominiumId: aurora.id,
    providerId: provider?.id ?? null,
    categoryId: expenseCategory.id,
    createdByUserId: admin.id,
    type: FinancialEntryType.EXPENSE,
    status: FinancialEntryStatus.OPEN,
    description: "Vistoria Preventiva Da Rede Hidráulica",
    competence: monthCompetence(0),
    dueDate: daysFromNow(9, 12),
    valueCents: 245000,
  });

  await upsertAiLog({
    administratorId: administrator.id,
    userId: admin.id,
    module: "chamados",
    action: "priorizacao_operacional",
    entityType: "Ticket",
    outputPreview:
      "Prioridade recomendada: vazamento do bloco A deve ser acompanhado antes dos chamados de iluminação.",
  });

  await upsertAiLog({
    administratorId: administrator.id,
    userId: admin.id,
    module: "financeiro",
    action: "resumo_gerencial",
    entityType: "FinancialEntry",
    outputPreview:
      "Há uma mensalidade vencida e uma despesa relevante prevista para manutenção hidráulica.",
  });

  await upsertAiLog({
    administratorId: administrator.id,
    userId: admin.id,
    module: "relatorios",
    action: "leitura_executiva",
    entityType: "Administrator",
    outputPreview:
      "A operação demonstra bom nível de organização, com atenção recomendada para inadimplência e manutenção preventiva.",
  });

  console.log("");
  console.log("Cenários comerciais criados/atualizados com sucesso:");
  console.log("- 3 chamados");
  console.log("- 2 comunicados");
  console.log("- 1 reunião de conselho com 2 pautas");
  console.log("- 2 enquetes com opções");
  console.log("- 2 assembleias com pautas");
  console.log("- 2 categorias financeiras");
  console.log("- 4 lançamentos financeiros");
  console.log("- 3 registros demonstrativos da IA Operacional");
  console.log("");
  console.log("Nenhuma outra administradora foi alterada.");
}

main()
  .catch((error) => {
    console.error("Erro ao executar seed de cenários demo:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
