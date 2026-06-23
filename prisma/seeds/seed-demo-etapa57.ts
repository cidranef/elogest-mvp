import "dotenv/config";

import {
  AccessRole,
  AdministratorPlanStatus,
  AdministratorProviderStatus,
  CondominiumProviderLinkType,
  CondominiumProviderStatus,
  CondominiumType,
  ProviderEntityType,
  ProviderGlobalStatus,
  ProviderOrigin,
  ProviderVisibility,
  Role,
  Status,
  UnitPersonLinkType,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { db } from "../../src/lib/db";

/* =========================================================
   ELOGEST — ETAPA 57.2
   SEED COMERCIAL IDempotente — BASE DEMO

   Cria:
   - 1 Administradora Demo;
   - 3 condomínios fictícios;
   - 12 unidades;
   - logins demonstrativos por perfil;
   - vínculos formais e contextos ativos;
   - 3 fornecedores fictícios homologados;
   - vínculos dos fornecedores com os condomínios.

   Segurança:
   - exige DEMO_SEED_PASSWORD;
   - usa apenas e-mails example.invalid;
   - não deve ser executado automaticamente no start;
   - não remove nem altera outras administradoras;
   - pode ser executado novamente sem duplicar a base.
   ========================================================= */

const DEMO_MARKER = "[DEMO ELOGEST]";
const PASSWORD_ENV_NAME = "DEMO_SEED_PASSWORD";
const BCRYPT_ROUNDS = 12;

const ADMINISTRATOR_CNPJ = "98000000000100";

const EMAILS = {
  administrator: "administradora.demo@example.invalid",
  syndic: "sindico.demo@example.invalid",
  councilMember: "conselheiro.demo@example.invalid",
  owner: "proprietario.demo@example.invalid",
  resident: "morador.demo@example.invalid",
} as const;

const CPFS = {
  syndic: "98000000001",
  councilMember: "98000000002",
  owner: "98000000003",
  resident: "98000000004",
} as const;

const CONDOMINIUMS = [
  {
    key: "aurora",
    name: "Residencial Aurora",
    legalName: "Condomínio Residencial Aurora",
    cnpj: "98000000000200",
    type: CondominiumType.RESIDENTIAL,
    email: "aurora.demo@example.invalid",
    phone: "(11) 90000-1001",
    cep: "05024-000",
    address: "Rua Das Palmeiras",
    number: "120",
    complement: "Torres A E B",
    district: "Pompeia",
    city: "São Paulo",
    state: "SP",
    blocksCount: 2,
    units: [
      { block: "A", unitNumber: "101", unitType: "Apartamento" },
      { block: "A", unitNumber: "102", unitType: "Apartamento" },
      { block: "B", unitNumber: "201", unitType: "Apartamento" },
      { block: "B", unitNumber: "202", unitType: "Apartamento" },
    ],
  },
  {
    key: "horizonte",
    name: "Edifício Horizonte",
    legalName: "Condomínio Edifício Horizonte",
    cnpj: "98000000000300",
    type: CondominiumType.MIXED,
    email: "horizonte.demo@example.invalid",
    phone: "(11) 90000-1002",
    cep: "04538-132",
    address: "Avenida Das Nações",
    number: "850",
    complement: "Torre Única",
    district: "Itaim Bibi",
    city: "São Paulo",
    state: "SP",
    blocksCount: 1,
    units: [
      { block: "Única", unitNumber: "31", unitType: "Sala Comercial" },
      { block: "Única", unitNumber: "32", unitType: "Sala Comercial" },
      { block: "Única", unitNumber: "41", unitType: "Apartamento" },
      { block: "Única", unitNumber: "42", unitType: "Apartamento" },
    ],
  },
  {
    key: "vila-verde",
    name: "Condomínio Vila Verde",
    legalName: "Condomínio Residencial Vila Verde",
    cnpj: "98000000000400",
    type: CondominiumType.HORIZONTAL,
    email: "vilaverde.demo@example.invalid",
    phone: "(11) 90000-1003",
    cep: "05656-050",
    address: "Alameda Dos Ipês",
    number: "450",
    complement: "Portaria Principal",
    district: "Morumbi",
    city: "São Paulo",
    state: "SP",
    blocksCount: 0,
    units: [
      { block: "Casas", unitNumber: "01", unitType: "Casa" },
      { block: "Casas", unitNumber: "02", unitType: "Casa" },
      { block: "Casas", unitNumber: "03", unitType: "Casa" },
      { block: "Casas", unitNumber: "04", unitType: "Casa" },
    ],
  },
] as const;

const PROVIDERS = [
  {
    tradeName: "Alfa Manutenção Predial",
    legalName: "Alfa Serviços Prediais Ltda.",
    document: "98000000000500",
    category: "Manutenção Predial",
    email: "alfa.manutencao@example.invalid",
    phone: "(11) 90000-2001",
    description: "Manutenção preventiva, hidráulica e pequenos reparos.",
  },
  {
    tradeName: "Segura Portaria E Monitoramento",
    legalName: "Segura Monitoramento Ltda.",
    document: "98000000000600",
    category: "Segurança E Portaria",
    email: "segura.portaria@example.invalid",
    phone: "(11) 90000-2002",
    description: "Portaria, controle de acesso e monitoramento condominial.",
  },
  {
    tradeName: "Jardins Urbanos Paisagismo",
    legalName: "Jardins Urbanos Serviços Ambientais Ltda.",
    document: "98000000000700",
    category: "Jardinagem E Paisagismo",
    email: "jardins.urbanos@example.invalid",
    phone: "(11) 90000-2003",
    description: "Jardinagem, paisagismo e manutenção de áreas verdes.",
  },
] as const;

type NullableId = string | null | undefined;

function requireStrongSeedPassword() {
  const value = String(process.env[PASSWORD_ENV_NAME] || "").trim();

  if (value.length < 12) {
    throw new Error(
      `${PASSWORD_ENV_NAME} não configurada ou muito curta. Informe uma senha forte com pelo menos 12 caracteres antes de executar o seed.`,
    );
  }

  return value;
}

async function upsertAccess(params: {
  userId: string;
  administratorId?: NullableId;
  condominiumId?: NullableId;
  unitId?: NullableId;
  residentId?: NullableId;
  unitPersonLinkId?: NullableId;
  role: AccessRole;
  label: string;
  isDefault?: boolean;
}) {
  const where = {
    userId: params.userId,
    administratorId: params.administratorId ?? null,
    condominiumId: params.condominiumId ?? null,
    unitId: params.unitId ?? null,
    residentId: params.residentId ?? null,
    role: params.role,
  };

  const existing = await db.userAccess.findFirst({
    where,
    select: { id: true },
  });

  const data = {
    administratorId: params.administratorId ?? null,
    condominiumId: params.condominiumId ?? null,
    unitId: params.unitId ?? null,
    residentId: params.residentId ?? null,
    unitPersonLinkId: params.unitPersonLinkId ?? null,
    role: params.role,
    label: params.label,
    isDefault: Boolean(params.isDefault),
    isActive: true,
    revokedAt: null,
    revokedReason: null,
    metadata: {
      demo: true,
      marker: DEMO_MARKER,
    },
  };

  if (existing) {
    return db.userAccess.update({
      where: { id: existing.id },
      data,
    });
  }

  return db.userAccess.create({
    data: {
      userId: params.userId,
      ...data,
    },
  });
}

async function upsertUnitPersonLink(params: {
  userId: string;
  residentId: string;
  condominiumId: string;
  unitId: string;
  linkType: UnitPersonLinkType;
  isPrimary: boolean;
  canVote: boolean;
  canOpenTickets?: boolean;
}) {
  const where = {
    userId: params.userId,
    residentId: params.residentId,
    condominiumId: params.condominiumId,
    unitId: params.unitId,
    linkType: params.linkType,
  };

  const existing = await db.unitPersonLink.findFirst({
    where,
    select: { id: true },
  });

  const data = {
    ...where,
    isPrimary: params.isPrimary,
    canVote: params.canVote,
    canOpenTickets: params.canOpenTickets ?? true,
    receivesNotifications: true,
    status: Status.ACTIVE,
    startsAt: null,
    endsAt: null,
    notes: `${DEMO_MARKER} vínculo criado pelo seed comercial.`,
    metadata: {
      demo: true,
      marker: DEMO_MARKER,
    },
  };

  if (existing) {
    return db.unitPersonLink.update({
      where: { id: existing.id },
      data,
    });
  }

  return db.unitPersonLink.create({ data });
}

async function upsertCondominiumProvider(params: {
  administratorId: string;
  condominiumId: string;
  providerId: string;
  administratorProviderId: string;
  createdByUserId: string;
  category: string;
}) {
  const existing = await db.condominiumProvider.findFirst({
    where: {
      administratorId: params.administratorId,
      condominiumId: params.condominiumId,
      providerId: params.providerId,
    },
    select: { id: true },
  });

  const data = {
    administratorId: params.administratorId,
    condominiumId: params.condominiumId,
    providerId: params.providerId,
    administratorProviderId: params.administratorProviderId,
    status: CondominiumProviderStatus.ACTIVE,
    linkType: CondominiumProviderLinkType.ON_DEMAND,
    category: params.category,
    isPreferred: true,
    startDate: new Date("2026-01-01T12:00:00.000Z"),
    endDate: null,
    notes: `${DEMO_MARKER} fornecedor vinculado ao cenário comercial.`,
    createdByUserId: params.createdByUserId,
    metadata: {
      demo: true,
      marker: DEMO_MARKER,
    },
  };

  if (existing) {
    return db.condominiumProvider.update({
      where: { id: existing.id },
      data,
    });
  }

  return db.condominiumProvider.create({ data });
}

async function main() {
  console.log("=========================================================");
  console.log("ELOGEST — ETAPA 57.2");
  console.log("Seed Comercial Idempotente — Base Demo");
  console.log("=========================================================");

  const password = requireStrongSeedPassword();
  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  const premiumPlan = await db.plan.findUnique({
    where: { slug: "premium" },
    select: { id: true, name: true },
  });

  if (!premiumPlan) {
    throw new Error(
      "Plano Premium não encontrado. Execute primeiro o seed de planos da Etapa 47.",
    );
  }

  const administrator = await db.administrator.upsert({
    where: { cnpj: ADMINISTRATOR_CNPJ },
    update: {
      name: "Prisma Gestão Condominial",
      email: "contato.prisma.demo@example.invalid",
      phone: "(11) 90000-0001",
      status: Status.ACTIVE,
      isDemo: true,
      demoProtectionEnabled: true,
      planId: premiumPlan.id,
      planStatus: AdministratorPlanStatus.ACTIVE,
      planStartedAt: new Date("2026-01-01T12:00:00.000Z"),
      planExpiresAt: null,
      customLimitsEnabled: false,
    },
    create: {
      name: "Prisma Gestão Condominial",
      cnpj: ADMINISTRATOR_CNPJ,
      email: "contato.prisma.demo@example.invalid",
      phone: "(11) 90000-0001",
      status: Status.ACTIVE,
      isDemo: true,
      demoProtectionEnabled: true,
      planId: premiumPlan.id,
      planStatus: AdministratorPlanStatus.ACTIVE,
      planStartedAt: new Date("2026-01-01T12:00:00.000Z"),
      customLimitsEnabled: false,
    },
  });

  const administratorUser = await db.user.upsert({
    where: { email: EMAILS.administrator },
    update: {
      name: "Marina Costa",
      phone: "(11) 90000-0101",
      passwordHash,
      role: Role.ADMINISTRADORA,
      administratorId: administrator.id,
      condominiumId: null,
      residentId: null,
      isActive: true,
    },
    create: {
      name: "Marina Costa",
      email: EMAILS.administrator,
      phone: "(11) 90000-0101",
      passwordHash,
      role: Role.ADMINISTRADORA,
      administratorId: administrator.id,
      isActive: true,
    },
  });

  await upsertAccess({
    userId: administratorUser.id,
    administratorId: administrator.id,
    role: AccessRole.ADMINISTRADORA,
    label: "Administradora — Prisma Gestão Condominial",
    isDefault: true,
  });

  const condominiums = new Map<string, Awaited<ReturnType<typeof db.condominium.upsert>>>();
  const units = new Map<string, Awaited<ReturnType<typeof db.unit.upsert>>>();

  for (const definition of CONDOMINIUMS) {
    const condominium = await db.condominium.upsert({
      where: { cnpj: definition.cnpj },
      update: {
        administratorId: administrator.id,
        name: definition.name,
        legalName: definition.legalName,
        type: definition.type,
        status: Status.ACTIVE,
        email: definition.email,
        phone: definition.phone,
        administrativeContactName: "Atendimento Prisma Gestão",
        administrativeContactEmail: "atendimento.prisma.demo@example.invalid",
        administrativeContactPhone: "(11) 90000-0010",
        cep: definition.cep,
        address: definition.address,
        number: definition.number,
        complement: definition.complement,
        district: definition.district,
        city: definition.city,
        state: definition.state,
        unitsCount: definition.units.length,
        blocksCount: definition.blocksCount,
        managementStartDate: new Date("2025-01-01T12:00:00.000Z"),
        managementEndDate: null,
        notes: `${DEMO_MARKER} condomínio fictício para demonstrações comerciais.`,
        metadata: {
          demo: true,
          marker: DEMO_MARKER,
          scenarioKey: definition.key,
        },
      },
      create: {
        administratorId: administrator.id,
        name: definition.name,
        legalName: definition.legalName,
        cnpj: definition.cnpj,
        type: definition.type,
        status: Status.ACTIVE,
        email: definition.email,
        phone: definition.phone,
        administrativeContactName: "Atendimento Prisma Gestão",
        administrativeContactEmail: "atendimento.prisma.demo@example.invalid",
        administrativeContactPhone: "(11) 90000-0010",
        cep: definition.cep,
        address: definition.address,
        number: definition.number,
        complement: definition.complement,
        district: definition.district,
        city: definition.city,
        state: definition.state,
        unitsCount: definition.units.length,
        blocksCount: definition.blocksCount,
        managementStartDate: new Date("2025-01-01T12:00:00.000Z"),
        notes: `${DEMO_MARKER} condomínio fictício para demonstrações comerciais.`,
        metadata: {
          demo: true,
          marker: DEMO_MARKER,
          scenarioKey: definition.key,
        },
      },
    });

    condominiums.set(definition.key, condominium);

    for (const unitDefinition of definition.units) {
      const unit = await db.unit.upsert({
        where: {
          condominiumId_block_unitNumber: {
            condominiumId: condominium.id,
            block: unitDefinition.block,
            unitNumber: unitDefinition.unitNumber,
          },
        },
        update: {
          unitType: unitDefinition.unitType,
          status: Status.ACTIVE,
        },
        create: {
          condominiumId: condominium.id,
          block: unitDefinition.block,
          unitNumber: unitDefinition.unitNumber,
          unitType: unitDefinition.unitType,
          status: Status.ACTIVE,
        },
      });

      units.set(
        `${definition.key}:${unitDefinition.block}:${unitDefinition.unitNumber}`,
        unit,
      );
    }
  }

  const aurora = condominiums.get("aurora");
  const horizonte = condominiums.get("horizonte");
  const vilaVerde = condominiums.get("vila-verde");

  if (!aurora || !horizonte || !vilaVerde) {
    throw new Error("Não foi possível localizar todos os condomínios demo.");
  }

  function requireUnit(key: string) {
    const unit = units.get(key);
    if (!unit) throw new Error(`Unidade demo não encontrada: ${key}`);
    return unit;
  }

  const personDefinitions = [
    {
      key: "syndic",
      name: "Carlos Mendes",
      email: EMAILS.syndic,
      cpf: CPFS.syndic,
      phone: "(11) 90000-0201",
      legacyRole: Role.SINDICO,
      accessRole: AccessRole.SINDICO,
      condominium: aurora,
      unit: requireUnit("aurora:A:101"),
      residentType: "Síndico",
      linkType: UnitPersonLinkType.OWNER,
      canVote: true,
    },
    {
      key: "councilMember",
      name: "Renata Alves",
      email: EMAILS.councilMember,
      cpf: CPFS.councilMember,
      phone: "(11) 90000-0202",
      legacyRole: Role.MORADOR,
      accessRole: AccessRole.CONSELHEIRO,
      condominium: aurora,
      unit: requireUnit("aurora:A:102"),
      residentType: "Conselheira",
      linkType: UnitPersonLinkType.OWNER,
      canVote: true,
    },
    {
      key: "owner",
      name: "Eduardo Lima",
      email: EMAILS.owner,
      cpf: CPFS.owner,
      phone: "(11) 90000-0203",
      legacyRole: Role.MORADOR,
      accessRole: AccessRole.PROPRIETARIO,
      condominium: horizonte,
      unit: requireUnit("horizonte:Única:41"),
      residentType: "Proprietário",
      linkType: UnitPersonLinkType.OWNER,
      canVote: true,
    },
    {
      key: "resident",
      name: "Juliana Rocha",
      email: EMAILS.resident,
      cpf: CPFS.resident,
      phone: "(11) 90000-0204",
      legacyRole: Role.MORADOR,
      accessRole: AccessRole.MORADOR,
      condominium: vilaVerde,
      unit: requireUnit("vila-verde:Casas:02"),
      residentType: "Moradora",
      linkType: UnitPersonLinkType.RESIDENT,
      canVote: false,
    },
  ] as const;

  for (const person of personDefinitions) {
    const resident = await db.resident.upsert({
      where: { cpf: person.cpf },
      update: {
        condominiumId: person.condominium.id,
        unitId: person.unit.id,
        name: person.name,
        email: person.email,
        phone: person.phone,
        residentType: person.residentType,
        status: Status.ACTIVE,
      },
      create: {
        condominiumId: person.condominium.id,
        unitId: person.unit.id,
        name: person.name,
        cpf: person.cpf,
        email: person.email,
        phone: person.phone,
        residentType: person.residentType,
        status: Status.ACTIVE,
      },
    });

    const user = await db.user.upsert({
      where: { email: person.email },
      update: {
        name: person.name,
        phone: person.phone,
        passwordHash,
        role: person.legacyRole,
        administratorId: administrator.id,
        condominiumId: person.condominium.id,
        residentId: resident.id,
        isActive: true,
      },
      create: {
        name: person.name,
        email: person.email,
        phone: person.phone,
        passwordHash,
        role: person.legacyRole,
        administratorId: administrator.id,
        condominiumId: person.condominium.id,
        residentId: resident.id,
        isActive: true,
      },
    });

    const link = await upsertUnitPersonLink({
      userId: user.id,
      residentId: resident.id,
      condominiumId: person.condominium.id,
      unitId: person.unit.id,
      linkType: person.linkType,
      isPrimary: true,
      canVote: person.canVote,
      canOpenTickets: true,
    });

    await upsertAccess({
      userId: user.id,
      administratorId: administrator.id,
      condominiumId: person.condominium.id,
      unitId: person.unit.id,
      residentId: resident.id,
      unitPersonLinkId: link.id,
      role: person.accessRole,
      label: `${person.residentType} — ${person.condominium.name}`,
      isDefault: true,
    });
  }

  for (const providerDefinition of PROVIDERS) {
    const provider = await db.provider.upsert({
      where: { documentNormalized: providerDefinition.document },
      update: {
        tradeName: providerDefinition.tradeName,
        legalName: providerDefinition.legalName,
        document: providerDefinition.document,
        entityType: ProviderEntityType.COMPANY,
        primaryCategory: providerDefinition.category,
        categories: [providerDefinition.category],
        description: providerDefinition.description,
        serviceArea: "São Paulo E Região Metropolitana",
        email: providerDefinition.email,
        phone: providerDefinition.phone,
        whatsapp: providerDefinition.phone,
        city: "São Paulo",
        state: "SP",
        globalStatus: ProviderGlobalStatus.ACTIVE,
        visibility: ProviderVisibility.PRIVATE,
        isVerified: true,
        isFeatured: false,
        origin: ProviderOrigin.ADMINISTRATOR,
        createdByAdministratorId: administrator.id,
        createdByUserId: administratorUser.id,
        metadata: {
          demo: true,
          marker: DEMO_MARKER,
        },
      },
      create: {
        tradeName: providerDefinition.tradeName,
        legalName: providerDefinition.legalName,
        document: providerDefinition.document,
        documentNormalized: providerDefinition.document,
        entityType: ProviderEntityType.COMPANY,
        primaryCategory: providerDefinition.category,
        categories: [providerDefinition.category],
        description: providerDefinition.description,
        serviceArea: "São Paulo E Região Metropolitana",
        email: providerDefinition.email,
        phone: providerDefinition.phone,
        whatsapp: providerDefinition.phone,
        city: "São Paulo",
        state: "SP",
        globalStatus: ProviderGlobalStatus.ACTIVE,
        visibility: ProviderVisibility.PRIVATE,
        isVerified: true,
        isFeatured: false,
        origin: ProviderOrigin.ADMINISTRATOR,
        createdByAdministratorId: administrator.id,
        createdByUserId: administratorUser.id,
        metadata: {
          demo: true,
          marker: DEMO_MARKER,
        },
      },
    });

    const administratorProvider = await db.administratorProvider.upsert({
      where: {
        administratorId_providerId: {
          administratorId: administrator.id,
          providerId: provider.id,
        },
      },
      update: {
        status: AdministratorProviderStatus.HOMOLOGATED,
        internalName: providerDefinition.tradeName,
        internalCategory: providerDefinition.category,
        notes: `${DEMO_MARKER} fornecedor homologado para demonstração.`,
        canBeUsedInTickets: true,
        visibleToSyndics: true,
        visibleToResidents: false,
        homologatedAt: new Date("2026-01-15T12:00:00.000Z"),
        homologatedByUserId: administratorUser.id,
        metadata: {
          demo: true,
          marker: DEMO_MARKER,
        },
      },
      create: {
        administratorId: administrator.id,
        providerId: provider.id,
        status: AdministratorProviderStatus.HOMOLOGATED,
        internalName: providerDefinition.tradeName,
        internalCategory: providerDefinition.category,
        notes: `${DEMO_MARKER} fornecedor homologado para demonstração.`,
        canBeUsedInTickets: true,
        visibleToSyndics: true,
        visibleToResidents: false,
        homologatedAt: new Date("2026-01-15T12:00:00.000Z"),
        homologatedByUserId: administratorUser.id,
        metadata: {
          demo: true,
          marker: DEMO_MARKER,
        },
      },
    });

    for (const condominium of condominiums.values()) {
      await upsertCondominiumProvider({
        administratorId: administrator.id,
        condominiumId: condominium.id,
        providerId: provider.id,
        administratorProviderId: administratorProvider.id,
        createdByUserId: administratorUser.id,
        category: providerDefinition.category,
      });
    }
  }

  console.log("");
  console.log("Seed comercial concluído com sucesso.");
  console.log("");
  console.log("Base criada/atualizada:");
  console.log(`- Plano: ${premiumPlan.name}`);
  console.log(`- Administradora Demo: ${administrator.name}`);
  console.log("- Condomínios: 3");
  console.log("- Unidades: 12");
  console.log("- Fornecedores homologados: 3");
  console.log("");
  console.log("Logins demonstrativos:");
  console.log(`- ADMINISTRADORA: ${EMAILS.administrator}`);
  console.log(`- SÍNDICO: ${EMAILS.syndic}`);
  console.log(`- CONSELHEIRO: ${EMAILS.councilMember}`);
  console.log(`- PROPRIETÁRIO: ${EMAILS.owner}`);
  console.log(`- MORADOR: ${EMAILS.resident}`);
  console.log("");
  console.log(`Senha: valor definido exclusivamente em ${PASSWORD_ENV_NAME}.`);
  console.log("");
  console.log(
    "Atenção: este seed não deve ser incluído no comando start do Railway.",
  );
}

main()
  .catch((error) => {
    console.error("Erro ao executar seed comercial demo:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
