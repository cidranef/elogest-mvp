import { db } from "@/lib/db";
import Link from "next/link";
import { requireRole } from "@/lib/permissions";
import { Role } from "@prisma/client";

export default async function CondominiosPage() {
  const session = await requireRole([
    Role.SUPER_ADMIN,
    Role.ADMINISTRADORA,
    Role.SINDICO,
  ]);

  const where =
    session.user.role === Role.ADMINISTRADORA && session.user.administratorId
      ? { administratorId: session.user.administratorId }
      : session.user.role === Role.SINDICO && session.user.condominiumId
      ? { id: session.user.condominiumId }
      : {};

  const condominios = await db.condominium.findMany({
    where,
    include: {
      administrator: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Condomínios</h1>
            <p className="text-slate-400">
              Condomínios vinculados às administradoras.
            </p>
          </div>

          {session.user.role !== Role.SINDICO ? (
            <Link
              href="/admin/condominios/novo"
              className="rounded-xl bg-green-600 hover:bg-green-700 px-5 py-3 font-semibold transition"
            >
              + Novo Condomínio
            </Link>
          ) : null}
        </div>

        <div className="space-y-4">
          {condominios.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
              Nenhum condomínio cadastrado.
            </div>
          ) : (
            condominios.map((condominio) => (
              <div
                key={condominio.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-green-600 transition"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold">{condominio.name}</h2>
                    <p className="text-slate-400">
                      Administradora: {condominio.administrator.name}
                    </p>

                    <div className="mt-4 grid gap-2 text-sm text-slate-400 md:grid-cols-2">
                      <p>CNPJ: {condominio.cnpj || "-"}</p>
                      <p>E-mail: {condominio.email || "-"}</p>
                      <p>Telefone: {condominio.phone || "-"}</p>
                      <p>
                        Endereço:{" "}
                        {[
                          condominio.address,
                          condominio.number,
                          condominio.district,
                          condominio.city,
                          condominio.state,
                        ]
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-green-950 px-4 py-1 text-sm font-semibold text-green-400">
                    {condominio.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}