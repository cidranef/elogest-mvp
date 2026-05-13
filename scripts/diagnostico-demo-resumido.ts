import "dotenv/config";
import { writeFile } from "fs/promises";
import path from "path";
import { db } from "../src/lib/db";



/* =========================================================
   DIAGNÓSTICO RESUMIDO DA BASE DEMO - ELOGEST

   Este script NÃO altera nada no banco.

   Ele gera um arquivo:
   diagnostico-demo-resumido.txt

   Com:
   - resumo geral;
   - administradoras;
   - condomínios;
   - usuários;
   - acessos de cada usuário;
   - moradores/unidades.

   Comando:
   npx tsx scripts/diagnostico-demo-resumido.ts
   ========================================================= */



function line() {
  return "------------------------------------------------------------";
}



function unitLabel(unit?: {
  block?: string | null;
  unitNumber?: string | null;
} | null) {
  if (!unit) return "-";

  return `${unit.block ? unit.block + " - " : ""}${unit.unitNumber}`;
}



async function main() {
  const output: string[] = [];

  output.push("DIAGNÓSTICO RESUMIDO DA BASE DEMO - ELOGEST");
  output.push(line());
  output.push("");



  /* =========================================================
     RESUMO GERAL
     ========================================================= */

  const resumo = {
    administrators: await db.administrator.count(),
    condominiums: await db.condominium.count(),
    units: await db.unit.count(),
    residents: await db.resident.count(),
    users: await db.user.count(),
    accesses: await db.userAccess.count(),
    tickets: await db.ticket.count(),
    notifications: await db.notification.count(),
  };

  output.push("RESUMO GERAL");
  output.push(JSON.stringify(resumo, null, 2));
  output.push("");



  /* =========================================================
     ADMINISTRADORAS
     ========================================================= */

  const administradoras = await db.administrator.findMany({
    include: {
      condominiums: true,
      users: true,
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

  output.push("ADMINISTRADORAS");
  output.push(line());

  for (const adm of administradoras) {
    output.push(`ID: ${adm.id}`);
    output.push(`Nome: ${adm.name}`);
    output.push(`Status: ${adm.status}`);
    output.push(`CNPJ: ${adm.cnpj || "-"}`);
    output.push(`E-mail: ${adm.email || "-"}`);
    output.push(`Condomínios: ${adm.condominiums.length}`);
    output.push(`Usuários legados: ${adm.users.length}`);
    output.push(`UserAccess: ${adm.accesses.length}`);

    if (adm.accesses.length > 0) {
      output.push("Acessos:");
      for (const access of adm.accesses) {
        output.push(
          `  - ${access.user.name} | ${access.user.email} | ${access.role} | default=${access.isDefault} | ativo=${access.isActive} | label=${access.label || "-"}`
        );
      }
    }

    output.push(line());
  }

  output.push("");



  /* =========================================================
     CONDOMÍNIOS
     ========================================================= */

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
      residents: true,
      accesses: {
        include: {
          user: true,
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

  output.push("CONDOMÍNIOS");
  output.push(line());

  for (const cond of condominios) {
    output.push(`ID: ${cond.id}`);
    output.push(`Nome: ${cond.name}`);
    output.push(`Administradora: ${cond.administrator.name}`);
    output.push(`Status: ${cond.status}`);
    output.push(`CNPJ: ${cond.cnpj || "-"}`);
    output.push(`Cidade/UF: ${cond.city || "-"} / ${cond.state || "-"}`);
    output.push(`Unidades: ${cond.units.length}`);
    output.push(`Moradores: ${cond.residents.length}`);
    output.push(`UserAccess: ${cond.accesses.length}`);

    if (cond.units.length > 0) {
      output.push("Unidades:");
      for (const unit of cond.units) {
        output.push(
          `  - ${unit.id} | ${unitLabel(unit)} | tipo=${unit.unitType || "-"} | status=${unit.status}`
        );
      }
    }

    if (cond.accesses.length > 0) {
      output.push("Acessos:");
      for (const access of cond.accesses) {
        output.push(
          `  - ${access.user.name} | ${access.user.email} | ${access.role} | default=${access.isDefault} | ativo=${access.isActive} | label=${access.label || "-"}`
        );
      }
    }

    output.push(line());
  }

  output.push("");



  /* =========================================================
     MORADORES
     ========================================================= */

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

  output.push("MORADORES / RESIDENTES");
  output.push(line());

  for (const resident of moradores) {
    output.push(`ID: ${resident.id}`);
    output.push(`Nome: ${resident.name}`);
    output.push(`E-mail: ${resident.email || "-"}`);
    output.push(`CPF: ${resident.cpf || "-"}`);
    output.push(`Tipo: ${resident.residentType || "-"}`);
    output.push(`Status: ${resident.status}`);
    output.push(`Condomínio: ${resident.condominium.name}`);
    output.push(`Unidade: ${unitLabel(resident.unit)}`);
    output.push(`User legado: ${resident.user?.email || "-"}`);

    if (resident.accesses.length > 0) {
      output.push("Acessos:");
      for (const access of resident.accesses) {
        output.push(
          `  - ${access.user.name} | ${access.user.email} | ${access.role} | default=${access.isDefault} | ativo=${access.isActive} | label=${access.label || "-"}`
        );
      }
    }

    output.push(line());
  }

  output.push("");



  /* =========================================================
     USUÁRIOS E ACESSOS
     ========================================================= */

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

  output.push("USUÁRIOS E ACESSOS");
  output.push(line());

  for (const user of usuarios) {
    output.push(`ID: ${user.id}`);
    output.push(`Nome: ${user.name}`);
    output.push(`E-mail: ${user.email}`);
    output.push(`Role legado: ${user.role}`);
    output.push(`Ativo: ${user.isActive ? "SIM" : "NÃO"}`);
    output.push(`Administradora legada: ${user.administrator?.name || "-"}`);
    output.push(`Condomínio legado: ${user.condominium?.name || "-"}`);
    output.push(
      `Resident legado: ${
        user.resident
          ? `${user.resident.name} / ${unitLabel(user.resident.unit)}`
          : "-"
      }`
    );

    if (user.accesses.length === 0) {
      output.push("UserAccess: nenhum");
    } else {
      output.push("UserAccess:");
      for (const access of user.accesses) {
        output.push(`  - ID: ${access.id}`);
        output.push(`    Role: ${access.role}`);
        output.push(`    Label: ${access.label || "-"}`);
        output.push(`    Default: ${access.isDefault}`);
        output.push(`    Ativo: ${access.isActive}`);
        output.push(`    Administradora: ${access.administrator?.name || "-"}`);
        output.push(`    Condomínio: ${access.condominium?.name || "-"}`);
        output.push(`    Unidade: ${unitLabel(access.unit)}`);
        output.push(`    Resident: ${access.resident?.name || "-"}`);
      }
    }

    output.push(line());
  }



  const filePath = path.join(process.cwd(), "diagnostico-demo-resumido.txt");

  await writeFile(filePath, output.join("\n"), "utf8");

  console.log("");
  console.log("✅ Diagnóstico resumido gerado com sucesso.");
  console.log("");
  console.log(`Arquivo: ${filePath}`);
  console.log("");
}



main()
  .catch((error) => {
    console.error("");
    console.error("❌ Erro ao gerar diagnóstico resumido:");
    console.error(error);
    console.error("");
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });