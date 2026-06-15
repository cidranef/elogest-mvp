import "dotenv/config";

import { FinancialEntryType, Status } from "@prisma/client";
import { db } from "../../src/lib/db";



/* =========================================================
   ELOGEST — ETAPA 53.1
   Seed Inicial De Categorias Financeiras

   Caminho:
   prisma/seeds/seed-etapa53-categorias-financeiras.ts

   Objetivo:
   - Criar categorias financeiras padrão para cada administradora.
   - Preservar isolamento por administratorId.
   - Permitir edição e ampliação posterior pela administradora.
   - Manter execução idempotente por upsert.
   ========================================================= */



type DefaultFinancialCategory = {
  type: FinancialEntryType;
  name: string;
  description: string;
  sortOrder: number;
};



const defaultCategories: DefaultFinancialCategory[] = [
  {
    type: FinancialEntryType.REVENUE,
    name: "Mensalidade Condominial",
    description: "Mensalidades ordinárias vinculadas às unidades do condomínio.",
    sortOrder: 10,
  },
  {
    type: FinancialEntryType.REVENUE,
    name: "Fundo De Reserva",
    description: "Recebimentos destinados ao fundo de reserva do condomínio.",
    sortOrder: 20,
  },
  {
    type: FinancialEntryType.REVENUE,
    name: "Multa",
    description: "Valores recebidos a título de multa.",
    sortOrder: 30,
  },
  {
    type: FinancialEntryType.REVENUE,
    name: "Juros",
    description: "Valores recebidos a título de juros.",
    sortOrder: 40,
  },
  {
    type: FinancialEntryType.REVENUE,
    name: "Receita Extraordinária",
    description: "Receitas extraordinárias não recorrentes.",
    sortOrder: 50,
  },
  {
    type: FinancialEntryType.REVENUE,
    name: "Outros Recebimentos",
    description: "Outros recebimentos não classificados nas categorias anteriores.",
    sortOrder: 60,
  },
  {
    type: FinancialEntryType.EXPENSE,
    name: "Água",
    description: "Despesas de abastecimento de água e serviços relacionados.",
    sortOrder: 110,
  },
  {
    type: FinancialEntryType.EXPENSE,
    name: "Energia Elétrica",
    description: "Despesas de energia elétrica do condomínio.",
    sortOrder: 120,
  },
  {
    type: FinancialEntryType.EXPENSE,
    name: "Limpeza",
    description: "Despesas de limpeza, conservação e materiais relacionados.",
    sortOrder: 130,
  },
  {
    type: FinancialEntryType.EXPENSE,
    name: "Manutenção",
    description: "Despesas de manutenção preventiva ou corretiva.",
    sortOrder: 140,
  },
  {
    type: FinancialEntryType.EXPENSE,
    name: "Portaria",
    description: "Despesas relacionadas à operação de portaria.",
    sortOrder: 150,
  },
  {
    type: FinancialEntryType.EXPENSE,
    name: "Segurança",
    description: "Despesas relacionadas à segurança condominial.",
    sortOrder: 160,
  },
  {
    type: FinancialEntryType.EXPENSE,
    name: "Seguros",
    description: "Despesas com seguros do condomínio.",
    sortOrder: 170,
  },
  {
    type: FinancialEntryType.EXPENSE,
    name: "Honorários",
    description: "Honorários profissionais e serviços administrativos.",
    sortOrder: 180,
  },
  {
    type: FinancialEntryType.EXPENSE,
    name: "Obras",
    description: "Despesas relacionadas a obras e melhorias.",
    sortOrder: 190,
  },
  {
    type: FinancialEntryType.EXPENSE,
    name: "Outros Pagamentos",
    description: "Outros pagamentos não classificados nas categorias anteriores.",
    sortOrder: 200,
  },
];



async function main() {
  console.log("Iniciando seed da Etapa 53.1 — Categorias Financeiras...");

  const administrators = await db.administrator.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  for (const administrator of administrators) {
    for (const category of defaultCategories) {
      await db.financialCategory.upsert({
        where: {
          administratorId_type_name: {
            administratorId: administrator.id,
            type: category.type,
            name: category.name,
          },
        },
        update: {
          description: category.description,
          status: Status.ACTIVE,
          isDefault: true,
          sortOrder: category.sortOrder,
        },
        create: {
          administratorId: administrator.id,
          type: category.type,
          name: category.name,
          description: category.description,
          status: Status.ACTIVE,
          isDefault: true,
          sortOrder: category.sortOrder,
        },
      });
    }

    console.log(`Categorias financeiras conferidas: ${administrator.name}`);
  }

  console.log("Seed da Etapa 53.1 concluído com sucesso.");
}



main()
  .catch((error) => {
    console.error("Erro ao executar seed da Etapa 53.1:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
