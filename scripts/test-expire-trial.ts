import { AdministratorPlanStatus } from "@prisma/client";
import { db } from "../src/lib/db";

async function main() {
  const administrator = await db.administrator.findFirst({
    where: {
      planStatus: AdministratorPlanStatus.TRIALING,
    },
    select: {
      id: true,
      name: true,
      planExpiresAt: true,
    },
  });

  if (!administrator) {
    throw new Error("Nenhuma administradora em trial foi encontrada.");
  }

  const expiredAt = new Date();
  expiredAt.setDate(expiredAt.getDate() - 1);

  const updated = await db.administrator.update({
    where: {
      id: administrator.id,
    },
    data: {
      planStatus: AdministratorPlanStatus.TRIALING,
      planExpiresAt: expiredAt,
    },
    select: {
      id: true,
      name: true,
      planStatus: true,
      planExpiresAt: true,
    },
  });

  console.log("Trial preparado para expiração:", updated);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });