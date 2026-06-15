import "dotenv/config";

import { Status } from "@prisma/client";
import { db } from "../../src/lib/db";



/* =========================================================
   ELOGEST — ETAPA 47
   Seed Inicial De Planos, Módulos E Limites

   Caminho:
   prisma/seeds/seed-etapa47-planos.ts

   Objetivo:
   - Criar os planos comerciais base do EloGest.
   - Criar os módulos controláveis da plataforma.
   - Incluir o módulo Reuniões De Conselho da Etapa 49.
   - Incluir o módulo Enquetes da Etapa 50.
   - Vincular módulos aos planos.
   - Definir limites comerciais iniciais.

   Planos:
   - Free
   - Essencial
   - Profissional
   - Premium
   - Enterprise

   Decisão aprovada:
   - Plano Free libera 3 fornecedores.
   - Plano Essencial libera 10 fornecedores.

   Observação técnica:
   - Este seed usa o db central do projeto em src/lib/db.ts.
   - Isso evita erro de inicialização do PrismaClient no Prisma 7.
   ========================================================= */



const modules = [
  {
    name: "Chamados",
    slug: "chamados",
    description: "Gestão de chamados, solicitações, atendimento e histórico operacional.",
  },
  {
    name: "Condomínios",
    slug: "condominios",
    description: "Cadastro e gestão dos condomínios da carteira da administradora.",
  },
  {
    name: "Unidades",
    slug: "unidades",
    description: "Cadastro e gestão das unidades vinculadas aos condomínios.",
  },
  {
    name: "Moradores",
    slug: "moradores",
    description: "Cadastro e gestão de moradores, proprietários e vínculos por unidade.",
  },
  {
    name: "Usuários",
    slug: "usuarios",
    description: "Gestão de usuários, perfis de acesso e permissões.",
  },
  {
    name: "Fornecedores",
    slug: "fornecedores",
    description: "Rede De Fornecedores EloGest, homologação e vínculos por condomínio.",
  },
  {
    name: "Comunicados",
    slug: "comunicados",
    description: "Envio de comunicados oficiais com controle de leitura.",
  },
  {
    name: "Reuniões De Conselho",
    slug: "reunioes-conselho",
    description: "Sala De Reunião EloGest para conselho, pauta, participantes, presença, anexos e histórico.",
  },
  {
    name: "Enquetes",
    slug: "enquetes",
    description: "Enquetes consultivas, pesquisas rápidas e levantamento de opinião dos condôminos.",
  },
  {
    name: "Assembleias",
    slug: "assembleias",
    description: "Assembleias, votações formais e decisões condominiais com regras próprias.",
  },
  {
    name: "Financeiro",
    slug: "financeiro",
    description: "Financeiro condominial inicial com lançamentos, mensalidades, baixas e visão gerencial.",
  },
  {
    name: "Relatórios",
    slug: "relatorios",
    description: "Relatórios gerenciais, indicadores e visões analíticas.",
  },
  {
    name: "WhatsApp",
    slug: "whatsapp",
    description: "Notificações externas via WhatsApp.",
  },
  {
    name: "IA",
    slug: "ia",
    description: "Recursos de inteligência artificial para apoio operacional.",
  },
];



const plans = [
  {
    name: "Free",
    slug: "free",
    description: "Plano gratuito de avaliação inicial da plataforma EloGest.",
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    maxCondominiums: 1,
    maxUnits: 30,
    maxUsers: 5,
    maxMonthlyTickets: 30,
    maxProviders: 3,
    modules: [
      "chamados",
      "condominios",
      "unidades",
      "moradores",
      "usuarios",
      "fornecedores",
      "relatorios",
    ],
  },
  {
    name: "Essencial",
    slug: "essential",
    description: "Plano inicial para pequenas administradoras ou carteiras em implantação.",
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    maxCondominiums: 3,
    maxUnits: 300,
    maxUsers: 20,
    maxMonthlyTickets: 200,
    maxProviders: 10,
    modules: [
      "chamados",
      "condominios",
      "unidades",
      "moradores",
      "usuarios",
      "fornecedores",
      "relatorios",
    ],
  },
  {
    name: "Profissional",
    slug: "professional",
    description: "Plano para administradoras em operação regular com carteira em crescimento.",
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    maxCondominiums: 15,
    maxUnits: 2000,
    maxUsers: 100,
    maxMonthlyTickets: 1500,
    maxProviders: 100,
    modules: [
      "chamados",
      "condominios",
      "unidades",
      "moradores",
      "usuarios",
      "fornecedores",
      "comunicados",
      "reunioes-conselho",
      "enquetes",
      "relatorios",
    ],
  },
  {
    name: "Premium",
    slug: "premium",
    description: "Plano avançado para administradoras com maior volume e módulos estratégicos.",
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    maxCondominiums: 50,
    maxUnits: 10000,
    maxUsers: 500,
    maxMonthlyTickets: 10000,
    maxProviders: 500,
    modules: [
      "chamados",
      "condominios",
      "unidades",
      "moradores",
      "usuarios",
      "fornecedores",
      "comunicados",
      "reunioes-conselho",
      "enquetes",
      "assembleias",
      "financeiro",
      "relatorios",
      "whatsapp",
      "ia",
    ],
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    description: "Plano personalizado para grandes carteiras, redes e contratos especiais.",
    monthlyPriceCents: null,
    annualPriceCents: null,
    maxCondominiums: null,
    maxUnits: null,
    maxUsers: null,
    maxMonthlyTickets: null,
    maxProviders: null,
    modules: [
      "chamados",
      "condominios",
      "unidades",
      "moradores",
      "usuarios",
      "fornecedores",
      "comunicados",
      "reunioes-conselho",
      "enquetes",
      "assembleias",
      "financeiro",
      "relatorios",
      "whatsapp",
      "ia",
    ],
  },
];



async function main() {
  console.log("Iniciando seed da Etapa 47 — Planos, Módulos e Limites...");



  /* =========================================================
     1. Cria ou atualiza módulos
     ========================================================= */

  const moduleMap = new Map<string, string>();

  for (const moduleItem of modules) {
    const savedModule = await db.platformModule.upsert({
      where: {
        slug: moduleItem.slug,
      },
      update: {
        name: moduleItem.name,
        description: moduleItem.description,
        status: Status.ACTIVE,
      },
      create: {
        name: moduleItem.name,
        slug: moduleItem.slug,
        description: moduleItem.description,
        status: Status.ACTIVE,
      },
    });

    moduleMap.set(savedModule.slug, savedModule.id);
  }



  /* =========================================================
     2. Cria ou atualiza planos
     ========================================================= */

  for (const planItem of plans) {
    const savedPlan = await db.plan.upsert({
      where: {
        slug: planItem.slug,
      },
      update: {
        name: planItem.name,
        description: planItem.description,
        monthlyPriceCents: planItem.monthlyPriceCents,
        annualPriceCents: planItem.annualPriceCents,
        maxCondominiums: planItem.maxCondominiums,
        maxUnits: planItem.maxUnits,
        maxUsers: planItem.maxUsers,
        maxMonthlyTickets: planItem.maxMonthlyTickets,
        maxProviders: planItem.maxProviders,
        status: Status.ACTIVE,
      },
      create: {
        name: planItem.name,
        slug: planItem.slug,
        description: planItem.description,
        monthlyPriceCents: planItem.monthlyPriceCents,
        annualPriceCents: planItem.annualPriceCents,
        maxCondominiums: planItem.maxCondominiums,
        maxUnits: planItem.maxUnits,
        maxUsers: planItem.maxUsers,
        maxMonthlyTickets: planItem.maxMonthlyTickets,
        maxProviders: planItem.maxProviders,
        status: Status.ACTIVE,
      },
    });



    /* =========================================================
       3. Vincula módulos liberados ao plano
       ========================================================= */

    for (const moduleSlug of planItem.modules) {
      const moduleId = moduleMap.get(moduleSlug);

      if (!moduleId) {
        console.warn(`Módulo não encontrado para o slug: ${moduleSlug}`);
        continue;
      }

      await db.planModule.upsert({
        where: {
          planId_moduleId: {
            planId: savedPlan.id,
            moduleId,
          },
        },
        update: {
          enabled: true,
        },
        create: {
          planId: savedPlan.id,
          moduleId,
          enabled: true,
        },
      });
    }



    /* =========================================================
       4. Desativa vínculos de módulos removidos do plano
       ========================================================= */

    const allowedModuleIds = planItem.modules
      .map((moduleSlug) => moduleMap.get(moduleSlug))
      .filter((moduleId): moduleId is string => Boolean(moduleId));

    await db.planModule.updateMany({
      where: {
        planId: savedPlan.id,
        moduleId: {
          notIn: allowedModuleIds,
        },
      },
      data: {
        enabled: false,
      },
    });
  }



  /* =========================================================
     5. Define Plano Free como padrão para administradoras
        antigas que ainda não têm plano definido
     ========================================================= */

  const freePlan = await db.plan.findUnique({
    where: {
      slug: "free",
    },
  });

  if (freePlan) {
    await db.administrator.updateMany({
      where: {
        planId: null,
      },
      data: {
        planId: freePlan.id,
        planStatus: "ACTIVE",
        planStartedAt: new Date(),
      },
    });
  }



  console.log("Seed da Etapa 47 concluído com sucesso.");
}



main()
  .catch((error) => {
    console.error("Erro ao executar seed da Etapa 47:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });