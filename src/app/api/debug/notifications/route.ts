import { db } from "@/lib/db";
import { NextResponse } from "next/server";



/* =========================================================
   DEBUG TEMPORÁRIO - NOTIFICAÇÕES

   USO LOCAL APENAS.

   Objetivo:
   Verificar se a notificação TICKET_ASSIGNED_PUBLIC
   está sendo criada no banco.

   IMPORTANTE:
   Depois do teste, apagar esta pasta:
   src/app/api/debug
   ========================================================= */

export async function GET() {
  try {
    const notifications = await db.notification.findMany({
      take: 30,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },

        ticket: {
          select: {
            id: true,
            title: true,
            status: true,
            createdByUserId: true,
            condominiumId: true,
            unitId: true,
            residentId: true,

            condominium: {
              select: {
                id: true,
                name: true,
              },
            },

            unit: {
              select: {
                id: true,
                block: true,
                unitNumber: true,
              },
            },

            resident: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const simplified = notifications.map((notification) => ({
      id: notification.id,
      userId: notification.userId,
      userName: notification.user?.name || null,
      userEmail: notification.user?.email || null,
      userRole: notification.user?.role || null,

      ticketId: notification.ticketId,
      ticketTitle: notification.ticket?.title || null,
      ticketCreatedByUserId: notification.ticket?.createdByUserId || null,
      ticketCondominiumId: notification.ticket?.condominiumId || null,
      ticketUnitId: notification.ticket?.unitId || null,
      ticketResidentId: notification.ticket?.residentId || null,

      type: notification.type,
      title: notification.title,
      message: notification.message,
      status: notification.status,
      href: notification.href,
      createdAt: notification.createdAt,

      metadata: notification.metadata,
    }));

    return NextResponse.json({
      total: simplified.length,
      notifications: simplified,
    });
  } catch (error: any) {
    console.error("ERRO DEBUG NOTIFICAÇÕES:", error);

    return NextResponse.json(
      {
        error: "Erro ao consultar notificações.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}