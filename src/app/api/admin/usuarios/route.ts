import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageUsers } from "@/lib/access-control";
import { NextResponse } from "next/server";
import { Role, Status } from "@prisma/client";
import bcrypt from "bcryptjs";
import { validateStrongPassword } from "@/lib/password-policy";



/* =========================================================
   USUÁRIOS - API ADMINISTRATIVA

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   GET:
   - ADMINISTRADORA lista usuários da própria carteira.

   POST:
   - ADMINISTRADORA cria usuários operacionais dentro da própria
     carteira:
     ADMINISTRADORA
     SINDICO
     MORADOR

   Regras consolidadas:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por esta rota; deve usar a área /elogest.
   - SÍNDICO, MORADOR, PROPRIETÁRIO e CONSELHEIRO são bloqueados.
   - Todas as consultas usam administratorId do activeAccess.
   - A permissão MANAGE_USERS é validada no perfil ativo.
   - ADMINISTRADORA não cria nem edita SUPER_ADMIN por /admin.
   - SÍNDICO precisa estar vinculado a um condomínio da carteira.
   - Apenas 1 síndico ativo é permitido por condomínio.
   - UserAccess do síndico é sincronizado ao criar/alterar vínculos.
   - MORADOR exige residentId ativo da carteira.
   - E-mail é normalizado e validado.
   - Telefone pessoal continua preparado para notificações/WhatsApp.

   ETAPA 42.8 — SEGURANÇA DE SENHA
   - Senha inicial usa a política central de senha forte.
   - Exige:
     mínimo de 8 caracteres,
     letra maiúscula,
     letra minúscula,
     número,
     caractere especial.
   - Bloqueia senhas óbvias/previsíveis.
   - Bloqueia senha contendo parte do e-mail ou nome do usuário.
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



function normalizePhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");

  return digits.length > 0 ? digits : null;
}



function isValidBrazilianPhone(phone?: string | null) {
  if (!phone) return true;

  /*
    Aceitamos telefones brasileiros com DDD em formato nacional:
    - 10 dígitos: telefone fixo com DDD;
    - 11 dígitos: celular com DDD;
    - 12/13 dígitos: número já com 55.
  */
  return (
    phone.length === 10 ||
    phone.length === 11 ||
    phone.length === 12 ||
    phone.length === 13
  );
}



function isValidEmail(email: string) {
  if (!email) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}



function isValidAdminRole(role: string): role is Role {
  return (
    role === Role.ADMINISTRADORA ||
    role === Role.SINDICO ||
    role === Role.MORADOR
  );
}




/* =========================================================
   ETAPA 43 - SINCRONIZAÇÃO DO USER_ACCESS OPERACIONAL

   Motivo:
   O perfil ativo pode ser um registro real em UserAccess. Se um
   síndico for movido de condomínio e o UserAccess antigo continuar
   ativo, o cookie activeAccessId pode manter acesso ao condomínio
   anterior.

   Regra:
   - Ao criar/editar usuário operacional, sincronizamos o UserAccess
     principal com os vínculos atuais do User.
   - Para SÍNDICO, todos os outros acessos SÍNDICO do mesmo usuário
     são inativados.
   - Se o usuário for inativado, os acessos operacionais também são
     inativados.
   ========================================================= */

function buildPrimaryAccessLabel({
  role,
  condominiumName,
  administratorName,
  residentName,
}: {
  role: Role;
  condominiumName?: string | null;
  administratorName?: string | null;
  residentName?: string | null;
}) {
  if (role === Role.ADMINISTRADORA) {
    return administratorName
      ? `Administradora - ${administratorName}`
      : "Administradora";
  }

  if (role === Role.SINDICO) {
    return condominiumName ? `Síndico - ${condominiumName}` : "Síndico";
  }

  if (role === Role.MORADOR) {
    return residentName ? `Morador - ${residentName}` : "Morador";
  }

  return String(role);
}



async function syncOperationalUserAccess({
  userId,
  role,
  administratorId,
  condominiumId,
  residentId,
  isActive,
}: {
  userId: string;
  role: Role;
  administratorId: string | null;
  condominiumId: string | null;
  residentId: string | null;
  isActive: boolean;
}) {
  if (!isActive) {
    await db.userAccess.updateMany({
      where: {
        userId,
      },
      data: {
        isActive: false,
        isDefault: false,
      },
    });

    return;
  }

  if (
    role !== Role.ADMINISTRADORA &&
    role !== Role.SINDICO &&
    role !== Role.MORADOR
  ) {
    return;
  }

  const [administrator, condominium, resident] = await Promise.all([
    administratorId
      ? db.administrator.findUnique({
          where: { id: administratorId },
          select: { name: true },
        })
      : Promise.resolve(null),

    condominiumId
      ? db.condominium.findUnique({
          where: { id: condominiumId },
          select: { name: true },
        })
      : Promise.resolve(null),

    residentId
      ? db.resident.findUnique({
          where: { id: residentId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const label = buildPrimaryAccessLabel({
    role,
    administratorName: administrator?.name || null,
    condominiumName: condominium?.name || null,
    residentName: resident?.name || null,
  });

  const existingAccess = await db.userAccess.findFirst({
    where: {
      userId,
      role,
    },
    orderBy: [
      {
        isDefault: "desc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  const syncedAccess = existingAccess
    ? await db.userAccess.update({
        where: {
          id: existingAccess.id,
        },
        data: {
          label,
          administratorId,
          condominiumId,
          residentId,
          isActive: true,
          isDefault: true,
        },
      })
    : await db.userAccess.create({
        data: {
          userId,
          role,
          label,
          administratorId,
          condominiumId,
          residentId,
          isActive: true,
          isDefault: true,
        },
      });

  await db.userAccess.updateMany({
    where: {
      userId,
      role,
      id: {
        not: syncedAccess.id,
      },
    },
    data: {
      isActive: false,
      isDefault: false,
    },
  });

  if (role === Role.SINDICO && condominiumId) {
    await db.userAccess.updateMany({
      where: {
        userId,
        role: Role.SINDICO,
        id: {
          not: syncedAccess.id,
        },
      },
      data: {
        isActive: false,
        isDefault: false,
      },
    });
  }
}



const userSelect = {
  id: true,
  name: true,
  email: true,

  // ETAPA 42.10.6 — Telefone pessoal para notificações/WhatsApp
  phone: true,
  phoneVerifiedAt: true,
  phoneOptInAt: true,
  phoneOptOutAt: true,

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
      phone: true,
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
   USUÁRIO COM CONTEXTO ADMINISTRATIVO
   ========================================================= */

async function getAdminContextUser() {
  const sessionUser: any = await getAuthUser();

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess: ActiveUserAccess | null =
    await getActiveUserAccessFromCookies({
      userId: sessionUser.id,
    });

  if (!activeAccess) {
    return {
      ...sessionUser,
      activeAccess: null,
    };
  }

  return {
    ...sessionUser,

    role: activeAccess.role || sessionUser.role,

    administratorId:
      activeAccess.administratorId !== undefined
        ? activeAccess.administratorId
        : sessionUser.administratorId,

    condominiumId:
      activeAccess.condominiumId !== undefined
        ? activeAccess.condominiumId
        : sessionUser.condominiumId,

    unitId:
      activeAccess.unitId !== undefined
        ? activeAccess.unitId
        : sessionUser.unitId,

    residentId:
      activeAccess.residentId !== undefined
        ? activeAccess.residentId
        : sessionUser.residentId,

    activeAccess,
  };
}



/* =========================================================
   VALIDA CONTEXTO ADMINISTRATIVO
   ========================================================= */

function validateAdminContext(user: any) {
  const activeAccess = user?.activeAccess as ActiveUserAccess | null;

  if (!activeAccess) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!isAdministradoraAccess(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso ao cadastro administrativo de usuários. Use o portal ou a área EloGest.",
    };
  }

  if (!activeAccess.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canManageUsers(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para gerenciar usuários.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



function getAdministratorIdFromContext(user: any) {
  const activeAccess = user?.activeAccess as ActiveUserAccess | null;

  return activeAccess?.administratorId || null;
}



/* =========================================================
   GET - LISTAR USUÁRIOS
   ========================================================= */

export async function GET() {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user: any = await getAdminContextUser();

    const contextValidation = validateAdminContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const administratorId = getAdministratorIdFromContext(user);

    if (!administratorId) {
      return NextResponse.json(
        { error: "Contexto de administradora sem vínculo com administradora." },
        { status: 403 }
      );
    }



    /* =========================================================
       ESCOPO DE LISTAGEM

       ADMINISTRADORA:
       - vê usuários vinculados à própria administradora;
       - vê síndicos dos condomínios da própria carteira;
       - vê moradores dos condomínios da própria carteira.
       ========================================================= */

    const usuarios = await db.user.findMany({
      where: {
        OR: [
          {
            administratorId,
          },
          {
            condominium: {
              administratorId,
            },
          },
          {
            resident: {
              condominium: {
                administratorId,
              },
            },
          },
        ],
      },
      select: userSelect,
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(usuarios);
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR USUÁRIOS:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
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
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const authUser: any = await getAdminContextUser();
    const body = await req.json();

    const contextValidation = validateAdminContext(authUser);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const currentAdministratorId = getAdministratorIdFromContext(authUser);

    if (!currentAdministratorId) {
      return NextResponse.json(
        { error: "Contexto de administradora sem vínculo com administradora." },
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
    let phone = normalizePhone(body.phone);
    const nextIsActive = body.isActive === false ? false : true;

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

    if (!isValidBrazilianPhone(phone)) {
      return NextResponse.json(
        {
          error:
            "Informe um telefone válido com DDD para notificações/WhatsApp ou deixe o campo em branco.",
        },
        { status: 400 }
      );
    }

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

    if (!isValidAdminRole(rawRole)) {
      return NextResponse.json(
        {
          error:
            "Perfil de usuário inválido para a área administrativa. Use Administradora, Síndico ou Morador.",
        },
        { status: 400 }
      );
    }

    const role: Role = rawRole;



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
       ADMINISTRADORA

       Rota /admin:
       - só cria usuário de administradora para a própria carteira.
       - administratorId do body é ignorado.
       ========================================================= */

    if (role === Role.ADMINISTRADORA) {
      const administradora = await db.administrator.findFirst({
        where: {
          id: currentAdministratorId,
          status: Status.ACTIVE,
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

      administratorId = administradora.id;
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
          administratorId: currentAdministratorId,
          status: Status.ACTIVE,
          administrator: {
            status: Status.ACTIVE,
          },
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

      /*
         Etapa 43 - regra de integridade:
         Apenas 1 usuário SÍNDICO ativo pode existir por condomínio.

         Observação:
         Usuários síndicos inativos são preservados no histórico.
         O bloqueio vale para novo síndico ativo.
      */
      if (nextIsActive) {
        const existingActiveSindico = await db.user.findFirst({
          where: {
            role: Role.SINDICO,
            condominiumId: condominio.id,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        });

        if (existingActiveSindico) {
          return NextResponse.json(
            {
              error:
                "Este condomínio já possui um síndico ativo vinculado. Inative ou edite o síndico atual antes de cadastrar outro.",
            },
            { status: 409 }
          );
        }
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
            condominium: {
              administratorId: currentAdministratorId,
            },
          },
          select: {
            id: true,
            phone: true,
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

        if (!phone) {
          phone = normalizePhone(morador.phone);
        }
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
          condominium: {
            administratorId: currentAdministratorId,
          },
        },
        include: {
          condominium: {
            select: {
              id: true,
              status: true,
              administratorId: true,
              administrator: {
                select: {
                  status: true,
                },
              },
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

      if (
        morador.condominium?.status !== Status.ACTIVE ||
        morador.condominium?.administrator?.status !== Status.ACTIVE
      ) {
        return NextResponse.json(
          {
            error:
              "O condomínio ou a administradora deste morador está inativo. Reative antes de criar o acesso.",
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

      if (!phone) {
        phone = normalizePhone(morador.phone);
      }
    }



    /* =========================================================
       CRIAR USUÁRIO
       ========================================================= */

    const passwordHash = await bcrypt.hash(password, 10);

    const usuario = await db.user.create({
      data: {
        name,
        email,
        phone,
        phoneOptInAt: phone ? new Date() : null,
        phoneVerifiedAt: null,
        phoneOptOutAt: null,
        passwordHash,
        role,
        administratorId,
        condominiumId,
        residentId,
        isActive: nextIsActive,
      },
      select: userSelect,
    });

    await syncOperationalUserAccess({
      userId: usuario.id,
      role,
      administratorId,
      condominiumId,
      residentId,
      isActive: usuario.isActive,
    });

    return NextResponse.json(usuario, {
      status: 201,
    });
  } catch (error: unknown) {
    console.error("ERRO AO CRIAR USUÁRIO:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
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
