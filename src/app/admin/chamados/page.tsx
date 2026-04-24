import { db } from "@/lib/db";
import Link from "next/link";
import { TicketStatusActions } from "@/components/chamados/ticket-status-actions";
import { requireAuth } from "@/lib/permissions";
import { Role } from "@prisma/client";

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    OPEN: "Aberto",
    IN_PROGRESS: "Em andamento",
    RESOLVED: "Resolvido",
    CANCELED: "Cancelado",
  };

  return labels[status] || status;
}

function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    LOW: "Baixa",
    MEDIUM: "Média",
    HIGH: "Alta",
    URGENT: "Urgente",
  };

  return labels[priority] || priority;
}

function statusClass(status: string) {
  const classes: Record<string, string> = {
    OPEN: "bg-blue-950 text-blue-300",
    IN_PROGRESS: "bg-yellow-950 text-yellow-300",
    RESOLVED: "bg-green-950 text-green-300",
    CANCELED: "bg-red-950 text-red-300",
  };

  return classes[status] || "bg-slate-800 text-slate-300";
}

export default async function ChamadosPage() {
  const session = await requireAuth();

  const where =
    session.user.role === Role.ADMINISTRADORA && session.user.administratorId
      ? {
          condominium: {
            administratorId: session.user.administratorId,
          },
        }
      : session.user.role === Role.SINDICO && session.user.condominiumId
      ? { condominiumId: session.user.condominiumId }
      : session.user.role === Role.MORADOR && session.user.residentId
      ? { residentId: session.user.residentId }
      : {};

  const chamados = await db.ticket.findMany({
    where,
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

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Chamados</h1>
            <p className="text-slate-400">
              Gestão de ocorrências e solicitações dos moradores.
            </p>
          </div>

          <Link
            href="/admin/chamados/novo"
            className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700"
          >
            + Novo Chamado
          </Link>
        </div>

        <div className="space-y-4">
          {chamados.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
              Nenhum chamado cadastrado.
            </div>
          ) : (
            chamados.map((chamado) => (
              <div
                key={chamado.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-green-600 transition"
              >
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div className="flex-1">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-bold">{chamado.title}</h2>

                      <span
                        className={`rounded-full px-4 py-1 text-sm font-semibold ${statusClass(
                          chamado.status
                        )}`}
                      >
                        {statusLabel(chamado.status)}
                      </span>
                    </div>

                    <div className="space-y-1 text-slate-400">
                      <p>Condomínio: {chamado.condominium.name}</p>
                      <p>
                        Unidade:{" "}
                        {chamado.unit.block
                          ? `Bloco ${chamado.unit.block} - `
                          : ""}
                        {chamado.unit.unitNumber}
                      </p>
                      <p>Morador: {chamado.resident?.name || "-"}</p>
                      <p>Categoria: {chamado.category || "-"}</p>
                      <p>Prioridade: {priorityLabel(chamado.priority)}</p>
                      <p>Criado por: {chamado.createdByUser.name}</p>
                      <p>
                        Criado em:{" "}
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(chamado.createdAt)}
                      </p>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-300">
                      {chamado.description}
                    </div>

                    {chamado.closedAt ? (
                      <p className="mt-3 text-sm text-green-400">
                        Resolvido em:{" "}
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(chamado.closedAt)}
                      </p>
                    ) : null}
                  </div>

                  {session.user.role !== Role.MORADOR ? (
                    <div className="min-w-[220px]">
                      <TicketStatusActions
                        ticketId={chamado.id}
                        currentStatus={chamado.status}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}