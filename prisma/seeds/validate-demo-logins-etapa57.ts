import "dotenv/config";

import { AccessRole, Role, Status } from "@prisma/client";
import { db } from "../../src/lib/db";

/* =========================================================
   ELOGEST — ETAPA 57.3
   VALIDAÇÃO DOS LOGINS DEMONSTRATIVOS

   Verifica:
   - Administradora Demo ativa;
   - marcação isDemo e proteção;
   - usuários demo ativos;
   - e-mails esperados;
   - role legado compatível;
   - UserAccess ativo e padrão;
   - vínculo com administradora/condomínio/unidade;
   - Resident e UnitPersonLink quando aplicável;
   - ausência de acesso a outra administradora.

   Este script não altera dados.
   ========================================================= */

const ADMIN_CNPJ = "98000000000100";

const EXPECTED = [
  {
    label: "Administradora",
    email: "administradora.demo@example.invalid",
    legacyRole: Role.ADMINISTRADORA,
    accessRole: AccessRole.ADMINISTRADORA,
    requiresResident: false,
    requiresCondominium: false,
    requiresUnit: false,
  },
  {
    label: "Síndico",
    email: "sindico.demo@example.invalid",
    legacyRole: Role.SINDICO,
    accessRole: AccessRole.SINDICO,
    requiresResident: true,
    requiresCondominium: true,
    requiresUnit: true,
  },
  {
    label: "Conselheiro",
    email: "conselheiro.demo@example.invalid",
    legacyRole: Role.MORADOR,
    accessRole: AccessRole.CONSELHEIRO,
    requiresResident: true,
    requiresCondominium: true,
    requiresUnit: true,
  },
  {
    label: "Proprietário",
    email: "proprietario.demo@example.invalid",
    legacyRole: Role.MORADOR,
    accessRole: AccessRole.PROPRIETARIO,
    requiresResident: true,
    requiresCondominium: true,
    requiresUnit: true,
  },
  {
    label: "Morador",
    email: "morador.demo@example.invalid",
    legacyRole: Role.MORADOR,
    accessRole: AccessRole.MORADOR,
    requiresResident: true,
    requiresCondominium: true,
    requiresUnit: true,
  },
] as const;

type CheckResult = {
  ok: boolean;
  message: string;
};

function ok(message: string): CheckResult {
  return { ok: true, message };
}

function fail(message: string): CheckResult {
  return { ok: false, message };
}

async function main() {
  console.log("=========================================================");
  console.log("ELOGEST — ETAPA 57.3");
  console.log("Validação Dos Logins Demonstrativos");
  console.log("=========================================================");

  const checks: CheckResult[] = [];

  const administrator = await db.administrator.findUnique({
    where: { cnpj: ADMIN_CNPJ },
    select: {
      id: true,
      name: true,
      status: true,
      isDemo: true,
      demoProtectionEnabled: true,
      plan: {
        select: {
          name: true,
          slug: true,
          status: true,
        },
      },
    },
  });

  if (!administrator) {
    throw new Error(
      "Administradora Demo não encontrada. Execute primeiro os seeds da Etapa 57.2.",
    );
  }

  checks.push(
    administrator.status === Status.ACTIVE
      ? ok("Administradora Demo está ativa.")
      : fail("Administradora Demo não está ativa."),
  );

  checks.push(
    administrator.isDemo
      ? ok("Administradora marcada com isDemo=true.")
      : fail("Administradora não está marcada como demo."),
  );

  checks.push(
    administrator.demoProtectionEnabled
      ? ok("Proteção estrutural demo está ativa.")
      : fail("Proteção estrutural demo não está ativa."),
  );

  checks.push(
    administrator.plan?.slug === "premium"
      ? ok("Plano Premium vinculado.")
      : fail(
          `Plano inesperado: ${administrator.plan?.name ?? "sem plano"}.`,
        ),
  );

  for (const expected of EXPECTED) {
    const user = await db.user.findUnique({
      where: { email: expected.email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        administratorId: true,
        condominiumId: true,
        residentId: true,
        accesses: {
          where: {
            isActive: true,
            revokedAt: null,
          },
          select: {
            id: true,
            administratorId: true,
            condominiumId: true,
            unitId: true,
            residentId: true,
            unitPersonLinkId: true,
            role: true,
            label: true,
            isDefault: true,
            isActive: true,
          },
        },
      },
    });

    if (!user) {
      checks.push(fail(`${expected.label}: usuário não encontrado.`));
      continue;
    }

    checks.push(
      user.isActive
        ? ok(`${expected.label}: usuário ativo.`)
        : fail(`${expected.label}: usuário inativo.`),
    );

    checks.push(
      user.role === expected.legacyRole
        ? ok(`${expected.label}: role legado compatível.`)
        : fail(
            `${expected.label}: role legado ${user.role} diferente de ${expected.legacyRole}.`,
          ),
    );

    checks.push(
      user.administratorId === administrator.id
        ? ok(`${expected.label}: vinculado à Administradora Demo.`)
        : fail(`${expected.label}: vínculo legado aponta para outra administradora.`),
    );

    if (expected.requiresResident) {
      checks.push(
        user.residentId
          ? ok(`${expected.label}: Resident vinculado.`)
          : fail(`${expected.label}: sem Resident vinculado.`),
      );
    }

    if (expected.requiresCondominium) {
      checks.push(
        user.condominiumId
          ? ok(`${expected.label}: condomínio legado vinculado.`)
          : fail(`${expected.label}: sem condomínio legado vinculado.`),
      );
    }

    const expectedAccesses = user.accesses.filter(
      (access) =>
        access.role === expected.accessRole &&
        access.administratorId === administrator.id,
    );

    checks.push(
      expectedAccesses.length === 1
        ? ok(`${expected.label}: possui um acesso ativo do perfil esperado.`)
        : fail(
            `${expected.label}: esperava 1 acesso ${expected.accessRole}, encontrou ${expectedAccesses.length}.`,
          ),
    );

    const access = expectedAccesses[0];

    if (access) {
      checks.push(
        access.isDefault
          ? ok(`${expected.label}: acesso marcado como padrão.`)
          : fail(`${expected.label}: acesso não está marcado como padrão.`),
      );

      if (expected.requiresCondominium) {
        checks.push(
          access.condominiumId
            ? ok(`${expected.label}: UserAccess possui condomínio.`)
            : fail(`${expected.label}: UserAccess sem condomínio.`),
        );
      }

      if (expected.requiresUnit) {
        checks.push(
          access.unitId
            ? ok(`${expected.label}: UserAccess possui unidade.`)
            : fail(`${expected.label}: UserAccess sem unidade.`),
        );

        checks.push(
          access.unitPersonLinkId
            ? ok(`${expected.label}: UnitPersonLink vinculado.`)
            : fail(`${expected.label}: UserAccess sem UnitPersonLink.`),
        );
      }

      if (access.unitPersonLinkId) {
        const link = await db.unitPersonLink.findUnique({
          where: { id: access.unitPersonLinkId },
          select: {
            id: true,
            userId: true,
            residentId: true,
            condominiumId: true,
            unitId: true,
            status: true,
          },
        });

        checks.push(
          link &&
            link.userId === user.id &&
            link.condominiumId === access.condominiumId &&
            link.unitId === access.unitId &&
            link.status === Status.ACTIVE
            ? ok(`${expected.label}: UnitPersonLink íntegro e ativo.`)
            : fail(`${expected.label}: UnitPersonLink inconsistente.`),
        );
      }
    }

    const foreignAccesses = user.accesses.filter(
      (access) =>
        access.administratorId &&
        access.administratorId !== administrator.id,
    );

    checks.push(
      foreignAccesses.length === 0
        ? ok(`${expected.label}: sem acesso ativo a outra administradora.`)
        : fail(
            `${expected.label}: possui ${foreignAccesses.length} acesso(s) ativo(s) a outra administradora.`,
          ),
    );
  }

  const passed = checks.filter((check) => check.ok).length;
  const failed = checks.length - passed;

  console.log("");
  for (const check of checks) {
    console.log(`${check.ok ? "✓" : "✗"} ${check.message}`);
  }

  console.log("");
  console.log("---------------------------------------------------------");
  console.log(`Total: ${checks.length}`);
  console.log(`Aprovados: ${passed}`);
  console.log(`Falhas: ${failed}`);
  console.log("---------------------------------------------------------");

  if (failed > 0) {
    throw new Error(
      `Validação concluída com ${failed} falha(s). Corrija antes de aprovar a Etapa 57.3.`,
    );
  }

  console.log("");
  console.log("Todos os logins demonstrativos foram validados.");
}

main()
  .catch((error) => {
    console.error("");
    console.error("Falha na validação:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
