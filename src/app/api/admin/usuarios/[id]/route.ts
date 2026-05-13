import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { Role, Status } from "@prisma/client";
import bcrypt from "bcryptjs";
import { validateStrongPassword } from "@/lib/password-policy";



/* =========================================================
   USUÁRIOS - API DE ATUALIZAÇÃO

   ETAPA 35.4 — INTEGRAÇÃO MORADOR x ACESSO AO PORTAL

   PATCH:
   - Atualiza nome, e-mail, senha, perfil, status e vínculos
   - SÍNDICO pode ter residentId opcional
   - MORADOR exige residentId obrigatório

   Regras:
   - SUPER_ADMIN pode editar qualquer usuário
   - ADMINISTRADORA só pode editar usuários da própria carteira
   - ADMINISTRADORA não pode editar/criar vínculo SUPER_ADMIN
   - E-mail é validado e único
   - MORADOR só pode ser vinculado a morador ativo
   - SÍNDICO só pode ser vinculado a condomínio ativo
   - residentId não pode estar vinculado a outro usuário

   ETAPA 42.8 — SEGURANÇA DE SENHA
   - Senha continua opcional na edição.
   - Se enviada, passa a usar a política central de senha forte.
   - Bloqueia senha fraca, óbvia ou contendo parte do e-mail/nome.
   ========================================================= */



interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}



/* =========================================================
   HELPERS
   ========================================================= */

function normalizeText(value?: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned.length > 0 ? cleaned : "";
}



function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}



function isValidEmail(email: string) {
  if (!email) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}



function isValidRole(role: string): role is Role {
  return [
    Role.SUPER_ADMIN,
    Role.ADMINISTRADORA,
    Role.SINDICO,
    Role.MORADOR,
  ].includes(role as Role);
}



const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,

  administratorId: true,
  condominiumId: true,
  residentId: true,

  administrator: {
    select: {
      id: true,
      name: true,
    },
  },

  condominium: {
    select: {
      id: true,
      name: true,
    },
  },

  resident: {
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      unit: {
        select: {
          id: true,
          block: true,
          unitNumber: true,
        },
      },
      condominium: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },

  createdAt: true,
  updatedAt: true,
};



/* =========================================================
   PATCH - ATUALIZAR USUÁRIO
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const authUser: any = await getAuthUser();
    const { id } = await context.params;
    const body = await req.json();



    /* =========================================================
       AUTORIZAÇÃO
       ========================================================= */

    if (
      authUser.role !== Role.SUPER_ADMIN &&
      authUser.role !== Role.ADMINISTRADORA
    ) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    if (authUser.role === Role.ADMINISTRADORA && !authUser.administratorId) {
      return NextResponse.json(
        { error: "Usuário administrador sem administradora vinculada." },
        { status: 403 }
      );
    }



    /* =========================================================
       LOCALIZAR USUÁRIO ATUAL COM ESCOPO DE CARTEIRA

       SUPER_ADMIN:
       - pode localizar qualquer usuário

       ADMINISTRADORA:
       - só pode localizar usuários vinculados à própria carteira
       ========================================================= */

    const usuarioAtual = await db.user.findFirst({
      where: {
        id,
        ...(authUser.role === Role.SUPER_ADMIN
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
        passwordHash: true,
        role: true,
        isActive: true,

        administratorId: true,
        condominiumId: true,
        residentId: true,
      },
    });



    if (!usuarioAtual) {
      return NextResponse.json(
        { error: "Usuário não encontrado ou acesso negado." },
        { status: 404 }
      );
    }



    /* =========================================================
       NORMALIZAÇÃO
       ========================================================= */

    const name =
      body.name !== undefined
        ? normalizeText(body.name)
        : usuarioAtual.name;



    const email =
      body.email !== undefined
        ? normalizeEmail(body.email)
        : normalizeEmail(usuarioAtual.email);



    const rawRole =
      body.role !== undefined
        ? String(body.role)
        : String(usuarioAtual.role);



    if (!isValidRole(rawRole)) {
      return NextResponse.json(
        { error: "Perfil de usuário inválido." },
        { status: 400 }
      );
    }



    const role: Role = rawRole;



    const isActive =
      body.isActive !== undefined
        ? Boolean(body.isActive)
        : usuarioAtual.isActive;



    /* =========================================================
       VALIDAÇÕES BÁSICAS
       ========================================================= */

    if (!name) {
      return NextResponse.json(
        { error: "Nome do usuário é obrigatório." },
        { status: 400 }
      );
    }



    if (!email) {
      return NextResponse.json(
        { error: "E-mail do usuário é obrigatório." },
        { status: 400 }
      );
    }



    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Informe um e-mail válido." },
        { status: 400 }
      );
    }



    /* =========================================================
       PROTEÇÃO SUPER_ADMIN

       ADMINISTRADORA:
       - não pode editar usuário SUPER_ADMIN
       - não pode transformar usuário em SUPER_ADMIN
       ========================================================= */

    if (authUser.role !== Role.SUPER_ADMIN) {
      if (usuarioAtual.role === Role.SUPER_ADMIN || role === Role.SUPER_ADMIN) {
        return NextResponse.json(
          { error: "Apenas Super Admin pode alterar usuários Super Admin." },
          { status: 403 }
        );
      }
    }



    /* =========================================================
       VALIDAR E-MAIL ÚNICO
       ========================================================= */

    if (email !== normalizeEmail(usuarioAtual.email)) {
      const existingEmail = await db.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: "insensitive",
          },
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });



      if (existingEmail) {
        return NextResponse.json(
          { error: "Já existe um usuário cadastrado com este e-mail." },
          { status: 409 }
        );
      }
    }



    let administratorId: string | null = null;
    let condominiumId: string | null = null;
    let residentId: string | null = null;



    /* =========================================================
       SUPER_ADMIN
       ========================================================= */

    if (role === Role.SUPER_ADMIN) {
      administratorId = null;
      condominiumId = null;
      residentId = null;
    }



    /* =========================================================
       ADMINISTRADORA

       SUPER_ADMIN:
       - pode escolher administratorId

       ADMINISTRADORA:
       - só pode manter/criar usuário para a própria administradora
       ========================================================= */

    if (role === Role.ADMINISTRADORA) {
      administratorId =
        authUser.role === Role.SUPER_ADMIN
          ? body.administratorId || usuarioAtual.administratorId || null
          : authUser.administratorId || null;



      if (!administratorId) {
        return NextResponse.json(
          { error: "Selecione a administradora para este usuário." },
          { status: 400 }
        );
      }



      const administradora = await db.administrator.findFirst({
        where: {
          id: administratorId,
          status: Status.ACTIVE,
          ...(authUser.role === Role.SUPER_ADMIN
            ? {}
            : {
                id: authUser.administratorId,
              }),
        },
        select: {
          id: true,
        },
      });



      if (!administradora) {
        return NextResponse.json(
          { error: "Administradora não encontrada, inativa ou acesso negado." },
          { status: 403 }
        );
      }



      condominiumId = null;
      residentId = null;
    }



    /* =========================================================
       SÍNDICO

       Obrigatório:
       - condominiumId

       Opcional:
       - residentId, desde que:
         1. pertença ao mesmo condomínio;
         2. esteja ativo;
         3. não esteja vinculado a outro usuário.
       ========================================================= */

    if (role === Role.SINDICO) {
      const selectedCondominiumId =
        body.condominiumId !== undefined
          ? body.condominiumId
          : usuarioAtual.condominiumId;



      if (!selectedCondominiumId) {
        return NextResponse.json(
          { error: "Selecione o condomínio para o síndico." },
          { status: 400 }
        );
      }



      const condominio = await db.condominium.findFirst({
        where: {
          id: selectedCondominiumId,
          status: Status.ACTIVE,
          ...(authUser.role === Role.SUPER_ADMIN
            ? {}
            : {
                administratorId: authUser.administratorId,
              }),
        },
        select: {
          id: true,
        },
      });



      if (!condominio) {
        return NextResponse.json(
          { error: "Condomínio não encontrado, inativo ou acesso negado." },
          { status: 403 }
        );
      }



      administratorId = null;
      condominiumId = condominio.id;
      residentId = null;



      const selectedResidentId =
        body.residentId !== undefined
          ? body.residentId || null
          : usuarioAtual.residentId || null;



      if (selectedResidentId) {
        const morador = await db.resident.findFirst({
          where: {
            id: selectedResidentId,
            condominiumId: condominio.id,
            status: Status.ACTIVE,
            ...(authUser.role === Role.SUPER_ADMIN
              ? {}
              : {
                  condominium: {
                    administratorId: authUser.administratorId,
                  },
                }),
          },
          select: {
            id: true,
          },
        });



        if (!morador) {
          return NextResponse.json(
            {
              error:
                "Morador não encontrado, inativo, acesso negado ou não pertence ao condomínio do síndico.",
            },
            { status: 403 }
          );
        }



        const existingResidentUser = await db.user.findFirst({
          where: {
            residentId: morador.id,
            NOT: {
              id,
            },
          },
          select: {
            id: true,
          },
        });



        if (existingResidentUser) {
          return NextResponse.json(
            {
              error: "Este morador já possui outro usuário vinculado.",
            },
            { status: 409 }
          );
        }



        residentId = morador.id;
      }
    }



    /* =========================================================
       MORADOR

       Obrigatório:
       - residentId

       Regras:
       - morador deve estar ativo;
       - condomínio do morador deve estar ativo;
       - administradora só pode editar dentro da própria carteira;
       - morador não pode estar vinculado a outro usuário.
       ========================================================= */

    if (role === Role.MORADOR) {
      const selectedResidentId =
        body.residentId !== undefined
          ? body.residentId
          : usuarioAtual.residentId;



      if (!selectedResidentId) {
        return NextResponse.json(
          { error: "Selecione o morador para este usuário." },
          { status: 400 }
        );
      }



      const morador = await db.resident.findFirst({
        where: {
          id: selectedResidentId,
          status: Status.ACTIVE,
          ...(authUser.role === Role.SUPER_ADMIN
            ? {}
            : {
                condominium: {
                  administratorId: authUser.administratorId,
                },
              }),
        },
        include: {
          condominium: {
            select: {
              id: true,
              status: true,
              administratorId: true,
            },
          },
        },
      });



      if (!morador) {
        return NextResponse.json(
          { error: "Morador não encontrado, inativo ou acesso negado." },
          { status: 403 }
        );
      }



      if (morador.condominium?.status !== Status.ACTIVE) {
        return NextResponse.json(
          {
            error:
              "O condomínio deste morador está inativo. Reative o condomínio antes de vincular o acesso.",
          },
          { status: 400 }
        );
      }



      const existingResidentUser = await db.user.findFirst({
        where: {
          residentId: morador.id,
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });



      if (existingResidentUser) {
        return NextResponse.json(
          { error: "Este morador já possui outro usuário vinculado." },
          { status: 409 }
        );
      }



      administratorId = null;
      condominiumId = morador.condominiumId;
      residentId = morador.id;
    }



    /* =========================================================
       SENHA OPCIONAL

       Na edição:
       - se senha vier vazia, mantém a senha atual;
       - se senha vier preenchida, aplica política central de senha forte.
       ========================================================= */

    let passwordHash = usuarioAtual.passwordHash;



    if (body.password && String(body.password).trim()) {
      const password = String(body.password);

      const passwordValidation = validateStrongPassword(password, {
        email,
        name,
      });

      if (!passwordValidation.valid) {
        return NextResponse.json(
          {
            error: passwordValidation.errors.join(" "),
            errors: passwordValidation.errors,
          },
          {
            status: 400,
          }
        );
      }



      passwordHash = await bcrypt.hash(password, 10);
    }



    /* =========================================================
       ATUALIZAÇÃO
       ========================================================= */

    const usuario = await db.user.update({
      where: {
        id,
      },
      data: {
        name,
        email,
        passwordHash,
        role,
        administratorId,
        condominiumId,
        residentId,
        isActive,
      },
      select: userSelect,
    });



    return NextResponse.json(usuario);
  } catch (error: any) {
    console.error("ERRO AO ATUALIZAR USUÁRIO:", error);



    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um usuário com estes dados." },
        { status: 409 }
      );
    }



    return NextResponse.json(
      { error: "Erro ao atualizar usuário." },
      { status: 500 }
    );
  }
}