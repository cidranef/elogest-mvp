import {
  AccessRole,
  Status,
  UnitPersonLinkType,
  type Prisma,
} from "@prisma/client";
import { db } from "../src/lib/db";

/* =========================================================
   ELOGEST — ETAPA 51.5.3
   NORMALIZAÇÃO SEGURA DE VÍNCULOS FORMAIS DE MORADORES

   Execução padrão:
   - somente diagnóstico;
   - não altera banco.

   Aplicação:
   npx tsx scripts/normalizar-vinculos-moradores-etapa51.ts --apply

   Regra conservadora:
   - PROPRIETARIO -> OWNER + canVote true;
   - INQUILINO -> TENANT + canVote false;
   - FAMILIAR -> DEPENDENT + canVote false;
   - RESPONSAVEL -> RESIDENT + canVote false;
   - OUTRO -> AUTHORIZED + canVote false.

   O script NÃO promove "Responsável" para proprietário.
   ========================================================= */

const APPLY_CHANGES = process.argv.includes("--apply");

function residentTypeToLinkType(residentType?: string | null): UnitPersonLinkType {
  if (residentType === "PROPRIETARIO") return UnitPersonLinkType.OWNER;
  if (residentType === "INQUILINO") return UnitPersonLinkType.TENANT;
  if (residentType === "FAMILIAR") return UnitPersonLinkType.DEPENDENT;
  if (residentType === "OUTRO") return UnitPersonLinkType.AUTHORIZED;

  return UnitPersonLinkType.RESIDENT;
}

function buildAccessLabel({
  linkType,
  condominiumName,
  block,
  unitNumber,
}: {
  linkType: UnitPersonLinkType;
  condominiumName: string;
  block?: string | null;
  unitNumber: string;
}) {
  const roleLabel =
    linkType === UnitPersonLinkType.OWNER ? "Proprietário" : "Morador";

  return `${roleLabel} - ${condominiumName} / ${
    block ? `Bloco ${block} - ` : ""
  }Unidade ${unitNumber}`;
}

async function syncResident(
  tx: Prisma.TransactionClient,
  resident: Awaited<ReturnType<typeof loadResidents>>[number]
) {
  const linkType = residentTypeToLinkType(resident.residentType);
  const canVote = linkType === UnitPersonLinkType.OWNER;
  const legacyUserId = resident.user?.id || null;

  const currentLink = await tx.unitPersonLink.findFirst({
    where: {
      residentId: resident.id,
    },
    orderBy: [
      {
        isPrimary: "desc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  const formalLink = currentLink
    ? await tx.unitPersonLink.update({
        where: {
          id: currentLink.id,
        },
        data: {
          userId: legacyUserId,
          condominiumId: resident.condominiumId,
          unitId: resident.unitId,
          linkType,
          isPrimary: true,
          canVote,
          canOpenTickets: true,
          receivesNotifications: true,
          status: resident.status,
          metadata: {
            source: "ETAPA51_SAFE_BACKFILL",
            syncedAt: new Date().toISOString(),
          },
        },
      })
    : await tx.unitPersonLink.create({
        data: {
          userId: legacyUserId,
          residentId: resident.id,
          condominiumId: resident.condominiumId,
          unitId: resident.unitId,
          linkType,
          isPrimary: true,
          canVote,
          canOpenTickets: true,
          receivesNotifications: true,
          status: resident.status,
          metadata: {
            source: "ETAPA51_SAFE_BACKFILL",
            syncedAt: new Date().toISOString(),
          },
        },
      });

  await tx.unitPersonLink.updateMany({
    where: {
      residentId: resident.id,
      id: {
        not: formalLink.id,
      },
    },
    data: {
      status: Status.INACTIVE,
      isPrimary: false,
    },
  });

  if (!legacyUserId) {
    return;
  }

  const accessRole =
    linkType === UnitPersonLinkType.OWNER
      ? AccessRole.PROPRIETARIO
      : AccessRole.MORADOR;

  const existingAccess = await tx.userAccess.findFirst({
    where: {
      userId: legacyUserId,
      residentId: resident.id,
      role: {
        in: [AccessRole.MORADOR, AccessRole.PROPRIETARIO],
      },
    },
    orderBy: [
      {
        isDefault: "desc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  const accessData = {
    administratorId: resident.condominium.administratorId,
    condominiumId: resident.condominiumId,
    unitId: resident.unitId,
    residentId: resident.id,
    unitPersonLinkId: formalLink.id,
    role: accessRole,
    label: buildAccessLabel({
      linkType,
      condominiumName: resident.condominium.name,
      block: resident.unit.block,
      unitNumber: resident.unit.unitNumber,
    }),
    isActive: resident.status === Status.ACTIVE && resident.user?.isActive === true,
  };

  const access = existingAccess
    ? await tx.userAccess.update({
        where: {
          id: existingAccess.id,
        },
        data: accessData,
      })
    : await tx.userAccess.create({
        data: {
          userId: legacyUserId,
          ...accessData,
          isDefault: false,
        },
      });

  await tx.userAccess.updateMany({
    where: {
      userId: legacyUserId,
      residentId: resident.id,
      role: {
        in: [AccessRole.MORADOR, AccessRole.PROPRIETARIO],
      },
      id: {
        not: access.id,
      },
    },
    data: {
      isActive: false,
      isDefault: false,
    },
  });
}

async function loadResidents() {
  return db.resident.findMany({
    orderBy: [
      {
        condominium: {
          name: "asc",
        },
      },
      {
        unit: {
          unitNumber: "asc",
        },
      },
      {
        name: "asc",
      },
    ],
    include: {
      condominium: {
        select: {
          id: true,
          name: true,
          administratorId: true,
        },
      },
      unit: {
        select: {
          id: true,
          block: true,
          unitNumber: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          isActive: true,
        },
      },
      unitPersonLinks: {
        orderBy: [
          {
            isPrimary: "desc",
          },
          {
            createdAt: "asc",
          },
        ],
        take: 1,
      },
    },
  });
}

async function main() {
  const residents = await loadResidents();

  console.log("");
  console.log("EloGest — Diagnóstico De Vínculos Formais");
  console.log(`Modo: ${APPLY_CHANGES ? "APLICAÇÃO" : "SOMENTE LEITURA"}`);
  console.log(`Moradores analisados: ${residents.length}`);
  console.log("");

  let alreadyNormalized = 0;
  let pendingNormalization = 0;
  let owners = 0;
  let residentsWithoutUser = 0;

  for (const resident of residents) {
    const expectedLinkType = residentTypeToLinkType(resident.residentType);
    const expectedCanVote = expectedLinkType === UnitPersonLinkType.OWNER;
    const current = resident.unitPersonLinks[0] || null;

    const normalized =
      current?.condominiumId === resident.condominiumId &&
      current?.unitId === resident.unitId &&
      current?.linkType === expectedLinkType &&
      current?.canVote === expectedCanVote &&
      current?.userId === (resident.user?.id || null);

    if (expectedCanVote) owners += 1;
    if (!resident.user) residentsWithoutUser += 1;

    if (normalized) {
      alreadyNormalized += 1;
      continue;
    }

    pendingNormalization += 1;

    console.log(
      [
        resident.condominium.name,
        resident.unit.block ? `Bloco ${resident.unit.block}` : null,
        `Unidade ${resident.unit.unitNumber}`,
        resident.name,
        resident.residentType || "SEM CLASSIFICAÇÃO",
        `=> ${expectedLinkType}`,
        expectedCanVote ? "VOTA" : "NÃO VOTA",
        resident.user?.email || "SEM USUÁRIO",
      ]
        .filter(Boolean)
        .join(" | ")
    );

    if (APPLY_CHANGES) {
      await db.$transaction(async (tx) => {
        await syncResident(tx, resident);
      });
    }
  }

  console.log("");
  console.log("Resumo");
  console.log(`Já normalizados: ${alreadyNormalized}`);
  console.log(`Pendentes: ${pendingNormalization}`);
  console.log(`Proprietários confirmados pelo cadastro legado: ${owners}`);
  console.log(`Cadastros sem usuário de portal: ${residentsWithoutUser}`);

  if (!APPLY_CHANGES) {
    console.log("");
    console.log(
      "Nenhuma alteração foi realizada. Revise a lista e execute novamente com --apply quando estiver seguro."
    );
  } else {
    console.log("");
    console.log("Normalização concluída.");
  }
}

main()
  .catch((error: unknown) => {
    console.error("Falha ao normalizar vínculos:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
