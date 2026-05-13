/* =========================================================
   SEED DE USUÁRIOS DEMONSTRAÇÃO - ELOGEST

   Executa a criação de dados mínimos para testar:

   - Área administrativa
   - Portal do síndico
   - Portal do morador

   USUÁRIOS CRIADOS:

   superadmin@demo.com
   administradora@demo.com
   sindico@demo.com
   morador@demo.com

   SENHA PARA TODOS:
   123456

   IMPORTANTE:
   Use apenas em ambiente de desenvolvimento/teste.
   ========================================================= */

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

if (!process.env.DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não encontrada no arquivo .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});


/* =========================================================
   CONFIGURAÇÕES DO SEED
   ========================================================= */

const DEMO_PASSWORD = "123456";

const DEMO_ADMINISTRATOR = {
  name: "Administradora Demo",
  cnpj: "00.000.000/0001-00",
  email: "contato@administradorademo.com",
  phone: "(11) 99999-0000",
};

const DEMO_CONDOMINIUM = {
  name: "Condomínio Demo EloGest",
  cnpj: "11.111.111/0001-11",
  email: "contato@condominiodemo.com",
  phone: "(11) 98888-0000",
  cep: "01000-000",
  address: "Rua Demonstração",
  number: "100",
  complement: "Condomínio Demo",
  district: "Centro",
  city: "São Paulo",
  state: "SP",
};

const DEMO_UNITS = [
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
    block: "B",
    unitNumber: "201",
    unitType: "Apartamento",
  },
];

const DEMO_RESIDENT = {
  name: "Morador Demo",
  cpf: "000.000.000-01",
  email: "morador@demo.com",
  phone: "(11) 97777-0000",
  residentType: "PROPRIETARIO",
};



/* =========================================================
   HELPERS
   ========================================================= */

async function createPasswordHash() {
  const saltRounds = 10;
  return bcrypt.hash(DEMO_PASSWORD, saltRounds);
}

function logSection(title) {
  console.log("\n=================================================");
  console.log(title);
  console.log("=================================================");
}



/* =========================================================
   EXECUÇÃO PRINCIPAL
   ========================================================= */

async function main() {
  logSection("Iniciando seed de usuários demonstração");

  const passwordHash = await createPasswordHash();



  /* =========================================================
     1. ADMINISTRADORA DEMO
     ========================================================= */

  const administrator = await prisma.administrator.upsert({
    where: {
      cnpj: DEMO_ADMINISTRATOR.cnpj,
    },
    update: {
      name: DEMO_ADMINISTRATOR.name,
      email: DEMO_ADMINISTRATOR.email,
      phone: DEMO_ADMINISTRATOR.phone,
      status: "ACTIVE",
    },
    create: {
      name: DEMO_ADMINISTRATOR.name,
      cnpj: DEMO_ADMINISTRATOR.cnpj,
      email: DEMO_ADMINISTRATOR.email,
      phone: DEMO_ADMINISTRATOR.phone,
      status: "ACTIVE",
    },
  });

  console.log("Administradora:", administrator.name);



  /* =========================================================
     2. CONDOMÍNIO DEMO
     ========================================================= */

  const condominium = await prisma.condominium.upsert({
    where: {
      cnpj: DEMO_CONDOMINIUM.cnpj,
    },
    update: {
      administratorId: administrator.id,
      name: DEMO_CONDOMINIUM.name,
      email: DEMO_CONDOMINIUM.email,
      phone: DEMO_CONDOMINIUM.phone,
      cep: DEMO_CONDOMINIUM.cep,
      address: DEMO_CONDOMINIUM.address,
      number: DEMO_CONDOMINIUM.number,
      complement: DEMO_CONDOMINIUM.complement,
      district: DEMO_CONDOMINIUM.district,
      city: DEMO_CONDOMINIUM.city,
      state: DEMO_CONDOMINIUM.state,
      status: "ACTIVE",
    },
    create: {
      administratorId: administrator.id,
      name: DEMO_CONDOMINIUM.name,
      cnpj: DEMO_CONDOMINIUM.cnpj,
      email: DEMO_CONDOMINIUM.email,
      phone: DEMO_CONDOMINIUM.phone,
      cep: DEMO_CONDOMINIUM.cep,
      address: DEMO_CONDOMINIUM.address,
      number: DEMO_CONDOMINIUM.number,
      complement: DEMO_CONDOMINIUM.complement,
      district: DEMO_CONDOMINIUM.district,
      city: DEMO_CONDOMINIUM.city,
      state: DEMO_CONDOMINIUM.state,
      status: "ACTIVE",
    },
  });

  console.log("Condomínio:", condominium.name);



  /* =========================================================
     3. UNIDADES DEMO
     ========================================================= */

  const createdUnits = [];

  for (const unitData of DEMO_UNITS) {
    const unit = await prisma.unit.upsert({
      where: {
        condominiumId_block_unitNumber: {
          condominiumId: condominium.id,
          block: unitData.block,
          unitNumber: unitData.unitNumber,
        },
      },
      update: {
        unitType: unitData.unitType,
        status: "ACTIVE",
      },
      create: {
        condominiumId: condominium.id,
        block: unitData.block,
        unitNumber: unitData.unitNumber,
        unitType: unitData.unitType,
        status: "ACTIVE",
      },
    });

    createdUnits.push(unit);

    console.log(
      "Unidade:",
      `${unit.block ? unit.block + " - " : ""}${unit.unitNumber}`
    );
  }

  const residentUnit = createdUnits[0];



  /* =========================================================
     4. MORADOR DEMO
     ========================================================= */

  const resident = await prisma.resident.upsert({
    where: {
      cpf: DEMO_RESIDENT.cpf,
    },
    update: {
      condominiumId: condominium.id,
      unitId: residentUnit.id,
      name: DEMO_RESIDENT.name,
      email: DEMO_RESIDENT.email,
      phone: DEMO_RESIDENT.phone,
      residentType: DEMO_RESIDENT.residentType,
      status: "ACTIVE",
    },
    create: {
      condominiumId: condominium.id,
      unitId: residentUnit.id,
      name: DEMO_RESIDENT.name,
      cpf: DEMO_RESIDENT.cpf,
      email: DEMO_RESIDENT.email,
      phone: DEMO_RESIDENT.phone,
      residentType: DEMO_RESIDENT.residentType,
      status: "ACTIVE",
    },
  });

  console.log(
    "Morador:",
    `${resident.name} - Unidade ${residentUnit.block} ${residentUnit.unitNumber}`
  );



  /* =========================================================
     5. USUÁRIO SUPER ADMIN DEMO
     ========================================================= */

  const superAdminUser = await prisma.user.upsert({
    where: {
      email: "superadmin@demo.com",
    },
    update: {
      name: "Super Admin Demo",
      passwordHash,
      role: "SUPER_ADMIN",
      administratorId: null,
      condominiumId: null,
      residentId: null,
      isActive: true,
    },
    create: {
      name: "Super Admin Demo",
      email: "superadmin@demo.com",
      passwordHash,
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  console.log("Usuário SUPER_ADMIN:", superAdminUser.email);



  /* =========================================================
     6. USUÁRIO ADMINISTRADORA DEMO
     ========================================================= */

  const administradoraUser = await prisma.user.upsert({
    where: {
      email: "administradora@demo.com",
    },
    update: {
      name: "Administradora Demo",
      passwordHash,
      role: "ADMINISTRADORA",
      administratorId: administrator.id,
      condominiumId: null,
      residentId: null,
      isActive: true,
    },
    create: {
      name: "Administradora Demo",
      email: "administradora@demo.com",
      passwordHash,
      role: "ADMINISTRADORA",
      administratorId: administrator.id,
      isActive: true,
    },
  });

  console.log("Usuário ADMINISTRADORA:", administradoraUser.email);



  /* =========================================================
     7. USUÁRIO SÍNDICO DEMO
     ========================================================= */

  const sindicoUser = await prisma.user.upsert({
    where: {
      email: "sindico@demo.com",
    },
    update: {
      name: "Síndico Demo",
      passwordHash,
      role: "SINDICO",
      administratorId: null,
      condominiumId: condominium.id,
      residentId: null,
      isActive: true,
    },
    create: {
      name: "Síndico Demo",
      email: "sindico@demo.com",
      passwordHash,
      role: "SINDICO",
      condominiumId: condominium.id,
      isActive: true,
    },
  });

  console.log("Usuário SINDICO:", sindicoUser.email);



  /* =========================================================
     8. USUÁRIO MORADOR DEMO
     ========================================================= */

  const moradorUser = await prisma.user.upsert({
    where: {
      email: "morador@demo.com",
    },
    update: {
      name: "Morador Demo",
      passwordHash,
      role: "MORADOR",
      administratorId: null,
      condominiumId: condominium.id,
      residentId: resident.id,
      isActive: true,
    },
    create: {
      name: "Morador Demo",
      email: "morador@demo.com",
      passwordHash,
      role: "MORADOR",
      condominiumId: condominium.id,
      residentId: resident.id,
      isActive: true,
    },
  });

  console.log("Usuário MORADOR:", moradorUser.email);



  /* =========================================================
     FINAL
     ========================================================= */

  logSection("Seed concluído com sucesso");

  console.log("Usuários criados/atualizados:");
  console.log("");
  console.log("SUPER_ADMIN:");
  console.log("  email: superadmin@demo.com");
  console.log("  senha: 123456");
  console.log("");
  console.log("ADMINISTRADORA:");
  console.log("  email: administradora@demo.com");
  console.log("  senha: 123456");
  console.log("");
  console.log("SINDICO:");
  console.log("  email: sindico@demo.com");
  console.log("  senha: 123456");
  console.log("");
  console.log("MORADOR:");
  console.log("  email: morador@demo.com");
  console.log("  senha: 123456");
  console.log("");
  console.log("Teste o portal com:");
  console.log("  /portal/chamados");
}



/* =========================================================
   EXECUTAR
   ========================================================= */

main()
  .catch((error) => {
    console.error("Erro ao executar seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });