import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";



/* =========================================================
   MORADORES - API ADMINISTRATIVA

   ETAPA 35.3 — CADASTRO DE MORADORES

   GET:
   - SUPER_ADMIN vê todos os moradores
   - ADMINISTRADORA vê apenas moradores da sua carteira

   POST:
   - cria novo morador vinculado a uma unidade permitida
   - valida CPF duplicado quando informado
   - valida CPF, e-mail, status e tipo de morador

   PADRÃO BRASIL:
   Tipos de morador mantidos em português sem acento:
   - PROPRIETARIO
   - INQUILINO
   - FAMILIAR
   - RESPONSAVEL
   - OUTRO
   ========================================================= */



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
   GET - LISTAR MORADORES
   ========================================================= */

export async function GET() {
  try {
    const user: any = await getAuthUser();



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
       FILTRO POR CARTEIRA DA ADMINISTRADORA

       SUPER_ADMIN:
       - visualiza todos os moradores

       ADMINISTRADORA:
       - visualiza apenas moradores vinculados a condomínios
         da própria administradora
       ========================================================= */

    const where =
      user.role === "SUPER_ADMIN"
        ? {}
        : {
            condominium: {
              administratorId: user.administratorId,
            },
          };



    /* =========================================================
       CONSULTA
       ========================================================= */

    const moradores = await db.resident.findMany({
      where,
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
      orderBy: {
        createdAt: "desc",
      },
    });



    /* =========================================================
       RESPOSTA PADRONIZADA
       ========================================================= */

    const result = moradores.map((morador) => formatMoradorResponse(morador));

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("ERRO AO LISTAR MORADORES:", error);



    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    return NextResponse.json(
      { error: "Erro ao listar moradores." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - CRIAR MORADOR
   ========================================================= */

export async function POST(req: Request) {
  try {
    const user: any = await getAuthUser();
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
       VALIDAÇÕES BÁSICAS
       ========================================================= */

    if (!body.unitId) {
      return NextResponse.json(
        { error: "Unidade é obrigatória." },
        { status: 400 }
      );
    }



    const name = normalizeText(body.name);

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

       Tipo de morador:
       - mantém padrão brasileiro sem acento
       ========================================================= */

    const cpf = body.cpf ? onlyDigits(body.cpf) : null;
    const email = normalizeEmail(body.email);
    const phone = body.phone ? onlyDigits(body.phone) : null;
    const residentType = normalizeText(body.residentType);
    const status = body.status || "ACTIVE";



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
       VALIDAR UNIDADE PERMITIDA

       Esta regra é fundamental:

       ADMINISTRADORA:
       - só pode cadastrar morador em unidade pertencente
         a condomínio da própria carteira

       SUPER_ADMIN:
       - pode cadastrar em qualquer unidade
       ========================================================= */

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



    /* =========================================================
       VALIDAR CPF ÚNICO QUANDO INFORMADO

       Como o CPF foi normalizado, evita duplicidade entre:
       - CPF com máscara
       - CPF sem máscara
       ========================================================= */

    if (cpf) {
      const existing = await db.resident.findFirst({
        where: {
          cpf,
        },
        select: {
          id: true,
        },
      });



      if (existing) {
        return NextResponse.json(
          { error: "Já existe um morador cadastrado com esse CPF." },
          { status: 409 }
        );
      }
    }



    /* =========================================================
       CRIAÇÃO DO MORADOR

       O condominiumId não vem livre do frontend.
       Ele é derivado da unidade validada.

       Isso evita fraude por troca manual de payload.
       ========================================================= */

    const morador = await db.resident.create({
      data: {
        condominiumId: unidade.condominiumId,
        unitId: unidade.id,

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



    return NextResponse.json(formatMoradorResponse(morador), {
      status: 201,
    });
  } catch (error: any) {
    console.error("ERRO AO CRIAR MORADOR:", error);



    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um morador cadastrado com esse CPF." },
        { status: 409 }
      );
    }



    return NextResponse.json(
      { error: "Erro ao criar morador." },
      { status: 500 }
    );
  }
}