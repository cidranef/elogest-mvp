import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-guard";
import {
  ACTIVE_ACCESS_COOKIE,
  SYNTHETIC_RESIDENT_ACCESS_PREFIX,
  buildAccessSummary,
  getActiveUserAccessFromCookies,
  getDefaultUserAccess,
  getUserAccessById,
} from "@/lib/user-access";



/* =========================================================
   ETAPA 28.5 - ACESSO ATIVO DO USUÁRIO

   Esta rota:
   - retorna o contexto ativo atual;
   - salva o contexto escolhido pelo usuário;
   - usa o cookie activeAccessId.

   GET:
   - lê o contexto ativo a partir do cookie.

   POST:
   - recebe accessId;
   - valida se pertence ao usuário logado;
   - grava cookie httpOnly;
   - retorna o contexto ativo escolhido.

   ETAPA 40.1 — AUDITORIA FUNCIONAL FINAL DO MVP
   AUTENTICAÇÃO, PERFIL ATIVO E REDIRECIONAMENTO

   Ajustes desta revisão:
   - accessId null não limpa mais o contexto automaticamente.
   - Limpar contexto agora exige clear: true.
   - Suporte defensivo para perfil sintético residencial enviado
     com source/residentId.
   - Se o perfil escolhido for fallback legado sem accessId,
     a rota retorna sucesso usando o acesso padrão e remove cookie
     inválido anterior.
   - Mantida validação de que o acesso pertence ao usuário logado.
   ========================================================= */



/* =========================================================
   HELPERS
   ========================================================= */

function getStringOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}



function buildSyntheticResidentAccessId(residentId?: string | null) {
  if (!residentId) {
    return null;
  }

  return `${SYNTHETIC_RESIDENT_ACCESS_PREFIX}${residentId}`;
}



function sameOrEmpty(
  expected?: string | null,
  received?: string | null
) {
  if (!received) {
    return true;
  }

  return expected === received;
}



function bodyMatchesAccess(body: any, access: any) {
  if (!access) {
    return false;
  }

  const role = getStringOrNull(body?.role);
  const administratorId = getStringOrNull(body?.administratorId);
  const condominiumId = getStringOrNull(body?.condominiumId);
  const unitId = getStringOrNull(body?.unitId);
  const residentId = getStringOrNull(body?.residentId);

  if (role && access.role !== role) {
    return false;
  }

  if (!sameOrEmpty(access.administratorId, administratorId)) {
    return false;
  }

  if (!sameOrEmpty(access.condominiumId, condominiumId)) {
    return false;
  }

  if (!sameOrEmpty(access.unitId, unitId)) {
    return false;
  }

  if (!sameOrEmpty(access.residentId, residentId)) {
    return false;
  }

  return true;
}



/* =========================================================
   GET - BUSCAR CONTEXTO ATIVO
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

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: authUser.id,
    });

    return NextResponse.json({
      activeAccess: buildAccessSummary(activeAccess),
    });
  } catch (error: any) {
    console.error("ERRO AO BUSCAR ACESSO ATIVO:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao buscar acesso ativo." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - DEFINIR CONTEXTO ATIVO
   ========================================================= */

export async function POST(req: NextRequest) {
  try {
    const authUser: any = await getAuthUser();

    if (!authUser?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    const body = await req.json();



    /* =========================================================
       LIMPAR CONTEXTO — AGORA APENAS DE FORMA EXPLÍCITA

       Antes:
       - accessId null limpava automaticamente o cookie.

       Problema:
       - Perfis sintéticos/fallback poderiam chegar sem accessId
         em alguns fluxos de interface.

       Agora:
       - só limpa quando body.clear === true.
       ========================================================= */

    if (body?.clear === true) {
      const response = NextResponse.json({
        success: true,
        message: "Contexto ativo redefinido para o padrão.",
        activeAccess: null,
      });

      response.cookies.delete(ACTIVE_ACCESS_COOKIE);

      return response;
    }



    /* =========================================================
       IDENTIFICA O ACCESS ID ESCOLHIDO

       Situações aceitas:
       1. accessId real de UserAccess;
       2. accessId sintético já montado;
       3. source SYNTHETIC_RESIDENT com residentId, para montar:
          synthetic-resident:<residentId>
       ========================================================= */

    const receivedAccessId = getStringOrNull(body?.accessId);

    const source = getStringOrNull(body?.source);
    const residentId = getStringOrNull(body?.residentId);

    const syntheticAccessId =
      source === "SYNTHETIC_RESIDENT"
        ? buildSyntheticResidentAccessId(residentId)
        : null;

    const accessId = receivedAccessId || syntheticAccessId;



    /* =========================================================
       CASO SEM ACCESS ID

       Isso pode acontecer em fallback legado.

       Não limpamos o cookie automaticamente. Tentamos usar o
       acesso padrão do usuário e validamos se ele corresponde
       ao que foi enviado pela tela.

       Se corresponder:
       - retorna sucesso;
       - remove cookie anterior, pois o padrão será usado;
       - evita manter cookie inválido ou antigo.
       ========================================================= */

    if (!accessId) {
      const defaultAccess = await getDefaultUserAccess(authUser.id);

      if (!defaultAccess || !bodyMatchesAccess(body, defaultAccess)) {
        return NextResponse.json(
          {
            error:
              "Não foi possível identificar o perfil de acesso selecionado.",
          },
          { status: 400 }
        );
      }

      const response = NextResponse.json({
        success: true,
        message: "Contexto ativo atualizado para o perfil padrão.",
        activeAccess: buildAccessSummary(defaultAccess),
      });

      response.cookies.delete(ACTIVE_ACCESS_COOKIE);

      return response;
    }



    /* =========================================================
       VALIDA SE O ACESSO PERTENCE AO USUÁRIO LOGADO

       getUserAccessById já suporta:
       - UserAccess real;
       - synthetic-resident:<residentId>.
       ========================================================= */

    const selectedAccess = await getUserAccessById(authUser.id, accessId);

    if (!selectedAccess) {
      return NextResponse.json(
        { error: "Acesso não encontrado ou não pertence ao usuário." },
        { status: 404 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DEFENSIVA DO BODY

       Se a tela enviou role/contexto, conferimos se bate com
       o acesso localizado. Isso evita gravar um accessId correto
       com dados contextuais incoerentes no payload.
       ========================================================= */

    if (!bodyMatchesAccess(body, selectedAccess)) {
      return NextResponse.json(
        { error: "Os dados do perfil selecionado não conferem." },
        { status: 400 }
      );
    }



    /* =========================================================
       SALVA COOKIE DO CONTEXTO ATIVO

       Pode salvar:
       - ID real do UserAccess;
       - ID sintético residencial:
         synthetic-resident:<residentId>
       ========================================================= */

    const response = NextResponse.json({
      success: true,
      message: "Contexto ativo atualizado com sucesso.",
      activeAccess: buildAccessSummary(selectedAccess),
    });

    response.cookies.set(ACTIVE_ACCESS_COOKIE, selectedAccess.accessId || accessId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error: any) {
    console.error("ERRO AO DEFINIR ACESSO ATIVO:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao definir acesso ativo." },
      { status: 500 }
    );
  }
}