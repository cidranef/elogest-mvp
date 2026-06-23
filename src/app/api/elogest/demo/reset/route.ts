import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEMO_CNPJ = "98000000000100";
const CONFIRMATION = "RESETAR DEMO";

const ACTIVE_RESET_STATUSES = ["PENDING", "RUNNING"] as const;
const STALE_RESET_MINUTES = 15;

type ResetExecutionResult = {
  output: string;
};

function resolveTsxCliPath() {
  const candidates = [
    path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.cjs"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function runReset(logId: string): Promise<ResetExecutionResult> {
  return new Promise((resolve, reject) => {
    const tsxCli = resolveTsxCliPath();

    if (!tsxCli) {
      reject(
        new Error(
          "CLI do tsx não encontrado no servidor. Execute npm install antes de tentar novamente.",
        ),
      );
      return;
    }

    const resetFile = path.join(
      process.cwd(),
      "prisma",
      "seeds",
      "reset-demo-etapa57.ts",
    );

    if (!existsSync(resetFile)) {
      reject(new Error("Arquivo do reset da demonstração não foi encontrado."));
      return;
    }

    const child = spawn(process.execPath, [tsxCli, resetFile], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CONFIRM_DEMO_RESET: "RESETAR_PRISMA_GESTAO",
        DEMO_RESET_LOG_ID: logId,
      },
      windowsHide: true,
    });

    let output = "";

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ output });
        return;
      }

      const executionError = new Error(
        `O processo de reset terminou com código ${code ?? "desconhecido"}.`,
      );

      Object.assign(executionError, {
        technicalOutput: output,
      });

      reject(executionError);
    });
  });
}

function getPublicErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("DEMO_SEED_PASSWORD")) {
    return "A senha dos usuários demo não está configurada corretamente no servidor.";
  }

  if (message.includes("CLI do tsx")) {
    return "O executor do reset não está disponível no servidor.";
  }

  if (message.includes("não foi encontrado")) {
    return "Um arquivo necessário para o reset não foi encontrado no servidor.";
  }

  return "O reset não foi concluído. Nenhuma nova tentativa deve ser feita até a verificação dos logs do servidor.";
}

function getTechnicalOutput(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "technicalOutput" in error &&
    typeof error.technicalOutput === "string"
  ) {
    return error.technicalOutput;
  }

  return error instanceof Error ? error.stack || error.message : String(error);
}

export async function POST(request: Request) {
  const auth = await requireEloGestSuperAdmin();

  if ("error" in auth) {
    return auth.error;
  }

  const body = (await request.json().catch(() => null)) as {
    confirmation?: string;
  } | null;

  if (String(body?.confirmation || "").trim().toUpperCase() !== CONFIRMATION) {
    return NextResponse.json(
      {
        error: `Digite ${CONFIRMATION} para confirmar.`,
        code: "INVALID_CONFIRMATION",
      },
      { status: 400 },
    );
  }

  if (
    !process.env.DEMO_SEED_PASSWORD ||
    process.env.DEMO_SEED_PASSWORD.length < 12
  ) {
    return NextResponse.json(
      {
        error:
          "A senha dos usuários demo não está configurada corretamente no servidor.",
        code: "DEMO_PASSWORD_NOT_CONFIGURED",
      },
      { status: 500 },
    );
  }

  const demo = await db.administrator.findUnique({
    where: { cnpj: DEMO_CNPJ },
    select: {
      id: true,
      isDemo: true,
      demoProtectionEnabled: true,
    },
  });

  if (!demo || !demo.isDemo || !demo.demoProtectionEnabled) {
    return NextResponse.json(
      {
        error: "A Administradora Demo protegida não foi encontrada.",
        code: "DEMO_NOT_FOUND",
      },
      { status: 409 },
    );
  }

  const staleBefore = new Date(
    Date.now() - STALE_RESET_MINUTES * 60 * 1000,
  );

  await db.demoResetLog.updateMany({
    where: {
      status: {
        in: [...ACTIVE_RESET_STATUSES],
      },
      startedAt: {
        lt: staleBefore,
      },
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage:
        "Execução anterior marcada automaticamente como interrompida.",
    },
  });

  const activeReset = await db.demoResetLog.findFirst({
    where: {
      status: {
        in: [...ACTIVE_RESET_STATUSES],
      },
    },
    select: {
      id: true,
      startedAt: true,
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  if (activeReset) {
    return NextResponse.json(
      {
        error: "Já existe um reset do Ambiente Demo em andamento.",
        code: "RESET_ALREADY_RUNNING",
      },
      { status: 409 },
    );
  }

  /*
   * O log precisa ser criado e confirmado antes do processo filho.
   * Não envolva runReset em uma transação Prisma: o processo filho
   * utiliza outra conexão e precisa enxergar este registro.
   */
  const log = await db.demoResetLog.create({
    data: {
      demoCnpj: DEMO_CNPJ,
      requestedByUserId: auth.authUser.id,
      requestedByName: auth.authUser.name ?? null,
      requestedByEmail: auth.authUser.email ?? null,
      status: "PENDING",
      strategy: "SAFE_ROTATION",
    },
    select: {
      id: true,
    },
  });

  try {
    const reset = await runReset(log.id);

    const completedLog = await db.demoResetLog.findUnique({
      where: { id: log.id },
      select: {
        status: true,
        errorMessage: true,
      },
    });

    if (completedLog?.status !== "SUCCESS") {
      throw new Error(
        completedLog?.errorMessage ||
          "O processo terminou sem confirmar a conclusão do reset.",
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Ambiente Demo restaurado com sucesso.",
        logId: log.id,
        output: reset.output.slice(-1500),
      },
      { status: 200 },
    );
  } catch (error) {
    const publicMessage = getPublicErrorMessage(error);
    const technicalOutput = getTechnicalOutput(error);

    console.error("[EloGest Demo Reset] Falha na execução:", technicalOutput);

    await db.demoResetLog.updateMany({
      where: { id: log.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: technicalOutput.slice(0, 2000),
      },
    });

    return NextResponse.json(
      {
        error: publicMessage,
        code: "DEMO_RESET_FAILED",
      },
      { status: 500 },
    );
  }
}
