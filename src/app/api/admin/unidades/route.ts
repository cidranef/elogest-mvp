import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const unidades = await db.unit.findMany({
      include: {
        condominium: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(unidades);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Erro ao listar unidades." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.condominiumId || !body.unitNumber) {
      return NextResponse.json(
        { error: "Condomínio e número são obrigatórios." },
        { status: 400 }
      );
    }

    const unidade = await db.unit.create({
      data: {
        condominiumId: body.condominiumId,
        block: body.block || null,
        unitNumber: body.unitNumber,
        unitType: body.unitType || null,
      },
    });

    return NextResponse.json(unidade);
  } catch (error: any) {
    // 🔥 ERRO DE DUPLICIDADE (UNIQUE)
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Essa unidade já existe nesse condomínio." },
        { status: 400 }
      );
    }

    console.error(error);

    return NextResponse.json(
      { error: "Erro ao criar unidade." },
      { status: 500 }
    );
  }
}