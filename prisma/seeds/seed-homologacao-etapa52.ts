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
   ELOGEST — ETAPA 52.9
   SEED CONTROLADO DE HOMOLOGAÇÃO

   Caminho:
   prisma/seeds/seed-homologacao-etapa52.ts

   Objetivo:
   - Popular uma base remota limpa com dados mínimos e previsíveis.
   - Permitir homologação publicada sem copiar resíduos de testes locais.
   - Validar login, perfis, contexto ativo, portal, fornecedores,
     assembleias, Ata Com IA, PDF oficial e Cloudflare R2.
   - Ser idempotente: executar novamente não duplica a base principal.

   Segurança:
   - Nunca grava uma senha fixa no repositório.
   - Exige HOMOLOGACAO_SEED_PASSWORD no ambiente de execução.
   - Utiliza e-mails reservados em example.invalid.
   - Identifica registros de teste com [HOMOLOGAÇÃO].
   - Não deve ser executado automaticamente no start do Railway.
   ========================================================= */

const HOMOLOGATION_MARKER = "[HOMOLOGAÇÃO]";
const PASSWORD_ENV_NAME = "HOMOLOGACAO_SEED_PASSWORD";
const BCRYPT_ROUNDS = 12;

const EMAILS = {
  superAdmin: "superadmin.homologacao@example.invalid",
  administrator: "admin.homologacao@example.invalid",
  syndic: "sindico.homologacao@example.invalid",
  owner: "proprietario.homologacao@example.invalid",
  councilMember: "conselheiro.homologacao@example.invalid",
  resident: "morador.homologacao@example.invalid",
} as const;

const CPF = {
  syndic: "99000000001",
  owner: "99000000002",
  councilMember: "99000000003",
  resident: "99000000004",
} as const;

const ADMINISTRATOR_CNPJ = "99000000000100";
const CONDOMINIUM_CNPJ = "99000000000200";
const PROVIDER_DOCUMENT = "99000000000300";

type NullableId = string | null | undefined;

function requireStrongSeedPassword() {
  const value = String(process.env[PASSWORD_ENV_NAME] || "").trim();

  if (value.length < 12) {
    throw new Error(
      `${PASSWORD_ENV_NAME} não configurada ou muito curta. Informe uma senha temporária forte com pelo menos 12 caracteres antes de executar o seed.`,
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
    select: {
      id: true,
    },
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
      homologation: true,
      marker: HOMOLOGATION_MARKER,
    },
  };

  if (existing) {
    return db.userAccess.update({
      where: {
        id: existing.id,
      },
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
    select: {
      id: true,
    },
  });

  const data = {
    ...where,
    isPrimary: params.isPrimary,
    canVote: params.canVote,
    canOpenTickets: params.canOpenTickets ?? true,
    receivesNotifications: true,
    status: Status.ACTIVE,
    notes: `${HOMOLOGATION_MARKER} vínculo criado pelo seed controlado.`,
    metadata: {
      homologation: true,
      marker: HOMOLOGATION_MARKER,
    },
  };

  if (existing) {
    return db.unitPersonLink.update({
      where: {
        id: existing.id,
      },
      data,
    });
  }

  return db.unitPersonLink.create({
    data,
  });
}

async function upsertCondominiumProvider(params: {
  administratorId: string;
  condominiumId: string;
  providerId: string;
  administratorProviderId: string;
  createdByUserId: string;
}) {
  const existing = await db.condominiumProvider.findFirst({
    where: {
      administratorId: params.administratorId,
      condominiumId: params.condominiumId,
      providerId: params.providerId,
    },
    select: {
      id: true,
    },
  });

  const data = {
    administratorId: params.administratorId,
    condominiumId: params.condominiumId,
    providerId: params.providerId,
    administratorProviderId: params.administratorProviderId,
    status: CondominiumProviderStatus.ACTIVE,
    linkType: CondominiumProviderLinkType.ON_DEMAND,
    category: "Manutenção Predial",
    isPreferred: true,
    notes: `${HOMOLOGATION_MARKER} fornecedor vinculado para testes.`,
    createdByUserId: params.createdByUserId,
    metadata: {
      homologation: true,
      marker: HOMOLOGATION_MARKER,
    },
  };

  if (existing) {
    return db.condominiumProvider.update({
      where: {
        id: existing.id,
      },
      data,
    });
  }

  return db.condominiumProvider.create({
    data,
  });
}

async function main() {
  console.log("=========================================================");
  console.log("ELOGEST — ETAPA 52.9");
  console.log("Seed controlado de homologação");
  console.log("=========================================================");

  const password = requireStrongSeedPassword();
  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  const premiumPlan = await db.plan.findUnique({
    where: {
      slug: "premium",
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!premiumPlan) {
    throw new Error(
      "Plano Premium não encontrado. Execute primeiro o seed da Etapa 47 ou utilize o script npm run seed:homologacao.",
    );
  }

  const administrator = await db.administrator.upsert({
    where: {
      cnpj: ADMINISTRATOR_CNPJ,
    },
    update: {
      name: `${HOMOLOGATION_MARKER} Administradora EloGest`,
      email: "administradora.homologacao@example.invalid",
      phone: "(11) 90000-0001",
      status: Status.ACTIVE,
      planId: premiumPlan.id,
      planStatus: AdministratorPlanStatus.ACTIVE,
      planStartedAt: new Date(),
      planExpiresAt: null,
      customLimitsEnabled: false,
    },
    create: {
      name: `${HOMOLOGATION_MARKER} Administradora EloGest`,
      cnpj: ADMINISTRATOR_CNPJ,
      email: "administradora.homologacao@example.invalid",
      phone: "(11) 90000-0001",
      status: Status.ACTIVE,
      planId: premiumPlan.id,
      planStatus: AdministratorPlanStatus.ACTIVE,
      planStartedAt: new Date(),
      customLimitsEnabled: false,
    },
  });

  const condominium = await db.condominium.upsert({
    where: {
      cnpj: CONDOMINIUM_CNPJ,
    },
    update: {
      administratorId: administrator.id,
      name: `${HOMOLOGATION_MARKER} Edifício Skorpios`,
      legalName: "Condomínio Edifício Skorpios — Homologação",
      type: CondominiumType.RESIDENTIAL,
      status: Status.ACTIVE,
      email: "condominio.homologacao@example.invalid",
      phone: "(11) 90000-0002",
      administrativeContactName: "Contato De Homologação",
      administrativeContactEmail: "contato.homologacao@example.invalid",
      administrativeContactPhone: "(11) 90000-0003",
      cep: "05024-000",
      address: "Rua Barão Do Bananal",
      number: "742",
      complement: "Torre Única",
      district: "Pompeia",
      city: "São Paulo",
      state: "SP",
      unitsCount: 4,
      blocksCount: 1,
      managementStartDate: new Date(),
      notes: `${HOMOLOGATION_MARKER} condomínio criado pelo seed controlado.`,
      metadata: {
        homologation: true,
        marker: HOMOLOGATION_MARKER,
      },
    },
    create: {
      administratorId: administrator.id,
      name: `${HOMOLOGATION_MARKER} Edifício Skorpios`,
      legalName: "Condomínio Edifício Skorpios — Homologação",
      cnpj: CONDOMINIUM_CNPJ,
      type: CondominiumType.RESIDENTIAL,
      status: Status.ACTIVE,
      email: "condominio.homologacao@example.invalid",
      phone: "(11) 90000-0002",
      administrativeContactName: "Contato De Homologação",
      administrativeContactEmail: "contato.homologacao@example.invalid",
      administrativeContactPhone: "(11) 90000-0003",
      cep: "05024-000",
      address: "Rua Barão Do Bananal",
      number: "742",
      complement: "Torre Única",
      district: "Pompeia",
      city: "São Paulo",
      state: "SP",
      unitsCount: 4,
      blocksCount: 1,
      managementStartDate: new Date(),
      notes: `${HOMOLOGATION_MARKER} condomínio criado pelo seed controlado.`,
      metadata: {
        homologation: true,
        marker: HOMOLOGATION_MARKER,
      },
    },
  });

  const unitDefinitions = [
    {
      block: "A",
      unitNumber: "101",
      unitType: "Apartamento",
    },
    {
      block: "A",
      unitNumber: "102",
      unitType: "Apartamento",
    },
    {
      block: "A",
      unitNumber: "201",
      unitType: "Apartamento",
    },
    {
      block: "A",
      unitNumber: "202",
      unitType: "Apartamento",
    },
  ] as const;

  const units = new Map<string, Awaited<ReturnType<typeof db.unit.upsert>>>();

  for (const definition of unitDefinitions) {
    const savedUnit = await db.unit.upsert({
      where: {
        condominiumId_block_unitNumber: {
          condominiumId: condominium.id,
          block: definition.block,
          unitNumber: definition.unitNumber,
        },
      },
      update: {
        unitType: definition.unitType,
        status: Status.ACTIVE,
      },
      create: {
        condominiumId: condominium.id,
        block: definition.block,
        unitNumber: definition.unitNumber,
        unitType: definition.unitType,
        status: Status.ACTIVE,
      },
    });

    units.set(definition.unitNumber, savedUnit);
  }

  const requireUnit = (unitNumber: string) => {
    const unit = units.get(unitNumber);

    if (!unit) {
      throw new Error(`Unidade ${unitNumber} não localizada durante o seed.`);
    }

    return unit;
  };

  const residentDefinitions = [
    {
      key: "syndic",
      cpf: CPF.syndic,
      name: "Síndico Homologação",
      email: EMAILS.syndic,
      phone: "(11) 90000-0101",
      residentType: "PROPRIETARIO",
      unitNumber: "101",
    },
    {
      key: "owner",
      cpf: CPF.owner,
      name: "Proprietário Homologação",
      email: EMAILS.owner,
      phone: "(11) 90000-0102",
      residentType: "PROPRIETARIO",
      unitNumber: "102",
    },
    {
      key: "councilMember",
      cpf: CPF.councilMember,
      name: "Conselheiro Homologação",
      email: EMAILS.councilMember,
      phone: "(11) 90000-0201",
      residentType: "PROPRIETARIO",
      unitNumber: "201",
    },
    {
      key: "resident",
      cpf: CPF.resident,
      name: "Morador Homologação",
      email: EMAILS.resident,
      phone: "(11) 90000-0202",
      residentType: "MORADOR",
      unitNumber: "202",
    },
  ] as const;

  const residents = new Map<
    (typeof residentDefinitions)[number]["key"],
    Awaited<ReturnType<typeof db.resident.upsert>>
  >();

  for (const definition of residentDefinitions) {
    const savedResident = await db.resident.upsert({
      where: {
        cpf: definition.cpf,
      },
      update: {
        condominiumId: condominium.id,
        unitId: requireUnit(definition.unitNumber).id,
        name: definition.name,
        email: definition.email,
        phone: definition.phone,
        residentType: definition.residentType,
        status: Status.ACTIVE,
      },
      create: {
        condominiumId: condominium.id,
        unitId: requireUnit(definition.unitNumber).id,
        name: definition.name,
        cpf: definition.cpf,
        email: definition.email,
        phone: definition.phone,
        residentType: definition.residentType,
        status: Status.ACTIVE,
      },
    });

    residents.set(definition.key, savedResident);
  }

  const requireResident = (
    key: (typeof residentDefinitions)[number]["key"],
  ) => {
    const resident = residents.get(key);

    if (!resident) {
      throw new Error(`Morador ${key} não localizado durante o seed.`);
    }

    return resident;
  };

  const superAdminUser = await db.user.upsert({
    where: {
      email: EMAILS.superAdmin,
    },
    update: {
      name: "Super Admin Homologação",
      passwordHash,
      role: Role.SUPER_ADMIN,
      administratorId: null,
      condominiumId: null,
      residentId: null,
      isActive: true,
    },
    create: {
      name: "Super Admin Homologação",
      email: EMAILS.superAdmin,
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  });

  const administratorUser = await db.user.upsert({
    where: {
      email: EMAILS.administrator,
    },
    update: {
      name: "Administrador Homologação",
      passwordHash,
      role: Role.ADMINISTRADORA,
      administratorId: administrator.id,
      condominiumId: null,
      residentId: null,
      isActive: true,
    },
    create: {
      name: "Administrador Homologação",
      email: EMAILS.administrator,
      passwordHash,
      role: Role.ADMINISTRADORA,
      administratorId: administrator.id,
      isActive: true,
    },
  });

  const syndicResident = requireResident("syndic");
  const ownerResident = requireResident("owner");
  const councilResident = requireResident("councilMember");
  const residentResident = requireResident("resident");

  const syndicUser = await db.user.upsert({
    where: {
      email: EMAILS.syndic,
    },
    update: {
      name: syndicResident.name,
      phone: syndicResident.phone,
      passwordHash,
      role: Role.SINDICO,
      administratorId: administrator.id,
      condominiumId: condominium.id,
      residentId: syndicResident.id,
      isActive: true,
    },
    create: {
      name: syndicResident.name,
      email: EMAILS.syndic,
      phone: syndicResident.phone,
      passwordHash,
      role: Role.SINDICO,
      administratorId: administrator.id,
      condominiumId: condominium.id,
      residentId: syndicResident.id,
      isActive: true,
    },
  });

  const ownerUser = await db.user.upsert({
    where: {
      email: EMAILS.owner,
    },
    update: {
      name: ownerResident.name,
      phone: ownerResident.phone,
      passwordHash,
      role: Role.MORADOR,
      administratorId: administrator.id,
      condominiumId: condominium.id,
      residentId: ownerResident.id,
      isActive: true,
    },
    create: {
      name: ownerResident.name,
      email: EMAILS.owner,
      phone: ownerResident.phone,
      passwordHash,
      role: Role.MORADOR,
      administratorId: administrator.id,
      condominiumId: condominium.id,
      residentId: ownerResident.id,
      isActive: true,
    },
  });

  const councilUser = await db.user.upsert({
    where: {
      email: EMAILS.councilMember,
    },
    update: {
      name: councilResident.name,
      phone: councilResident.phone,
      passwordHash,
      role: Role.MORADOR,
      administratorId: administrator.id,
      condominiumId: condominium.id,
      residentId: councilResident.id,
      isActive: true,
    },
    create: {
      name: councilResident.name,
      email: EMAILS.councilMember,
      phone: councilResident.phone,
      passwordHash,
      role: Role.MORADOR,
      administratorId: administrator.id,
      condominiumId: condominium.id,
      residentId: councilResident.id,
      isActive: true,
    },
  });

  const residentUser = await db.user.upsert({
    where: {
      email: EMAILS.resident,
    },
    update: {
      name: residentResident.name,
      phone: residentResident.phone,
      passwordHash,
      role: Role.MORADOR,
      administratorId: administrator.id,
      condominiumId: condominium.id,
      residentId: residentResident.id,
      isActive: true,
    },
    create: {
      name: residentResident.name,
      email: EMAILS.resident,
      phone: residentResident.phone,
      passwordHash,
      role: Role.MORADOR,
      administratorId: administrator.id,
      condominiumId: condominium.id,
      residentId: residentResident.id,
      isActive: true,
    },
  });

  const syndicOwnerLink = await upsertUnitPersonLink({
    userId: syndicUser.id,
    residentId: syndicResident.id,
    condominiumId: condominium.id,
    unitId: requireUnit("101").id,
    linkType: UnitPersonLinkType.OWNER,
    isPrimary: true,
    canVote: true,
  });

  const ownerLink = await upsertUnitPersonLink({
    userId: ownerUser.id,
    residentId: ownerResident.id,
    condominiumId: condominium.id,
    unitId: requireUnit("102").id,
    linkType: UnitPersonLinkType.OWNER,
    isPrimary: true,
    canVote: true,
  });

  const councilOwnerLink = await upsertUnitPersonLink({
    userId: councilUser.id,
    residentId: councilResident.id,
    condominiumId: condominium.id,
    unitId: requireUnit("201").id,
    linkType: UnitPersonLinkType.OWNER,
    isPrimary: true,
    canVote: true,
  });

  const residentLink = await upsertUnitPersonLink({
    userId: residentUser.id,
    residentId: residentResident.id,
    condominiumId: condominium.id,
    unitId: requireUnit("202").id,
    linkType: UnitPersonLinkType.RESIDENT,
    isPrimary: true,
    canVote: false,
  });

  await upsertAccess({
    userId: superAdminUser.id,
    role: AccessRole.SUPER_ADMIN,
    label: `${HOMOLOGATION_MARKER} Super Admin`,
    isDefault: true,
  });

  await upsertAccess({
    userId: administratorUser.id,
    administratorId: administrator.id,
    role: AccessRole.ADMINISTRADORA,
    label: `${HOMOLOGATION_MARKER} Administradora`,
    isDefault: true,
  });

  await upsertAccess({
    userId: syndicUser.id,
    administratorId: administrator.id,
    condominiumId: condominium.id,
    unitId: requireUnit("101").id,
    residentId: syndicResident.id,
    unitPersonLinkId: syndicOwnerLink.id,
    role: AccessRole.SINDICO,
    label: `${HOMOLOGATION_MARKER} Síndico — Bloco A — Unidade 101`,
    isDefault: true,
  });

  await upsertAccess({
    userId: syndicUser.id,
    administratorId: administrator.id,
    condominiumId: condominium.id,
    unitId: requireUnit("101").id,
    residentId: syndicResident.id,
    unitPersonLinkId: syndicOwnerLink.id,
    role: AccessRole.PROPRIETARIO,
    label: `${HOMOLOGATION_MARKER} Proprietário — Bloco A — Unidade 101`,
  });

  await upsertAccess({
    userId: ownerUser.id,
    administratorId: administrator.id,
    condominiumId: condominium.id,
    unitId: requireUnit("102").id,
    residentId: ownerResident.id,
    unitPersonLinkId: ownerLink.id,
    role: AccessRole.PROPRIETARIO,
    label: `${HOMOLOGATION_MARKER} Proprietário — Bloco A — Unidade 102`,
    isDefault: true,
  });

  await upsertAccess({
    userId: councilUser.id,
    administratorId: administrator.id,
    condominiumId: condominium.id,
    unitId: requireUnit("201").id,
    residentId: councilResident.id,
    unitPersonLinkId: councilOwnerLink.id,
    role: AccessRole.CONSELHEIRO,
    label: `${HOMOLOGATION_MARKER} Conselheiro — Bloco A — Unidade 201`,
    isDefault: true,
  });

  await upsertAccess({
    userId: councilUser.id,
    administratorId: administrator.id,
    condominiumId: condominium.id,
    unitId: requireUnit("201").id,
    residentId: councilResident.id,
    unitPersonLinkId: councilOwnerLink.id,
    role: AccessRole.PROPRIETARIO,
    label: `${HOMOLOGATION_MARKER} Proprietário — Bloco A — Unidade 201`,
  });

  await upsertAccess({
    userId: residentUser.id,
    administratorId: administrator.id,
    condominiumId: condominium.id,
    unitId: requireUnit("202").id,
    residentId: residentResident.id,
    unitPersonLinkId: residentLink.id,
    role: AccessRole.MORADOR,
    label: `${HOMOLOGATION_MARKER} Morador — Bloco A — Unidade 202`,
    isDefault: true,
  });

  const provider = await db.provider.upsert({
    where: {
      documentNormalized: PROVIDER_DOCUMENT,
    },
    update: {
      tradeName: `${HOMOLOGATION_MARKER} Manutenção Predial Demo`,
      legalName: "Manutenção Predial Demo Homologação Ltda.",
      document: PROVIDER_DOCUMENT,
      entityType: ProviderEntityType.COMPANY,
      primaryCategory: "Manutenção Predial",
      categories: ["Manutenção Predial", "Pequenos Reparos"],
      description: `${HOMOLOGATION_MARKER} fornecedor fictício para validação do módulo.`,
      serviceArea: "São Paulo — SP",
      email: "fornecedor.homologacao@example.invalid",
      phone: "(11) 90000-0300",
      whatsapp: "(11) 90000-0300",
      city: "São Paulo",
      state: "SP",
      globalStatus: ProviderGlobalStatus.ACTIVE,
      visibility: ProviderVisibility.PRIVATE,
      origin: ProviderOrigin.ADMINISTRATOR,
      createdByAdministratorId: administrator.id,
      createdByUserId: administratorUser.id,
      metadata: {
        homologation: true,
        marker: HOMOLOGATION_MARKER,
      },
    },
    create: {
      tradeName: `${HOMOLOGATION_MARKER} Manutenção Predial Demo`,
      legalName: "Manutenção Predial Demo Homologação Ltda.",
      document: PROVIDER_DOCUMENT,
      documentNormalized: PROVIDER_DOCUMENT,
      entityType: ProviderEntityType.COMPANY,
      primaryCategory: "Manutenção Predial",
      categories: ["Manutenção Predial", "Pequenos Reparos"],
      description: `${HOMOLOGATION_MARKER} fornecedor fictício para validação do módulo.`,
      serviceArea: "São Paulo — SP",
      email: "fornecedor.homologacao@example.invalid",
      phone: "(11) 90000-0300",
      whatsapp: "(11) 90000-0300",
      city: "São Paulo",
      state: "SP",
      globalStatus: ProviderGlobalStatus.ACTIVE,
      visibility: ProviderVisibility.PRIVATE,
      origin: ProviderOrigin.ADMINISTRATOR,
      createdByAdministratorId: administrator.id,
      createdByUserId: administratorUser.id,
      metadata: {
        homologation: true,
        marker: HOMOLOGATION_MARKER,
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
      internalName: "Manutenção Predial Demo",
      internalCategory: "Manutenção Predial",
      notes: `${HOMOLOGATION_MARKER} homologação fictícia para testes.`,
      canBeUsedInTickets: true,
      visibleToSyndics: true,
      visibleToResidents: false,
      homologatedAt: new Date(),
      homologatedByUserId: administratorUser.id,
      metadata: {
        homologation: true,
        marker: HOMOLOGATION_MARKER,
      },
    },
    create: {
      administratorId: administrator.id,
      providerId: provider.id,
      status: AdministratorProviderStatus.HOMOLOGATED,
      internalName: "Manutenção Predial Demo",
      internalCategory: "Manutenção Predial",
      notes: `${HOMOLOGATION_MARKER} homologação fictícia para testes.`,
      canBeUsedInTickets: true,
      visibleToSyndics: true,
      visibleToResidents: false,
      homologatedAt: new Date(),
      homologatedByUserId: administratorUser.id,
      metadata: {
        homologation: true,
        marker: HOMOLOGATION_MARKER,
      },
    },
  });

  await upsertCondominiumProvider({
    administratorId: administrator.id,
    condominiumId: condominium.id,
    providerId: provider.id,
    administratorProviderId: administratorProvider.id,
    createdByUserId: administratorUser.id,
  });

  console.log("");
  console.log("Seed de homologação concluído com sucesso.");
  console.log("");
  console.log("Base criada:");
  console.log(`- Plano: ${premiumPlan.name}`);
  console.log(`- Administradora: ${administrator.name}`);
  console.log(`- Condomínio: ${condominium.name}`);
  console.log("- Unidades: A-101, A-102, A-201 e A-202");
  console.log("- Proprietários aptos a voto: A-101, A-102 e A-201");
  console.log("- Morador sem voto próprio: A-202");
  console.log("- Fornecedor fictício homologado: 1");
  console.log("");
  console.log("Logins de homologação:");
  console.log(`- SUPER_ADMIN: ${EMAILS.superAdmin}`);
  console.log(`- ADMINISTRADORA: ${EMAILS.administrator}`);
  console.log(`- SINDICO: ${EMAILS.syndic}`);
  console.log(`- PROPRIETARIO: ${EMAILS.owner}`);
  console.log(`- CONSELHEIRO: ${EMAILS.councilMember}`);
  console.log(`- MORADOR: ${EMAILS.resident}`);
  console.log("");
  console.log(
    `Senha: valor informado exclusivamente por ${PASSWORD_ENV_NAME}.`,
  );
  console.log("");
  console.log(
    "Próximo passo: acessar a aplicação publicada e criar manualmente uma assembleia de homologação para validar o fluxo completo da Etapa 52.",
  );
}

main()
  .catch((error) => {
    console.error("Erro ao executar seed controlado de homologação:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
