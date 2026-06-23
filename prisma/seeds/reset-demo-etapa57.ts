import "dotenv/config";

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Status } from "@prisma/client";
import { db } from "../../src/lib/db";

const DEMO_ADMIN_CNPJ = "98000000000100";
const REQUIRED_CONFIRMATION = "RESETAR_PRISMA_GESTAO";

function requireEnvironment() {
  const confirmation = String(process.env.CONFIRM_DEMO_RESET || "").trim();
  const password = String(process.env.DEMO_SEED_PASSWORD || "").trim();

  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Confirmação inválida. Defina CONFIRM_DEMO_RESET=${REQUIRED_CONFIRMATION}.`,
    );
  }

  if (password.length < 12) {
    throw new Error(
      "DEMO_SEED_PASSWORD não configurada ou possui menos de 12 caracteres.",
    );
  }
}

function resolveTsxCliPath() {
  const candidates = [
    path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.cjs"),
  ];

  const resolved = candidates.find((candidate) => existsSync(candidate));

  if (!resolved) {
    throw new Error(
      "CLI local do tsx não encontrado. Execute npm install.",
    );
  }

  return resolved;
}

function runTsx(file: string, label: string) {
  console.log(`\n▶ ${label}`);

  const absoluteFile = path.resolve(process.cwd(), file);

  if (!existsSync(absoluteFile)) {
    throw new Error(`Arquivo não encontrado: ${absoluteFile}`);
  }

  const result = spawnSync(
    process.execPath,
    [resolveTsxCliPath(), absoluteFile],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} terminou com código ${result.status}.`);
  }
}

function archiveValue(
  value: string | null,
  stamp: string,
  fallback: string,
) {
  const clean = String(value || fallback).trim();
  return `${clean}-ARQ-${stamp}`;
}

async function archiveCurrentDemo() {
  const administrator = await db.administrator.findUnique({
    where: { cnpj: DEMO_ADMIN_CNPJ },
    select: {
      id: true,
      name: true,
      cnpj: true,
      isDemo: true,
      demoProtectionEnabled: true,
      condominiums: {
        select: {
          id: true,
          cnpj: true,
          name: true,
        },
      },
      users: {
        select: {
          id: true,
          email: true,
          name: true,
          residentId: true,
        },
      },
    },
  });

  if (!administrator) {
    throw new Error("Administradora Demo atual não encontrada.");
  }

  if (!administrator.isDemo) {
    throw new Error(
      "A administradora localizada não está marcada como demo.",
    );
  }

  if (!administrator.demoProtectionEnabled) {
    throw new Error(
      "A proteção da administradora demo está desativada.",
    );
  }

  const stamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);

  await db.$transaction(async (tx) => {
    await tx.userAccess.updateMany({
      where: { administratorId: administrator.id },
      data: {
        isActive: false,
        isDefault: false,
        revokedAt: new Date(),
        revokedReason: "Reset do Ambiente Demo",
      },
    });

    for (const [index, user] of administrator.users.entries()) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: `arquivado.demo.${stamp}.${index + 1}@example.invalid`,
          isActive: false,
        },
      });
    }

    const residents = await tx.resident.findMany({
      where: {
        condominium: {
          administratorId: administrator.id,
        },
      },
      select: {
        id: true,
        cpf: true,
        email: true,
      },
    });

    for (const [index, resident] of residents.entries()) {
      await tx.resident.update({
        where: { id: resident.id },
        data: {
          cpf: resident.cpf
            ? archiveValue(resident.cpf, stamp, `CPF-${index + 1}`)
            : null,
          email: resident.email
            ? `residente.arquivado.${stamp}.${index + 1}@example.invalid`
            : null,
          status: Status.INACTIVE,
        },
      });
    }

    for (const [
      index,
      condominium,
    ] of administrator.condominiums.entries()) {
      await tx.condominium.update({
        where: { id: condominium.id },
        data: {
          name: `[ARQUIVO DEMO ${stamp}] ${condominium.name}`,
          cnpj: condominium.cnpj
            ? archiveValue(
                condominium.cnpj,
                stamp,
                `COND-${index + 1}`,
              )
            : null,
          status: Status.INACTIVE,
        },
      });
    }

    await tx.administrator.update({
      where: { id: administrator.id },
      data: {
        name: `[ARQUIVO TÉCNICO DEMO ${stamp}] ${administrator.name}`,
        cnpj: archiveValue(
          administrator.cnpj,
          stamp,
          "ADMIN-DEMO",
        ),
        status: Status.INACTIVE,
        demoProtectionEnabled: false,
      },
    });
  });

  return administrator.id;
}

async function updateLog(data: Record<string, unknown>) {
  const logId = String(process.env.DEMO_RESET_LOG_ID || "").trim();

  if (!logId) {
    return;
  }

  /*
   * updateMany é intencional:
   * - não lança P2025 se o registro não existir;
   * - permite execução manual sem histórico;
   * - evita transformar uma falha de auditoria em falha do reset.
   */
  const result = await db.demoResetLog.updateMany({
    where: { id: logId },
    data,
  });

  if (result.count === 0) {
    console.warn(
      `[EloGest Demo Reset] Histórico ${logId} não encontrado para atualização.`,
    );
  }
}

async function main() {
  console.log("=========================================================");
  console.log("ELOGEST — RESET OPERACIONAL INTEGRAL DA DEMO");
  console.log("Estratégia: rotação segura e reconstrução limpa");
  console.log("=========================================================");

  requireEnvironment();

  await updateLog({
    status: "RUNNING",
  });

  const archivedAdministratorId = await archiveCurrentDemo();

  await updateLog({
    archivedAdministratorId,
  });

  await db.$disconnect();

  runTsx(
    "prisma/seeds/seed-etapa47-planos.ts",
    "Garantindo planos e módulos",
  );

  runTsx(
    "prisma/seeds/seed-demo-etapa57.ts",
    "Criando nova base estrutural demo",
  );

  runTsx(
    "prisma/seeds/seed-demo-etapa57-cenarios.ts",
    "Criando cenários comerciais limpos",
  );

  runTsx(
    "prisma/seeds/validate-demo-logins-etapa57.ts",
    "Validando logins e vínculos",
  );

  runTsx(
    "prisma/seeds/validate-demo-protections-etapa57.ts",
    "Validando proteções demo",
  );

  const created = await db.administrator.findUnique({
    where: { cnpj: DEMO_ADMIN_CNPJ },
    select: {
      id: true,
      name: true,
    },
  });

  if (!created) {
    throw new Error(
      "A nova Administradora Demo não foi criada.",
    );
  }

  await updateLog({
    status: "SUCCESS",
    createdAdministratorId: created.id,
    completedAt: new Date(),
    summary: {
      strategy: "SAFE_ROTATION",
      archivedAdministratorId,
      createdAdministratorId: created.id,
      administratorName: created.name,
    },
  });

  console.log("\nReset operacional concluído com sucesso.");
  console.log(
    "A carteira anterior foi arquivada e uma nova demonstração limpa foi criada.",
  );
}

main().catch(async (error) => {
  const message =
    error instanceof Error ? error.message : "Erro desconhecido";

  console.error("\nFalha no reset:", error);

  try {
    await updateLog({
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: message.slice(0, 2000),
    });
  } catch (logError) {
    console.error(
      "Falha ao atualizar o histórico do reset:",
      logError,
    );
  }

  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
