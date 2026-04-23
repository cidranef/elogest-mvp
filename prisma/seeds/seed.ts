import "dotenv/config";
import { PrismaClient, Role, Status } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL não definida.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("Heloisa100%", 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: "cidranef@gmail.com" },
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

  const administrator = await prisma.administrator.upsert({
    where: { cnpj: "00000000000191" },
    update: {},
    create: {
      name: "Administradora Modelo",
      cnpj: "00000000000191",
      email: "admin@modelo.com",
      phone: "11999999999",
      status: Status.ACTIVE,
    },
  });

  const condominium = await prisma.condominium.create({
    data: {
      administratorId: administrator.id,
      name: "Condomínio Exemplo",
      cnpj: "00000000000272",
      email: "contato@condominioexemplo.com",
      phone: "11988888888",
      cep: "01001000",
      address: "Praça da Sé",
      number: "100",
      complement: "Bloco A",
      district: "Sé",
      city: "São Paulo",
      state: "SP",
      status: Status.ACTIVE,
    },
  }).catch(async () => {
    return prisma.condominium.findFirstOrThrow({
      where: { cnpj: "00000000000272" },
    });
  });

  const sindicoPasswordHash = await bcrypt.hash("Heloisa100%", 10);

  await prisma.user.upsert({
    where: { email: "sindico@condominioexemplo.com" },
    update: {},
    create: {
      name: "Síndico Exemplo",
      email: "sindico@condominioexemplo.com",
      passwordHash: sindicoPasswordHash,
      role: Role.SINDICO,
      condominiumId: condominium.id,
      administratorId: administrator.id,
      isActive: true,
    },
  });

  const unit = await prisma.unit.create({
    data: {
      condominiumId: condominium.id,
      block: "A",
      unitNumber: "101",
      unitType: "Apartamento",
      status: Status.ACTIVE,
    },
  }).catch(async () => {
    return prisma.unit.findFirstOrThrow({
      where: {
        condominiumId: condominium.id,
        block: "A",
        unitNumber: "101",
      },
    });
  });

  const resident = await prisma.resident.create({
    data: {
      condominiumId: condominium.id,
      unitId: unit.id,
      name: "Morador Exemplo",
      cpf: "12345678900",
      email: "morador@exemplo.com",
      phone: "11977777777",
      residentType: "PROPRIETARIO",
      status: Status.ACTIVE,
    },
  }).catch(async () => {
    return prisma.resident.findFirstOrThrow({
      where: { email: "morador@exemplo.com" },
    });
  });

  const residentPasswordHash = await bcrypt.hash("Heloisa100%", 10);

  await prisma.user.upsert({
    where: { email: "morador@exemplo.com" },
    update: {},
    create: {
      name: "Morador Exemplo",
      email: "morador@exemplo.com",
      passwordHash: residentPasswordHash,
      role: Role.MORADOR,
      administratorId: administrator.id,
      condominiumId: condominium.id,
      residentId: resident.id,
      isActive: true,
    },
  });

  console.log("Seed executado com sucesso.");
  console.log({
    superAdmin: {
      email: superAdmin.email,
      senha: "Heloisa100%",
      perfil: "SUPER_ADMIN",
    },
  });
}

main()
  .catch((e) => {
    console.error("Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });