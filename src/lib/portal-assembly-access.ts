import { AssemblyEligibilityStatus, AssemblyRepresentationStatus, Status } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-guard";
import { canAccessPortal, canViewAssembly } from "@/lib/access-control";
import {
  getActiveUserAccessFromCookies,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { db } from "@/lib/db";

/* =========================================================
   ETAPA 51.8.1 — ACESSO DO PORTAL ÀS ASSEMBLEIAS

   Centraliza:
   - autenticação do usuário;
   - perfil ativo do portal;
   - escopo por condomínio;
   - unidades que a pessoa pode representar diretamente;
   - procurações internas vigentes.
   ========================================================= */

export type PortalAssemblyVotingUnit = {
  eligibleUnitId: string;
  unitId: string;
  block: string | null;
  unitNumber: string;
  votingWeight: string;
  origin: "DIRECT_UNIT_LINK" | "PROXY_REPRESENTATION";
  representationId: string | null;
};

type PortalAssemblyAccessSuccess = {
  authUser: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  activeAccess: ActiveUserAccess;
};

export async function requirePortalAssemblyAccess(): Promise<
  PortalAssemblyAccessSuccess | { error: NextResponse }
> {
  try {
    const authUser = await getAuthUser();

    if (!authUser?.id) {
      return {
        error: NextResponse.json({ error: "Não autorizado." }, { status: 401 }),
      };
    }

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: authUser.id,
    });

    if (!activeAccess) {
      return {
        error: NextResponse.json(
          { error: "Nenhum perfil de acesso ativo foi identificado." },
          { status: 403 },
        ),
      };
    }

    if (!canAccessPortal(activeAccess) || !canViewAssembly(activeAccess)) {
      return {
        error: NextResponse.json(
          { error: "Este perfil não possui acesso às assembleias do portal." },
          { status: 403 },
        ),
      };
    }

    if (!activeAccess.condominiumId) {
      return {
        error: NextResponse.json(
          { error: "O perfil ativo não está vinculado a um condomínio." },
          { status: 403 },
        ),
      };
    }

    return {
      authUser: {
        id: authUser.id,
        name: authUser.name || null,
        email: authUser.email || null,
      },
      activeAccess,
    };
  } catch (error) {
    console.error("Erro ao validar acesso do portal às assembleias:", error);

    return {
      error: NextResponse.json(
        { error: "Não foi possível validar o acesso às assembleias." },
        { status: 500 },
      ),
    };
  }
}

export async function findPortalAssemblyVotingUnits(params: {
  assemblyId: string;
  condominiumId: string;
  userId: string;
  votingStartsAt?: Date | null;
  votingEndsAt?: Date | null;
  now?: Date;
}) {
  const now = params.now || new Date();

  /* =========================================================
     ETAPA 51.8.1.1 — PROCURAÇÕES FUTURAS VISÍVEIS NO PORTAL

     A listagem do portal não deve avaliar a procuração apenas pelo
     relógio atual. Antes da abertura da votação, uma procuração pode
     ter vigência futura e ainda assim já precisa aparecer para o
     representante na assembleia agendada.

     Para consulta no portal, validamos se a procuração cobre a janela
     da votação da assembleia. A validação do instante exato do voto
     continuará sendo feita novamente na API de votação.
     ========================================================= */

  const referenceStart = params.votingStartsAt || now;
  const referenceEnd = params.votingEndsAt || referenceStart;

  const [eligibleUnits, representations] = await Promise.all([
    db.assemblyEligibleUnit.findMany({
      where: {
        assemblyId: params.assemblyId,
        status: AssemblyEligibilityStatus.ELIGIBLE,
        unit: {
          condominiumId: params.condominiumId,
          unitPersonLinks: {
            some: {
              userId: params.userId,
              status: Status.ACTIVE,
              canVote: true,
              AND: [
                {
                  OR: [{ startsAt: null }, { startsAt: { lte: now } }],
                },
                {
                  OR: [{ endsAt: null }, { endsAt: { gte: now } }],
                },
              ],
            },
          },
        },
      },
      select: {
        id: true,
        unitId: true,
        snapshotBlock: true,
        snapshotUnitNumber: true,
        votingWeight: true,
      },
      orderBy: [{ snapshotBlock: "asc" }, { snapshotUnitNumber: "asc" }],
    }),
    db.assemblyRepresentation.findMany({
      where: {
        assemblyId: params.assemblyId,
        representativeUserId: params.userId,
        status: AssemblyRepresentationStatus.ACTIVE,
        AND: [
          {
            OR: [
              { validFrom: null },
              { validFrom: { lte: referenceStart } },
            ],
          },
          {
            OR: [
              { validUntil: null },
              { validUntil: { gte: referenceEnd } },
            ],
          },
        ],
      },
      select: {
        id: true,
        unitId: true,
        unit: {
          select: {
            condominiumId: true,
          },
        },
      },
    }),
  ]);

  const directUnits: PortalAssemblyVotingUnit[] = eligibleUnits.map((item) => ({
    eligibleUnitId: item.id,
    unitId: item.unitId,
    block: item.snapshotBlock || null,
    unitNumber: item.snapshotUnitNumber,
    votingWeight: String(item.votingWeight),
    origin: "DIRECT_UNIT_LINK",
    representationId: null,
  }));

  const proxyUnitIds = representations
    .filter((item) => item.unit.condominiumId === params.condominiumId)
    .map((item) => item.unitId);

  if (proxyUnitIds.length === 0) {
    return directUnits;
  }

  const proxyEligibleUnits = await db.assemblyEligibleUnit.findMany({
    where: {
      assemblyId: params.assemblyId,
      status: AssemblyEligibilityStatus.ELIGIBLE,
      unitId: { in: proxyUnitIds },
    },
    select: {
      id: true,
      unitId: true,
      snapshotBlock: true,
      snapshotUnitNumber: true,
      votingWeight: true,
    },
    orderBy: [{ snapshotBlock: "asc" }, { snapshotUnitNumber: "asc" }],
  });

  const representationByUnitId = new Map(
    representations.map((item) => [item.unitId, item.id]),
  );

  const result = new Map<string, PortalAssemblyVotingUnit>();

  for (const item of directUnits) {
    result.set(item.eligibleUnitId, item);
  }

  for (const item of proxyEligibleUnits) {
    if (result.has(item.id)) continue;

    result.set(item.id, {
      eligibleUnitId: item.id,
      unitId: item.unitId,
      block: item.snapshotBlock || null,
      unitNumber: item.snapshotUnitNumber,
      votingWeight: String(item.votingWeight),
      origin: "PROXY_REPRESENTATION",
      representationId: representationByUnitId.get(item.unitId) || null,
    });
  }

  return Array.from(result.values()).sort((left, right) => {
    const leftLabel = `${left.block || ""}-${left.unitNumber}`;
    const rightLabel = `${right.block || ""}-${right.unitNumber}`;
    return leftLabel.localeCompare(rightLabel, "pt-BR");
  });
}
