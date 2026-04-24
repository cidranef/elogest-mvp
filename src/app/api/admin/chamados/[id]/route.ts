import { db } from "@/lib/db";
import { TicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const status = body.status as TicketStatus;

    if (!Object.values(TicketStatus).includes(status)) {
      return NextResponse.json(
        { error: "Status inválido." },
        { status: 400 }
      );
    }

    const chamado = await db.ticket.update({
      where: { id },
      data: {
        status,
        closedAt: status === "RESOLVED" ? new Date() : null,
      },
    });

    return NextResponse.json(chamado);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Erro ao atualizar chamado." },
      { status: 500 }
    );
  }
}