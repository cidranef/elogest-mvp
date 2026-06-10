import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  AssemblyEligibilityStatus,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - CANDIDATOS PARA PROCURAÇÃO

   Arquivo:
   src/app/api/admin/assembleias/[id]/procuracoes/candidatos/route.ts

   ELOGEST — ETAPA 51.5.1

   Objetivo:
   - Listar concedentes somente da unidade selecionada.
   - Pesquisar representantes internos por nome ou e-mail.
   - Evitar carregar uma lista extensa de usuários no modal.
   - Permitir representante cadastrado sem exigir vínculo prévio
     com o condomínio; a procuração é o direito específico.
   ========================================================= */

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function normalizeNullableString(value: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const eligibleUnitId = normalizeNullableString(
      searchParams.get("eligibleUnitId"),
    );
    const query = normalizeNullableString(searchParams.get("q"));
    const selectedRepresentativeUserId = normalizeNullableString(
      searchParams.get("selectedRepresentativeUserId"),
    );

    const assembly = await db.assembly.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
        condominiumId: true,
      },
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    const eligibleUnit = eligibleUnitId
      ? await db.assemblyEligibleUnit.findFirst({
          where: {
            id: eligibleUnitId,
            assemblyId: assembly.id,
            status: AssemblyEligibilityStatus.ELIGIBLE,
          },
          select: {
            id: true,
            unitId: true,
          },
        })
      : null;

    const grantors = eligibleUnit
      ? await db.user.findMany({
          where: {
            isActive: true,
            OR: [
              {
                // ETAPA 51.5.2 — vínculo formal já normalizado.
                unitPersonLinks: {
                  some: {
                    condominiumId: assembly.condominiumId,
                    unitId: eligibleUnit.unitId,
                    status: Status.ACTIVE,
                    canVote: true,
                  },
                },
              },
              {
                // ETAPA 51.5.2 — compatibilidade com cadastros anteriores.
                // Alguns usuários já possuem perfil PROPRIETARIO ativo na
                // unidade, mas ainda não têm UnitPersonLink.userId preenchido.
                accesses: {
                  some: {
                    condominiumId: assembly.condominiumId,
                    unitId: eligibleUnit.unitId,
                    isActive: true,
                    role: AccessRole.PROPRIETARIO,
                  },
                },
              },
            ],
          },
          orderBy: {
            name: "asc",
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        })
      : [];

    const shouldSearchRepresentatives = Boolean(query && query.length >= 2);

    const representatives = shouldSearchRepresentatives || selectedRepresentativeUserId
      ? await db.user.findMany({
          where: {
            isActive: true,
            OR: [
              ...(shouldSearchRepresentatives && query
                ? [
                    {
                      name: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      email: {
                        contains: query,
                        mode: "insensitive" as const,
                      },
                    },
                  ]
                : []),
              ...(selectedRepresentativeUserId
                ? [
                    {
                      id: selectedRepresentativeUserId,
                    },
                  ]
                : []),
            ],
          },
          orderBy: {
            name: "asc",
          },
          take: 20,
          select: {
            id: true,
            name: true,
            email: true,
            accesses: {
              where: {
                isActive: true,
              },
              orderBy: [
                {
                  condominiumId: "asc",
                },
                {
                  label: "asc",
                },
              ],
              select: {
                id: true,
                role: true,
                label: true,
                condominiumId: true,
                unitId: true,
              },
            },
          },
        })
      : [];

    return NextResponse.json({
      grantors,
      representatives,
      minimumRepresentativeQueryLength: 2,
    });
  } catch (error) {
    console.error("Erro ao pesquisar candidatos para procuração:", error);
    return NextResponse.json(
      { error: "Não foi possível pesquisar os candidatos para procuração." },
      { status: 500 },
    );
  }
}
