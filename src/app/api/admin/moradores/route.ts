import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const moradores = await db.resident.findMany({
      include: {
        condominium: true,
        unit: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(moradores);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Erro ao listar moradores." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.unitId || !body.name) {
      return NextResponse.json(
        { error: "Unidade e nome do morador são obrigatórios." },
        { status: 400 }
      );
    }

    const unidade = await db.unit.findUnique({
      where: {
        id: body.unitId,
      },
    });

    if (!unidade) {
      return NextResponse.json(
        { error: "Unidade não encontrada." },
        { status: 404 }
      );
    }

    const morador = await db.resident.create({
      data: {
        condominiumId: unidade.condominiumId,
        unitId: unidade.id,
        name: body.name,
        cpf: body.cpf || null,
        email: body.email || null,
        phone: body.phone || null,
        residentType: body.residentType || null,
      },
    });

    return NextResponse.json(morador);
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um morador cadastrado com esse CPF." },
        { status: 400 }
      );
    }

    console.error(error);

    return NextResponse.json(
      { error: "Erro ao criar morador." },
      { status: 500 }
    );
  }
}