import { NextResponse } from "next/server";
import {
  AccessRole,
  AnnouncementStatus,
  AnnouncementTargetScope,
  Status,
  UnitPersonLinkType,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthUser, isAuthError } from "@/lib/auth-guard";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";



/* =========================================================
   ANNOUNCEMENT PORTAL UTILS - ELOGEST

   Arquivo:
   src/lib/announcement-portal-utils.ts

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Objetivo:
   - Centralizar a proteção das APIs do portal de comunicados.
   - Garantir que o usuário só veja comunicados compatíveis com
     o perfil ativo.
   - Isolar administradora, condomínio, unidade, perfil e vínculo.
   - Bloquear leitura quando a administradora estiver inativa ou
     sem o módulo Comunicados liberado.
   ========================================================= */



type AuthUser = {
  id: string;
  role?: string | null;
  name?: string | null;
  email?: string | null;
};



type CookieActiveAccess = {
  id: string;
  userId?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  unitPersonLinkId?: string | null;
  role: AccessRole | string;
  label?: string | null;
  isActive?: boolean;
};



export type PortalAnnouncementAccess = {
  authUser: AuthUser;
  accessId: string;
  administratorId: string;
  condominiumId: string | null;
  unitId: string | null;
  residentId: string | null;
  role: AccessRole;
  linkType: UnitPersonLinkType | null;
  accessLabel: string | null;
  administrator: {
    id: string;
    name: string;
    status: Status | string;
  };
};



export type PortalAnnouncementAccessResult =
  | PortalAnnouncementAccess
  | {
      error: NextResponse;
    };



/* =========================================================
   RESPOSTAS PADRÃO
   ========================================================= */

function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: "Usuário não autenticado.",
    },
    {
      status: 401,
    }
  );
}



function forbiddenResponse(message = "Acesso não permitido.") {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 403,
    }
  );
}



function inactiveAdministratorResponse() {
  return NextResponse.json(
    {
      error:
        "A administradora responsável por este perfil está inativa. O acesso aos comunicados foi bloqueado.",
      code: "ADMINISTRATOR_INACTIVE",
    },
    {
      status: 403,
    }
  );
}



function moduleNotAvailableResponse() {
  return NextResponse.json(
    {
      error: "O módulo Comunicados não está liberado para o plano atual da administradora.",
      code: "MODULE_NOT_AVAILABLE",
    },
    {
      status: 403,
    }
  );
}



/* =========================================================
   HELPERS DE PLANO/MÓDULO

   Observação:
   A regra é equivalente à validação administrativa da Etapa 47,
   mas aqui não usamos o guard admin porque o portal aceita perfis
   SINDICO, MORADOR, PROPRIETARIO e CONSELHEIRO.
   ========================================================= */

function isDateWindowActive({
  startsAt,
  expiresAt,
  now,
}: {
  startsAt?: Date | null;
  expiresAt?: Date | null;
  now: Date;
}) {
  if (startsAt && startsAt > now) {
    return false;
  }

  if (expiresAt && expiresAt < now) {
    return false;
  }

  return true;
}



async function administratorHasAnnouncementsModule(administratorId: string) {
  const now = new Date();

  const administrator = await db.administrator.findUnique({
    where: {
      id: administratorId,
    },
    select: {
      id: true,
      plan: {
        select: {
          id: true,
          status: true,
          modules: {
            where: {
              enabled: true,
              module: {
                slug: "comunicados",
                status: "ACTIVE",
              },
            },
            select: {
              id: true,
              enabled: true,
              module: {
                select: {
                  id: true,
                  slug: true,
                  status: true,
                },
              },
            },
          },
        },
      },
      moduleOverrides: {
        where: {
          module: {
            slug: "comunicados",
            status: "ACTIVE",
          },
        },
        select: {
          id: true,
          enabled: true,
          startsAt: true,
          expiresAt: true,
          module: {
            select: {
              id: true,
              slug: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!administrator) {
    return false;
  }

  const activeOverride = administrator.moduleOverrides.find((override) =>
    isDateWindowActive({
      startsAt: override.startsAt,
      expiresAt: override.expiresAt,
      now,
    })
  );

  if (activeOverride) {
    return activeOverride.enabled === true;
  }

  return (
    administrator.plan?.status === "ACTIVE" &&
    administrator.plan.modules.some(
      (planModule) =>
        planModule.enabled === true &&
        planModule.module.slug === "comunicados" &&
        planModule.module.status === "ACTIVE"
    )
  );
}



/* =========================================================
   GUARD DO PORTAL PARA COMUNICADOS
   ========================================================= */

function isPortalRole(role: string | null | undefined) {
  if (!role) {
    return false;
  }

  const portalRoles: string[] = [
    AccessRole.SINDICO,
    AccessRole.MORADOR,
    AccessRole.PROPRIETARIO,
    AccessRole.CONSELHEIRO,
  ];

  return portalRoles.includes(role);
}



export async function requirePortalAnnouncementAccess(): Promise<PortalAnnouncementAccessResult> {
  try {
    const authUser = (await getAuthUser()) as AuthUser;

    const cookieAccess = (await getActiveUserAccessFromCookies({
      userId: authUser.id,
    })) as CookieActiveAccess | null;

    if (!cookieAccess) {
      return {
        error: forbiddenResponse("Não foi possível identificar o perfil ativo."),
      };
    }

    if (!isPortalRole(String(cookieAccess.role))) {
      return {
        error: forbiddenResponse("Acesso restrito ao portal do usuário."),
      };
    }

    const userAccess = await db.userAccess.findFirst({
      where: {
        id: cookieAccess.id,
        userId: authUser.id,
        isActive: true,
      },
      select: {
        id: true,
        administratorId: true,
        condominiumId: true,
        unitId: true,
        residentId: true,
        role: true,
        label: true,
        unitPersonLink: {
          select: {
            id: true,
            linkType: true,
            status: true,
            receivesNotifications: true,
          },
        },
        administrator: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        condominium: {
          select: {
            id: true,
            administratorId: true,
            administrator: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!userAccess) {
      return {
        error: forbiddenResponse("Perfil ativo não encontrado ou inativo."),
      };
    }

    if (!isPortalRole(userAccess.role)) {
      return {
        error: forbiddenResponse("Acesso restrito ao portal do usuário."),
      };
    }

    const administrator = userAccess.administrator || userAccess.condominium?.administrator || null;
    const administratorId = userAccess.administratorId || userAccess.condominium?.administratorId || null;

    if (!administrator || !administratorId) {
      return {
        error: forbiddenResponse("Perfil ativo sem administradora vinculada."),
      };
    }

    if (administrator.status !== Status.ACTIVE) {
      return {
        error: inactiveAdministratorResponse(),
      };
    }

    const hasModule = await administratorHasAnnouncementsModule(administratorId);

    if (!hasModule) {
      return {
        error: moduleNotAvailableResponse(),
      };
    }

    return {
      authUser,
      accessId: userAccess.id,
      administratorId,
      condominiumId: userAccess.condominiumId,
      unitId: userAccess.unitId,
      residentId: userAccess.residentId,
      role: userAccess.role,
      linkType:
        userAccess.unitPersonLink?.status === Status.ACTIVE &&
        userAccess.unitPersonLink.receivesNotifications === true
          ? userAccess.unitPersonLink.linkType
          : null,
      accessLabel: userAccess.label,
      administrator: {
        id: administrator.id,
        name: administrator.name,
        status: administrator.status,
      },
    };
  } catch (error) {
    if (isAuthError(error)) {
      return {
        error: unauthorizedResponse(),
      };
    }

    console.error("Erro ao validar acesso aos comunicados do portal:", error);

    return {
      error: NextResponse.json(
        {
          error: "Não foi possível validar o acesso aos comunicados.",
        },
        {
          status: 500,
        }
      ),
    };
  }
}



/* =========================================================
   WHERE DE VISIBILIDADE DO PORTAL

   Regra:
   - Comunicado precisa estar publicado.
   - Comunicado precisa pertencer à administradora do perfil ativo.
   - Comunicado precisa estar dentro da janela de publicação.
   - O público-alvo precisa bater com o perfil ativo.
   ========================================================= */

export function buildPortalAnnouncementWhere(
  access: PortalAnnouncementAccess
): Prisma.AnnouncementWhereInput {
  const now = new Date();

  const visibilityOr: Prisma.AnnouncementWhereInput[] = [
    {
      targetScope: AnnouncementTargetScope.ALL_ADMINISTRATOR,
    },
    {
      targetScope: AnnouncementTargetScope.ROLE,
      targets: {
        some: {
          role: access.role,
        },
      },
    },
  ];

  if (access.condominiumId) {
    visibilityOr.push(
      {
        targetScope: AnnouncementTargetScope.CONDOMINIUM,
        condominiumId: access.condominiumId,
      },
      {
        targetScope: AnnouncementTargetScope.CONDOMINIUM,
        targets: {
          some: {
            condominiumId: access.condominiumId,
          },
        },
      }
    );
  }

  if (access.unitId) {
    visibilityOr.push({
      targetScope: AnnouncementTargetScope.UNIT,
      targets: {
        some: {
          unitId: access.unitId,
        },
      },
    });
  }

  if (access.linkType) {
    visibilityOr.push({
      targetScope: AnnouncementTargetScope.LINK_TYPE,
      targets: {
        some: {
          linkType: access.linkType,
        },
      },
    });
  }

  const customTargetOr: Prisma.AnnouncementTargetWhereInput[] = [
    {
      role: access.role,
    },
  ];

  if (access.condominiumId) {
    customTargetOr.push({
      condominiumId: access.condominiumId,
    });
  }

  if (access.unitId) {
    customTargetOr.push({
      unitId: access.unitId,
    });
  }

  if (access.linkType) {
    customTargetOr.push({
      linkType: access.linkType,
    });
  }

  visibilityOr.push({
    targetScope: AnnouncementTargetScope.CUSTOM,
    targets: {
      some: {
        OR: customTargetOr,
      },
    },
  });

  return {
    administratorId: access.administratorId,
    status: AnnouncementStatus.PUBLISHED,
    AND: [
      {
        OR: [
          {
            publishedAt: null,
          },
          {
            publishedAt: {
              lte: now,
            },
          },
        ],
      },
      {
        OR: [
          {
            expiresAt: null,
          },
          {
            expiresAt: {
              gt: now,
            },
          },
        ],
      },
      {
        OR: visibilityOr,
      },
    ],
  };
}



export function buildPortalAnnouncementDetailWhere({
  access,
  announcementId,
}: {
  access: PortalAnnouncementAccess;
  announcementId: string;
}): Prisma.AnnouncementWhereInput {
  return {
    id: announcementId,
    ...buildPortalAnnouncementWhere(access),
  };
}



export function normalizeSearchParam(value: string | null) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}



export function formatAnnouncementForPortalList({
  announcement,
  accessId,
}: {
  announcement: {
    id: string;
    title: string;
    content: string;
    type: string;
    priority: string;
    targetScope: string;
    publishedAt: Date | null;
    eventDate: Date | null;
    eventStartAt: Date | null;
    eventEndAt: Date | null;
    expiresAt: Date | null;
    requireReadingConfirmation: boolean;
    condominium: {
      id: string;
      name: string;
    } | null;
    readings: {
      id: string;
      accessId: string;
      readAt: Date;
    }[];
    createdAt: Date;
    updatedAt: Date;
  };
  accessId: string;
}) {
  const reading = announcement.readings.find((item) => item.accessId === accessId) || null;
  const plainContent = announcement.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  return {
    id: announcement.id,
    title: announcement.title,
    excerpt: plainContent.length > 180 ? `${plainContent.slice(0, 180)}...` : plainContent,
    type: announcement.type,
    priority: announcement.priority,
    targetScope: announcement.targetScope,
    condominium: announcement.condominium,
    publishedAt: announcement.publishedAt,
    eventDate: announcement.eventDate,
    eventStartAt: announcement.eventStartAt,
    eventEndAt: announcement.eventEndAt,
    expiresAt: announcement.expiresAt,
    requireReadingConfirmation: announcement.requireReadingConfirmation,
    isRead: Boolean(reading),
    readAt: reading?.readAt || null,
    createdAt: announcement.createdAt,
    updatedAt: announcement.updatedAt,
  };
}
