import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";



/* =========================================================
   AUTH GUARD - ELOGEST

   Função central para recuperar o usuário autenticado
   em rotas server-side, route handlers e páginas protegidas.

   Regra:
   - Sem sessão válida: lança erro "UNAUTHORIZED".
   - Com sessão válida: retorna o usuário autenticado já preparado
     para trabalhar com perfil ativo/contexto ativo quando essa
     informação estiver disponível na sessão.

   ETAPA 40.1 — AUDITORIA FUNCIONAL FINAL DO MVP
   AUTENTICAÇÃO E REDIRECIONAMENTO

   Ajustes anteriores:
   - Mantida compatibilidade total com getAuthUser().
   - Adicionado tipo AuthUser para reduzir uso de any.
   - Adicionados helpers isAuthError() e unauthorizedResponse().
   - Mantida a string "UNAUTHORIZED" usada pelas APIs existentes.

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   Ajustes desta revisão:
   - AuthUser passa a refletir melhor o contexto ativo do usuário.
   - Adicionado suporte a accessId, label, source e isDefault.
   - Adicionado suporte a unitPersonLinkId e tipo de vínculo da unidade.
   - Adicionado suporte a permissões e metadados vindos do UserAccess.
   - Adicionado helper getEffectiveAuthUser() para mesclar activeAccess
     quando a sessão já trouxer esse objeto.
   - Mantida compatibilidade com session.user legado.

   Observação importante:
   Este arquivo NÃO consulta o banco diretamente.
   Ele apenas normaliza a sessão já emitida pelo NextAuth.

   A resolução completa do perfil ativo por cookie/banco deve continuar
   nas rotas próprias de contexto, como:
   - src/app/api/user/accesses/route.ts
   - src/app/api/user/active-access/route.ts
   ========================================================= */



/* =========================================================
   TIPOS
   ========================================================= */

export type AuthAccessRole =
  | "SUPER_ADMIN"
  | "ADMINISTRADORA"
  | "SINDICO"
  | "MORADOR"
  | "PROPRIETARIO"
  | "CONSELHEIRO"
  | string;



export type AuthUnitPersonLinkType =
  | "OWNER"
  | "RESIDENT"
  | "TENANT"
  | "DEPENDENT"
  | "AUTHORIZED"
  | string;



export type AuthJsonObject = Record<string, unknown>;



export type AuthActiveAccess = {
  id?: string | null;
  accessId?: string | null;

  userId?: string | null;
  role?: AuthAccessRole | null;
  label?: string | null;

  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  unitPersonLinkId?: string | null;

  unitPersonLinkType?: AuthUnitPersonLinkType | null;
  linkType?: AuthUnitPersonLinkType | null;

  canVote?: boolean | null;
  canOpenTickets?: boolean | null;
  receivesNotifications?: boolean | null;

  permissionsOverride?: AuthJsonObject | null;
  metadata?: AuthJsonObject | null;

  source?: string | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;

  lastUsedAt?: string | Date | null;
  revokedAt?: string | Date | null;
  revokedReason?: string | null;
};



export type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;

  /* Perfil efetivo do usuário na requisição atual. */
  role?: AuthAccessRole | null;

  /* Escopos efetivos da requisição atual. */
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  unitPersonLinkId?: string | null;

  /* Dados do perfil ativo/UserAccess. */
  accessId?: string | null;
  label?: string | null;
  source?: string | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;

  /* Dados do vínculo da pessoa com a unidade. */
  unitPersonLinkType?: AuthUnitPersonLinkType | null;
  linkType?: AuthUnitPersonLinkType | null;
  canVote?: boolean | null;
  canOpenTickets?: boolean | null;
  receivesNotifications?: boolean | null;

  /* Campos preparados para governança e regras especiais. */
  permissionsOverride?: AuthJsonObject | null;
  metadata?: AuthJsonObject | null;
  lastUsedAt?: string | Date | null;
  revokedAt?: string | Date | null;
  revokedReason?: string | null;

  /* Compatibilidade com sessões que já tragam o perfil ativo aninhado. */
  activeAccess?: AuthActiveAccess | null;
};



/* =========================================================
   HELPERS INTERNOS
   ========================================================= */

function normalizeNullableString(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized || null;
}



function normalizeBoolean(value?: boolean | null) {
  return typeof value === "boolean" ? value : null;
}



function normalizeJsonObject(value?: AuthJsonObject | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}



/* =========================================================
   PERFIL EFETIVO DA SESSÃO

   Se a sessão trouxer apenas dados legados em session.user, mantém.
   Se a sessão trouxer activeAccess, ele passa a ser a fonte principal
   para role, escopos e vínculo.
   ========================================================= */

export function getEffectiveAuthUser(user: AuthUser): AuthUser {
  const activeAccess = user.activeAccess;

  if (!activeAccess) {
    return {
      ...user,
      role: normalizeNullableString(user.role),
      administratorId: normalizeNullableString(user.administratorId),
      condominiumId: normalizeNullableString(user.condominiumId),
      unitId: normalizeNullableString(user.unitId),
      residentId: normalizeNullableString(user.residentId),
      unitPersonLinkId: normalizeNullableString(user.unitPersonLinkId),
      accessId: normalizeNullableString(user.accessId),
      label: normalizeNullableString(user.label),
      source: normalizeNullableString(user.source) || "LEGACY_SESSION",
      isDefault: normalizeBoolean(user.isDefault),
      isActive: user.isActive === false ? false : true,
      unitPersonLinkType: normalizeNullableString(
        user.unitPersonLinkType || user.linkType
      ),
      linkType: normalizeNullableString(user.linkType || user.unitPersonLinkType),
      canVote: normalizeBoolean(user.canVote),
      canOpenTickets: normalizeBoolean(user.canOpenTickets),
      receivesNotifications: normalizeBoolean(user.receivesNotifications),
      permissionsOverride: normalizeJsonObject(user.permissionsOverride),
      metadata: normalizeJsonObject(user.metadata),
    };
  }

  const effectiveLinkType = normalizeNullableString(
    activeAccess.unitPersonLinkType ||
      activeAccess.linkType ||
      user.unitPersonLinkType ||
      user.linkType
  );

  return {
    ...user,

    role: normalizeNullableString(activeAccess.role || user.role),

    administratorId: normalizeNullableString(
      activeAccess.administratorId || user.administratorId
    ),
    condominiumId: normalizeNullableString(
      activeAccess.condominiumId || user.condominiumId
    ),
    unitId: normalizeNullableString(activeAccess.unitId || user.unitId),
    residentId: normalizeNullableString(
      activeAccess.residentId || user.residentId
    ),
    unitPersonLinkId: normalizeNullableString(
      activeAccess.unitPersonLinkId || user.unitPersonLinkId
    ),

    accessId: normalizeNullableString(
      activeAccess.accessId || activeAccess.id || user.accessId
    ),
    label: normalizeNullableString(activeAccess.label || user.label),
    source: normalizeNullableString(activeAccess.source || user.source) ||
      "USER_ACCESS",
    isDefault: normalizeBoolean(activeAccess.isDefault ?? user.isDefault),
    isActive: activeAccess.isActive === false || user.isActive === false
      ? false
      : true,

    unitPersonLinkType: effectiveLinkType,
    linkType: effectiveLinkType,

    canVote: normalizeBoolean(activeAccess.canVote ?? user.canVote),
    canOpenTickets: normalizeBoolean(
      activeAccess.canOpenTickets ?? user.canOpenTickets
    ),
    receivesNotifications: normalizeBoolean(
      activeAccess.receivesNotifications ?? user.receivesNotifications
    ),

    permissionsOverride: normalizeJsonObject(
      activeAccess.permissionsOverride || user.permissionsOverride
    ),
    metadata: normalizeJsonObject(activeAccess.metadata || user.metadata),

    lastUsedAt: activeAccess.lastUsedAt || user.lastUsedAt || null,
    revokedAt: activeAccess.revokedAt || user.revokedAt || null,
    revokedReason: normalizeNullableString(
      activeAccess.revokedReason || user.revokedReason
    ),
  };
}



/* =========================================================
   AUTENTICAÇÃO
   ========================================================= */

export async function getAuthUser(): Promise<AuthUser> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  return getEffectiveAuthUser(session.user as AuthUser);
}



export async function getOptionalAuthUser(): Promise<AuthUser | null> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return null;
  }

  return getEffectiveAuthUser(session.user as AuthUser);
}



export async function getActiveAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();

  if (user.isActive === false || user.revokedAt) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}



/* =========================================================
   ERROS E RESPOSTAS PADRÃO
   ========================================================= */

export function isAuthError(error: unknown) {
  return error instanceof Error && error.message === "UNAUTHORIZED";
}



export function unauthorizedResponse() {
  return Response.json(
    { error: "Não autorizado." },
    { status: 401 }
  );
}



export function forbiddenResponse(message = "Acesso negado.") {
  return Response.json(
    { error: message },
    { status: 403 }
  );
}
