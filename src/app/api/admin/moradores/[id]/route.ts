import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";



/* =========================================================
   MORADORES - API DE ATUALIZAÇÃO

   ETAPA 35.3 — CADASTRO DE MORADORES

   PATCH:
   - Editar morador
   - Alterar unidade
   - Alterar nome, CPF, e-mail, telefone, tipo e status
   - Ativar / inativar morador

   Regras aplicadas:

   1. SUPER_ADMIN pode editar qualquer morador
   2. ADMINISTRADORA só pode editar moradores da própria carteira
   3. ADMINISTRADORA só pode mover morador para unidade da própria carteira
   4. CPF é normalizado e validado
   5. CPF duplicado é bloqueado
   6. E-mail é validado quando informado
   7. Status é validado
   8. Tipo de morador é validado

   PADRÃO BRASIL:
   Tipos de morador mantidos em português sem acento:
   - PROPRIETARIO
   - INQUILINO
   - FAMILIAR
   - RESPONSAVEL
   - OUTRO
   ========================================================= */



interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}



/* =========================================================
   HELPERS
   ========================================================= */

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}



function normalizeText(value?: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned.length > 0 ? cleaned : null;
}



function normalizeEmail(value?: string | null) {
  const cleaned = String(value || "").trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}



function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}



function isValidCpfFormat(cpf: string) {
  return /^\d{11}$/.test(cpf);
}



function isValidStatus(status: string) {
  return ["ACTIVE", "INACTIVE"].includes(status);
}



function isValidResidentType(residentType?: string | null) {
  if (!residentType) return true;

  return [
    "PROPRIETARIO",
    "INQUILINO",
    "FAMILIAR",
    "RESPONSAVEL",
    "OUTRO",
  ].includes(residentType);
}



function countOpenTickets(tickets: Array<{ status: string }>) {
  return tickets.filter(
    (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"
  ).length;
}



function formatMoradorResponse(morador: any) {
  return {
    id: morador.id,

    condominiumId: morador.condominiumId,
    unitId: morador.unitId,
    userId: morador.userId || null,

    condominium: morador.condominium,
    unit: morador.unit,
    user: morador.user,

    name: morador.name,
    cpf: morador.cpf,
    email: morador.email,
    phone: morador.phone,
    residentType: morador.residentType,
    status: morador.status,

    createdAt: morador.createdAt,
    updatedAt: morador.updatedAt,

    totalTickets: morador.tickets?.length || 0,
    openTickets: countOpenTickets(morador.tickets || []),
    hasUser: !!morador.user,
  };
}



/* =========================================================
   PATCH - ATUALIZAR MORADOR
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const user: any = await getAuthUser();
    const { id } = await context.params;
    const body = await req.json();



    /* =========================================================
       AUTORIZAÇÃO
       ========================================================= */

    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMINISTRADORA") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    /* =========================================================
       VALIDAR ACESSO AO MORADOR ATUAL

       SUPER_ADMIN:
       - pode localizar qualquer morador

       ADMINISTRADORA:
       - só localiza morador vinculado a condomínio
         da própria carteira
       ========================================================= */

    const moradorAtual = await db.resident.findFirst({
      where: {
        id,
        ...(user.role === "SUPER_ADMIN"
          ? {}
          : {
              condominium: {
                administratorId: user.administratorId,
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



    if (!moradorAtual) {
      return NextResponse.json(
        { error: "Morador não encontrado ou acesso negado." },
        { status: 404 }
      );
    }



    /* =========================================================
       DEFINIR UNIDADE FINAL

       Regra importante:
       - O frontend não decide livremente o condomínio.
       - O condomínio final sempre vem da unidade validada.

       Isso evita que alguém altere manualmente o payload
       e vincule o morador a uma unidade/condomínio indevido.
       ========================================================= */

    let unitId = moradorAtual.unitId;
    let condominiumId = moradorAtual.condominiumId;



    if (body.unitId !== undefined) {
      if (!body.unitId) {
        return NextResponse.json(
          { error: "Unidade é obrigatória." },
          { status: 400 }
        );
      }



      const unidade = await db.unit.findFirst({
        where: {
          id: body.unitId,
          ...(user.role === "SUPER_ADMIN"
            ? {}
            : {
                condominium: {
                  administratorId: user.administratorId,
                },
              }),
        },
        include: {
          condominium: true,
        },
      });



      if (!unidade) {
        return NextResponse.json(
          { error: "Unidade não encontrada ou acesso negado." },
          { status: 403 }
        );
      }



      unitId = unidade.id;
      condominiumId = unidade.condominiumId;
    }



    /* =========================================================
       NOME
       ========================================================= */

    const name =
      body.name !== undefined
        ? normalizeText(body.name)
        : moradorAtual.name;



    if (!name) {
      return NextResponse.json(
        { error: "Nome do morador é obrigatório." },
        { status: 400 }
      );
    }



    /* =========================================================
       NORMALIZAÇÃO DOS CAMPOS

       CPF:
       - remove pontos, traços e demais caracteres
       - salva somente números

       E-mail:
       - trim + lowercase

       Telefone:
       - salva somente números

       Tipo de morador:
       - mantém padrão brasileiro sem acento
       ========================================================= */

    const cpf =
      body.cpf !== undefined
        ? body.cpf
          ? onlyDigits(body.cpf)
          : null
        : moradorAtual.cpf;



    const email =
      body.email !== undefined
        ? normalizeEmail(body.email)
        : moradorAtual.email;



    const phone =
      body.phone !== undefined
        ? body.phone
          ? onlyDigits(body.phone)
          : null
        : moradorAtual.phone;



    const residentType =
      body.residentType !== undefined
        ? normalizeText(body.residentType)
        : moradorAtual.residentType;



    const status =
      body.status !== undefined
        ? body.status || "ACTIVE"
        : moradorAtual.status;



    /* =========================================================
       VALIDAÇÃO DE CPF
       ========================================================= */

    if (cpf && !isValidCpfFormat(cpf)) {
      return NextResponse.json(
        { error: "CPF inválido. Informe um CPF com 11 dígitos." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DE E-MAIL
       ========================================================= */

    if (email && !isValidEmail(email)) {
      return NextResponse.json(
        { error: "E-mail inválido." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DE STATUS
       ========================================================= */

    if (!isValidStatus(status)) {
      return NextResponse.json(
        { error: "Status inválido." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DE TIPO DE MORADOR

       Valores permitidos:
       PROPRIETARIO
       INQUILINO
       FAMILIAR
       RESPONSAVEL
       OUTRO
       ========================================================= */

    if (!isValidResidentType(residentType)) {
      return NextResponse.json(
        { error: "Tipo de morador inválido." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAR CPF DUPLICADO, QUANDO INFORMADO

       Permite manter o próprio CPF do morador atual,
       mas bloqueia se outro morador já possuir o CPF.
       ========================================================= */

    if (cpf) {
      const existing = await db.resident.findFirst({
        where: {
          cpf,
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });



      if (existing) {
        return NextResponse.json(
          { error: "Já existe outro morador cadastrado com esse CPF." },
          { status: 409 }
        );
      }
    }



    /* =========================================================
       ATUALIZAÇÃO DO MORADOR

       Observação:
       - Inativar o morador não apaga histórico.
       - O filtro para remover moradores inativos dos selects
         operacionais deve ser aplicado nas APIs/listagens
         operacionais usando status: "ACTIVE".
       ========================================================= */

    const morador = await db.resident.update({
      where: {
        id,
      },
      data: {
        condominiumId,
        unitId,

        name,
        cpf,
        email,
        phone,
        residentType,
        status,
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
        tickets: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });



    return NextResponse.json(formatMoradorResponse(morador));
  } catch (error: any) {
    console.error("ERRO AO ATUALIZAR MORADOR:", error);



    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um morador cadastrado com esses dados." },
        { status: 409 }
      );
    }



    return NextResponse.json(
      { error: "Erro ao atualizar morador." },
      { status: 500 }
    );
  }
}