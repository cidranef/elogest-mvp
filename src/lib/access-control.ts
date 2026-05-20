/* =========================================================
   ETAPA 43 - MATRIZ CENTRAL DE PERMISSÕES - ELOGEST

   Este arquivo centraliza regras de acesso por perfil, vínculo
   e escopo operacional.

   Objetivo desta revisão:
   - manter compatibilidade com as funções existentes;
   - consolidar a separação entre identidade do usuário e vínculo;
   - preparar a arquitetura para múltiplos perfis por usuário;
   - diferenciar proprietário, morador, inquilino, dependente e autorizado;
   - reforçar o uso do perfil ativo nas APIs;
   - evitar vazamento de dados entre administradoras, condomínios e unidades.

   Importante:
   - O User representa a identidade da pessoa.
   - O UserAccess representa o perfil ativo daquela pessoa em um contexto.
   - O UnitPersonLink representa o vínculo formal da pessoa com uma unidade.

   Regra de ouro:
   APIs revisadas devem preferir o activeAccess/contexto ativo e não apenas
   session.user.role.
   ========================================================= */



/* =========================================================
   TIPOS
   ========================================================= */

export type AppRole =
  | "SUPER_ADMIN"
  | "ADMINISTRADORA"
  | "SINDICO"
  | "MORADOR"
  | "PROPRIETARIO"
  | "CONSELHEIRO"
  | string;



export type AppArea =
  | "ELOGEST"
  | "ADMIN"
  | "PORTAL"
  | "NOTIFICATIONS"
  | "PUBLIC";



export type UnitPersonLinkType =
  | "OWNER"
  | "RESIDENT"
  | "TENANT"
  | "DEPENDENT"
  | "AUTHORIZED"
  | string;



export type PermissionKey =
  | "ACCESS_ELOGEST"
  | "ACCESS_ADMIN"
  | "ACCESS_PORTAL"
  | "ACCESS_NOTIFICATIONS"

  | "MANAGE_ADMINISTRATORS"
  | "MANAGE_CONDOMINIUMS"
  | "MANAGE_UNITS"
  | "MANAGE_RESIDENTS"
  | "MANAGE_USERS"
  | "MANAGE_UNIT_PERSON_LINKS"

  | "VIEW_ALL_TICKETS"
  | "VIEW_ADMIN_TICKETS"
  | "VIEW_CONDOMINIUM_TICKETS"
  | "VIEW_OWN_TICKETS"

  | "CREATE_ADMIN_TICKET"
  | "CREATE_PORTAL_TICKET"

  | "ASSIGN_TICKET"
  | "CHANGE_TICKET_STATUS"
  | "COMMENT_INTERNAL"
  | "COMMENT_PUBLIC"

  | "UPLOAD_ATTACHMENT"
  | "DELETE_ATTACHMENT"

  | "RATE_TICKET"

  | "VIEW_REPORTS"
  | "VIEW_DASHBOARDS"

  | "VOTE_ASSEMBLY"
  | "VIEW_ASSEMBLY"
  | "VIEW_FINANCIAL_SUMMARY"

  | "MANAGE_OWN_NOTIFICATION_PREFERENCES";



export type PermissionOverrideLike = unknown;



/* =========================================================
   AUTH USER LIKE / ACTIVE ACCESS LIKE

   Este tipo aceita tanto session.user quanto objetos vindos de
   UserAccess/activeAccess.

   Campos novos da Etapa 43:
   - unitPersonLinkId
   - linkType
   - canVote
   - canOpenTickets
   - receivesNotifications
   - permissionsOverride
   - revokedAt / revokedReason
   ========================================================= */

export type AuthUserLike = {
  id?: string | null;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  role?: AppRole | null;

  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  unitPersonLinkId?: string | null;

  linkType?: UnitPersonLinkType | null;
  canVote?: boolean | null;
  canOpenTickets?: boolean | null;
  receivesNotifications?: boolean | null;

  accessId?: string | null;
  label?: string | null;
  source?: string | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;

  /*
     ETAPA 43.1 — Compatibilidade com Prisma Json

     O banco pode retornar permissionsOverride como JsonValue/JsonLike.
     Por isso este campo precisa aceitar unknown, e a validação deve
     acontecer somente dentro de getPermissionOverrideRules().
  */
  permissionsOverride?: PermissionOverrideLike;
  lastUsedAt?: Date | string | null;
  revokedAt?: Date | string | null;
  revokedReason?: string | null;
};



/* =========================================================
   LABELS DOS PERFIS E VÍNCULOS
   ========================================================= */

export function getRoleLabel(role?: AppRole | null) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMINISTRADORA: "Administradora",
    SINDICO: "Síndico",
    MORADOR: "Morador",
    PROPRIETARIO: "Proprietário",
    CONSELHEIRO: "Conselheiro",
  };

  return labels[String(role || "")] || role || "Usuário";
}



export function getUnitPersonLinkTypeLabel(
  linkType?: UnitPersonLinkType | null
) {
  const labels: Record<string, string> = {
    OWNER: "Proprietário",
    RESIDENT: "Morador",
    TENANT: "Inquilino",
    DEPENDENT: "Dependente",
    AUTHORIZED: "Autorizado",
  };

  return labels[String(linkType || "")] || linkType || "Vínculo não informado";
}



/* =========================================================
   NORMALIZAÇÃO BÁSICA
   ========================================================= */

export function normalizeRole(role?: AppRole | null) {
  return String(role || "").trim().toUpperCase();
}



export function normalizeUnitPersonLinkType(
  linkType?: UnitPersonLinkType | null
) {
  return String(linkType || "").trim().toUpperCase();
}



export function sameId(
  left?: string | null,
  right?: string | null
) {
  if (!left || !right) {
    return false;
  }

  return String(left) === String(right);
}



export function hasId(value?: string | null) {
  return !!String(value || "").trim();
}



export function getEffectiveUserId(user?: AuthUserLike | null) {
  return user?.userId || user?.id || null;
}



export function isActiveAccess(user?: AuthUserLike | null) {
  if (!user) return false;

  if (user.revokedAt) return false;

  if (user.isActive === false) return false;

  return true;
}



/* =========================================================
   GRUPOS DE PERFIS
   ========================================================= */

export function isSuperAdmin(user?: AuthUserLike | null) {
  return normalizeRole(user?.role) === "SUPER_ADMIN";
}



export function isAdministradora(user?: AuthUserLike | null) {
  return normalizeRole(user?.role) === "ADMINISTRADORA";
}



export function isSindico(user?: AuthUserLike | null) {
  return normalizeRole(user?.role) === "SINDICO";
}



export function isMorador(user?: AuthUserLike | null) {
  return normalizeRole(user?.role) === "MORADOR";
}



export function isProprietario(user?: AuthUserLike | null) {
  return normalizeRole(user?.role) === "PROPRIETARIO";
}



export function isConselheiro(user?: AuthUserLike | null) {
  return normalizeRole(user?.role) === "CONSELHEIRO";
}



export function isAdminRole(user?: AuthUserLike | null) {
  return isSuperAdmin(user) || isAdministradora(user);
}



export function isPortalRole(user?: AuthUserLike | null) {
  return (
    isSindico(user) ||
    isMorador(user) ||
    isProprietario(user) ||
    isConselheiro(user)
  );
}



export function isResidentialRole(user?: AuthUserLike | null) {
  return isMorador(user) || isProprietario(user);
}



/* =========================================================
   GRUPOS DE VÍNCULO COM UNIDADE
   ========================================================= */

export function isOwnerLink(user?: AuthUserLike | null) {
  return normalizeUnitPersonLinkType(user?.linkType) === "OWNER";
}



export function isResidentLink(user?: AuthUserLike | null) {
  return normalizeUnitPersonLinkType(user?.linkType) === "RESIDENT";
}



export function isTenantLink(user?: AuthUserLike | null) {
  return normalizeUnitPersonLinkType(user?.linkType) === "TENANT";
}



export function isDependentLink(user?: AuthUserLike | null) {
  return normalizeUnitPersonLinkType(user?.linkType) === "DEPENDENT";
}



export function isAuthorizedLink(user?: AuthUserLike | null) {
  return normalizeUnitPersonLinkType(user?.linkType) === "AUTHORIZED";
}



export function isOccupantLink(user?: AuthUserLike | null) {
  return isResidentLink(user) || isTenantLink(user) || isDependentLink(user);
}



/* =========================================================
   MATRIZ DE PERMISSÕES POR PERFIL

   Regras de escopo continuam sendo validadas nas APIs.
   Esta matriz responde apenas: este perfil pode executar esta ação?
   ========================================================= */

export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  SUPER_ADMIN: [
    "ACCESS_ELOGEST",
    "ACCESS_NOTIFICATIONS",

    "MANAGE_ADMINISTRATORS",
    "MANAGE_CONDOMINIUMS",
    "MANAGE_UNITS",
    "MANAGE_RESIDENTS",
    "MANAGE_USERS",
    "MANAGE_UNIT_PERSON_LINKS",

    "VIEW_ALL_TICKETS",
    "VIEW_ADMIN_TICKETS",
    "VIEW_CONDOMINIUM_TICKETS",
    "VIEW_OWN_TICKETS",

    "CREATE_ADMIN_TICKET",
    "CREATE_PORTAL_TICKET",

    "ASSIGN_TICKET",
    "CHANGE_TICKET_STATUS",
    "COMMENT_INTERNAL",
    "COMMENT_PUBLIC",

    "UPLOAD_ATTACHMENT",
    "DELETE_ATTACHMENT",

    "RATE_TICKET",

    "VIEW_REPORTS",
    "VIEW_DASHBOARDS",

    "VOTE_ASSEMBLY",
    "VIEW_ASSEMBLY",
    "VIEW_FINANCIAL_SUMMARY",

    "MANAGE_OWN_NOTIFICATION_PREFERENCES",
  ],

  ADMINISTRADORA: [
    "ACCESS_ADMIN",
    "ACCESS_NOTIFICATIONS",

    "MANAGE_CONDOMINIUMS",
    "MANAGE_UNITS",
    "MANAGE_RESIDENTS",
    "MANAGE_USERS",
    "MANAGE_UNIT_PERSON_LINKS",

    "VIEW_ADMIN_TICKETS",

    "CREATE_ADMIN_TICKET",

    "ASSIGN_TICKET",
    "CHANGE_TICKET_STATUS",
    "COMMENT_INTERNAL",
    "COMMENT_PUBLIC",

    "UPLOAD_ATTACHMENT",
    "DELETE_ATTACHMENT",

    "VIEW_REPORTS",
    "VIEW_DASHBOARDS",

    "VIEW_FINANCIAL_SUMMARY",

    "MANAGE_OWN_NOTIFICATION_PREFERENCES",
  ],

  SINDICO: [
    "ACCESS_PORTAL",
    "ACCESS_NOTIFICATIONS",

    "VIEW_CONDOMINIUM_TICKETS",

    "CREATE_PORTAL_TICKET",

    "COMMENT_PUBLIC",

    "UPLOAD_ATTACHMENT",

    "RATE_TICKET",

    "VIEW_DASHBOARDS",
    "VIEW_ASSEMBLY",
    "VIEW_FINANCIAL_SUMMARY",

    "MANAGE_OWN_NOTIFICATION_PREFERENCES",
  ],

  MORADOR: [
    "ACCESS_PORTAL",
    "ACCESS_NOTIFICATIONS",

    "VIEW_OWN_TICKETS",

    "CREATE_PORTAL_TICKET",

    "COMMENT_PUBLIC",

    "UPLOAD_ATTACHMENT",

    "RATE_TICKET",

    "VIEW_ASSEMBLY",

    "MANAGE_OWN_NOTIFICATION_PREFERENCES",
  ],

  PROPRIETARIO: [
    "ACCESS_PORTAL",
    "ACCESS_NOTIFICATIONS",

    "VIEW_OWN_TICKETS",

    "CREATE_PORTAL_TICKET",

    "COMMENT_PUBLIC",

    "UPLOAD_ATTACHMENT",

    "RATE_TICKET",

    "VOTE_ASSEMBLY",
    "VIEW_ASSEMBLY",
    "VIEW_FINANCIAL_SUMMARY",

    "MANAGE_OWN_NOTIFICATION_PREFERENCES",
  ],

  CONSELHEIRO: [
    "ACCESS_PORTAL",
    "ACCESS_NOTIFICATIONS",

    "VIEW_CONDOMINIUM_TICKETS",

    "COMMENT_PUBLIC",

    "UPLOAD_ATTACHMENT",

    "VIEW_DASHBOARDS",
    "VIEW_ASSEMBLY",
    "VIEW_FINANCIAL_SUMMARY",

    "MANAGE_OWN_NOTIFICATION_PREFERENCES",
  ],
};



/* =========================================================
   PERMISSIONS OVERRIDE

   Formatos aceitos:
   - ["PERMISSION_A", "PERMISSION_B"]
   - { allow: ["PERMISSION_A"], deny: ["PERMISSION_B"] }

   deny tem prioridade sobre allow.
   ========================================================= */

function normalizePermissionKeyArray(value: unknown): PermissionKey[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is PermissionKey => {
    return typeof item === "string" && item.trim().length > 0;
  });
}



function getPermissionOverrideRules(override?: PermissionOverrideLike) {
  if (!override) {
    return {
      allow: [] as PermissionKey[],
      deny: [] as PermissionKey[],
    };
  }

  if (Array.isArray(override)) {
    return {
      allow: normalizePermissionKeyArray(override),
      deny: [] as PermissionKey[],
    };
  }

  if (typeof override === "object" && override !== null) {
    const record = override as {
      allow?: unknown;
      deny?: unknown;
    };

    return {
      allow: normalizePermissionKeyArray(record.allow),
      deny: normalizePermissionKeyArray(record.deny),
    };
  }

  return {
    allow: [] as PermissionKey[],
    deny: [] as PermissionKey[],
  };
}



/* =========================================================
   CONSULTAR PERMISSÃO
   ========================================================= */

export function hasPermission(
  user: AuthUserLike | null | undefined,
  permission: PermissionKey
) {
  if (!isActiveAccess(user)) return false;

  const role = normalizeRole(user?.role);

  if (!role) return false;

  const overrideRules = getPermissionOverrideRules(user?.permissionsOverride);

  if (overrideRules.deny.includes(permission)) {
    return false;
  }

  if (overrideRules.allow.includes(permission)) {
    return true;
  }

  const permissions = ROLE_PERMISSIONS[role] || [];

  return permissions.includes(permission);
}



export function hasAnyPermission(
  user: AuthUserLike | null | undefined,
  permissions: PermissionKey[]
) {
  return permissions.some((permission) => hasPermission(user, permission));
}



export function hasAllPermissions(
  user: AuthUserLike | null | undefined,
  permissions: PermissionKey[]
) {
  return permissions.every((permission) => hasPermission(user, permission));
}



/* =========================================================
   VALIDADORES DE ÁREA

   Separação oficial:
   - ELOGEST: área interna da dona da plataforma
   - ADMIN: área operacional da administradora cliente
   - PORTAL: síndico, morador, proprietário e conselheiro
   ========================================================= */

export function canAccessEloGest(user?: AuthUserLike | null) {
  return hasPermission(user, "ACCESS_ELOGEST");
}



export function canAccessAdmin(user?: AuthUserLike | null) {
  return hasPermission(user, "ACCESS_ADMIN") && hasId(user?.administratorId);
}



export function canAccessPortal(user?: AuthUserLike | null) {
  return hasPermission(user, "ACCESS_PORTAL") && hasId(user?.condominiumId);
}



export function canAccessNotifications(user?: AuthUserLike | null) {
  return hasPermission(user, "ACCESS_NOTIFICATIONS");
}



export function canManageOwnNotificationPreferences(
  user?: AuthUserLike | null
) {
  return hasPermission(user, "MANAGE_OWN_NOTIFICATION_PREFERENCES");
}



export function canAccessArea(
  user: AuthUserLike | null | undefined,
  area: AppArea
) {
  if (area === "PUBLIC") {
    return true;
  }

  if (area === "ELOGEST") {
    return canAccessEloGest(user);
  }

  if (area === "ADMIN") {
    return canAccessAdmin(user);
  }

  if (area === "PORTAL") {
    return canAccessPortal(user);
  }

  if (area === "NOTIFICATIONS") {
    return canAccessNotifications(user);
  }

  return false;
}



/* =========================================================
   VALIDADORES DE CHAMADOS
   ========================================================= */

export function canViewAllTickets(user?: AuthUserLike | null) {
  return hasPermission(user, "VIEW_ALL_TICKETS");
}



export function canViewAdminTickets(user?: AuthUserLike | null) {
  return hasPermission(user, "VIEW_ADMIN_TICKETS");
}



export function canViewCondominiumTickets(user?: AuthUserLike | null) {
  return hasPermission(user, "VIEW_CONDOMINIUM_TICKETS");
}



export function canViewOwnTickets(user?: AuthUserLike | null) {
  return hasPermission(user, "VIEW_OWN_TICKETS");
}



export function canCreateAdminTicket(user?: AuthUserLike | null) {
  return hasPermission(user, "CREATE_ADMIN_TICKET") && hasId(user?.administratorId);
}



export function canCreatePortalTicket(user?: AuthUserLike | null) {
  if (!hasPermission(user, "CREATE_PORTAL_TICKET")) {
    return false;
  }

  if (user?.canOpenTickets === false) {
    return false;
  }

  return hasId(user?.condominiumId);
}



export function canAssignTicket(user?: AuthUserLike | null) {
  return hasPermission(user, "ASSIGN_TICKET");
}



export function canChangeTicketStatus(user?: AuthUserLike | null) {
  return hasPermission(user, "CHANGE_TICKET_STATUS");
}



export function canCommentInternal(user?: AuthUserLike | null) {
  return hasPermission(user, "COMMENT_INTERNAL");
}



export function canCommentPublic(user?: AuthUserLike | null) {
  return hasPermission(user, "COMMENT_PUBLIC");
}



export function canUploadAttachment(user?: AuthUserLike | null) {
  return hasPermission(user, "UPLOAD_ATTACHMENT");
}



export function canDeleteAttachment(user?: AuthUserLike | null) {
  return hasPermission(user, "DELETE_ATTACHMENT");
}



export function canRateTicket(user?: AuthUserLike | null) {
  return hasPermission(user, "RATE_TICKET");
}



/* =========================================================
   VALIDADORES DE CADASTROS
   ========================================================= */

export function canManageAdministrators(user?: AuthUserLike | null) {
  return hasPermission(user, "MANAGE_ADMINISTRATORS");
}



export function canManageCondominiums(user?: AuthUserLike | null) {
  return hasPermission(user, "MANAGE_CONDOMINIUMS");
}



export function canManageUnits(user?: AuthUserLike | null) {
  return hasPermission(user, "MANAGE_UNITS");
}



export function canManageResidents(user?: AuthUserLike | null) {
  return hasPermission(user, "MANAGE_RESIDENTS");
}



export function canManageUsers(user?: AuthUserLike | null) {
  return hasPermission(user, "MANAGE_USERS");
}



export function canManageUnitPersonLinks(user?: AuthUserLike | null) {
  return hasPermission(user, "MANAGE_UNIT_PERSON_LINKS");
}



export function canViewReports(user?: AuthUserLike | null) {
  return hasPermission(user, "VIEW_REPORTS");
}



export function canViewDashboards(user?: AuthUserLike | null) {
  return hasPermission(user, "VIEW_DASHBOARDS");
}



/* =========================================================
   VALIDADORES FUTUROS: ASSEMBLEIA / FINANCEIRO
   ========================================================= */

export function canViewAssembly(user?: AuthUserLike | null) {
  return hasPermission(user, "VIEW_ASSEMBLY");
}



export function canVoteAssembly(user?: AuthUserLike | null) {
  if (!hasPermission(user, "VOTE_ASSEMBLY")) {
    return false;
  }

  if (typeof user?.canVote === "boolean") {
    return user.canVote;
  }

  return isProprietario(user) || isOwnerLink(user);
}



export function canViewFinancialSummary(user?: AuthUserLike | null) {
  return hasPermission(user, "VIEW_FINANCIAL_SUMMARY");
}



export function canReceiveNotificationsInContext(
  user?: AuthUserLike | null
) {
  if (!canAccessNotifications(user)) {
    return false;
  }

  if (typeof user?.receivesNotifications === "boolean") {
    return user.receivesNotifications;
  }

  return true;
}



/* =========================================================
   VALIDADORES DE ESCOPO

   Estes helpers não substituem filtros Prisma nas APIs.
   Eles apenas padronizam comparações e deixam as regras explícitas.
   ========================================================= */

export type CondominiumScopeLike = {
  id?: string | null;
  condominiumId?: string | null;
  administratorId?: string | null;
};



export type UnitScopeLike = {
  id?: string | null;
  unitId?: string | null;
  condominiumId?: string | null;
  administratorId?: string | null;
};



export type ResidentScopeLike = {
  id?: string | null;
  residentId?: string | null;
  unitId?: string | null;
  condominiumId?: string | null;
  administratorId?: string | null;
};



export function canAccessAdministratorScope(
  user: AuthUserLike | null | undefined,
  administratorId?: string | null
) {
  if (!isActiveAccess(user)) return false;

  if (isSuperAdmin(user)) {
    return true;
  }

  if (isAdministradora(user)) {
    return sameId(user?.administratorId, administratorId);
  }

  return false;
}



export function canAccessCondominiumScope(
  user: AuthUserLike | null | undefined,
  condominiumId?: string | null,
  administratorId?: string | null
) {
  if (!isActiveAccess(user)) return false;

  if (isSuperAdmin(user)) {
    return true;
  }

  if (isAdministradora(user)) {
    if (administratorId) {
      return sameId(user?.administratorId, administratorId);
    }

    /*
       Compatibilidade:
       quando a rota antiga ainda não envia administratorId do condomínio,
       permitimos a avaliação pelo perfil. APIs novas devem usar
       canAccessCondominiumRecordScope para validar carteira com segurança.
    */
    return hasId(user?.administratorId) && hasId(condominiumId);
  }

  if (isSindico(user) || isConselheiro(user) || isResidentialRole(user)) {
    return sameId(user?.condominiumId, condominiumId);
  }

  return false;
}



export function canAccessCondominiumRecordScope(
  user: AuthUserLike | null | undefined,
  condominium?: CondominiumScopeLike | null
) {
  if (!isActiveAccess(user) || !condominium) return false;

  const condominiumId = condominium.id || condominium.condominiumId || null;

  return canAccessCondominiumScope(
    user,
    condominiumId,
    condominium.administratorId || null
  );
}



export function canAccessUnitScope(
  user: AuthUserLike | null | undefined,
  unitId?: string | null,
  condominiumId?: string | null,
  administratorId?: string | null
) {
  if (!isActiveAccess(user)) return false;

  if (isSuperAdmin(user)) {
    return true;
  }

  if (isAdministradora(user)) {
    if (administratorId) {
      return sameId(user?.administratorId, administratorId);
    }

    return hasId(user?.administratorId) && hasId(unitId);
  }

  if (isSindico(user) || isConselheiro(user)) {
    if (condominiumId) {
      return sameId(user?.condominiumId, condominiumId);
    }

    return sameId(user?.unitId, unitId) || hasId(user?.condominiumId);
  }

  if (isResidentialRole(user)) {
    return sameId(user?.unitId, unitId);
  }

  return false;
}



export function canAccessUnitRecordScope(
  user: AuthUserLike | null | undefined,
  unit?: UnitScopeLike | null
) {
  if (!isActiveAccess(user) || !unit) return false;

  const unitId = unit.id || unit.unitId || null;

  return canAccessUnitScope(
    user,
    unitId,
    unit.condominiumId || null,
    unit.administratorId || null
  );
}



export function canAccessResidentScope(
  user: AuthUserLike | null | undefined,
  residentId?: string | null,
  unitId?: string | null,
  condominiumId?: string | null,
  administratorId?: string | null
) {
  if (!isActiveAccess(user)) return false;

  if (isSuperAdmin(user)) {
    return true;
  }

  if (isAdministradora(user)) {
    if (administratorId) {
      return sameId(user?.administratorId, administratorId);
    }

    return hasId(user?.administratorId) && hasId(residentId);
  }

  if (isSindico(user) || isConselheiro(user)) {
    if (condominiumId) {
      return sameId(user?.condominiumId, condominiumId);
    }

    return hasId(user?.condominiumId);
  }

  if (isResidentialRole(user)) {
    if (residentId && user?.residentId) {
      return sameId(user.residentId, residentId);
    }

    if (unitId && user?.unitId) {
      return sameId(user.unitId, unitId);
    }
  }

  return false;
}



export function canAccessResidentRecordScope(
  user: AuthUserLike | null | undefined,
  resident?: ResidentScopeLike | null
) {
  if (!isActiveAccess(user) || !resident) return false;

  const residentId = resident.id || resident.residentId || null;

  return canAccessResidentScope(
    user,
    residentId,
    resident.unitId || null,
    resident.condominiumId || null,
    resident.administratorId || null
  );
}



/* =========================================================
   VALIDADORES DE CHAMADO POR ESCOPO

   O objeto ticket pode ser qualquer retorno Prisma simplificado,
   desde que contenha os IDs relevantes.
   ========================================================= */

export type TicketScopeLike = {
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  createdByUserId?: string | null;
  createdByAccessId?: string | null;
  assignedToUserId?: string | null;
};



export function canAccessTicketScope(
  user: AuthUserLike | null | undefined,
  ticket?: TicketScopeLike | null
) {
  if (!isActiveAccess(user) || !ticket) {
    return false;
  }

  if (isSuperAdmin(user)) {
    return true;
  }

  if (isAdministradora(user)) {
    if (ticket.administratorId && user?.administratorId) {
      return sameId(user.administratorId, ticket.administratorId);
    }

    return canViewAdminTickets(user) && hasId(user?.administratorId);
  }

  if (isSindico(user) || isConselheiro(user)) {
    return sameId(user?.condominiumId, ticket.condominiumId);
  }

  if (isResidentialRole(user)) {
    if (ticket.createdByAccessId && user?.accessId) {
      return sameId(user.accessId, ticket.createdByAccessId);
    }

    if (ticket.residentId && user?.residentId) {
      return sameId(user.residentId, ticket.residentId);
    }

    if (ticket.unitId && user?.unitId) {
      return sameId(user.unitId, ticket.unitId);
    }

    if (ticket.createdByUserId && getEffectiveUserId(user)) {
      return sameId(getEffectiveUserId(user), ticket.createdByUserId);
    }

    return false;
  }

  return false;
}



/* =========================================================
   FILTROS PRISMA SUGERIDOS

   Estes helpers retornam objetos de filtro básicos para uso em
   findMany. Em rotas específicas, eles podem ser combinados com
   filtros adicionais.
   ========================================================= */

export function buildAdminScopeWhere(user?: AuthUserLike | null) {
  if (!isActiveAccess(user)) {
    return {
      id: "__NO_ACCESS__",
    };
  }

  /*
     /admin é área operacional da administradora.
     SUPER_ADMIN não deve usar este filtro para operar como administradora.
     Para visão global da EloGest, use rotas /elogest.
  */
  if (isAdministradora(user)) {
    return {
      administratorId: user?.administratorId || "__NO_ACCESS__",
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



export function buildAdminCondominiumScopeWhere(user?: AuthUserLike | null) {
  if (!isActiveAccess(user)) {
    return {
      id: "__NO_ACCESS__",
    };
  }

  if (isAdministradora(user)) {
    return {
      administratorId: user?.administratorId || "__NO_ACCESS__",
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



export function buildPortalTicketScopeWhere(user?: AuthUserLike | null) {
  if (!isActiveAccess(user)) {
    return {
      id: "__NO_ACCESS__",
    };
  }

  if (isSindico(user) || isConselheiro(user)) {
    return {
      condominiumId: user?.condominiumId || "__NO_ACCESS__",
    };
  }

  if (isResidentialRole(user)) {
    return {
      OR: [
        {
          createdByAccessId: user?.accessId || "__NO_ACCESS__",
        },
        {
          residentId: user?.residentId || "__NO_ACCESS__",
        },
        {
          unitId: user?.unitId || "__NO_ACCESS__",
        },
        {
          createdByUserId: getEffectiveUserId(user) || "__NO_ACCESS__",
        },
      ],
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



export function buildUnitPersonLinkScopeWhere(user?: AuthUserLike | null) {
  if (!isActiveAccess(user)) {
    return {
      id: "__NO_ACCESS__",
    };
  }

  if (isSuperAdmin(user)) {
    return {};
  }

  if (isAdministradora(user)) {
    return {
      condominium: {
        administratorId: user?.administratorId || "__NO_ACCESS__",
      },
    };
  }

  if (isSindico(user) || isConselheiro(user)) {
    return {
      condominiumId: user?.condominiumId || "__NO_ACCESS__",
    };
  }

  if (isResidentialRole(user)) {
    return {
      OR: [
        {
          id: user?.unitPersonLinkId || "__NO_ACCESS__",
        },
        {
          userId: getEffectiveUserId(user) || "__NO_ACCESS__",
        },
        {
          residentId: user?.residentId || "__NO_ACCESS__",
        },
        {
          unitId: user?.unitId || "__NO_ACCESS__",
        },
      ],
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



/* =========================================================
   ROTAS PADRÃO POR PERFIL

   Usado para redirecionamento e botões de retorno.
   ========================================================= */

export function getDefaultHomeForRole(role?: AppRole | null) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "SUPER_ADMIN") {
    return "/elogest/dashboard";
  }

  if (normalizedRole === "ADMINISTRADORA") {
    return "/admin/dashboard";
  }

  if (
    normalizedRole === "SINDICO" ||
    normalizedRole === "MORADOR" ||
    normalizedRole === "PROPRIETARIO" ||
    normalizedRole === "CONSELHEIRO"
  ) {
    return "/portal/dashboard";
  }

  return "/login";
}



export function getDefaultHomeForUser(user?: AuthUserLike | null) {
  return getDefaultHomeForRole(user?.role || null);
}



/* =========================================================
   DESCRIÇÃO DA MATRIZ PARA AUDITORIA FUTURA
   ========================================================= */

export function getRolePermissionSummary() {
  return Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({
    role,
    label: getRoleLabel(role),
    permissions,
    totalPermissions: permissions.length,
  }));
}
