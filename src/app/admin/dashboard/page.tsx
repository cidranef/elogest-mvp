import { db } from "@/lib/db";
import Link from "next/link";
import { requireRole } from "@/lib/permissions";
import { Role } from "@prisma/client";

export default async function AdminDashboardPage() {
  await requireRole([Role.SUPER_ADMIN, Role.ADMINISTRADORA, Role.SINDICO]);

  const [
    totalAdministradoras,
    totalCondominios,
    totalUnidades,
    totalMoradores,
    totalChamados,
    chamadosAbertos,
    chamadosEmAndamento,
    chamadosResolvidos,
    chamadosCancelados,
  ] = await Promise.all([
    db.administrator.count(),
    db.condominium.count(),
    db.unit.count(),
    db.resident.count(),
    db.ticket.count(),
    db.ticket.count({ where: { status: "OPEN" } }),
    db.ticket.count({ where: { status: "IN_PROGRESS" } }),
    db.ticket.count({ where: { status: "RESOLVED" } }),
    db.ticket.count({ where: { status: "CANCELED" } }),
  ]);

  const ultimosChamados = await db.ticket.findMany({
    take: 5,
    include: {
      condominium: true,
      unit: true,
      resident: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Dashboard Administrativo</h1>
          <p className="text-slate-400">
            Visão geral da operação da plataforma EloGest.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-4 mb-8">
          <KpiCard title="Administradoras" value={totalAdministradoras} />
          <KpiCard title="Condomínios" value={totalCondominios} />
          <KpiCard title="Unidades" value={totalUnidades} />
          <KpiCard title="Moradores" value={totalMoradores} />
        </section>

        <section className="grid gap-4 md:grid-cols-5 mb-8">
          <KpiCard title="Total Chamados" value={totalChamados} />
          <KpiCard title="Abertos" value={chamadosAbertos} />
          <KpiCard title="Em andamento" value={chamadosEmAndamento} />
          <KpiCard title="Resolvidos" value={chamadosResolvidos} />
          <KpiCard title="Cancelados" value={chamadosCancelados} />
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Últimos chamados</h2>
              <p className="text-slate-400">
                Chamados mais recentes registrados no sistema.
              </p>
            </div>

            <Link
              href="/admin/chamados"
              className="rounded-xl bg-green-600 px-4 py-2 font-semibold hover:bg-green-700"
            >
              Ver todos
            </Link>
          </div>

          <div className="space-y-4">
            {ultimosChamados.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-slate-400">
                Nenhum chamado registrado.
              </div>
            ) : (
              ultimosChamados.map((chamado) => (
                <div
                  key={chamado.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="font-semibold">{chamado.title}</h3>
                      <p className="text-sm text-slate-400">
                        {chamado.condominium.name} ·{" "}
                        {chamado.unit.block
                          ? `Bloco ${chamado.unit.block} - `
                          : ""}
                        Unidade {chamado.unit.unitNumber}
                      </p>
                      <p className="text-sm text-slate-500">
                        Morador: {chamado.resident?.name || "-"}
                      </p>
                    </div>

                    <span className="rounded-full bg-blue-950 px-4 py-1 text-sm font-semibold text-blue-300">
                      {statusLabel(chamado.status)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function KpiCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <p className="text-sm text-slate-400">{title}</p>
      <h2 className="mt-2 text-3xl font-bold">{value}</h2>
    </div>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    OPEN: "Aberto",
    IN_PROGRESS: "Em andamento",
    RESOLVED: "Resolvido",
    CANCELED: "Cancelado",
  };

  return labels[status] || status;
}