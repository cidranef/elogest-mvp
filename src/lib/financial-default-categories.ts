import { FinancialEntryType, Status } from "@prisma/client";
import { db } from "@/lib/db";

/* =========================================================
   ELOGEST — CATEGORIAS FINANCEIRAS PADRÃO

   Origem: Etapa 53.1 — Financeiro Inicial
   Uso atual:
   - Seed de categorias financeiras por administradora.
   - Conversão de onboarding público em administradora.

   Objetivo:
   - Evitar duplicidade de lógica.
   - Garantir que administradoras criadas pelo onboarding já
     nasçam com categorias financeiras padrão.
   - Manter idempotência via upsert.
   ========================================================= */

type DefaultFinancialCategory = {
  type: FinancialEntryType;
  name: string;
  description: string;
  sortOrder: number;
};

type FinancialCategoryClient = {
  financialCategory: {
    upsert: (args: {
      where: {
        administratorId_type_name: {
          administratorId: string;
          type: FinancialEntryType;
          name: string;
        };
      };
      update: {
        description: string;
        status: Status;
        isDefault: boolean;
        sortOrder: number;
      };
      create: {
        administratorId: string;
        type: FinancialEntryType;
        name: string;
        description: string;
        status: Status;
        isDefault: boolean;
        sortOrder: number;
      };
    }) => Promise<unknown>;
  };
};

export const DEFAULT_FINANCIAL_CATEGORIES: DefaultFinancialCategory[] = [
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

export async function ensureDefaultFinancialCategories(
  administratorId: string,
  client: FinancialCategoryClient = db,
) {
  for (const category of DEFAULT_FINANCIAL_CATEGORIES) {
    await client.financialCategory.upsert({
      where: {
        administratorId_type_name: {
          administratorId,
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
        administratorId,
        type: category.type,
        name: category.name,
        description: category.description,
        status: Status.ACTIVE,
        isDefault: true,
        sortOrder: category.sortOrder,
      },
    });
  }
}
