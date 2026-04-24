import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const administradoras = await db.administrator.findMany({
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(administradoras);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Erro ao listar administradoras." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "Nome da administradora é obrigatório." },
        { status: 400 }
      );
    }

    const administradora = await db.administrator.create({
      data: {
        name: body.name,
        email: body.email || null,
        cnpj: body.cnpj || null,
        phone: body.phone || null,
      },
    });

    return NextResponse.json(administradora);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Erro ao criar administradora." },
      { status: 500 }
    );
  }
}