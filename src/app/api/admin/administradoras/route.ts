import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// 🔒 Simulação de helper de auth (vamos padronizar depois)
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.administratorId) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    const administradora = await db.administrator.findUnique({
      where: {
        id: session.user.administratorId,
      },
    });

    return NextResponse.json(administradora);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Erro ao listar administradora." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.administratorId) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    const body = await req.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "Nome da administradora é obrigatório." },
        { status: 400 }
      );
    }

    // 🔒 Aqui você decide a regra de negócio:
    // Normalmente NÃO se cria administradora via API logada
    // Mas se quiser permitir atualização, melhor usar PUT

    return NextResponse.json(
      { error: "Operação não permitida." },
      { status: 403 }
    );

  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Erro ao processar requisição." },
      { status: 500 }
    );
  }
}