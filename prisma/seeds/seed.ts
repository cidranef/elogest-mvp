import "dotenv/config";
import {
  AccessRole,
  NotificationChannel,
  NotificationStatus,
  PrismaClient,
  Role,
  Status,
  TicketPriority,
  TicketRatingTargetType,
  TicketScope,
  TicketStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";



/* =========================================================
   SEED DEMO - ELOGEST

   ETAPA 42.1 — BASE DEMO REALISTA

   Objetivo:
   - Preparar uma base de demonstração mais profissional.
   - Remover a sensação de "teste técnico".
   - Criar dados coerentes para uma apresentação curta do MVP.

   Este seed cria:
   - Super Admin EloGest
   - Administradora demo
   - 3 condomínios
   - usuários por perfil
   - unidades
   - moradores/proprietários
   - vínculos UserAccess
   - chamados com histórico
   - notificações internas
   - avaliações de atendimento

   Senha padrão dos usuários demo:
   Heloisa100%
   ========================================================= */



const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL não definida.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = "Heloisa100%";



/* =========================================================
   DADOS DEMO CONTROLADOS

   Importante:
   Usamos e-mails e CNPJs específicos para poder limpar/recriar
   apenas a base demo sem apagar dados reais.
   ========================================================= */

const DEMO_ADMIN_CNPJ = "11222333000144";

const DEMO_CONDOMINIUM_CNPJS = [
  "11222333000225",
  "11222333000306",
  "11222333000497",
];

const DEMO_USER_EMAILS = [
  "admin@prismagestao.com.br",
  "atendimento@prismagestao.com.br",
  "sindico.skorpios@demo.com",
  "sindico.vistaverde@demo.com",
  "morador.skorpios@demo.com",
  "proprietario.skorpios@demo.com",
  "morador.vistaverde@demo.com",
];

const DEMO_RESIDENT_CPFS = [
  "32165498700",
  "32165498701",
  "32165498702",
  "32165498703",
];



/* =========================================================
   HELPERS
   ========================================================= */

async function createPasswordHash() {
  return bcrypt.hash(DEFAULT_PASSWORD, 10);
}



async function upsertUserAccess(data: {
  userId: string;
  role: AccessRole;
  label: string;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  isDefault?: boolean;
}) {
  const existing = await prisma.userAccess.findFirst({
    where: {
      userId: data.userId,
      role: data.role,
      administratorId: data.administratorId ?? null,
      condominiumId: data.condominiumId ?? null,
      unitId: data.unitId ?? null,
      residentId: data.residentId ?? null,
    },
  });

  if (existing) {
    return prisma.userAccess.update({
      where: {
        id: existing.id,
      },
      data: {
        label: data.label,
        isDefault: data.isDefault ?? false,
        isActive: true,
      },
    });
  }

  return prisma.userAccess.create({
    data: {
      userId: data.userId,
      role: data.role,
      label: data.label,
      administratorId: data.administratorId ?? null,
      condominiumId: data.condominiumId ?? null,
      unitId: data.unitId ?? null,
      residentId: data.residentId ?? null,
      isDefault: data.isDefault ?? false,
      isActive: true,
    },
  });
}



async function createTicketLog(data: {
  ticketId: string;
  userId: string;
  accessId?: string | null;
  actorRole: string;
  actorLabel: string;
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  comment?: string | null;
}) {
  return prisma.ticketLog.create({
    data: {
      ticketId: data.ticketId,
      userId: data.userId,
      accessId: data.accessId ?? null,
      actorRole: data.actorRole,
      actorLabel: data.actorLabel,
      action: data.action,
      fromValue: data.fromValue ?? null,
      toValue: data.toValue ?? null,
      comment: data.comment ?? null,
    },
  });
}



async function createNotification(data: {
  userId: string;
  ticketId?: string | null;
  accessId?: string | null;
  type: string;
  title: string;
  message: string;
  href: string;
  status?: NotificationStatus;
}) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      ticketId: data.ticketId ?? null,
      accessId: data.accessId ?? null,
      channel: NotificationChannel.SYSTEM,
      status: data.status ?? NotificationStatus.UNREAD,
      type: data.type,
      title: data.title,
      message: data.message,
      href: data.href,
    },
  });
}



/* =========================================================
   LIMPEZA DA BASE DEMO

   Remove apenas dados vinculados à administradora demo e aos
   e-mails/CPFs controlados acima.
   ========================================================= */

async function resetDemoData() {
  const demoAdministrator = await prisma.administrator.findUnique({
    where: {
      cnpj: DEMO_ADMIN_CNPJ,
    },
    select: {
      id: true,
    },
  });

  const demoCondominiums = await prisma.condominium.findMany({
    where: {
      OR: [
        {
          cnpj: {
            in: DEMO_CONDOMINIUM_CNPJS,
          },
        },
        demoAdministrator
          ? {
              administratorId: demoAdministrator.id,
            }
          : {},
      ],
    },
    select: {
      id: true,
    },
  });

  const demoCondominiumIds = demoCondominiums.map((item) => item.id);

  const demoUsers = await prisma.user.findMany({
    where: {
      email: {
        in: DEMO_USER_EMAILS,
      },
    },
    select: {
      id: true,
    },
  });

  const demoUserIds = demoUsers.map((item) => item.id);

  const demoResidents = await prisma.resident.findMany({
    where: {
      OR: [
        {
          cpf: {
            in: DEMO_RESIDENT_CPFS,
          },
        },
        {
          email: {
            in: DEMO_USER_EMAILS,
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  const demoResidentIds = demoResidents.map((item) => item.id);

  const demoTickets = await prisma.ticket.findMany({
    where: {
      OR: [
        {
          condominiumId: {
            in: demoCondominiumIds,
          },
        },
        {
          createdByUserId: {
            in: demoUserIds,
          },
        },
        {
          residentId: {
            in: demoResidentIds,
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  const demoTicketIds = demoTickets.map((item) => item.id);

  await prisma.notification.deleteMany({
    where: {
      OR: [
        {
          userId: {
            in: demoUserIds,
          },
        },
        {
          ticketId: {
            in: demoTicketIds,
          },
        },
      ],
    },
  });

  await prisma.ticketRating.deleteMany({
    where: {
      ticketId: {
        in: demoTicketIds,
      },
    },
  });

  await prisma.ticketAttachment.deleteMany({
    where: {
      ticketId: {
        in: demoTicketIds,
      },
    },
  });

  await prisma.ticketLog.deleteMany({
    where: {
      ticketId: {
        in: demoTicketIds,
      },
    },
  });

  await prisma.ticket.deleteMany({
    where: {
      id: {
        in: demoTicketIds,
      },
    },
  });

  await prisma.userAccess.deleteMany({
    where: {
      OR: [
        {
          userId: {
            in: demoUserIds,
          },
        },
        {
          condominiumId: {
            in: demoCondominiumIds,
          },
        },
        {
          residentId: {
            in: demoResidentIds,
          },
        },
      ],
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: {
        in: DEMO_USER_EMAILS,
      },
    },
  });

  await prisma.resident.deleteMany({
    where: {
      OR: [
        {
          cpf: {
            in: DEMO_RESIDENT_CPFS,
          },
        },
        {
          email: {
            in: DEMO_USER_EMAILS,
          },
        },
      ],
    },
  });

  await prisma.unit.deleteMany({
    where: {
      condominiumId: {
        in: demoCondominiumIds,
      },
    },
  });

  await prisma.condominium.deleteMany({
    where: {
      id: {
        in: demoCondominiumIds,
      },
    },
  });

  await prisma.administrator.deleteMany({
    where: {
      cnpj: DEMO_ADMIN_CNPJ,
    },
  });
}



/* =========================================================
   SEED PRINCIPAL
   ========================================================= */

async function main() {
  const passwordHash = await createPasswordHash();

  await resetDemoData();



  /* =========================================================
     SUPER ADMIN ELOGEST

     Mantemos o seu usuário real como Super Admin.
   ========================================================= */

  const superAdmin = await prisma.user.upsert({
    where: {
      email: "cidranef@gmail.com",
    },
    update: {
      name: "Fabio Costa",
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      name: "Fabio Costa",
      email: "cidranef@gmail.com",
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  });

  await upsertUserAccess({
    userId: superAdmin.id,
    role: AccessRole.SUPER_ADMIN,
    label: "Super Admin EloGest",
    isDefault: true,
  });



  /* =========================================================
     ADMINISTRADORA DEMO
   ========================================================= */

  const administrator = await prisma.administrator.create({
    data: {
      name: "Prisma Gestão Condominial",
      cnpj: DEMO_ADMIN_CNPJ,
      email: "contato@prismagestao.com.br",
      phone: "1132048800",
      status: Status.ACTIVE,
    },
  });



  /* =========================================================
     CONDOMÍNIOS DEMO
   ========================================================= */

  const skorpios = await prisma.condominium.create({
    data: {
      administratorId: administrator.id,
      name: "Edifício Skorpios",
      cnpj: DEMO_CONDOMINIUM_CNPJS[0],
      email: "administracao@edificioskorpios.com.br",
      phone: "1133331001",
      cep: "05038000",
      address: "Rua Barão do Bananal",
      number: "742",
      complement: "Torre única",
      district: "Pompeia",
      city: "São Paulo",
      state: "SP",
      status: Status.ACTIVE,
    },
  });

  const vistaVerde = await prisma.condominium.create({
    data: {
      administratorId: administrator.id,
      name: "Condomínio Vista Verde",
      cnpj: DEMO_CONDOMINIUM_CNPJS[1],
      email: "contato@vistaverdecondominio.com.br",
      phone: "1133331002",
      cep: "05424000",
      address: "Rua Natingui",
      number: "1180",
      complement: "Blocos A e B",
      district: "Vila Madalena",
      city: "São Paulo",
      state: "SP",
      status: Status.ACTIVE,
    },
  });

  const jardimAguas = await prisma.condominium.create({
    data: {
      administratorId: administrator.id,
      name: "Residencial Jardim das Águas",
      cnpj: DEMO_CONDOMINIUM_CNPJS[2],
      email: "contato@jardimdasaguas.com.br",
      phone: "1133331003",
      cep: "04619000",
      address: "Rua Vieira de Morais",
      number: "920",
      complement: "Conjunto residencial",
      district: "Campo Belo",
      city: "São Paulo",
      state: "SP",
      status: Status.ACTIVE,
    },
  });



  /* =========================================================
     USUÁRIOS DA ADMINISTRADORA
   ========================================================= */

  const adminUser = await prisma.user.create({
    data: {
      name: "Mariana Almeida",
      email: "admin@prismagestao.com.br",
      passwordHash,
      role: Role.ADMINISTRADORA,
      administratorId: administrator.id,
      isActive: true,
    },
  });

  const atendimentoUser = await prisma.user.create({
    data: {
      name: "Carolina Mendes",
      email: "atendimento@prismagestao.com.br",
      passwordHash,
      role: Role.ADMINISTRADORA,
      administratorId: administrator.id,
      isActive: true,
    },
  });

  const adminAccess = await upsertUserAccess({
    userId: adminUser.id,
    role: AccessRole.ADMINISTRADORA,
    label: "Prisma Gestão Condominial",
    administratorId: administrator.id,
    isDefault: true,
  });

  const atendimentoAccess = await upsertUserAccess({
    userId: atendimentoUser.id,
    role: AccessRole.ADMINISTRADORA,
    label: "Atendimento — Prisma Gestão Condominial",
    administratorId: administrator.id,
    isDefault: true,
  });



  /* =========================================================
     UNIDADES
   ========================================================= */

  const skorpios101 = await prisma.unit.create({
    data: {
      condominiumId: skorpios.id,
      block: "A",
      unitNumber: "101",
      unitType: "Apartamento",
      status: Status.ACTIVE,
    },
  });

  const skorpios204 = await prisma.unit.create({
    data: {
      condominiumId: skorpios.id,
      block: "A",
      unitNumber: "204",
      unitType: "Apartamento",
      status: Status.ACTIVE,
    },
  });

  const vistaVerde302 = await prisma.unit.create({
    data: {
      condominiumId: vistaVerde.id,
      block: "B",
      unitNumber: "302",
      unitType: "Apartamento",
      status: Status.ACTIVE,
    },
  });

  const jardimAguas1208 = await prisma.unit.create({
    data: {
      condominiumId: jardimAguas.id,
      block: "Torre 1",
      unitNumber: "1208",
      unitType: "Apartamento",
      status: Status.ACTIVE,
    },
  });



  /* =========================================================
     MORADORES / PROPRIETÁRIOS
   ========================================================= */

  const moradorSkorpios = await prisma.resident.create({
    data: {
      condominiumId: skorpios.id,
      unitId: skorpios101.id,
      name: "Renata Oliveira",
      cpf: DEMO_RESIDENT_CPFS[0],
      email: "morador.skorpios@demo.com",
      phone: "11970000001",
      residentType: "MORADOR",
      status: Status.ACTIVE,
    },
  });

  const proprietarioSkorpios = await prisma.resident.create({
    data: {
      condominiumId: skorpios.id,
      unitId: skorpios204.id,
      name: "Carlos Henrique Lima",
      cpf: DEMO_RESIDENT_CPFS[1],
      email: "proprietario.skorpios@demo.com",
      phone: "11970000002",
      residentType: "PROPRIETARIO",
      status: Status.ACTIVE,
    },
  });

  const moradorVistaVerde = await prisma.resident.create({
    data: {
      condominiumId: vistaVerde.id,
      unitId: vistaVerde302.id,
      name: "Patrícia Nogueira",
      cpf: DEMO_RESIDENT_CPFS[2],
      email: "morador.vistaverde@demo.com",
      phone: "11970000003",
      residentType: "MORADOR",
      status: Status.ACTIVE,
    },
  });



  /* =========================================================
     SÍNDICOS
   ========================================================= */

  const sindicoSkorpios = await prisma.user.create({
    data: {
      name: "Eduardo Martins",
      email: "sindico.skorpios@demo.com",
      passwordHash,
      role: Role.SINDICO,
      administratorId: administrator.id,
      condominiumId: skorpios.id,
      isActive: true,
    },
  });

  const sindicoVistaVerde = await prisma.user.create({
    data: {
      name: "Luciana Prado",
      email: "sindico.vistaverde@demo.com",
      passwordHash,
      role: Role.SINDICO,
      administratorId: administrator.id,
      condominiumId: vistaVerde.id,
      isActive: true,
    },
  });



  /* =========================================================
     USUÁRIOS DE PORTAL
   ========================================================= */

  const moradorUser = await prisma.user.create({
    data: {
      name: "Renata Oliveira",
      email: "morador.skorpios@demo.com",
      passwordHash,
      role: Role.MORADOR,
      administratorId: administrator.id,
      condominiumId: skorpios.id,
      residentId: moradorSkorpios.id,
      isActive: true,
    },
  });

  const proprietarioUser = await prisma.user.create({
    data: {
      name: "Carlos Henrique Lima",
      email: "proprietario.skorpios@demo.com",
      passwordHash,
      role: Role.MORADOR,
      administratorId: administrator.id,
      condominiumId: skorpios.id,
      residentId: proprietarioSkorpios.id,
      isActive: true,
    },
  });

  const moradorVistaUser = await prisma.user.create({
    data: {
      name: "Patrícia Nogueira",
      email: "morador.vistaverde@demo.com",
      passwordHash,
      role: Role.MORADOR,
      administratorId: administrator.id,
      condominiumId: vistaVerde.id,
      residentId: moradorVistaVerde.id,
      isActive: true,
    },
  });



  /* =========================================================
     USER ACCESS
   ========================================================= */

  const sindicoSkorpiosAccess = await upsertUserAccess({
    userId: sindicoSkorpios.id,
    role: AccessRole.SINDICO,
    label: "Síndico — Edifício Skorpios",
    administratorId: administrator.id,
    condominiumId: skorpios.id,
    isDefault: true,
  });

  await upsertUserAccess({
    userId: sindicoVistaVerde.id,
    role: AccessRole.SINDICO,
    label: "Síndica — Condomínio Vista Verde",
    administratorId: administrator.id,
    condominiumId: vistaVerde.id,
    isDefault: true,
  });

  const moradorAccess = await upsertUserAccess({
    userId: moradorUser.id,
    role: AccessRole.MORADOR,
    label: "Morador — Edifício Skorpios / Unidade 101",
    administratorId: administrator.id,
    condominiumId: skorpios.id,
    unitId: skorpios101.id,
    residentId: moradorSkorpios.id,
    isDefault: true,
  });

  const proprietarioAccess = await upsertUserAccess({
    userId: proprietarioUser.id,
    role: AccessRole.PROPRIETARIO,
    label: "Proprietário — Edifício Skorpios / Unidade 204",
    administratorId: administrator.id,
    condominiumId: skorpios.id,
    unitId: skorpios204.id,
    residentId: proprietarioSkorpios.id,
    isDefault: true,
  });

  const moradorVistaAccess = await upsertUserAccess({
    userId: moradorVistaUser.id,
    role: AccessRole.MORADOR,
    label: "Morador — Vista Verde / Unidade 302",
    administratorId: administrator.id,
    condominiumId: vistaVerde.id,
    unitId: vistaVerde302.id,
    residentId: moradorVistaVerde.id,
    isDefault: true,
  });



  /* =========================================================
     CHAMADOS DEMO
   ========================================================= */

  const ticketInfiltracao = await prisma.ticket.create({
    data: {
      condominiumId: skorpios.id,
      unitId: skorpios101.id,
      residentId: moradorSkorpios.id,
      scope: TicketScope.UNIT,
      title: "Infiltração próxima à janela da sala",
      description:
        "Moradora relata entrada de água pela janela da sala em dias de chuva forte.",
      category: "Manutenção predial",
      priority: TicketPriority.HIGH,
      status: TicketStatus.IN_PROGRESS,
      createdByUserId: moradorUser.id,
      createdByAccessId: moradorAccess.id,
      assignedToUserId: atendimentoUser.id,
      firstResponseAt: new Date(Date.now() - 1000 * 60 * 60 * 20),
    },
  });

  await createTicketLog({
    ticketId: ticketInfiltracao.id,
    userId: moradorUser.id,
    accessId: moradorAccess.id,
    actorRole: "MORADOR",
    actorLabel: "Moradora — Unidade 101",
    action: "CREATED",
    comment: "Chamado aberto pela moradora pelo portal.",
  });

  await createTicketLog({
    ticketId: ticketInfiltracao.id,
    userId: atendimentoUser.id,
    accessId: atendimentoAccess.id,
    actorRole: "ADMINISTRADORA",
    actorLabel: "Atendimento — Prisma Gestão Condominial",
    action: "COMMENT_PUBLIC",
    comment:
      "Recebemos a solicitação e vamos acionar a equipe de vistoria para verificar a vedação da janela.",
  });

  await createTicketLog({
    ticketId: ticketInfiltracao.id,
    userId: atendimentoUser.id,
    accessId: atendimentoAccess.id,
    actorRole: "ADMINISTRADORA",
    actorLabel: "Atendimento — Prisma Gestão Condominial",
    action: "STATUS_CHANGED",
    fromValue: "OPEN",
    toValue: "IN_PROGRESS",
    comment: "Chamado colocado em atendimento.",
  });

  await createNotification({
    userId: moradorUser.id,
    ticketId: ticketInfiltracao.id,
    accessId: moradorAccess.id,
    type: "TICKET_PUBLIC_COMMENT",
    title: "Nova resposta no chamado",
    message: "A administradora respondeu ao chamado de infiltração.",
    href: `/portal/chamados/${ticketInfiltracao.id}`,
  });



  const ticketLampada = await prisma.ticket.create({
    data: {
      condominiumId: skorpios.id,
      scope: TicketScope.CONDOMINIUM,
      title: "Lâmpada queimada na garagem",
      description:
        "Síndico informa que há uma lâmpada queimada próxima às vagas 18 e 19.",
      category: "Área comum",
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.RESOLVED,
      createdByUserId: sindicoSkorpios.id,
      createdByAccessId: sindicoSkorpiosAccess.id,
      assignedToUserId: atendimentoUser.id,
      firstResponseAt: new Date(Date.now() - 1000 * 60 * 60 * 46),
      resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 18),
      closedAt: new Date(Date.now() - 1000 * 60 * 60 * 16),
    },
  });

  await createTicketLog({
    ticketId: ticketLampada.id,
    userId: sindicoSkorpios.id,
    accessId: sindicoSkorpiosAccess.id,
    actorRole: "SINDICO",
    actorLabel: "Síndico — Edifício Skorpios",
    action: "CREATED",
    comment: "Chamado aberto pelo síndico para manutenção da garagem.",
  });

  await createTicketLog({
    ticketId: ticketLampada.id,
    userId: atendimentoUser.id,
    accessId: atendimentoAccess.id,
    actorRole: "ADMINISTRADORA",
    actorLabel: "Atendimento — Prisma Gestão Condominial",
    action: "COMMENT_PUBLIC",
    comment: "Manutenção acionada. A substituição será realizada ainda hoje.",
  });

  await createTicketLog({
    ticketId: ticketLampada.id,
    userId: atendimentoUser.id,
    accessId: atendimentoAccess.id,
    actorRole: "ADMINISTRADORA",
    actorLabel: "Atendimento — Prisma Gestão Condominial",
    action: "STATUS_CHANGED",
    fromValue: "IN_PROGRESS",
    toValue: "RESOLVED",
    comment: "Lâmpada substituída pela equipe de manutenção.",
  });

  await prisma.ticketRating.create({
    data: {
      ticketId: ticketLampada.id,
      userId: sindicoSkorpios.id,
      rating: 5,
      comment: "Atendimento rápido e bem documentado.",
      ratedTargetType: TicketRatingTargetType.ADMINISTRADORA,
      ratedAdministratorId: administrator.id,
      ratedCondominiumId: skorpios.id,
      ratedLabel: "Prisma Gestão Condominial",
    },
  });



  const ticketBarulho = await prisma.ticket.create({
    data: {
      condominiumId: vistaVerde.id,
      unitId: vistaVerde302.id,
      residentId: moradorVistaVerde.id,
      scope: TicketScope.UNIT,
      title: "Barulho recorrente após o horário permitido",
      description:
        "Moradora relata ruídos frequentes após as 22h vindos da unidade superior.",
      category: "Convivência",
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      createdByUserId: moradorVistaUser.id,
      createdByAccessId: moradorVistaAccess.id,
    },
  });

  await createTicketLog({
    ticketId: ticketBarulho.id,
    userId: moradorVistaUser.id,
    accessId: moradorVistaAccess.id,
    actorRole: "MORADOR",
    actorLabel: "Moradora — Vista Verde / Unidade 302",
    action: "CREATED",
    comment: "Chamado aberto pelo portal do morador.",
  });

  await createNotification({
    userId: adminUser.id,
    ticketId: ticketBarulho.id,
    accessId: adminAccess.id,
    type: "TICKET_CREATED",
    title: "Novo chamado aberto",
    message: "Foi aberto um chamado de convivência no Condomínio Vista Verde.",
    href: `/admin/chamados/${ticketBarulho.id}`,
    status: NotificationStatus.UNREAD,
  });



  const ticketSegundaVia = await prisma.ticket.create({
    data: {
      condominiumId: skorpios.id,
      unitId: skorpios204.id,
      residentId: proprietarioSkorpios.id,
      scope: TicketScope.UNIT,
      title: "Solicitação de segunda via de documento",
      description:
        "Proprietário solicita segunda via de documento relacionado à unidade.",
      category: "Documentos",
      priority: TicketPriority.LOW,
      status: TicketStatus.RESOLVED,
      createdByUserId: proprietarioUser.id,
      createdByAccessId: proprietarioAccess.id,
      assignedToUserId: atendimentoUser.id,
      firstResponseAt: new Date(Date.now() - 1000 * 60 * 60 * 30),
      resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
      closedAt: new Date(Date.now() - 1000 * 60 * 60 * 10),
    },
  });

  await createTicketLog({
    ticketId: ticketSegundaVia.id,
    userId: proprietarioUser.id,
    accessId: proprietarioAccess.id,
    actorRole: "PROPRIETARIO",
    actorLabel: "Proprietário — Unidade 204",
    action: "CREATED",
    comment: "Solicitação aberta pelo proprietário.",
  });

  await createTicketLog({
    ticketId: ticketSegundaVia.id,
    userId: atendimentoUser.id,
    accessId: atendimentoAccess.id,
    actorRole: "ADMINISTRADORA",
    actorLabel: "Atendimento — Prisma Gestão Condominial",
    action: "COMMENT_PUBLIC",
    comment: "Documento localizado e disponibilizado para consulta.",
  });

  await prisma.ticketRating.create({
    data: {
      ticketId: ticketSegundaVia.id,
      userId: proprietarioUser.id,
      rating: 4,
      comment: "Solicitação resolvida com clareza.",
      ratedTargetType: TicketRatingTargetType.ADMINISTRADORA,
      ratedAdministratorId: administrator.id,
      ratedCondominiumId: skorpios.id,
      ratedLabel: "Prisma Gestão Condominial",
    },
  });



  /* =========================================================
     NOTIFICAÇÕES ADICIONAIS
   ========================================================= */

  await createNotification({
    userId: atendimentoUser.id,
    accessId: atendimentoAccess.id,
    type: "DEMO_ALERT",
    title: "Fila de atendimento atualizada",
    message: "Existem chamados novos e em andamento aguardando acompanhamento.",
    href: "/admin/chamados",
  });

  await createNotification({
    userId: sindicoSkorpios.id,
    ticketId: ticketLampada.id,
    accessId: sindicoSkorpiosAccess.id,
    type: "TICKET_RESOLVED",
    title: "Chamado resolvido",
    message: "O chamado da lâmpada queimada foi marcado como resolvido.",
    href: `/portal/chamados/${ticketLampada.id}`,
    status: NotificationStatus.READ,
  });



  /* =========================================================
     PREFERÊNCIAS DE NOTIFICAÇÃO BÁSICAS
   ========================================================= */

  const preferenceUsers = [
    adminUser,
    atendimentoUser,
    sindicoSkorpios,
    sindicoVistaVerde,
    moradorUser,
    proprietarioUser,
    moradorVistaUser,
  ];

  const eventTypes = [
    "TICKET_CREATED",
    "TICKET_ASSIGNED",
    "TICKET_PUBLIC_COMMENT",
    "TICKET_STATUS_CHANGED",
    "TICKET_RESOLVED",
    "TICKET_RATED",
  ];

  for (const user of preferenceUsers) {
    for (const eventType of eventTypes) {
      await prisma.notificationPreference.upsert({
        where: {
          userId_eventType: {
            userId: user.id,
            eventType,
          },
        },
        update: {
          systemEnabled: true,
          emailEnabled: false,
          whatsappEnabled: false,
        },
        create: {
          userId: user.id,
          eventType,
          systemEnabled: true,
          emailEnabled: false,
          whatsappEnabled: false,
        },
      });
    }
  }



  /* =========================================================
     LOG FINAL
   ========================================================= */

  console.log("Seed demo executado com sucesso.");
  console.log("");
  console.log("Usuários disponíveis para demo:");
  console.table([
    {
      perfil: "SUPER_ADMIN",
      nome: superAdmin.name,
      email: superAdmin.email,
      senha: DEFAULT_PASSWORD,
    },
    {
      perfil: "ADMINISTRADORA",
      nome: adminUser.name,
      email: adminUser.email,
      senha: DEFAULT_PASSWORD,
    },
    {
      perfil: "ATENDIMENTO",
      nome: atendimentoUser.name,
      email: atendimentoUser.email,
      senha: DEFAULT_PASSWORD,
    },
    {
      perfil: "SÍNDICO",
      nome: sindicoSkorpios.name,
      email: sindicoSkorpios.email,
      senha: DEFAULT_PASSWORD,
    },
    {
      perfil: "MORADOR",
      nome: moradorUser.name,
      email: moradorUser.email,
      senha: DEFAULT_PASSWORD,
    },
    {
      perfil: "PROPRIETÁRIO",
      nome: proprietarioUser.name,
      email: proprietarioUser.email,
      senha: DEFAULT_PASSWORD,
    },
  ]);
}



main()
  .catch((e) => {
    console.error("Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });