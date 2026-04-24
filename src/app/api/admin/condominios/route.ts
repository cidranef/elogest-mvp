import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const condominios = await db.condominium.findMany({
      include: {
        administrator: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(condominios);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Erro ao listar condomínios." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.administratorId || !body.name) {
      return NextResponse.json(
        { error: "Administradora e nome do condomínio são obrigatórios." },
        { status: 400 }
      );
    }

    const condominio = await db.condominium.create({
      data: {
        administratorId: body.administratorId,
        name: body.name,
        cnpj: body.cnpj || null,
        email: body.email || null,
        phone: body.phone || null,
        cep: body.cep || null,
        address: body.address || null,
        number: body.number || null,
        complement: body.complement || null,
        district: body.district || null,
        city: body.city || null,
        state: body.state || null,
      },
    });

    return NextResponse.json(condominio);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Erro ao criar condomínio." },
      { status: 500 }
    );
  }
}