import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const chamados = await db.ticket.findMany({
      include: {
        condominium: true,
        unit: true,
        resident: true,
        createdByUser: true,
        assignedToUser: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(chamados);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Erro ao listar chamados." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const body = await req.json();

    if (!body.condominiumId || !body.unitId || !body.title || !body.description) {
      return NextResponse.json(
        { error: "Unidade, título e descrição são obrigatórios." },
        { status: 400 }
      );
    }

    const chamado = await db.ticket.create({
      data: {
        condominiumId: body.condominiumId,
        unitId: body.unitId,
        residentId: body.residentId || null,
        title: body.title,
        description: body.description,
        category: body.category || null,
        priority: body.priority || "MEDIUM",
        createdByUserId: session.user.id,
      },
    });

    return NextResponse.json(chamado);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Erro ao criar chamado." },
      { status: 500 }
    );
  }
}