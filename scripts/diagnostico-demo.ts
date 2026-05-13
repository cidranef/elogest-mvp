import "dotenv/config";
import { db } from "../src/lib/db";



/* =========================================================
   DIAGNÓSTICO DA BASE DEMO - ELOGEST

   Objetivo:
   Listar os dados estruturais existentes após o reset operacional.

   Este script NÃO altera nada no banco.

   Ele exibe:
   - administradoras;
   - condomínios;
   - unidades;
   - moradores;
   - usuários;
   - vínculos UserAccess.

   Comando:
   npx tsx scripts/diagnostico-demo.ts
   ========================================================= */



function formatDate(value?: Date | null) {
  if (!value) return "-";

  return value.toLocaleString("pt-BR");
}



function unitLabel(unit?: {
  block?: string | null;
  unitNumber?: string | null;
} | null) {
  if (!unit) return "-";

  return `${unit.block ? unit.block + " - " : ""}${unit.unitNumber}`;
}



async function listarResumoGeral() {
  const [
    administrators,
    condominiums,
    units,
    residents,
    users,
    accesses,
    tickets,
    notifications,
  ] = await Promise.all([
    db.administrator.count(),
    db.condominium.count(),
    db.unit.count(),
    db.resident.count(),
    db.user.count(),
    db.userAccess.count(),
    db.ticket.count(),
    db.notification.count(),
  ]);

  console.log("");
  console.log("=====================================================");
  console.log(" RESUMO GERAL DA BASE");
  console.log("=====================================================");
  console.log("");

  console.table({
    administrators,
    condominiums,
    units,
    residents,
    users,
    accesses,
    tickets,
    notifications,
  });
}



async function listarAdministradoras() {
  const administradoras = await db.administrator.findMany({
    include: {
      condominiums: {
        orderBy: {
          name: "asc",
        },
      },
      users: {
        orderBy: {
          name: "asc",
        },
      },
      accesses: {
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  console.log("");
  console.log("=====================================================");
  console.log(" ADMINISTRADORAS");
  console.log("=====================================================");
  console.log("");

  for (const adm of administradoras) {
    console.log(`ADMINISTRADORA: ${adm.name}`);
    console.log(`ID: ${adm.id}`);
    console.log(`Status: ${adm.status}`);
    console.log(`CNPJ: ${adm.cnpj || "-"}`);
    console.log(`E-mail: ${adm.email || "-"}`);
    console.log(`Condomínios: ${adm.condominiums.length}`);
    console.log(`Usuários legados vinculados: ${adm.users.length}`);
    console.log(`UserAccess vinculados: ${adm.accesses.length}`);

    if (adm.accesses.length > 0) {
      console.log("");
      console.log("Acessos da administradora:");

      console.table(
        adm.accesses.map((access) => ({
          user: access.user.name,
          email: access.user.email,
          role: access.role,
          isDefault: access.isDefault,
          isActive: access.isActive,
          label: access.label || "-",
        }))
      );
    }

    console.log("");
    console.log("-----------------------------------------------------");
    console.log("");
  }
}



async function listarCondominios() {
  const condominios = await db.condominium.findMany({
    include: {
      administrator: true,
      units: {
        orderBy: [
          {
            block: "asc",
          },
          {
            unitNumber: "asc",
          },
        ],
      },
      residents: {
        orderBy: {
          name: "asc",
        },
      },
      accesses: {
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
    orderBy: [
      {
        administrator: {
          name: "asc",
        },
      },
      {
        name: "asc",
      },
    ],
  });

  console.log("");
  console.log("=====================================================");
  console.log(" CONDOMÍNIOS");
  console.log("=====================================================");
  console.log("");

  for (const cond of condominios) {
    console.log(`CONDOMÍNIO: ${cond.name}`);
    console.log(`ID: ${cond.id}`);
    console.log(`Administradora: ${cond.administrator.name}`);
    console.log(`Status: ${cond.status}`);
    console.log(`CNPJ: ${cond.cnpj || "-"}`);
    console.log(`Cidade/UF: ${cond.city || "-"} / ${cond.state || "-"}`);
    console.log(`Unidades: ${cond.units.length}`);
    console.log(`Moradores: ${cond.residents.length}`);
    console.log(`UserAccess vinculados: ${cond.accesses.length}`);

    if (cond.units.length > 0) {
      console.log("");
      console.log("Unidades:");

      console.table(
        cond.units.map((unit) => ({
          id: unit.id,
          unidade: unitLabel(unit),
          tipo: unit.unitType || "-",
          status: unit.status,
        }))
      );
    }

    if (cond.accesses.length > 0) {
      console.log("");
      console.log("Acessos do condomínio:");

      console.table(
        cond.accesses.map((access) => ({
          user: access.user.name,
          email: access.user.email,
          role: access.role,
          isDefault: access.isDefault,
          isActive: access.isActive,
          label: access.label || "-",
        }))
      );
    }

    console.log("");
    console.log("-----------------------------------------------------");
    console.log("");
  }
}



async function listarMoradores() {
  const moradores = await db.resident.findMany({
    include: {
      condominium: true,
      unit: true,
      user: true,
      accesses: {
        include: {
          user: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  console.log("");
  console.log("=====================================================");
  console.log(" MORADORES / RESIDENTES");
  console.log("=====================================================");
  console.log("");

  console.table(
    moradores.map((resident) => ({
      id: resident.id,
      nome: resident.name,
      email: resident.email || "-",
      cpf: resident.cpf || "-",
      tipo: resident.residentType || "-",
      status: resident.status,
      condominio: resident.condominium.name,
      unidade: unitLabel(resident.unit),
      userLegado: resident.user?.email || "-",
      acessos: resident.accesses.length,
    }))
  );
}



async function listarUsuariosEAcessos() {
  const usuarios = await db.user.findMany({
    include: {
      administrator: true,
      condominium: true,
      resident: {
        include: {
          unit: true,
          condominium: true,
        },
      },
      accesses: {
        include: {
          administrator: true,
          condominium: true,
          unit: true,
          resident: true,
        },
        orderBy: [
          {
            isDefault: "desc",
          },
          {
            createdAt: "asc",
          },
        ],
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  console.log("");
  console.log("=====================================================");
  console.log(" USUÁRIOS E ACESSOS");
  console.log("=====================================================");
  console.log("");

  for (const user of usuarios) {
    console.log(`USUÁRIO: ${user.name}`);
    console.log(`ID: ${user.id}`);
    console.log(`E-mail: ${user.email}`);
    console.log(`Role legado: ${user.role}`);
    console.log(`Ativo: ${user.isActive ? "SIM" : "NÃO"}`);
    console.log(`Administradora legada: ${user.administrator?.name || "-"}`);
    console.log(`Condomínio legado: ${user.condominium?.name || "-"}`);
    console.log(
      `Resident legado: ${
        user.resident
          ? `${user.resident.name} / ${unitLabel(user.resident.unit)}`
          : "-"
      }`
    );
    console.log(`Criado em: ${formatDate(user.createdAt)}`);

    if (user.accesses.length === 0) {
      console.log("");
      console.log("Nenhum UserAccess ativo/cadastrado para este usuário.");
    } else {
      console.log("");
      console.log("UserAccess:");

      console.table(
        user.accesses.map((access) => ({
          id: access.id,
          role: access.role,
          label: access.label || "-",
          isDefault: access.isDefault,
          isActive: access.isActive,
          administradora: access.administrator?.name || "-",
          condominio: access.condominium?.name || "-",
          unidade: unitLabel(access.unit),
          resident: access.resident?.name || "-",
        }))
      );
    }

    console.log("");
    console.log("-----------------------------------------------------");
    console.log("");
  }
}



async function main() {
  console.log("");
  console.log("=====================================================");
  console.log(" DIAGNÓSTICO DA BASE DEMO - ELOGEST");
  console.log("=====================================================");
  console.log("");

  await listarResumoGeral();
  await listarAdministradoras();
  await listarCondominios();
  await listarMoradores();
  await listarUsuariosEAcessos();

  console.log("");
  console.log("✅ Diagnóstico concluído.");
  console.log("");
}



main()
  .catch((error) => {
    console.error("");
    console.error("❌ Erro ao executar diagnóstico:");
    console.error(error);
    console.error("");
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });