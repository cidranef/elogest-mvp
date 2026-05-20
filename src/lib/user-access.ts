import { db } from "@/lib/db";



/* =========================================================
   ETAPA 43 - UTILITÁRIO DE PERFIL ATIVO / VÍNCULOS - ELOGEST

   Este arquivo centraliza a leitura e normalização dos perfis
   de acesso do usuário.

   Conceito principal da Etapa 43:
   - User representa a identidade/login.
   - UserAccess representa o perfil operacional explícito.
   - UnitPersonLink representa o vínculo formal da pessoa com
     uma unidade: proprietário, morador, inquilino, dependente
     ou autorizado.
   - Campos legados de User/Resident continuam sendo aceitos para
     manter o MVP funcionando durante a migração gradual.

   Compatibilidade mantida:
   - activeAccessId em cookie;
   - UserAccess real;
   - fallback legado de User;
   - synthetic-resident:<residentId>;
   - /contexto;
   - /api/user/accesses;
   - /api/user/active-access.

   Ajuste de build:
   - Os tipos de entrada foram intencionalmente flexibilizados para
     aceitar os objetos retornados pelo Prisma, especialmente campos
     JsonValue como permissionsOverride e metadata.
   - A normalização continua segura porque somente campos públicos e
     necessários são expostos no ActiveUserAccess.
   ========================================================= */



/* =========================================================
   COOKIE DO CONTEXTO ATIVO
   ========================================================= */

export const ACTIVE_ACCESS_COOKIE = "activeAccessId";

export const SYNTHETIC_RESIDENT_ACCESS_PREFIX = "synthetic-resident:";

export const SYNTHETIC_UNIT_PERSON_LINK_ACCESS_PREFIX = "unit-person-link:";



/* =========================================================
   TIPOS AUXILIARES
   ========================================================= */

export type ActiveAccessRole =
  | "SUPER_ADMIN"
  | "ADMINISTRADORA"
  | "SINDICO"
  | "MORADOR"
  | "PROPRIETARIO"
  | "CONSELHEIRO";

export type UnitPersonLinkType =
  | "OWNER"
  | "RESIDENT"
  | "TENANT"
  | "DEPENDENT"
  | "AUTHORIZED";

export type ActiveAccessSource =
  | "USER_ACCESS"
  | "LEGACY_USER"
  | "SYNTHETIC_RESIDENT"
  | "UNIT_PERSON_LINK";

export type ActiveUserAccess = {
  accessId: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  role: ActiveAccessRole;

  administratorId: string | null;
  condominiumId: string | null;
  unitId: string | null;
  residentId: string | null;
  unitPersonLinkId?: string | null;

  linkType?: UnitPersonLinkType | null;
  canVote?: boolean | null;
  canOpenTickets?: boolean | null;
  receivesNotifications?: boolean | null;

  permissionsOverride?: unknown;
  metadata?: unknown;

  label: string;
  isDefault: boolean;
  isActive: boolean;

  source: ActiveAccessSource;
};



/*
   Tipos flexíveis para entradas vindas do Prisma.

   Importante:
   Não usamos um tipo Prisma rígido aqui porque esta função recebe
   objetos com includes diferentes em rotas antigas e novas. Campos
   Json do Prisma também podem vir como JsonValue, JsonObject,
   JsonArray, string, number, boolean ou null.
*/

type UnitLike = {
  id?: string | null;
  block?: string | null;
  unitNumber?: string | null;
  condominiumId?: string | null;
  condominium?: {
    id?: string | null;
    name?: string | null;
    administratorId?: string | null;
  } | null;
};

type CondominiumLike = {
  id?: string | null;
  name?: string | null;
  administratorId?: string | null;
};

type AdministratorLike = {
  id?: string | null;
  name?: string | null;
};

type ResidentLike = {
  id?: string | null;
  name?: string | null;
  residentType?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  unit?: UnitLike | null;
  condominium?: CondominiumLike | null;
};

type UnitPersonLinkLike = {
  id?: string | null;
  userId?: string | null;
  role?: string | null;
  linkType?: string | null;
  type?: string | null;
  status?: string | null;
  isActive?: boolean | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;

  unit?: UnitLike | null;
  condominium?: CondominiumLike | null;
  resident?: ResidentLike | null;

  canVote?: boolean | null;
  canOpenTickets?: boolean | null;
  receivesNotifications?: boolean | null;
  permissionsOverride?: unknown;
  metadata?: unknown;
};

type UserAccessLike = {
  id?: string | null;
  role?: string | null;
  label?: string | null;

  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  unitPersonLinkId?: string | null;

  isDefault?: boolean | null;
  isActive?: boolean | null;

  administrator?: AdministratorLike | null;
  condominium?: CondominiumLike | null;
  unit?: UnitLike | null;
  resident?: ResidentLike | null;
  unitPersonLink?: UnitPersonLinkLike | null;

  linkType?: string | null;
  canVote?: boolean | null;
  canOpenTickets?: boolean | null;
  receivesNotifications?: boolean | null;
  permissionsOverride?: unknown;
  metadata?: unknown;
};

type UserWithAccessesLike = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  isActive?: boolean | null;

  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;

  administrator?: AdministratorLike | null;
  condominium?: CondominiumLike | null;
  resident?: ResidentLike | null;
  unit?: UnitLike | null;

  accesses?: UserAccessLike[] | null;
  unitPersonLinks?: UnitPersonLinkLike[] | null;
};



/* =========================================================
   NORMALIZAÇÃO BÁSICA
   ========================================================= */

function normalizeRoleValue(role?: string | null): ActiveAccessRole {
  const normalized = String(role || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (normalized === "ADMINISTRADORA") return "ADMINISTRADORA";
  if (normalized === "SINDICO") return "SINDICO";
  if (normalized === "PROPRIETARIO") return "PROPRIETARIO";
  if (normalized === "CONSELHEIRO") return "CONSELHEIRO";

  return "MORADOR";
}



function normalizeLinkTypeValue(
  linkType?: string | null
): UnitPersonLinkType | null {
  const normalized = String(linkType || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

  if (normalized === "OWNER" || normalized === "PROPRIETARIO") return "OWNER";
  if (normalized === "RESIDENT" || normalized === "MORADOR") return "RESIDENT";
  if (normalized === "TENANT" || normalized === "INQUILINO") return "TENANT";
  if (normalized === "DEPENDENT" || normalized === "DEPENDENTE") {
    return "DEPENDENT";
  }
  if (normalized === "AUTHORIZED" || normalized === "AUTORIZADO") {
    return "AUTHORIZED";
  }

  return null;
}



function roleFromUnitPersonLink(link: UnitPersonLinkLike): ActiveAccessRole {
  const explicitRole = String(link.role || "").trim();

  if (explicitRole) {
    return normalizeRoleValue(explicitRole);
  }

  const linkType = normalizeLinkTypeValue(link.linkType || link.type || null);

  if (linkType === "OWNER") {
    return "PROPRIETARIO";
  }

  return "MORADOR";
}



function isActiveLink(link: UnitPersonLinkLike) {
  if (link.isActive === false) {
    return false;
  }

  const status = String(link.status || "")
    .toUpperCase()
    .trim();

  if (status && status !== "ACTIVE") {
    return false;
  }

  return true;
}



/* =========================================================
   LABELS HUMANIZADAS
   ========================================================= */

export function roleLabel(role?: string | null) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";

    case "ADMINISTRADORA":
      return "Administradora";

    case "SINDICO":
      return "Síndico";

    case "MORADOR":
      return "Morador";

    case "PROPRIETARIO":
      return "Proprietário";

    case "CONSELHEIRO":
      return "Conselheiro";

    default:
      return "Usuário";
  }
}



export function linkTypeLabel(linkType?: string | null) {
  switch (linkType) {
    case "OWNER":
      return "Proprietário";

    case "RESIDENT":
      return "Morador";

    case "TENANT":
      return "Inquilino";

    case "DEPENDENT":
      return "Dependente";

    case "AUTHORIZED":
      return "Autorizado";

    default:
      return null;
  }
}



export function buildUnitLabel(unit?: {
  block?: string | null;
  unitNumber?: string | null;
} | null) {
  if (!unit?.unitNumber) return null;

  return `${unit.block ? unit.block + " - " : ""}${unit.unitNumber}`;
}



export function buildAccessLabelFromData({
  role,
  administratorName,
  condominiumName,
  unit,
  linkType,
}: {
  role?: string | null;
  administratorName?: string | null;
  condominiumName?: string | null;
  unit?: {
    block?: string | null;
    unitNumber?: string | null;
  } | null;
  linkType?: string | null;
}) {
  const baseRole = roleLabel(role);
  const unitLabel = buildUnitLabel(unit);
  const linkLabel = linkTypeLabel(linkType);

  if (role === "SUPER_ADMIN") {
    return "Super Admin";
  }

  if (role === "ADMINISTRADORA") {
    return administratorName
      ? `Administradora - ${administratorName}`
      : "Administradora";
  }

  if (role === "SINDICO") {
    return condominiumName ? `Síndico - ${condominiumName}` : "Síndico";
  }

  if (role === "MORADOR") {
    const displayRole = linkLabel || "Morador";

    if (condominiumName && unitLabel) {
      return `${displayRole} - ${condominiumName} / ${unitLabel}`;
    }

    if (unitLabel) {
      return `${displayRole} - ${unitLabel}`;
    }

    return displayRole;
  }

  if (role === "PROPRIETARIO") {
    if (condominiumName && unitLabel) {
      return `Proprietário - ${condominiumName} / ${unitLabel}`;
    }

    if (unitLabel) {
      return `Proprietário - ${unitLabel}`;
    }

    return "Proprietário";
  }

  if (role === "CONSELHEIRO") {
    return condominiumName ? `Conselheiro - ${condominiumName}` : "Conselheiro";
  }

  return baseRole;
}



/* =========================================================
   BUSCAR USUÁRIO COMPLETO COM ACESSOS
   ========================================================= */

export async function getUserWithAccesses(userId: string) {
  return db.user.findUnique({
    where: {
      id: userId,
    },
    include: {
      administrator: true,
      condominium: true,
      resident: {
        include: {
          unit: true,
          condominium: true,
        },
      },

      /*
         Etapa 43:
         Inclui vínculos formais de unidade, quando existirem.
         Caso o projeto ainda esteja sem dados nessa tabela, o array
         virá vazio e o fluxo legado continua funcionando.
      */
      unitPersonLinks: {
        /*
           Etapa 43 - correção de build:
           UnitPersonLink não usa isActive no schema atual.
           O filtro oficial deve usar status ACTIVE. A função
           isActiveLink() continua fazendo uma segunda validação
           defensiva em memória.
        */
        where: {
          status: "ACTIVE",
        },
        include: {
          unit: {
            include: {
              condominium: true,
            },
          },
          condominium: true,
          resident: {
            include: {
              unit: true,
              condominium: true,
            },
          },
        },
        orderBy: [
          {
            createdAt: "asc",
          },
        ],
      },

      accesses: {
        where: {
          isActive: true,
        },
        include: {
          administrator: true,
          condominium: true,
          unit: true,
          resident: {
            include: {
              unit: true,
              condominium: true,
            },
          },
          unitPersonLink: {
            include: {
              unit: {
                include: {
                  condominium: true,
                },
              },
              condominium: true,
              resident: {
                include: {
                  unit: true,
                  condominium: true,
                },
              },
            },
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
      },
    },
  });
}



/* =========================================================
   NORMALIZA UM REGISTRO USER_ACCESS
   ========================================================= */

export function normalizeUserAccess(
  user: UserWithAccessesLike,
  access: UserAccessLike
): ActiveUserAccess {
  const role = normalizeRoleValue(access.role || user.role || "MORADOR");

  const link = access.unitPersonLink || null;
  const linkType =
    normalizeLinkTypeValue(
      access.linkType ||
        link?.linkType ||
        link?.type ||
        null
    ) || null;

  const condominiumName =
    access.condominium?.name ||
    access.unit?.condominium?.name ||
    access.resident?.condominium?.name ||
    link?.condominium?.name ||
    link?.unit?.condominium?.name ||
    link?.resident?.condominium?.name ||
    user.condominium?.name ||
    user.resident?.condominium?.name ||
    null;

  const administratorName =
    access.administrator?.name || user.administrator?.name || null;

  const unit =
    access.unit ||
    access.resident?.unit ||
    link?.unit ||
    link?.resident?.unit ||
    null;

  const label =
    access.label ||
    buildAccessLabelFromData({
      role,
      administratorName,
      condominiumName,
      unit,
      linkType,
    });

  return {
    accessId: access.id || null,
    userId: user.id,
    userName: user.name || "",
    userEmail: user.email || "",
    role,

    administratorId: access.administratorId || null,
    condominiumId:
      access.condominiumId ||
      access.unit?.condominiumId ||
      access.resident?.condominiumId ||
      link?.condominiumId ||
      link?.unit?.condominiumId ||
      link?.resident?.condominiumId ||
      null,
    unitId:
      access.unitId ||
      access.resident?.unitId ||
      link?.unitId ||
      link?.resident?.unitId ||
      null,
    residentId: access.residentId || link?.residentId || null,
    unitPersonLinkId: access.unitPersonLinkId || link?.id || null,

    linkType,
    canVote:
      access.canVote ?? link?.canVote ?? (linkType === "OWNER" ? true : null),
    canOpenTickets: access.canOpenTickets ?? link?.canOpenTickets ?? null,
    receivesNotifications:
      access.receivesNotifications ?? link?.receivesNotifications ?? null,

    permissionsOverride: access.permissionsOverride ?? link?.permissionsOverride,
    metadata: access.metadata ?? link?.metadata,

    label,
    isDefault: !!access.isDefault,
    isActive: access.isActive !== false,

    source: "USER_ACCESS",
  };
}



/* =========================================================
   FALLBACK LEGADO
   ========================================================= */

export function normalizeLegacyUserAccess(user: UserWithAccessesLike): ActiveUserAccess {
  const role = normalizeRoleValue(user.role || "MORADOR");

  const condominiumName =
    user.condominium?.name || user.resident?.condominium?.name || null;

  const administratorName = user.administrator?.name || null;

  const unit = user.resident?.unit || user.unit || null;

  const label = buildAccessLabelFromData({
    role,
    administratorName,
    condominiumName,
    unit,
  });

  return {
    accessId: null,
    userId: user.id,
    userName: user.name || "",
    userEmail: user.email || "",
    role,

    administratorId: user.administratorId || null,
    condominiumId: user.condominiumId || user.resident?.condominiumId || null,
    unitId: user.unitId || user.resident?.unitId || null,
    residentId: user.residentId || null,
    unitPersonLinkId: null,

    linkType: null,
    canVote: role === "PROPRIETARIO" ? true : null,
    canOpenTickets: null,
    receivesNotifications: null,

    permissionsOverride: null,
    metadata: null,

    label,
    isDefault: true,
    isActive: user.isActive !== false,

    source: "LEGACY_USER",
  };
}



/* =========================================================
   ROLE RESIDENCIAL SINTÉTICO LEGADO
   ========================================================= */

function getSyntheticResidentRole(user: UserWithAccessesLike): ActiveAccessRole {
  const residentType = String(user?.resident?.residentType || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

  if (
    residentType.includes("PROPRIETARIO") ||
    residentType.includes("OWNER")
  ) {
    return "PROPRIETARIO";
  }

  return "MORADOR";
}



/* =========================================================
   ACESSO RESIDENCIAL SINTÉTICO LEGADO
   ========================================================= */

export function normalizeSyntheticResidentAccess(
  user: UserWithAccessesLike
): ActiveUserAccess | null {
  if (!user?.residentId || !user?.resident) {
    return null;
  }

  const role = getSyntheticResidentRole(user);

  const condominiumName =
    user.resident?.condominium?.name || user.condominium?.name || null;

  const unit = user.resident?.unit || user.unit || null;

  const label = buildAccessLabelFromData({
    role,
    condominiumName,
    unit,
  });

  return {
    accessId: `${SYNTHETIC_RESIDENT_ACCESS_PREFIX}${user.residentId}`,
    userId: user.id,
    userName: user.name || "",
    userEmail: user.email || "",
    role,

    administratorId: null,
    condominiumId: user.resident?.condominiumId || user.condominiumId || null,
    unitId: user.resident?.unitId || user.unitId || null,
    residentId: user.residentId || null,
    unitPersonLinkId: null,

    linkType: role === "PROPRIETARIO" ? "OWNER" : "RESIDENT",
    canVote: role === "PROPRIETARIO",
    canOpenTickets: null,
    receivesNotifications: null,

    permissionsOverride: null,
    metadata: null,

    label,
    isDefault: false,
    isActive: user.isActive !== false,

    source: "SYNTHETIC_RESIDENT",
  };
}



/* =========================================================
   ACESSO SINTÉTICO FORMAL VIA UNIT_PERSON_LINK
   ========================================================= */

export function normalizeUnitPersonLinkAccess(
  user: UserWithAccessesLike,
  link: UnitPersonLinkLike
): ActiveUserAccess | null {
  if (!link?.id || !isActiveLink(link)) {
    return null;
  }

  const role = roleFromUnitPersonLink(link);
  const linkType = normalizeLinkTypeValue(link.linkType || link.type || null);

  const condominiumName =
    link.condominium?.name ||
    link.unit?.condominium?.name ||
    link.resident?.condominium?.name ||
    user.condominium?.name ||
    null;

  const unit = link.unit || link.resident?.unit || null;

  const label = buildAccessLabelFromData({
    role,
    condominiumName,
    unit,
    linkType,
  });

  return {
    accessId: `${SYNTHETIC_UNIT_PERSON_LINK_ACCESS_PREFIX}${link.id}`,
    userId: user.id,
    userName: user.name || "",
    userEmail: user.email || "",
    role,

    administratorId: null,
    condominiumId:
      link.condominiumId ||
      link.unit?.condominiumId ||
      link.resident?.condominiumId ||
      null,
    unitId: link.unitId || link.resident?.unitId || null,
    residentId: link.residentId || null,
    unitPersonLinkId: link.id,

    linkType,
    canVote: link.canVote ?? (linkType === "OWNER" ? true : null),
    canOpenTickets: link.canOpenTickets ?? null,
    receivesNotifications: link.receivesNotifications ?? null,

    permissionsOverride: link.permissionsOverride,
    metadata: link.metadata,

    label,
    isDefault: false,
    isActive: true,

    source: "UNIT_PERSON_LINK",
  };
}



/* =========================================================
   CHAVE DE DEDUPLICAÇÃO
   ========================================================= */

function getAccessDedupKey(access: ActiveUserAccess) {
  return [
    access.role,
    access.administratorId || "",
    access.condominiumId || "",
    access.unitId || "",
    access.residentId || "",
    access.unitPersonLinkId || "",
  ].join("|");
}



function hasEquivalentResidentialAccess(
  accesses: ActiveUserAccess[],
  candidate: ActiveUserAccess
) {
  return accesses.some((access) => {
    if (candidate.unitPersonLinkId && access.unitPersonLinkId) {
      return access.unitPersonLinkId === candidate.unitPersonLinkId;
    }

    if (
      candidate.residentId &&
      access.residentId &&
      access.residentId === candidate.residentId &&
      (access.role === "MORADOR" || access.role === "PROPRIETARIO")
    ) {
      return true;
    }

    if (
      candidate.unitId &&
      access.unitId &&
      access.unitId === candidate.unitId &&
      access.role === candidate.role
    ) {
      return true;
    }

    return getAccessDedupKey(access) === getAccessDedupKey(candidate);
  });
}




/* =========================================================
   ETAPA 43 - DEFESA CONTRA USER_ACCESS OPERACIONAL OBSOLETO

   Situação corrigida:
   - Um usuário com perfil SÍNDICO foi movido para outro condomínio.
   - O campo legado User.condominiumId foi atualizado corretamente.
   - Porém um UserAccess antigo ainda podia permanecer ativo apontando
     para o condomínio anterior.
   - Se o cookie activeAccessId ainda apontasse para esse UserAccess,
     o portal poderia continuar lendo chamados do condomínio antigo.

   Regra:
   - Para perfis operacionais diretos do usuário, o UserAccess real
     precisa continuar coerente com os vínculos atuais do User.
   - Se estiver divergente, ele é ignorado na normalização.

   Observação:
   - Essa defesa não substitui a sincronização do banco feita em
     /api/admin/usuarios.
   - Ela protege usuários que já estavam com cookie antigo ou vínculo
     obsoleto antes da correção.
   ========================================================= */

function isStaleOperationalUserAccess(
  user: UserWithAccessesLike,
  access: UserAccessLike
) {
  const accessRole = normalizeRoleValue(access.role || null);
  const userRole = normalizeRoleValue(user.role || null);

  if (accessRole !== userRole) {
    return false;
  }

  if (accessRole === "SINDICO") {
    if (!user.condominiumId) {
      return true;
    }

    const accessCondominiumId =
      access.condominiumId || access.condominium?.id || null;

    return accessCondominiumId !== user.condominiumId;
  }

  if (accessRole === "ADMINISTRADORA") {
    if (!user.administratorId) {
      return true;
    }

    const accessAdministratorId =
      access.administratorId || access.administrator?.id || null;

    return accessAdministratorId !== user.administratorId;
  }

  if (accessRole === "MORADOR" || accessRole === "PROPRIETARIO") {
    if (!user.residentId) {
      return true;
    }

    const accessResidentId =
      access.residentId || access.resident?.id || null;

    return accessResidentId !== user.residentId;
  }

  return false;
}



/* =========================================================
   LISTA NORMALIZADA DE TODOS OS ACESSOS
   ========================================================= */

export function getNormalizedUserAccesses(
  user: UserWithAccessesLike
): ActiveUserAccess[] {
  const explicitAccesses = Array.isArray(user.accesses) ? user.accesses : [];

  const safeExplicitAccesses = explicitAccesses.filter((access) => {
    return !isStaleOperationalUserAccess(user, access);
  });

  const normalizedAccesses: ActiveUserAccess[] =
    safeExplicitAccesses.length > 0
      ? safeExplicitAccesses.map((access) => normalizeUserAccess(user, access))
      : [normalizeLegacyUserAccess(user)];

  /*
     Etapa 43:
     Vínculos formais de unidade entram como perfis sintéticos
     adicionais quando ainda não existir UserAccess equivalente.
  */
  const unitPersonLinks = user.unitPersonLinks || [];

  for (const link of unitPersonLinks) {
    const linkAccess = normalizeUnitPersonLinkAccess(user, link);

    if (linkAccess && !hasEquivalentResidentialAccess(normalizedAccesses, linkAccess)) {
      normalizedAccesses.push(linkAccess);
    }
  }

  /*
     Compatibilidade legado:
     Continua criando synthetic-resident:<residentId> para usuários
     que ainda dependem do vínculo Resident antigo.
  */
  const syntheticResidentAccess = normalizeSyntheticResidentAccess(user);

  if (
    syntheticResidentAccess &&
    !hasEquivalentResidentialAccess(normalizedAccesses, syntheticResidentAccess)
  ) {
    normalizedAccesses.push(syntheticResidentAccess);
  }

  return normalizedAccesses;
}



/* =========================================================
   BUSCAR ACESSO PADRÃO DO USUÁRIO
   ========================================================= */

export async function getDefaultUserAccess(
  userId: string
): Promise<ActiveUserAccess | null> {
  const user = await getUserWithAccesses(userId);

  if (!user) {
    return null;
  }

  const accesses = getNormalizedUserAccesses(user);

  return accesses.find((access) => access.isDefault) || accesses[0] || null;
}



/* =========================================================
   BUSCAR ACESSO ESPECÍFICO DO USUÁRIO
   ========================================================= */

export async function getUserAccessById(
  userId: string,
  accessId: string
): Promise<ActiveUserAccess | null> {
  const user = await getUserWithAccesses(userId);

  if (!user) {
    return null;
  }

  const accesses = getNormalizedUserAccesses(user);

  return accesses.find((item) => item.accessId === accessId) || null;
}



/* =========================================================
   BUSCAR CONTEXTO ATIVO DO USUÁRIO
   ========================================================= */

export async function getActiveUserAccess({
  userId,
  activeAccessId,
}: {
  userId: string;
  activeAccessId?: string | null;
}): Promise<ActiveUserAccess | null> {
  if (activeAccessId) {
    const selectedAccess = await getUserAccessById(userId, activeAccessId);

    if (selectedAccess) {
      return selectedAccess;
    }
  }

  return getDefaultUserAccess(userId);
}



/* =========================================================
   LER activeAccessId DOS COOKIES
   ========================================================= */

export async function getActiveAccessIdFromCookies(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");

    const cookieStore = await cookies();
    const value = cookieStore.get(ACTIVE_ACCESS_COOKIE)?.value || null;

    if (!value || !String(value).trim()) {
      return null;
    }

    return String(value).trim();
  } catch {
    return null;
  }
}



/* =========================================================
   BUSCAR CONTEXTO ATIVO A PARTIR DO COOKIE
   ========================================================= */

export async function getActiveUserAccessFromCookies({
  userId,
}: {
  userId: string;
}): Promise<ActiveUserAccess | null> {
  const activeAccessId = await getActiveAccessIdFromCookies();

  return getActiveUserAccess({
    userId,
    activeAccessId,
  });
}



/* =========================================================
   VALIDAÇÕES DE PAPEL
   ========================================================= */

export function hasAccessRole(
  access: ActiveUserAccess | null,
  roles: ActiveAccessRole[]
) {
  if (!access) return false;

  return roles.includes(access.role);
}



export function isSuperAdminAccess(access: ActiveUserAccess | null) {
  return hasAccessRole(access, ["SUPER_ADMIN"]);
}



export function isAdministradoraAccess(access: ActiveUserAccess | null) {
  return hasAccessRole(access, ["ADMINISTRADORA"]);
}



export function isSindicoAccess(access: ActiveUserAccess | null) {
  return hasAccessRole(access, ["SINDICO"]);
}



export function isMoradorAccess(access: ActiveUserAccess | null) {
  return hasAccessRole(access, ["MORADOR"]);
}



export function isProprietarioAccess(access: ActiveUserAccess | null) {
  return hasAccessRole(access, ["PROPRIETARIO"]);
}



export function isConselheiroAccess(access: ActiveUserAccess | null) {
  return hasAccessRole(access, ["CONSELHEIRO"]);
}



export function isResidentialAccess(access: ActiveUserAccess | null) {
  return hasAccessRole(access, ["MORADOR", "PROPRIETARIO"]);
}



export function isPortalAccess(access: ActiveUserAccess | null) {
  return hasAccessRole(access, [
    "MORADOR",
    "PROPRIETARIO",
    "SINDICO",
    "CONSELHEIRO",
  ]);
}



/* =========================================================
   LABEL PARA TIMELINE / COMENTÁRIOS
   ========================================================= */

export function buildActorRole(access: ActiveUserAccess | null) {
  if (!access) return null;

  return access.role;
}



export function buildActorLabel(access: ActiveUserAccess | null) {
  if (!access) return null;

  return access.label || roleLabel(access.role);
}



/* =========================================================
   RESUMO PARA API
   ========================================================= */

export function buildAccessSummary(access: ActiveUserAccess | null) {
  if (!access) return null;

  return {
    accessId: access.accessId,
    role: access.role,
    label: access.label,
    administratorId: access.administratorId,
    condominiumId: access.condominiumId,
    unitId: access.unitId,
    residentId: access.residentId,
    unitPersonLinkId: access.unitPersonLinkId || null,
    linkType: access.linkType || null,
    canVote: access.canVote ?? null,
    canOpenTickets: access.canOpenTickets ?? null,
    receivesNotifications: access.receivesNotifications ?? null,
    source: access.source,
  };
}



/* =========================================================
   HELPERS DE ÁREA POR CONTEXTO ATIVO
   ========================================================= */

export function canUseEloGestAreaAccess(access: ActiveUserAccess | null) {
  return isSuperAdminAccess(access);
}



export function canUseAdminAreaAccess(access: ActiveUserAccess | null) {
  return isAdministradoraAccess(access) && !!access?.administratorId;
}



export function canUsePortalAreaAccess(access: ActiveUserAccess | null) {
  return isPortalAccess(access);
}



export function getDefaultHomeForAccess(access: ActiveUserAccess | null) {
  if (!access) {
    return "/contexto";
  }

  if (canUseEloGestAreaAccess(access)) {
    return "/elogest/dashboard";
  }

  if (canUseAdminAreaAccess(access)) {
    return "/admin/dashboard";
  }

  if (canUsePortalAreaAccess(access)) {
    return "/portal/dashboard";
  }

  return "/contexto";
}
