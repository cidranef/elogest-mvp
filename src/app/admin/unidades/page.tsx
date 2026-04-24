import { db } from "@/lib/db";
import Link from "next/link";
import { requireRole } from "@/lib/permissions";
import { Role } from "@prisma/client";

export default async function UnidadesPage() {
  const session = await requireRole([
    Role.SUPER_ADMIN,
    Role.ADMINISTRADORA,
    Role.SINDICO,
  ]);

  const where =
    session.user.role === Role.ADMINISTRADORA && session.user.administratorId
      ? {
          condominium: {
            administratorId: session.user.administratorId,
          },
        }
      : session.user.role === Role.SINDICO && session.user.condominiumId
      ? { condominiumId: session.user.condominiumId }
      : {};

  const unidades = await db.unit.findMany({
    where,
    include: {
      condominium: true,
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
            <h1 className="text-3xl font-bold">Unidades</h1>
            <p className="text-slate-400">
              Apartamentos, casas ou salas vinculadas aos condomínios.
            </p>
          </div>

          <Link
            href="/admin/unidades/nova"
            className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700"
          >
            + Nova Unidade
          </Link>
        </div>

        <div className="space-y-4">
          {unidades.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
              Nenhuma unidade cadastrada.
            </div>
          ) : (
            unidades.map((unidade) => (
              <div
                key={unidade.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-green-600 transition"
              >
                <h2 className="text-xl font-bold">
                  {unidade.block ? `Bloco ${unidade.block} - ` : ""}
                  Unidade {unidade.unitNumber}
                </h2>

                <p className="text-slate-400">
                  Condomínio: {unidade.condominium.name}
                </p>

                <p className="text-slate-400 mt-2">
                  Tipo: {unidade.unitType || "-"}
                </p>

                <span className="inline-block mt-3 rounded-full bg-green-950 px-4 py-1 text-sm font-semibold text-green-400">
                  {unidade.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}