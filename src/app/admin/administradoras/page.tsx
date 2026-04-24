import { db } from "@/lib/db";
import Link from "next/link";
import { requireRole } from "@/lib/permissions";
import { Role } from "@prisma/client";

export default async function AdministradorasPage() {
  await requireRole([Role.SUPER_ADMIN]);

  const administradoras = await db.administrator.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Administradoras</h1>
            <p className="text-slate-400">
              Empresas administradoras vinculadas à EloGest.
            </p>
          </div>

          <Link
            href="/admin/administradoras/nova"
            className="rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700"
          >
            + Nova Administradora
          </Link>
        </div>

        <div className="space-y-4">
          {administradoras.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
              Nenhuma administradora cadastrada.
            </div>
          ) : (
            administradoras.map((adm) => (
              <div
                key={adm.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6 hover:border-green-600 transition"
              >
                <h2 className="text-xl font-bold">{adm.name}</h2>
                <div className="mt-3 space-y-1 text-slate-400">
                  <p>E-mail: {adm.email || "-"}</p>
                  <p>CNPJ: {adm.cnpj || "-"}</p>
                  <p>Telefone: {adm.phone || "-"}</p>
                </div>
                <span className="mt-3 inline-block rounded-full bg-green-950 px-4 py-1 text-sm font-semibold text-green-400">
                  {adm.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}