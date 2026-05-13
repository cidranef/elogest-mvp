import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-guard";
import {
  ActiveUserAccess,
  buildAccessSummary,
  getActiveUserAccessFromCookies,
  getNormalizedUserAccesses,
  getUserWithAccesses,
  roleLabel,
} from "@/lib/user-access";



/* =========================================================
   ETAPA 28.1 - LISTAR ACESSOS DO USUÁRIO

   Esta rota lista todos os vínculos/contextos ativos do usuário
   logado.

   Exemplo de retorno:
   [
     Morador - Condomínio Alpha / 101,
     Proprietário - Condomínio Alpha / 204,
     Síndico - Condomínio Beta
   ]

   Regras:
   - Se o usuário já possui registros em UserAccess, retorna eles.
   - Se ainda não possui UserAccess, retorna o acesso legado
     baseado nos campos antigos do User.
   - Não retorna senha nem dados sensíveis.

   ETAPA 30.4 - CORREÇÃO SÍNDICO + MORADOR

   Problema identificado:
   - Usuário com contexto SÍNDICO e também residentId/unitId
     não conseguia trocar para MORADOR/PROPRIETÁRIO.
   - Isso acontecia porque a rota usava apenas UserAccess quando
     havia registros em user.accesses.
   - Assim, o fallback residencial legado nunca era considerado.

   Solução:
   - A rota agora usa getNormalizedUserAccesses(user).
   - Essa função centraliza a montagem de todos os contextos:
     1. UserAccess explícitos;
     2. fallback legado, quando necessário;
     3. acesso residencial sintético quando houver residentId/unitId.

   Resultado esperado:
   - Síndico com unidade vinculada passa a ver:
     SÍNDICO + MORADOR/PROPRIETÁRIO em /contexto.

   ETAPA 40.1 — AUDITORIA FUNCIONAL FINAL DO MVP
   AUTENTICAÇÃO, PERFIL ATIVO E REDIRECIONAMENTO

   Ajustes desta revisão:
   - Remove dependência de nova consulta para getDefaultUserAccess,
     usando a própria lista normalizada carregada nesta rota.
   - Filtra somente perfis ativos na resposta.
   - Adiciona activeAccess na resposta.
   - Adiciona isCurrent em cada acesso para indicar o perfil
     efetivamente ativo no cookie/contexto atual.
   - Corrige roleLabel para retornar texto humanizado, como:
     "Síndico", "Morador", "Administradora".
   - Mantém accessId sintético, como:
     synthetic-resident:<residentId>.
   ========================================================= */



/* =========================================================
   HELPERS
   ========================================================= */

function getAccessComparisonKey(access: ActiveUserAccess | null) {
  if (!access) {
    return "";
  }

  if (access.accessId) {
    return `access:${access.accessId}`;
  }

  return [
    "context",
    access.role || "",
    access.administratorId || "",
    access.condominiumId || "",
    access.unitId || "",
    access.residentId || "",
  ].join(":");
}



function isSameAccess(
  accessA: ActiveUserAccess | null,
  accessB: ActiveUserAccess | null
) {
  if (!accessA || !accessB) {
    return false;
  }

  return getAccessComparisonKey(accessA) === getAccessComparisonKey(accessB);
}



function getDefaultAccessFromList(accesses: ActiveUserAccess[]) {
  return accesses.find((access) => access.isDefault) || accesses[0] || null;
}



/* =========================================================
   GET - LISTAR PERFIS DE ACESSO
   ========================================================= */

export async function GET() {
  try {
    const authUser: any = await getAuthUser();

    if (!authUser?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    /* =========================================================
       CARREGA USUÁRIO COM TODOS OS VÍNCULOS

       Inclui:
       - administrator;
       - condominium;
       - resident;
       - unit;
       - accesses ativos.
       ========================================================= */

    const user = await getUserWithAccesses(authUser.id);

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 404 }
      );
    }



    /* =========================================================
       ACESSOS NORMALIZADOS

       ETAPA 30.4:
       Substituímos a regra antiga:

       user.accesses.length > 0
         ? UserAccess
         : LegacyUser

       pela função central getNormalizedUserAccesses(user).

       Agora a lista pode conter também acesso sintético residencial:
       synthetic-resident:<residentId>

       Isso permite que um mesmo usuário opere como:
       - SÍNDICO;
       - MORADOR;
       - PROPRIETÁRIO.
       ========================================================= */

    const normalizedAccesses = getNormalizedUserAccesses(user);

    const activeAccesses = normalizedAccesses.filter((access) => {
      return access.isActive !== false;
    });



    /* =========================================================
       ACESSO PADRÃO E ACESSO ATUAL

       defaultAccess:
       - usado como sugestão quando nenhum perfil foi escolhido.

       activeAccess:
       - considera o cookie activeAccessId.
       - se não houver cookie válido, usa o padrão.
       ========================================================= */

    const defaultAccess = getDefaultAccessFromList(activeAccesses);

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: authUser.id,
    });



    /* =========================================================
       RESPOSTA SEGURA PARA O FRONTEND

       Não envia senha nem dados sensíveis.
       ========================================================= */

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },

      defaultAccess: buildAccessSummary(defaultAccess),

      activeAccess: buildAccessSummary(activeAccess),

      accesses: activeAccesses.map((access) => ({
        ...buildAccessSummary(access),

        // Campos visuais extras para facilitar o frontend.
        label: access.label,
        roleLabel: roleLabel(access.role),
        isDefault: access.isDefault,
        isActive: access.isActive,
        isCurrent: isSameAccess(access, activeAccess),
        source: access.source,
      })),
    });
  } catch (error: any) {
    console.error("ERRO AO LISTAR ACESSOS DO USUÁRIO:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao listar acessos do usuário." },
      { status: 500 }
    );
  }
}