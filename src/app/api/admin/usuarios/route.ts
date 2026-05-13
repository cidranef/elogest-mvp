import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { Role, Status } from "@prisma/client";
import bcrypt from "bcryptjs";



/* =========================================================
   USUÁRIOS - API ADMINISTRATIVA

   ETAPA 35.4 — INTEGRAÇÃO MORADOR x ACESSO AO PORTAL

   GET:
   - SUPER_ADMIN lista todos os usuários
   - ADMINISTRADORA lista usuários da própria carteira

   POST:
   - Cria usuário conforme perfil:
     SUPER_ADMIN
     ADMINISTRADORA
     SINDICO
     MORADOR

   Regras:
   - SÍNDICO precisa estar vinculado a um condomínio
   - SÍNDICO pode ter residentId opcional
   - MORADOR exige residentId
   - MORADOR só pode ser criado para morador ativo
   - ADMINISTRADORA só pode criar acessos dentro da própria carteira
   - E-mail é normalizado e validado
   - Senha inicial obrigatória com mínimo de 6 caracteres
   ========================================================= */



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
   GET - LISTAR USUÁRIOS
   ========================================================= */

export async function GET() {
  try {
    const user: any = await getAuthUser();



    /* =========================================================
       AUTORIZAÇÃO
       ========================================================= */

    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.ADMINISTRADORA) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    if (user.role === Role.ADMINISTRADORA && !user.administratorId) {
      return NextResponse.json(
        { error: "Usuário administrador sem administradora vinculada." },
        { status: 403 }
      );
    }



    /* =========================================================
       ESCOPO DE LISTAGEM

       SUPER_ADMIN:
       - vê todos

       ADMINISTRADORA:
       - vê usuários vinculados à própria administradora;
       - vê síndicos dos condomínios da própria carteira;
       - vê moradores dos condomínios da própria carteira.
       ========================================================= */

    const where =
      user.role === Role.SUPER_ADMIN
        ? {}
        : {
            OR: [
              {
                administratorId: user.administratorId,
              },
              {
                condominium: {
                  administratorId: user.administratorId,
                },
              },
              {
                resident: {
                  condominium: {
                    administratorId: user.administratorId,
                  },
                },
              },
            ],
          };



    const usuarios = await db.user.findMany({
      where,
      select: userSelect,
      orderBy: {
        name: "asc",
      },
    });



    return NextResponse.json(usuarios);
  } catch (error: any) {
    console.error("ERRO AO LISTAR USUÁRIOS:", error);



    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    return NextResponse.json(
      { error: "Erro ao listar usuários." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - CRIAR USUÁRIO
   ========================================================= */

export async function POST(req: Request) {
  try {
    const authUser: any = await getAuthUser();
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
       NORMALIZAÇÃO E VALIDAÇÕES BÁSICAS
       ========================================================= */

    const name = normalizeText(body.name);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const rawRole = String(body.role || "");



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



    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "A senha inicial deve ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }



    if (!isValidRole(rawRole)) {
      return NextResponse.json(
        { error: "Perfil de usuário inválido." },
        { status: 400 }
      );
    }



    const role: Role = rawRole;



    if (authUser.role !== Role.SUPER_ADMIN && role === Role.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "Apenas Super Admin pode criar outro Super Admin." },
        { status: 403 }
      );
    }



    /* =========================================================
       VALIDAR E-MAIL ÚNICO
       ========================================================= */

    const existingUser = await db.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });



    if (existingUser) {
      return NextResponse.json(
        { error: "Já existe um usuário cadastrado com este e-mail." },
        { status: 409 }
      );
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
       - informa administratorId

       ADMINISTRADORA:
       - só pode criar usuário para a própria administradora
       ========================================================= */

    if (role === Role.ADMINISTRADORA) {
      administratorId =
        authUser.role === Role.SUPER_ADMIN
          ? body.administratorId || null
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
         3. não tenha outro usuário vinculado.
       ========================================================= */

    if (role === Role.SINDICO) {
      if (!body.condominiumId) {
        return NextResponse.json(
          { error: "Selecione o condomínio para o síndico." },
          { status: 400 }
        );
      }



      const condominio = await db.condominium.findFirst({
        where: {
          id: body.condominiumId,
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



      condominiumId = condominio.id;
      administratorId = null;
      residentId = null;



      if (body.residentId) {
        const morador = await db.resident.findFirst({
          where: {
            id: body.residentId,
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
          },
          select: {
            id: true,
          },
        });



        if (existingResidentUser) {
          return NextResponse.json(
            {
              error:
                "Este morador já possui um usuário vinculado. Edite o usuário existente em vez de criar outro.",
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
       - administradora só pode criar para moradores da própria carteira;
       - morador não pode já possuir usuário vinculado.
       ========================================================= */

    if (role === Role.MORADOR) {
      if (!body.residentId) {
        return NextResponse.json(
          { error: "Selecione o morador para este usuário." },
          { status: 400 }
        );
      }



      const morador = await db.resident.findFirst({
        where: {
          id: body.residentId,
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
              "O condomínio deste morador está inativo. Reative o condomínio antes de criar o acesso.",
          },
          { status: 400 }
        );
      }



      const existingResidentUser = await db.user.findFirst({
        where: {
          residentId: morador.id,
        },
        select: {
          id: true,
        },
      });



      if (existingResidentUser) {
        return NextResponse.json(
          { error: "Este morador já possui um usuário vinculado." },
          { status: 409 }
        );
      }



      administratorId = null;
      condominiumId = morador.condominiumId;
      residentId = morador.id;
    }



    /* =========================================================
       CRIAR USUÁRIO
       ========================================================= */

    const passwordHash = await bcrypt.hash(password, 10);



    const usuario = await db.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        administratorId,
        condominiumId,
        residentId,
        isActive: body.isActive === false ? false : true,
      },
      select: userSelect,
    });



    return NextResponse.json(usuario, {
      status: 201,
    });
  } catch (error: any) {
    console.error("ERRO AO CRIAR USUÁRIO:", error);



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
      { error: "Erro ao criar usuário." },
      { status: 500 }
    );
  }
}