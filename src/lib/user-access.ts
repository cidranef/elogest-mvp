import { db } from "@/lib/db";



/* =========================================================
   ETAPA 27.3 - UTILITÁRIO DE CONTEXTO ATIVO DO USUÁRIO

   Objetivo:
   Centralizar a leitura do vínculo ativo do usuário.

   Novo modelo:
   - User representa a pessoa/login.
   - UserAccess representa o contexto de acesso.

   Exemplos:
   - MORADOR em uma unidade;
   - PROPRIETARIO em outra unidade;
   - SINDICO em um condomínio;
   - ADMINISTRADORA em uma administradora;
   - SUPER_ADMIN global.

   ETAPA 28.3:
   - Adicionada leitura do cookie activeAccessId.
   - Rotas podem usar getActiveUserAccessFromCookies().
   - Se o cookie existir e for válido, usa o contexto escolhido.
   - Se não existir cookie, usa o contexto padrão.
   - Se o cookie estiver inválido, ignora e usa o padrão.

   ETAPA 30.4:
   Correção para usuário com múltiplos papéis operacionais.

   Problema identificado:
   - Usuário com role SINDICO e também residentId/unitId vinculado
     entrava apenas como síndico.
   - A tela /contexto não oferecia opção de Morador/Proprietário.
   - Ao tentar trocar, o contexto continuava como SINDICO.

   Solução:
   - Criamos acesso sintético residencial quando o usuário possui
     vínculo com Resident/Unit.
   - Isso permite que um mesmo usuário opere como:
     SINDICO + MORADOR
     ou
     SINDICO + PROPRIETARIO
   - O accessId sintético é estável e pode ser salvo no cookie:
     synthetic-resident:<residentId>
   ========================================================= */



/* =========================================================
   COOKIE DO CONTEXTO ATIVO

   Este cookie é gravado pela rota:
   /api/user/active-access

   Ele guarda o ID do UserAccess escolhido pelo usuário.
   Também pode guardar um ID sintético residencial:
   synthetic-resident:<residentId>
   ========================================================= */

export const ACTIVE_ACCESS_COOKIE = "activeAccessId";

export const SYNTHETIC_RESIDENT_ACCESS_PREFIX = "synthetic-resident:";



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

  label: string;
  isDefault: boolean;
  isActive: boolean;

  source: "USER_ACCESS" | "LEGACY_USER" | "SYNTHETIC_RESIDENT";
};



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
}: {
  role?: string | null;
  administratorName?: string | null;
  condominiumName?: string | null;
  unit?: {
    block?: string | null;
    unitNumber?: string | null;
  } | null;
}) {
  const baseRole = roleLabel(role);
  const unitLabel = buildUnitLabel(unit);

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
    if (condominiumName && unitLabel) {
      return `Morador - ${condominiumName} / ${unitLabel}`;
    }

    if (unitLabel) {
      return `Morador - ${unitLabel}`;
    }

    return "Morador";
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

   Usado internamente por getDefaultUserAccess e
   getActiveUserAccess.
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

   Transforma o registro do banco em um formato padrão
   para as rotas usarem.
   ========================================================= */

export function normalizeUserAccess(user: any, access: any): ActiveUserAccess {
  const role = access.role as ActiveAccessRole;

  const condominiumName =
    access.condominium?.name ||
    access.resident?.condominium?.name ||
    user.condominium?.name ||
    null;

  const administratorName =
    access.administrator?.name || user.administrator?.name || null;

  const unit = access.unit || access.resident?.unit || null;

  const label =
    access.label ||
    buildAccessLabelFromData({
      role,
      administratorName,
      condominiumName,
      unit,
    });

  return {
    accessId: access.id,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    role,

    administratorId: access.administratorId || null,
    condominiumId:
      access.condominiumId || access.resident?.condominiumId || null,
    unitId: access.unitId || access.resident?.unitId || null,
    residentId: access.residentId || null,

    label,
    isDefault: !!access.isDefault,
    isActive: !!access.isActive,

    source: "USER_ACCESS",
  };
}



/* =========================================================
   FALLBACK LEGADO

   Caso algum usuário ainda não tenha UserAccess, criamos um
   contexto em memória com base nos campos antigos do User.

   Isso evita quebra durante a migração gradual.
   ========================================================= */

export function normalizeLegacyUserAccess(user: any): ActiveUserAccess {
  const role = user.role as ActiveAccessRole;

  const condominiumName =
    user.condominium?.name || user.resident?.condominium?.name || null;

  const administratorName = user.administrator?.name || null;

  const unit = user.resident?.unit || null;

  const label = buildAccessLabelFromData({
    role,
    administratorName,
    condominiumName,
    unit,
  });

  return {
    accessId: null,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    role,

    administratorId: user.administratorId || null,
    condominiumId: user.condominiumId || user.resident?.condominiumId || null,
    unitId: user.resident?.unitId || null,
    residentId: user.residentId || null,

    label,
    isDefault: true,
    isActive: !!user.isActive,

    source: "LEGACY_USER",
  };
}



/* =========================================================
   ETAPA 30.4 - ROLE RESIDENCIAL SINTÉTICO

   Define se o vínculo residencial deve aparecer como
   MORADOR ou PROPRIETARIO.

   Regra:
   - Se residentType indicar proprietário, usa PROPRIETARIO.
   - Caso contrário, usa MORADOR.

   Esta regra é tolerante a variações:
   - PROPRIETARIO
   - PROPRIETÁRIO
   - Proprietário
   - owner
   ========================================================= */

function getSyntheticResidentRole(user: any): ActiveAccessRole {
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
   ETAPA 30.4 - ACESSO RESIDENCIAL SINTÉTICO

   Cria um contexto adicional quando o usuário tem vínculo
   com Resident/Unit.

   Exemplo:
   Usuário principal:
   - role: SINDICO
   - condominiumId: Condomínio Alpha
   - residentId: João / Unidade 101

   Contextos resultantes:
   - SINDICO - Condomínio Alpha
   - MORADOR - Condomínio Alpha / 101

   O accessId sintético é:
   synthetic-resident:<residentId>
   ========================================================= */

export function normalizeSyntheticResidentAccess(
  user: any
): ActiveUserAccess | null {
  if (!user?.residentId || !user?.resident) {
    return null;
  }

  const role = getSyntheticResidentRole(user);

  const condominiumName =
    user.resident?.condominium?.name || user.condominium?.name || null;

  const unit = user.resident?.unit || null;

  const label = buildAccessLabelFromData({
    role,
    condominiumName,
    unit,
  });

  return {
    accessId: `${SYNTHETIC_RESIDENT_ACCESS_PREFIX}${user.residentId}`,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    role,

    administratorId: null,
    condominiumId: user.resident?.condominiumId || user.condominiumId || null,
    unitId: user.resident?.unitId || null,
    residentId: user.residentId || null,

    label,
    isDefault: false,
    isActive: !!user.isActive,

    source: "SYNTHETIC_RESIDENT",
  };
}



/* =========================================================
   ETAPA 30.4 - CHAVE DE DEDUPLICAÇÃO

   Evita duplicar contexto se já existir UserAccess explícito
   para o mesmo morador/unidade.

   Preferência:
   - UserAccess explícito sempre ganha.
   - Sintético só entra quando não houver contexto residencial.
   ========================================================= */

function getAccessDedupKey(access: ActiveUserAccess) {
  return [
    access.role,
    access.administratorId || "",
    access.condominiumId || "",
    access.unitId || "",
    access.residentId || "",
  ].join("|");
}



/* =========================================================
   ETAPA 30.4 - LISTA NORMALIZADA DE TODOS OS ACESSOS

   Esta é a função principal para montar a lista de contextos.

   Regra:
   1. Se houver UserAccess, normaliza todos.
   2. Se não houver UserAccess, usa fallback legado.
   3. Se o usuário tiver Resident vinculado, adiciona contexto
      residencial sintético, desde que não exista duplicado.
   ========================================================= */

export function getNormalizedUserAccesses(user: any): ActiveUserAccess[] {
  const normalizedAccesses: ActiveUserAccess[] =
    user.accesses && user.accesses.length > 0
      ? user.accesses.map((access: any) => normalizeUserAccess(user, access))
      : [normalizeLegacyUserAccess(user)];

  const syntheticResidentAccess = normalizeSyntheticResidentAccess(user);

  if (syntheticResidentAccess) {
    const alreadyHasResidentialAccess = normalizedAccesses.some((access) => {
      if (access.role !== "MORADOR" && access.role !== "PROPRIETARIO") {
        return false;
      }

      if (
        syntheticResidentAccess.residentId &&
        access.residentId === syntheticResidentAccess.residentId
      ) {
        return true;
      }

      if (
        syntheticResidentAccess.unitId &&
        access.unitId === syntheticResidentAccess.unitId
      ) {
        return true;
      }

      return getAccessDedupKey(access) === getAccessDedupKey(syntheticResidentAccess);
    });

    if (!alreadyHasResidentialAccess) {
      normalizedAccesses.push(syntheticResidentAccess);
    }
  }

  return normalizedAccesses;
}



/* =========================================================
   BUSCAR ACESSO PADRÃO DO USUÁRIO

   Regra:
   1. Monta todos os acessos normalizados.
   2. Busca isDefault=true.
   3. Se não houver, pega o primeiro.
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

   Agora também funciona para accessId sintético:

   synthetic-resident:<residentId>
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

   Regra:
   - se activeAccessId for enviado, tenta usar ele;
   - se não for enviado, usa o acesso padrão;
   - se nada existir, usa fallback legado.

   Observação:
   Esta função continua existindo para compatibilidade com
   rotas/scripts que ainda passam activeAccessId manualmente.
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
   ETAPA 28.3 - LER activeAccessId DOS COOKIES

   Esta função é segura para uso em rotas server-side do Next.js.

   Por que usamos import dinâmico?
   - Para não quebrar scripts Node fora do contexto Next.
   - Para manter compatibilidade com scripts de backfill.
   - Para evitar import estático de next/headers em rotinas que
     não rodam dentro de uma requisição Next.

   Se estiver fora de um request context, retorna null.
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
   ETAPA 28.3 - BUSCAR CONTEXTO ATIVO A PARTIR DO COOKIE

   Esta será a função preferencial nas rotas.

   Regra:
   1. Lê activeAccessId do cookie.
   2. Se existir e pertencer ao usuário, usa esse contexto.
   3. Se não existir ou for inválido, usa o contexto padrão.
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

   Esta função será usada para gravar:

   TicketLog.actorRole
   TicketLog.actorLabel

   Assim a timeline poderá mostrar:

   João da Silva
   [Morador]

   Maria Souza
   [Síndico]

   Observação:
   O banco mantém actorLabel completo para auditoria.
   A tela pode exibir apenas roleLabel().
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

   Retorna um objeto seguro para enviar ao frontend, sem dados
   sensíveis.
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
    source: access.source,
  };
}


/* =========================================================
   HELPERS DE ÁREA POR CONTEXTO ATIVO

   Usar em layouts e páginas server-side para proteger áreas.

   Separação oficial:
   - /elogest → SUPER_ADMIN
   - /admin   → ADMINISTRADORA com administratorId
   - /portal  → SINDICO, MORADOR, PROPRIETARIO, CONSELHEIRO
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
