import "dotenv/config";

import {
  AdministratorProviderStatus,
  ProviderEntityType,
  ProviderGlobalStatus,
  ProviderOrigin,
  ProviderVisibility,
} from "@prisma/client";
import { db } from "../../src/lib/db";



/* =========================================================
   ELOGEST — ETAPA 47
   Seed De Teste De Limite De Fornecedores

   Caminho:
   prisma/seeds/seed-etapa47-teste-limite-fornecedores.ts

   Objetivo:
   - Preparar uma administradora com N fornecedores homologados/ativos.
   - Facilitar o teste dos limites:
     Free: 3 fornecedores
     Essencial: 10 fornecedores

   Uso recomendado:
   - Rodar com count igual ao limite do plano.
   - Depois tentar cadastrar +1 fornecedor pela interface.
   - A interface/API deve bloquear com mensagem amigável.

   Exemplos:
   npx tsx prisma/seeds/seed-etapa47-teste-limite-fornecedores.ts --administratorId=ID --plan=free --count=3 --reset

   npx tsx prisma/seeds/seed-etapa47-teste-limite-fornecedores.ts --administratorId=ID --plan=essential --count=10 --reset

   Observação:
   - Este seed cria apenas registros com prefixo E47TEST.
   - Com --reset, remove apenas vínculos e providers de teste E47TEST.
   ========================================================= */



type CliArgs = {
  administratorId?: string;
  administratorName?: string;
  plan?: string;
  count: number;
  reset: boolean;
};



const TEST_PREFIX = "E47TEST";



function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));

  return arg ? arg.slice(prefix.length).trim() : "";
}



function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}



function parseArgs(): CliArgs {
  const countText = getArgValue("count");
  const parsedCount = Number(countText || "0");

  return {
    administratorId: getArgValue("administratorId") || undefined,
    administratorName: getArgValue("administratorName") || undefined,
    plan: getArgValue("plan") || undefined,
    count: Number.isFinite(parsedCount) && parsedCount > 0 ? Math.floor(parsedCount) : 0,
    reset: hasFlag("reset"),
  };
}



function normalizeDocument(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}



async function getAdministrator(args: CliArgs) {
  if (args.administratorId) {
    return db.administrator.findUnique({
      where: {
        id: args.administratorId,
      },
      select: {
        id: true,
        name: true,
        planId: true,
      },
    });
  }

  if (args.administratorName) {
    return db.administrator.findFirst({
      where: {
        name: {
          contains: args.administratorName,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        planId: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  return null;
}



async function applyPlanIfRequested({
  administratorId,
  planSlug,
}: {
  administratorId: string;
  planSlug?: string;
}) {
  if (!planSlug) {
    return null;
  }

  const plan = await db.plan.findUnique({
    where: {
      slug: planSlug,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      maxProviders: true,
    },
  });

  if (!plan) {
    throw new Error(`Plano não encontrado para o slug: ${planSlug}`);
  }

  await db.administrator.update({
    where: {
      id: administratorId,
    },
    data: {
      planId: plan.id,
      planStatus: "ACTIVE",
      planStartedAt: new Date(),
      planExpiresAt: null,
      customLimitsEnabled: false,
    },
  });

  await db.administratorLimitOverride.deleteMany({
    where: {
      administratorId,
    },
  });

  await db.administratorModuleOverride.deleteMany({
    where: {
      administratorId,
    },
  });

  return plan;
}



async function resetTestProviders(administratorId: string) {
  const testProviders = await db.provider.findMany({
    where: {
      documentNormalized: {
        startsWith: TEST_PREFIX,
      },
    },
    select: {
      id: true,
    },
  });

  const testProviderIds = testProviders.map((provider) => provider.id);

  if (testProviderIds.length === 0) {
    return {
      removedLinks: 0,
      removedProviders: 0,
    };
  }

  const removedLinks = await db.administratorProvider.deleteMany({
    where: {
      administratorId,
      providerId: {
        in: testProviderIds,
      },
    },
  });

  const stillUsedProviderIds = await db.administratorProvider.findMany({
    where: {
      providerId: {
        in: testProviderIds,
      },
    },
    select: {
      providerId: true,
    },
  });

  const stillUsedSet = new Set(
    stillUsedProviderIds.map((item) => item.providerId)
  );

  const removableProviderIds = testProviderIds.filter(
    (providerId) => !stillUsedSet.has(providerId)
  );

  const removedProviders = await db.provider.deleteMany({
    where: {
      id: {
        in: removableProviderIds,
      },
    },
  });

  return {
    removedLinks: removedLinks.count,
    removedProviders: removedProviders.count,
  };
}



async function createTestProviders({
  administratorId,
  count,
}: {
  administratorId: string;
  count: number;
}) {
  for (let index = 1; index <= count; index += 1) {
    const code = String(index).padStart(3, "0");
    const documentNormalized = normalizeDocument(`${TEST_PREFIX}${code}`);
    const tradeName = `Fornecedor Teste Etapa 47 ${code}`;

    await db.$transaction(async (tx) => {
      const provider = await tx.provider.upsert({
        where: {
          documentNormalized,
        },
        update: {
          tradeName,
          legalName: `${tradeName} Ltda`,
          document: documentNormalized,
          entityType: ProviderEntityType.COMPANY,
          primaryCategory: "Teste De Limite",
          description: "Fornecedor criado automaticamente para teste de limite da Etapa 47.",
          city: "São Paulo",
          state: "SP",
          globalStatus: ProviderGlobalStatus.ACTIVE,
          visibility: ProviderVisibility.PRIVATE,
          origin: ProviderOrigin.IMPORT,
        },
        create: {
          tradeName,
          legalName: `${tradeName} Ltda`,
          document: documentNormalized,
          documentNormalized,
          entityType: ProviderEntityType.COMPANY,
          primaryCategory: "Teste De Limite",
          description: "Fornecedor criado automaticamente para teste de limite da Etapa 47.",
          city: "São Paulo",
          state: "SP",
          globalStatus: ProviderGlobalStatus.ACTIVE,
          visibility: ProviderVisibility.PRIVATE,
          isVerified: false,
          isFeatured: false,
          origin: ProviderOrigin.IMPORT,
        },
      });

      await tx.administratorProvider.upsert({
        where: {
          administratorId_providerId: {
            administratorId,
            providerId: provider.id,
          },
        },
        update: {
          status: AdministratorProviderStatus.ACTIVE,
          internalName: tradeName,
          internalCategory: "Teste De Limite",
          notes: "Vínculo criado automaticamente para testar limite de fornecedores da Etapa 47.",
          canBeUsedInTickets: true,
          visibleToSyndics: false,
          visibleToResidents: false,
          homologatedAt: new Date(),
        },
        create: {
          administratorId,
          providerId: provider.id,
          status: AdministratorProviderStatus.ACTIVE,
          internalName: tradeName,
          internalCategory: "Teste De Limite",
          notes: "Vínculo criado automaticamente para testar limite de fornecedores da Etapa 47.",
          canBeUsedInTickets: true,
          visibleToSyndics: false,
          visibleToResidents: false,
          homologatedAt: new Date(),
        },
      });
    });
  }
}



async function main() {
  const args = parseArgs();

  if (!args.count) {
    throw new Error("Informe --count com um número maior que zero.");
  }

  const administrator = await getAdministrator(args);

  if (!administrator) {
    throw new Error(
      "Administradora não encontrada. Informe --administratorId=ID ou --administratorName=NOME."
    );
  }

  console.log("Administradora:", administrator.name);
  console.log("ID:", administrator.id);

  const appliedPlan = await applyPlanIfRequested({
    administratorId: administrator.id,
    planSlug: args.plan,
  });

  if (appliedPlan) {
    console.log(
      `Plano aplicado: ${appliedPlan.name} | Limite de fornecedores: ${appliedPlan.maxProviders ?? "Ilimitado"}`
    );
  }

  if (args.reset) {
    const removed = await resetTestProviders(administrator.id);

    console.log(
      `Reset concluído. Vínculos removidos: ${removed.removedLinks}. Providers removidos: ${removed.removedProviders}.`
    );
  }

  await createTestProviders({
    administratorId: administrator.id,
    count: args.count,
  });

  const totalProviders = await db.administratorProvider.count({
    where: {
      administratorId: administrator.id,
      status: {
        in: [
          AdministratorProviderStatus.IN_REVIEW,
          AdministratorProviderStatus.HOMOLOGATED,
          AdministratorProviderStatus.ACTIVE,
        ],
      },
    },
  });

  console.log(`Fornecedores contáveis na administradora: ${totalProviders}`);
  console.log("Seed de teste concluído com sucesso.");
}



main()
  .catch((error) => {
    console.error("Erro no seed de teste:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });