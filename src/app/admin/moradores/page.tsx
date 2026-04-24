import { db } from "@/lib/db";
import Link from "next/link";
import { requireRole } from "@/lib/permissions";
import { Role } from "@prisma/client";

export default async function MoradoresPage() {
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

  const moradores = await db.resident.findMany({
    where,
    include: {
      condominium: true,
      unit: true,
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
            <h1 className="text-3xl font-bold">Moradores</h1>
            <p className="text-slate-400">
              Moradores vinculados às unidades dos condomínios.
            </p>
          </div>

          <Link
            href="/admin/moradores/novo"
            className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700"
          >
            + Novo Morador
          </Link>
        </div>

        <div className="space-y-4">
          {moradores.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
              Nenhum morador cadastrado.
            </div>
          ) : (
            moradores.map((morador) => (
              <div
                key={morador.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-green-600 transition"
              >
                <h2 className="text-xl font-bold">{morador.name}</h2>

                <div className="mt-3 space-y-1 text-slate-400">
                  <p>Condomínio: {morador.condominium.name}</p>
                  <p>
                    Unidade:{" "}
                    {morador.unit.block ? `Bloco ${morador.unit.block} - ` : ""}
                    {morador.unit.unitNumber}
                  </p>
                  <p>E-mail: {morador.email || "-"}</p>
                  <p>Telefone: {morador.phone || "-"}</p>
                  <p>CPF: {morador.cpf || "-"}</p>
                  <p>Tipo: {morador.residentType || "-"}</p>
                </div>

                <span className="mt-3 inline-block rounded-full bg-green-950 px-4 py-1 text-sm font-semibold text-green-400">
                  {morador.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}