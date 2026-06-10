import {
  AccessRole,
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementTargetScope,
  AnnouncementType,
  NotificationChannel,
  NotificationStatus,
  Status,
  UnitPersonLinkType,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";



/* =========================================================
   ANNOUNCEMENT ADMIN UTILS - ELOGEST

   Arquivo:
   src/lib/announcement-admin-utils.ts

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Objetivo:
   - Centralizar validações e normalizações usadas pelas APIs
     administrativas de comunicados.
   - Evitar duplicação de regra entre criação, edição, publicação
     e leitura de comunicados.
   - Manter isolamento por administradora e escopo condominial.
   ========================================================= */



export type AnnouncementTargetInput = {
  condominiumId?: string | null;
  unitId?: string | null;
  block?: string | null;
  role?: AccessRole | null;
  linkType?: UnitPersonLinkType | null;
};



export type AnnouncementTargetCreateInput = {
  condominiumId?: string | null;
  unitId?: string | null;
  block?: string | null;
  role?: AccessRole | null;
  linkType?: UnitPersonLinkType | null;
};



export type AnnouncementValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      message: string;
      status?: number;
    };



export function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}



export function normalizeRequiredString(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}



export function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}



export function parseDateOrNull(value: unknown): AnnouncementValidationResult<Date | null> {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true,
      value: null,
    };
  }

  if (typeof value !== "string" && !(value instanceof Date)) {
    return {
      ok: false,
      message: "Data inválida.",
      status: 400,
    };
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      message: "Data inválida.",
      status: 400,
    };
  }

  return {
    ok: true,
    value: date,
  };
}



export function parseEnumValue<T extends Record<string, string>>({
  enumObject,
  value,
  fallback,
  fieldLabel,
}: {
  enumObject: T;
  value: unknown;
  fallback: T[keyof T];
  fieldLabel: string;
}): AnnouncementValidationResult<T[keyof T]> {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true,
      value: fallback,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      message: `${fieldLabel} inválido.`,
      status: 400,
    };
  }

  const enumValues = Object.values(enumObject) as string[];

  if (!enumValues.includes(value)) {
    return {
      ok: false,
      message: `${fieldLabel} inválido.`,
      status: 400,
    };
  }

  return {
    ok: true,
    value: value as T[keyof T],
  };
}



export function parseAnnouncementType(value: unknown) {
  return parseEnumValue({
    enumObject: AnnouncementType,
    value,
    fallback: AnnouncementType.GENERAL,
    fieldLabel: "Tipo do comunicado",
  });
}



export function parseAnnouncementPriority(value: unknown) {
  return parseEnumValue({
    enumObject: AnnouncementPriority,
    value,
    fallback: AnnouncementPriority.NORMAL,
    fieldLabel: "Prioridade do comunicado",
  });
}



export function parseAnnouncementTargetScope(value: unknown) {
  return parseEnumValue({
    enumObject: AnnouncementTargetScope,
    value,
    fallback: AnnouncementTargetScope.CONDOMINIUM,
    fieldLabel: "Público-alvo do comunicado",
  });
}



export function parseAnnouncementStatusForDraftFlow(value: unknown) {
  return parseEnumValue({
    enumObject: AnnouncementStatus,
    value,
    fallback: AnnouncementStatus.DRAFT,
    fieldLabel: "Status do comunicado",
  });
}



export function parseAccessRoleOrNull(value: unknown): AnnouncementValidationResult<AccessRole | null> {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true,
      value: null,
    };
  }

  return parseEnumValue({
    enumObject: AccessRole,
    value,
    fallback: AccessRole.MORADOR,
    fieldLabel: "Perfil de acesso",
  });
}



export function parseUnitPersonLinkTypeOrNull(
  value: unknown
): AnnouncementValidationResult<UnitPersonLinkType | null> {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true,
      value: null,
    };
  }

  return parseEnumValue({
    enumObject: UnitPersonLinkType,
    value,
    fallback: UnitPersonLinkType.RESIDENT,
    fieldLabel: "Tipo de vínculo",
  });
}



export async function assertCondominiumBelongsToAdministrator({
  administratorId,
  condominiumId,
}: {
  administratorId: string;
  condominiumId: string;
}) {
  const condominium = await db.condominium.findFirst({
    where: {
      id: condominiumId,
      administratorId,
    },
    select: {
      id: true,
      name: true,
      administratorId: true,
    },
  });

  if (!condominium) {
    return {
      ok: false as const,
      message: "Condomínio não encontrado nesta administradora.",
      status: 404,
    };
  }

  return {
    ok: true as const,
    value: condominium,
  };
}



export async function assertUnitBelongsToAdministrator({
  administratorId,
  unitId,
  condominiumId,
}: {
  administratorId: string;
  unitId: string;
  condominiumId?: string | null;
}) {
  const unit = await db.unit.findFirst({
    where: {
      id: unitId,
      condominium: {
        administratorId,
        ...(condominiumId
          ? {
              id: condominiumId,
            }
          : {}),
      },
    },
    select: {
      id: true,
      unitNumber: true,
      block: true,
      condominiumId: true,
      condominium: {
        select: {
          id: true,
          name: true,
          administratorId: true,
        },
      },
    },
  });

  if (!unit) {
    return {
      ok: false as const,
      message: "Unidade não encontrada nesta administradora.",
      status: 404,
    };
  }

  return {
    ok: true as const,
    value: unit,
  };
}





export async function assertBlockBelongsToCondominium({
  administratorId,
  condominiumId,
  block,
}: {
  administratorId: string;
  condominiumId: string;
  block: string;
}) {
  const unit = await db.unit.findFirst({
    where: {
      condominiumId,
      block,
      status: Status.ACTIVE,
      condominium: {
        administratorId,
      },
    },
    select: {
      id: true,
      block: true,
      condominiumId: true,
    },
  });

  if (!unit) {
    return {
      ok: false as const,
      message: "Bloco não encontrado neste condomínio ou sem unidades ativas.",
      status: 404,
    };
  }

  return {
    ok: true as const,
    value: {
      condominiumId: unit.condominiumId,
      block: unit.block || block,
    },
  };
}

export async function buildAnnouncementTargets({
  administratorId,
  targetScope,
  condominiumId,
  unitId,
  block,
  role,
  linkType,
  customTargets,
}: {
  administratorId: string;
  targetScope: AnnouncementTargetScope;
  condominiumId?: string | null;
  unitId?: string | null;
  block?: string | null;
  role?: AccessRole | null;
  linkType?: UnitPersonLinkType | null;
  customTargets?: AnnouncementTargetInput[] | null;
}): Promise<AnnouncementValidationResult<AnnouncementTargetCreateInput[]>> {
  if (targetScope === AnnouncementTargetScope.ALL_ADMINISTRATOR) {
    return {
      ok: true,
      value: [],
    };
  }

  if (targetScope === AnnouncementTargetScope.CONDOMINIUM) {
    if (!condominiumId) {
      return {
        ok: false,
        message: "Selecione um condomínio para publicar o comunicado.",
        status: 400,
      };
    }

    const condominiumValidation = await assertCondominiumBelongsToAdministrator({
      administratorId,
      condominiumId,
    });

    if (!condominiumValidation.ok) {
      return condominiumValidation;
    }

    return {
      ok: true,
      value: [
        {
          condominiumId,
          unitId: null,
          block: null,
          role: null,
          linkType: null,
        },
      ],
    };
  }


  if (targetScope === AnnouncementTargetScope.BLOCK) {
    if (!condominiumId) {
      return {
        ok: false,
        message: "Selecione um condomínio para publicar por bloco.",
        status: 400,
      };
    }

    const normalizedBlock = normalizeNullableString(block);

    if (!normalizedBlock) {
      return {
        ok: false,
        message: "Informe o bloco para publicar o comunicado.",
        status: 400,
      };
    }

    const blockValidation = await assertBlockBelongsToCondominium({
      administratorId,
      condominiumId,
      block: normalizedBlock,
    });

    if (!blockValidation.ok) {
      return blockValidation;
    }

    return {
      ok: true,
      value: [
        {
          condominiumId: blockValidation.value.condominiumId,
          unitId: null,
          block: blockValidation.value.block,
          role: null,
          linkType: null,
        },
      ],
    };
  }

  if (targetScope === AnnouncementTargetScope.UNIT) {
    if (!unitId) {
      return {
        ok: false,
        message: "Selecione uma unidade para publicar o comunicado.",
        status: 400,
      };
    }

    const unitValidation = await assertUnitBelongsToAdministrator({
      administratorId,
      unitId,
      condominiumId,
    });

    if (!unitValidation.ok) {
      return unitValidation;
    }

    return {
      ok: true,
      value: [
        {
          condominiumId: unitValidation.value.condominiumId,
          unitId,
          block: null,
          role: null,
          linkType: null,
        },
      ],
    };
  }

  if (targetScope === AnnouncementTargetScope.ROLE) {
    if (!role) {
      return {
        ok: false,
        message: "Selecione um perfil para publicar o comunicado.",
        status: 400,
      };
    }

    if (condominiumId) {
      const condominiumValidation = await assertCondominiumBelongsToAdministrator({
        administratorId,
        condominiumId,
      });

      if (!condominiumValidation.ok) {
        return condominiumValidation;
      }
    }

    return {
      ok: true,
      value: [
        {
          condominiumId: condominiumId ?? null,
          unitId: null,
          block: null,
          role,
          linkType: null,
        },
      ],
    };
  }

  if (targetScope === AnnouncementTargetScope.LINK_TYPE) {
    if (!linkType) {
      return {
        ok: false,
        message: "Selecione um tipo de vínculo para publicar o comunicado.",
        status: 400,
      };
    }

    if (condominiumId) {
      const condominiumValidation = await assertCondominiumBelongsToAdministrator({
        administratorId,
        condominiumId,
      });

      if (!condominiumValidation.ok) {
        return condominiumValidation;
      }
    }

    return {
      ok: true,
      value: [
        {
          condominiumId: condominiumId ?? null,
          unitId: null,
          block: null,
          role: null,
          linkType,
        },
      ],
    };
  }

  if (targetScope === AnnouncementTargetScope.CUSTOM) {
    if (!Array.isArray(customTargets) || customTargets.length === 0) {
      return {
        ok: false,
        message: "Informe pelo menos um público-alvo personalizado.",
        status: 400,
      };
    }

    const normalizedTargets: AnnouncementTargetCreateInput[] = [];

    for (const target of customTargets) {
      const targetCondominiumId = normalizeNullableString(target.condominiumId);
      const targetUnitId = normalizeNullableString(target.unitId);
      const targetBlock = normalizeNullableString(target.block);
      const targetRole = target.role ?? null;
      const targetLinkType = target.linkType ?? null;

      if (targetUnitId) {
        const unitValidation = await assertUnitBelongsToAdministrator({
          administratorId,
          unitId: targetUnitId,
          condominiumId: targetCondominiumId,
        });

        if (!unitValidation.ok) {
          return unitValidation;
        }

        normalizedTargets.push({
          condominiumId: unitValidation.value.condominiumId,
          unitId: targetUnitId,
          block: null,
          role: targetRole,
          linkType: targetLinkType,
        });

        continue;
      }


      if (targetBlock) {
        if (!targetCondominiumId) {
          return {
            ok: false,
            message: "Informe o condomínio para usar bloco no público personalizado.",
            status: 400,
          };
        }

        const blockValidation = await assertBlockBelongsToCondominium({
          administratorId,
          condominiumId: targetCondominiumId,
          block: targetBlock,
        });

        if (!blockValidation.ok) {
          return blockValidation;
        }

        normalizedTargets.push({
          condominiumId: blockValidation.value.condominiumId,
          unitId: null,
          block: blockValidation.value.block,
          role: targetRole,
          linkType: targetLinkType,
        });

        continue;
      }

      if (targetCondominiumId) {
        const condominiumValidation = await assertCondominiumBelongsToAdministrator({
          administratorId,
          condominiumId: targetCondominiumId,
        });

        if (!condominiumValidation.ok) {
          return condominiumValidation;
        }
      }

      normalizedTargets.push({
        condominiumId: targetCondominiumId,
        unitId: null,
        block: null,
        role: targetRole,
        linkType: targetLinkType,
      });
    }

    return {
      ok: true,
      value: normalizedTargets,
    };
  }

  return {
    ok: false,
    message: "Público-alvo inválido.",
    status: 400,
  };
}



export async function getAnnouncementForAdministrator({
  administratorId,
  announcementId,
}: {
  administratorId: string;
  announcementId: string;
}) {
  return db.announcement.findFirst({
    where: {
      id: announcementId,
      administratorId,
    },
    include: {
      condominium: {
        select: {
          id: true,
          name: true,
        },
      },
      createdByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      targets: {
        include: {
          condominium: {
            select: {
              id: true,
              name: true,
            },
          },
          unit: {
            select: {
              id: true,
              block: true,
              unitNumber: true,
              condominiumId: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      _count: {
        select: {
          readings: true,
          targets: true,
        },
      },
    },
  });
}



export function canEditAnnouncement(status: AnnouncementStatus) {
  return status === AnnouncementStatus.DRAFT || status === AnnouncementStatus.SCHEDULED;
}



export function canDeleteAnnouncement(status: AnnouncementStatus) {
  return status === AnnouncementStatus.DRAFT || status === AnnouncementStatus.SCHEDULED;
}




/* =========================================================
   NOTIFICAÇÕES INTERNAS DE COMUNICADOS

   Quando um comunicado é publicado imediatamente, criamos uma
   notificação SYSTEM para cada perfil ativo alcançado pelo
   público-alvo do comunicado. A confirmação de leitura continua
   independente, feita somente quando o usuário abre e confirma
   no portal.
   ========================================================= */

const PORTAL_ANNOUNCEMENT_ROLES = [
  AccessRole.SINDICO,
  AccessRole.MORADOR,
  AccessRole.PROPRIETARIO,
  AccessRole.CONSELHEIRO,
];

export type AnnouncementNotificationTarget = {
  id: string;
  userId: string;
  role: AccessRole;
  label: string | null;
  condominiumId: string | null;
  unitId: string | null;
};

function uniqueNotificationTargets(targets: AnnouncementNotificationTarget[]) {
  const map = new Map<string, AnnouncementNotificationTarget>();

  for (const target of targets) {
    map.set(`${target.userId}:${target.id}`, target);
  }

  return Array.from(map.values());
}

export async function findAnnouncementNotificationTargets({
  administratorId,
  announcementId,
}: {
  administratorId: string;
  announcementId: string;
}) {
  const announcement = await db.announcement.findFirst({
    where: {
      id: announcementId,
      administratorId,
    },
    select: {
      id: true,
      condominiumId: true,
      targetScope: true,
      targets: {
        select: {
          condominiumId: true,
          unitId: true,
          block: true,
          role: true,
          linkType: true,
        },
      },
    },
  });

  if (!announcement) {
    return [];
  }

  const baseWhere = {
    isActive: true,
    role: {
      in: PORTAL_ANNOUNCEMENT_ROLES,
    },
    user: {
      isActive: true,
    },
  };

  const administratorScope = {
    OR: [
      {
        administratorId,
      },
      {
        condominium: {
          administratorId,
        },
      },
    ],
  };

  const targetWheres: Prisma.UserAccessWhereInput[] = [];

  if (announcement.targetScope === AnnouncementTargetScope.ALL_ADMINISTRATOR) {
    targetWheres.push(administratorScope);
  }

  if (announcement.targetScope === AnnouncementTargetScope.CONDOMINIUM) {
    const condominiumIds = new Set<string>();

    if (announcement.condominiumId) {
      condominiumIds.add(announcement.condominiumId);
    }

    for (const target of announcement.targets) {
      if (target.condominiumId) {
        condominiumIds.add(target.condominiumId);
      }
    }

    if (condominiumIds.size > 0) {
      targetWheres.push({
        condominiumId: {
          in: Array.from(condominiumIds),
        },
      });
    }
  }

  if (announcement.targetScope === AnnouncementTargetScope.UNIT) {
    const unitIds = announcement.targets
      .map((target) => target.unitId)
      .filter((value): value is string => Boolean(value));

    if (unitIds.length > 0) {
      targetWheres.push({
        unitId: {
          in: unitIds,
        },
      });
    }
  }


  if (announcement.targetScope === AnnouncementTargetScope.BLOCK) {
    for (const target of announcement.targets) {
      if (!target.condominiumId || !target.block) {
        continue;
      }

      targetWheres.push({
        condominiumId: target.condominiumId,
        unit: {
          block: target.block,
        },
      });
    }
  }

  if (announcement.targetScope === AnnouncementTargetScope.ROLE) {
    for (const target of announcement.targets) {
      if (!target.role) {
        continue;
      }

      targetWheres.push({
        role: target.role,
        ...(target.condominiumId
          ? {
              condominiumId: target.condominiumId,
            }
          : administratorScope),
      });
    }
  }

  if (announcement.targetScope === AnnouncementTargetScope.LINK_TYPE) {
    for (const target of announcement.targets) {
      if (!target.linkType) {
        continue;
      }

      targetWheres.push({
        ...(target.condominiumId
          ? {
              condominiumId: target.condominiumId,
            }
          : administratorScope),
        unitPersonLink: {
          linkType: target.linkType,
          status: Status.ACTIVE,
          receivesNotifications: true,
        },
      });
    }
  }

  if (announcement.targetScope === AnnouncementTargetScope.CUSTOM) {
    for (const target of announcement.targets) {
      const customAnd: Prisma.UserAccessWhereInput[] = [];

      if (target.condominiumId) {
        customAnd.push({
          condominiumId: target.condominiumId,
        });
      }

      if (target.unitId) {
        customAnd.push({
          unitId: target.unitId,
        });
      }

      if (target.block) {
        customAnd.push({
          unit: {
            block: target.block,
          },
        });
      }

      if (target.role) {
        customAnd.push({
          role: target.role,
        });
      }

      if (target.linkType) {
        customAnd.push({
          unitPersonLink: {
            linkType: target.linkType,
            status: Status.ACTIVE,
            receivesNotifications: true,
          },
        });
      }

      if (customAnd.length > 0) {
        targetWheres.push({
          AND: customAnd,
        });
      }
    }
  }

  if (targetWheres.length === 0) {
    return [];
  }

  const targets = await db.userAccess.findMany({
    where: {
      ...baseWhere,
      AND: [
        administratorScope,
        {
          OR: targetWheres,
        },
      ],
    },
    select: {
      id: true,
      userId: true,
      role: true,
      label: true,
      condominiumId: true,
      unitId: true,
    },
  });

  return uniqueNotificationTargets(targets);
}

export async function createAnnouncementPublishedNotifications({
  administratorId,
  announcementId,
  title,
}: {
  administratorId: string;
  announcementId: string;
  title: string;
}) {
  const targets = await findAnnouncementNotificationTargets({
    administratorId,
    announcementId,
  });

  if (targets.length === 0) {
    return {
      created: 0,
    };
  }

  await db.notification.createMany({
    data: targets.map((target) => ({
      userId: target.userId,
      accessId: target.id,
      channel: NotificationChannel.SYSTEM,
      status: NotificationStatus.UNREAD,
      type: "ANNOUNCEMENT_PUBLISHED",
      title: "Novo Comunicado Da Administradora",
      message: title,
      href: `/portal/comunicados/${announcementId}`,
      metadata: {
        announcementId,
        source: "ANNOUNCEMENT",
        role: target.role,
        condominiumId: target.condominiumId,
        unitId: target.unitId,
      },
    })),
  });

  return {
    created: targets.length,
  };
}



/* =========================================================
   LEMBRETES INTERNOS PARA COMUNICADOS NÃO LIDOS

   ETAPA 48.9.3 — LEMBRETE PARA NÃO LIDOS

   Cria uma nova notificação interna somente para os perfis
   alcançados pelo público-alvo do comunicado que ainda não
   confirmaram leitura.
   ========================================================= */

export async function createAnnouncementUnreadReminderNotifications({
  administratorId,
  announcementId,
  title,
}: {
  administratorId: string;
  announcementId: string;
  title: string;
}) {
  const targets = await findAnnouncementNotificationTargets({
    administratorId,
    announcementId,
  });

  if (targets.length === 0) {
    return {
      created: 0,
      pending: 0,
      totalTargets: 0,
    };
  }

  const targetAccessIds = targets.map((target) => target.id);

  const readings = await db.announcementReading.findMany({
    where: {
      announcementId,
      accessId: {
        in: targetAccessIds,
      },
    },
    select: {
      accessId: true,
    },
  });

  const readAccessIds = new Set(readings.map((reading) => reading.accessId));
  const unreadTargets = targets.filter((target) => !readAccessIds.has(target.id));

  if (unreadTargets.length === 0) {
    return {
      created: 0,
      pending: 0,
      totalTargets: targets.length,
    };
  }

  await db.notification.createMany({
    data: unreadTargets.map((target) => ({
      userId: target.userId,
      accessId: target.id,
      channel: NotificationChannel.SYSTEM,
      status: NotificationStatus.UNREAD,
      type: "ANNOUNCEMENT_READING_REMINDER",
      title: "Lembrete De Leitura De Comunicado",
      message: `Você ainda não confirmou a leitura: ${title}`,
      href: `/portal/comunicados/${announcementId}`,
      metadata: {
        announcementId,
        source: "ANNOUNCEMENT",
        reminder: true,
        role: target.role,
        condominiumId: target.condominiumId,
        unitId: target.unitId,
      },
    })),
  });

  return {
    created: unreadTargets.length,
    pending: unreadTargets.length,
    totalTargets: targets.length,
  };
}
