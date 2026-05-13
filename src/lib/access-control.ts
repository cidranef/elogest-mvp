/* =========================================================
   ETAPA 26.1 / 26.4 - MATRIZ CENTRAL DE PERMISSÕES - ELOGEST

   Este arquivo centraliza regras básicas de acesso por perfil.

   Objetivo:
   - evitar regras espalhadas;
   - padronizar permissões;
   - facilitar auditoria de segurança;
   - permitir que páginas, APIs e componentes consultem
     permissões de forma consistente.

   Perfis existentes:
   - SUPER_ADMIN
   - ADMINISTRADORA
   - SINDICO
   - MORADOR
   - PROPRIETARIO
   - CONSELHEIRO

   ETAPA 35.7.5:
   - Adicionado suporte explícito ao perfil PROPRIETARIO.
   - Corrige bloqueio em /api/notifications quando o usuário
     está operando no contexto de proprietário/morador.
   - PROPRIETARIO passa a ter as mesmas permissões operacionais
     básicas do MORADOR no portal.

   ETAPA 40.2 — AUDITORIA DE PERMISSÕES E CONTEXTO ATIVO NAS APIs

   Ajustes desta revisão:
   - AuthUserLike passa a incluir unitId e source.
   - Adicionado suporte explícito ao perfil CONSELHEIRO.
   - Adicionados helpers de escopo por administradora, condomínio,
     unidade e morador.
   - Adicionados helpers para validar área usando o perfil ativo.
   - Separada a área ELOGEST da área ADMIN para evitar que
     SUPER_ADMIN opere dentro da área da administradora.
   - Documentado que APIs devem preferir o activeAccess, não apenas
     session.user.role.
   - Mantida compatibilidade com funções já existentes.
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

  | "MANAGE_OWN_NOTIFICATION_PREFERENCES";



/* =========================================================
   AUTH USER LIKE

   Importante:
   Para APIs novas ou revisadas, prefira enviar o activeAccess
   como parâmetro destas funções.

   Exemplo recomendado:
   const activeAccess = await getActiveUserAccessFromCookies({ userId });
   canAccessPortal(activeAccess)

   Evite depender apenas de session.user.role em APIs que precisam
   respeitar troca de perfil, contexto ativo e usuário com múltiplos
   vínculos.
   ========================================================= */

export type AuthUserLike = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: AppRole | null;

  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;

  accessId?: string | null;
  label?: string | null;
  source?: string | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
};



/* =========================================================
   LABELS DOS PERFIS
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



/* =========================================================
   NORMALIZAÇÃO BÁSICA
   ========================================================= */

export function normalizeRole(role?: AppRole | null) {
  return String(role || "").trim().toUpperCase();
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
   MATRIZ DE PERMISSÕES POR PERFIL

   Regras específicas de escopo continuam sendo validadas nas APIs:
   - administradora vê apenas sua carteira;
   - síndico vê apenas seu condomínio;
   - morador/proprietário vê apenas seus chamados/unidade;
   - super admin vê tudo.

   Observação:
   CONSELHEIRO fica com permissões mínimas de portal por enquanto.
   O escopo operacional específico pode ser expandido depois.
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

    "VIEW_ALL_TICKETS",
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

    "MANAGE_OWN_NOTIFICATION_PREFERENCES",
  ],

  ADMINISTRADORA: [
    "ACCESS_ADMIN",
    "ACCESS_NOTIFICATIONS",

    "MANAGE_CONDOMINIUMS",
    "MANAGE_UNITS",
    "MANAGE_RESIDENTS",
    "MANAGE_USERS",

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

    "MANAGE_OWN_NOTIFICATION_PREFERENCES",
  ],

  CONSELHEIRO: [
    "ACCESS_PORTAL",
    "ACCESS_NOTIFICATIONS",

    "VIEW_CONDOMINIUM_TICKETS",

    "COMMENT_PUBLIC",

    "UPLOAD_ATTACHMENT",

    "VIEW_DASHBOARDS",

    "MANAGE_OWN_NOTIFICATION_PREFERENCES",
  ],
};



/* =========================================================
   CONSULTAR PERMISSÃO
   ========================================================= */

export function hasPermission(
  user: AuthUserLike | null | undefined,
  permission: PermissionKey
) {
  const role = normalizeRole(user?.role);

  if (!role) return false;

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
  return hasPermission(user, "ACCESS_ADMIN");
}



export function canAccessPortal(user?: AuthUserLike | null) {
  return hasPermission(user, "ACCESS_PORTAL");
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
  return hasPermission(user, "CREATE_ADMIN_TICKET");
}



export function canCreatePortalTicket(user?: AuthUserLike | null) {
  return hasPermission(user, "CREATE_PORTAL_TICKET");
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



export function canViewReports(user?: AuthUserLike | null) {
  return hasPermission(user, "VIEW_REPORTS");
}



export function canViewDashboards(user?: AuthUserLike | null) {
  return hasPermission(user, "VIEW_DASHBOARDS");
}



/* =========================================================
   VALIDADORES DE ESCOPO

   Estes helpers não substituem o filtro Prisma das APIs.
   Eles servem para padronizar comparações e deixar as regras
   explícitas.

   Exemplos de uso:
   - Administradora só acessa condomínios de sua carteira.
   - Síndico só acessa seu condomínio.
   - Morador/proprietário só acessa sua unidade/residentId.
   ========================================================= */

export function canAccessAdministratorScope(
  user: AuthUserLike | null | undefined,
  administratorId?: string | null
) {
  if (!user) return false;

  if (isSuperAdmin(user)) {
    return true;
  }

  if (isAdministradora(user)) {
    return sameId(user.administratorId, administratorId);
  }

  return false;
}



export function canAccessCondominiumScope(
  user: AuthUserLike | null | undefined,
  condominiumId?: string | null
) {
  if (!user) return false;

  if (isSuperAdmin(user)) {
    return true;
  }

  if (isAdministradora(user)) {
    return true;
  }

  if (isSindico(user) || isConselheiro(user)) {
    return sameId(user.condominiumId, condominiumId);
  }

  if (isResidentialRole(user)) {
    return sameId(user.condominiumId, condominiumId);
  }

  return false;
}



export function canAccessUnitScope(
  user: AuthUserLike | null | undefined,
  unitId?: string | null
) {
  if (!user) return false;

  if (isSuperAdmin(user) || isAdministradora(user)) {
    return true;
  }

  if (isSindico(user) || isConselheiro(user)) {
    return true;
  }

  if (isResidentialRole(user)) {
    return sameId(user.unitId, unitId);
  }

  return false;
}



export function canAccessResidentScope(
  user: AuthUserLike | null | undefined,
  residentId?: string | null
) {
  if (!user) return false;

  if (isSuperAdmin(user) || isAdministradora(user)) {
    return true;
  }

  if (isSindico(user) || isConselheiro(user)) {
    return true;
  }

  if (isResidentialRole(user)) {
    return sameId(user.residentId, residentId);
  }

  return false;
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
  assignedToUserId?: string | null;
};



export function canAccessTicketScope(
  user: AuthUserLike | null | undefined,
  ticket?: TicketScopeLike | null
) {
  if (!user || !ticket) {
    return false;
  }

  if (isSuperAdmin(user)) {
    return true;
  }

  if (isAdministradora(user)) {
    if (ticket.administratorId && user.administratorId) {
      return sameId(user.administratorId, ticket.administratorId);
    }

    return canViewAdminTickets(user);
  }

  if (isSindico(user) || isConselheiro(user)) {
    return sameId(user.condominiumId, ticket.condominiumId);
  }

  if (isResidentialRole(user)) {
    if (ticket.residentId && user.residentId) {
      return sameId(user.residentId, ticket.residentId);
    }

    if (ticket.unitId && user.unitId) {
      return sameId(user.unitId, ticket.unitId);
    }

    if (ticket.createdByUserId && user.id) {
      return sameId(user.id, ticket.createdByUserId);
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

   Observação:
   Para administradora, quando o ticket não tem administratorId
   direto, a API pode precisar filtrar via relacionamento com
   condominium.administratorId.
   ========================================================= */

export function buildAdminScopeWhere(user?: AuthUserLike | null) {
  if (!user) {
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
      administratorId: user.administratorId || "__NO_ACCESS__",
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



export function buildPortalTicketScopeWhere(user?: AuthUserLike | null) {
  if (!user) {
    return {
      id: "__NO_ACCESS__",
    };
  }

  if (isSindico(user) || isConselheiro(user)) {
    return {
      condominiumId: user.condominiumId || "__NO_ACCESS__",
    };
  }

  if (isResidentialRole(user)) {
    return {
      OR: [
        {
          residentId: user.residentId || "__NO_ACCESS__",
        },
        {
          unitId: user.unitId || "__NO_ACCESS__",
        },
        {
          createdByUserId: user.id || "__NO_ACCESS__",
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