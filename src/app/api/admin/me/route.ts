import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";



/* =========================================================
   API ADMIN - USUÁRIO LOGADO

   Usada por telas administrativas para identificar o usuário.

   ETAPA 29.3:
   - Mantém os dados da sessão base.
   - Inclui o contexto ativo selecionado em /contexto.
   - Expõe campos efetivos para facilitar decisões visuais
     nas telas.

   Importante:
   A sessão base identifica o usuário.
   O contexto ativo define com qual papel/vínculo ele está
   operando naquele momento.
   ========================================================= */



export async function GET() {
  try {
    const user: any = await getAuthUser();

    const activeAccess: any = await getActiveUserAccessFromCookies({
      userId: user.id,
    });



    /* =========================================================
       CAMPOS EFETIVOS

       Se houver activeAccess, usamos ele.
       Caso contrário, mantemos os dados da sessão base.
       ========================================================= */

    const effectiveRole = activeAccess?.role || user.role;

    const effectiveAdministratorId =
      activeAccess?.administratorId !== undefined
        ? activeAccess.administratorId
        : user.administratorId || null;

    const effectiveCondominiumId =
      activeAccess?.condominiumId !== undefined
        ? activeAccess.condominiumId
        : user.condominiumId || null;

    const effectiveUnitId =
      activeAccess?.unitId !== undefined
        ? activeAccess.unitId
        : user.unitId || null;

    const effectiveResidentId =
      activeAccess?.residentId !== undefined
        ? activeAccess.residentId
        : user.residentId || null;



    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,

      /*
        Dados originais da sessão.
      */
      role: user.role,
      administratorId: user.administratorId || null,
      condominiumId: user.condominiumId || null,
      unitId: user.unitId || null,
      residentId: user.residentId || null,

      /*
        Contexto ativo bruto.
      */
      activeAccess: activeAccess || null,

      /*
        Dados efetivos.
        Estes devem ser preferidos em telas que dependem
        do contexto escolhido pelo usuário.
      */
      effectiveRole,
      effectiveAdministratorId,
      effectiveCondominiumId,
      effectiveUnitId,
      effectiveResidentId,
    });
  } catch (error: any) {
    console.error("ERRO AO CARREGAR USUÁRIO ADMIN:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao carregar usuário." },
      { status: 500 }
    );
  }
}