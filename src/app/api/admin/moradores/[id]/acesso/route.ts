import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";



/* =========================================================
   MORADORES - RESOLVER ACESSO

   ETAPA 35.4 — INTEGRAÇÃO MORADOR x ACESSO AO PORTAL

   Objetivo:
   Ao clicar em "Gerenciar acesso" no cadastro do morador,
   o sistema decide automaticamente:

   1. Se o morador já tem usuário vinculado:
      -> editar usuário vinculado

   2. Se o morador não tem usuário, mas o e-mail já existe:
      -> editar usuário existente para permitir vínculo

   3. Se o morador não tem usuário e o e-mail não existe:
      -> criar novo usuário MORADOR

   Regras de segurança:
   - SUPER_ADMIN pode gerenciar qualquer morador
   - ADMINISTRADORA só pode gerenciar moradores da própria carteira
   - Morador inativo não pode receber novo acesso
   - Morador sem e-mail não pode gerar acesso ao portal
   - E-mail duplicado fora da carteira bloqueia o fluxo
   ========================================================= */



interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}



/* =========================================================
   HELPERS
   ========================================================= */

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}



function isValidEmail(email: string) {
  if (!email) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}



/* =========================================================
   GET - RESOLVER ACESSO DO MORADOR
   ========================================================= */

export async function GET(req: Request, context: RouteContext) {
  try {
    const authUser: any = await getAuthUser();
    const { id } = await context.params;



    /* =========================================================
       AUTORIZAÇÃO
       ========================================================= */

    if (authUser.role !== "SUPER_ADMIN" && authUser.role !== "ADMINISTRADORA") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    /* =========================================================
       LOCALIZAR MORADOR COM ESCOPO DE CARTEIRA

       SUPER_ADMIN:
       - pode localizar qualquer morador

       ADMINISTRADORA:
       - só pode localizar morador vinculado a condomínio
         da própria administradora
       ========================================================= */

    const morador = await db.resident.findFirst({
      where: {
        id,
        ...(authUser.role === "SUPER_ADMIN"
          ? {}
          : {
              condominium: {
                administratorId: authUser.administratorId,
              },
            }),
      },
      include: {
        condominium: true,
        unit: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });



    if (!morador) {
      return NextResponse.json(
        { error: "Morador não encontrado ou acesso negado." },
        { status: 404 }
      );
    }



    /* =========================================================
       BLOQUEAR MORADOR INATIVO

       Regra:
       - Morador inativo permanece no histórico
       - Mas não deve receber/criar novo acesso ao portal
       ========================================================= */

    if (morador.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error:
            "Este morador está inativo. Reative o cadastro antes de gerenciar o acesso ao portal.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       CASO 1 — MORADOR JÁ TEM USUÁRIO VINCULADO

       Ação:
       - Abrir a tela de usuários em modo edição
       ========================================================= */

    if (morador.user?.id) {
      const params = new URLSearchParams({
        action: "edit",
        userId: morador.user.id,
      });



      return NextResponse.json({
        mode: "EDIT_LINKED_USER",
        message: "Morador já possui usuário vinculado.",
        userId: morador.user.id,
        residentId: morador.id,
        url: `/admin/usuarios?${params.toString()}`,
      });
    }



    /* =========================================================
       VALIDAR E-MAIL DO MORADOR

       Regra:
       - Para criar acesso ao portal, o morador precisa ter e-mail
       - O e-mail será usado como login
       ========================================================= */

    const residentEmail = normalizeEmail(morador.email);



    if (!residentEmail) {
      return NextResponse.json(
        {
          error:
            "Este morador ainda não possui e-mail cadastrado. Informe um e-mail antes de criar o acesso ao portal.",
        },
        { status: 400 }
      );
    }



    if (!isValidEmail(residentEmail)) {
      return NextResponse.json(
        {
          error:
            "O e-mail cadastrado para este morador é inválido. Corrija o e-mail antes de criar o acesso ao portal.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       CASO 2 — MORADOR NÃO TEM USUÁRIO,
       MAS EXISTE USUÁRIO COM O MESMO E-MAIL DENTRO DO ESCOPO

       Ação:
       - Abrir o usuário existente para edição/vínculo
       ========================================================= */

    const existingUserByEmail = await db.user.findFirst({
      where: {
        email: {
          equals: residentEmail,
          mode: "insensitive",
        },
        ...(authUser.role === "SUPER_ADMIN"
          ? {}
          : {
              OR: [
                {
                  administratorId: authUser.administratorId,
                },
                {
                  condominium: {
                    administratorId: authUser.administratorId,
                  },
                },
                {
                  resident: {
                    condominium: {
                      administratorId: authUser.administratorId,
                    },
                  },
                },
              ],
            }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        residentId: true,
      },
    });



    if (existingUserByEmail) {
      const params = new URLSearchParams({
        action: "edit",
        userId: existingUserByEmail.id,
        residentId: morador.id,
      });



      return NextResponse.json({
        mode: "EDIT_EXISTING_EMAIL_USER",
        message:
          "Já existe um usuário com o e-mail deste morador. Abra o usuário existente para revisar ou vincular o morador.",
        userId: existingUserByEmail.id,
        residentId: morador.id,
        url: `/admin/usuarios?${params.toString()}`,
      });
    }



    /* =========================================================
       CASO 2.1 — EXISTE USUÁRIO COM O MESMO E-MAIL,
       MAS FORA DA CARTEIRA DA ADMINISTRADORA

       Regra:
       - Bloqueia para evitar que uma administradora vincule
         um usuário pertencente a outra carteira
       ========================================================= */

    const existingUserOutOfScope = await db.user.findFirst({
      where: {
        email: {
          equals: residentEmail,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });



    if (existingUserOutOfScope) {
      return NextResponse.json(
        {
          error:
            "Já existe um usuário com este e-mail, mas ele não está dentro da sua carteira de acesso.",
        },
        { status: 409 }
      );
    }



    /* =========================================================
       CASO 3 — E-MAIL LIVRE, CRIAR NOVO USUÁRIO

       Ação:
       - Abrir a tela de usuários em modo criação
       - Pré-configurar role MORADOR
       - Enviar residentId para vínculo automático
       ========================================================= */

    const params = new URLSearchParams({
      action: "create",
      role: "MORADOR",
      residentId: morador.id,
    });



    return NextResponse.json({
      mode: "CREATE_NEW_USER",
      message: "Morador sem usuário e com e-mail livre para criação.",
      residentId: morador.id,
      url: `/admin/usuarios?${params.toString()}`,
    });
  } catch (error: any) {
    console.error("ERRO AO RESOLVER ACESSO DO MORADOR:", error);



    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    return NextResponse.json(
      { error: "Erro ao resolver acesso do morador." },
      { status: 500 }
    );
  }
}