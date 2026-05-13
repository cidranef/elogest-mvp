import "dotenv/config";
import { db } from "../src/lib/db";



/* =========================================================
   ETAPA 27.2 - BACKFILL DE USER ACCESS

   Objetivo:
   Criar registros na nova tabela UserAccess com base nos
   usuários legados já existentes.

   Importante:
   - Este script NÃO altera o login.
   - Este script NÃO remove campos antigos do User.
   - Este script NÃO apaga dados.
   - Ele apenas cria vínculos em UserAccess quando ainda
     não existem.

   Mapeamento:

   User.role SUPER_ADMIN
   → UserAccess SUPER_ADMIN

   User.role ADMINISTRADORA + administratorId
   → UserAccess ADMINISTRADORA

   User.role SINDICO + condominiumId
   → UserAccess SINDICO

   User.role MORADOR + residentId
   → UserAccess MORADOR com resident/unit/condominium
   ========================================================= */



type LegacyUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  administratorId?: string | null;
  condominiumId?: string | null;
  residentId?: string | null;
  isActive: boolean;
  resident?: {
    id: string;
    condominiumId: string;
    unitId: string;
    name: string;
    unit?: {
      id: string;
      block?: string | null;
      unitNumber: string;
    } | null;
    condominium?: {
      id: string;
      name: string;
    } | null;
  } | null;
  administrator?: {
    id: string;
    name: string;
  } | null;
  condominium?: {
    id: string;
    name: string;
  } | null;
};



function buildUnitLabel(unit?: {
  block?: string | null;
  unitNumber: string;
} | null) {
  if (!unit) return null;

  return `${unit.block ? unit.block + " - " : ""}${unit.unitNumber}`;
}



function buildAccessLabel(user: LegacyUser) {
  if (user.role === "SUPER_ADMIN") {
    return "Super Admin";
  }

  if (user.role === "ADMINISTRADORA") {
    return user.administrator?.name
      ? `Administradora - ${user.administrator.name}`
      : "Administradora";
  }

  if (user.role === "SINDICO") {
    return user.condominium?.name
      ? `Síndico - ${user.condominium.name}`
      : "Síndico";
  }

  if (user.role === "MORADOR") {
    const condominiumName = user.resident?.condominium?.name || "Condomínio";
    const unitLabel = buildUnitLabel(user.resident?.unit);

    return unitLabel
      ? `Morador - ${condominiumName} / ${unitLabel}`
      : `Morador - ${condominiumName}`;
  }

  return user.role;
}



async function userAlreadyHasDefaultAccess(userId: string) {
  const existingDefault = await db.userAccess.findFirst({
    where: {
      userId,
      isDefault: true,
    },
    select: {
      id: true,
    },
  });

  return !!existingDefault;
}



async function findExistingAccess({
  userId,
  role,
  administratorId,
  condominiumId,
  unitId,
  residentId,
}: {
  userId: string;
  role: any;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
}) {
  return db.userAccess.findFirst({
    where: {
      userId,
      role,
      administratorId: administratorId || null,
      condominiumId: condominiumId || null,
      unitId: unitId || null,
      residentId: residentId || null,
    },
    select: {
      id: true,
    },
  });
}



async function createAccessIfMissing({
  user,
  role,
  administratorId = null,
  condominiumId = null,
  unitId = null,
  residentId = null,
}: {
  user: LegacyUser;
  role: any;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
}) {
  const existing = await findExistingAccess({
    userId: user.id,
    role,
    administratorId,
    condominiumId,
    unitId,
    residentId,
  });

  if (existing) {
    console.log(
      `SKIP: vínculo já existe | ${user.email} | ${role} | accessId=${existing.id}`
    );

    return {
      created: false,
      skipped: true,
    };
  }

  const alreadyHasDefault = await userAlreadyHasDefaultAccess(user.id);

  const access = await db.userAccess.create({
    data: {
      userId: user.id,
      role,
      administratorId,
      condominiumId,
      unitId,
      residentId,
      label: buildAccessLabel(user),
      isDefault: !alreadyHasDefault,
      isActive: user.isActive,
    },
  });

  console.log(
    `OK: vínculo criado | ${user.email} | ${role} | accessId=${access.id}`
  );

  return {
    created: true,
    skipped: false,
  };
}



async function main() {
  console.log("=====================================================");
  console.log("ETAPA 27.2 - BACKFILL USER ACCESS");
  console.log("=====================================================");



  const users = await db.user.findMany({
    include: {
      administrator: true,
      condominium: true,
      resident: {
        include: {
          unit: true,
          condominium: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(`Usuários encontrados: ${users.length}`);

  let createdCount = 0;
  let skippedCount = 0;
  let warningCount = 0;



  for (const user of users as LegacyUser[]) {
    try {
      if (user.role === "SUPER_ADMIN") {
        const result = await createAccessIfMissing({
          user,
          role: "SUPER_ADMIN",
        });

        if (result.created) createdCount++;
        if (result.skipped) skippedCount++;

        continue;
      }



      if (user.role === "ADMINISTRADORA") {
        if (!user.administratorId) {
          warningCount++;
          console.warn(
            `WARN: usuário ADMINISTRADORA sem administratorId | ${user.email}`
          );

          continue;
        }

        const result = await createAccessIfMissing({
          user,
          role: "ADMINISTRADORA",
          administratorId: user.administratorId,
        });

        if (result.created) createdCount++;
        if (result.skipped) skippedCount++;

        continue;
      }



      if (user.role === "SINDICO") {
        if (!user.condominiumId) {
          warningCount++;
          console.warn(
            `WARN: usuário SINDICO sem condominiumId | ${user.email}`
          );

          continue;
        }

        const result = await createAccessIfMissing({
          user,
          role: "SINDICO",
          condominiumId: user.condominiumId,
        });

        if (result.created) createdCount++;
        if (result.skipped) skippedCount++;

        continue;
      }



      if (user.role === "MORADOR") {
        if (!user.residentId || !user.resident) {
          warningCount++;
          console.warn(
            `WARN: usuário MORADOR sem residentId/resident | ${user.email}`
          );

          continue;
        }

        if (!user.resident.condominiumId || !user.resident.unitId) {
          warningCount++;
          console.warn(
            `WARN: morador com vínculo incompleto | ${user.email} | residentId=${user.residentId}`
          );

          continue;
        }

        const result = await createAccessIfMissing({
          user,
          role: "MORADOR",
          condominiumId: user.resident.condominiumId,
          unitId: user.resident.unitId,
          residentId: user.residentId,
        });

        if (result.created) createdCount++;
        if (result.skipped) skippedCount++;

        continue;
      }



      warningCount++;
      console.warn(`WARN: role não mapeada | ${user.email} | ${user.role}`);
    } catch (error) {
      warningCount++;
      console.error(`ERRO ao processar usuário ${user.email}:`, error);
    }
  }



  console.log("=====================================================");
  console.log("BACKFILL FINALIZADO");
  console.log("=====================================================");
  console.log(`Criados: ${createdCount}`);
  console.log(`Ignorados porque já existiam: ${skippedCount}`);
  console.log(`Alertas/pendências: ${warningCount}`);
  console.log("=====================================================");
}



main()
  .catch((error) => {
    console.error("ERRO GERAL NO BACKFILL USER ACCESS:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });