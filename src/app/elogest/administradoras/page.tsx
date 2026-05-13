import Link from "next/link";
import { redirect } from "next/navigation";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";



/* =========================================================
   ELOGEST - ADMINISTRADORAS

   Rota:
   /elogest/administradoras

   ETAPA 42.2 — AMBIENTE SUPER ADMIN ELOGEST

   Objetivo:
   - Listar administradoras cadastradas na plataforma.
   - Permitir acesso ao detalhe da administradora.
   - Preparar criação de novas administradoras.
   - Manter esta área exclusiva para SUPER_ADMIN.

   Esta página pertence à área interna da EloGest.
   Não deve usar AdminShell, pois AdminShell é da administradora.
   ========================================================= */

export const dynamic = "force-dynamic";



type AuthUser = {
  id: string;
  role?: string | null;
  name?: string | null;
  email?: string | null;
};



function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}



function statusLabel(status: string) {
  if (status === "ACTIVE") return "Ativa";
  if (status === "INACTIVE") return "Inativa";
  return status;
}



function statusClasses(status: string) {
  if (status === "ACTIVE") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  return "border-[#DDE5DF] bg-[#F7F9F8] text-[#64736A]";
}



function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-[26px] border border-[#DDE5DF] bg-white/92 p-5 shadow-[0_16px_48px_rgba(23,33,27,0.06)]">
      <p className="text-sm font-semibold text-[#64736A]">
        {title}
      </p>

      <p className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#17211B]">
        {value}
      </p>

      <p className="mt-2 text-sm leading-6 text-[#7A877F]">
        {description}
      </p>
    </div>
  );
}



export default async function EloGestAdministradorasPage() {
  const authUser = (await getAuthUser()) as AuthUser | null;

  if (!authUser) {
    redirect("/login");
  }

  if (authUser.role !== "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }



  const [administradoras, totalAtivas, totalInativas] = await Promise.all([
    db.administrator.findMany({
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            condominiums: true,
            users: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),

    db.administrator.count({
      where: {
        status: "ACTIVE",
      },
    }),

    db.administrator.count({
      where: {
        status: "INACTIVE",
      },
    }),
  ]);



  return (
    <EloGestShell current="administradoras">
      <div className="space-y-8">



        {/* =====================================================
           HEADER
           ===================================================== */}

        <section className="rounded-[34px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Gestão EloGest
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                Administradoras
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64736A] sm:text-base sm:leading-7">
                Gerencie as administradoras clientes da plataforma, acompanhe
                seus condomínios vinculados e mantenha o controle global do
                ambiente EloGest.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/elogest/dashboard"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Voltar ao dashboard
              </Link>

              <Link
                href="/elogest/administradoras/nova"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
              >
                Nova administradora
              </Link>
            </div>
          </div>
        </section>



        {/* =====================================================
           KPIS
           ===================================================== */}

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Total"
            value={administradoras.length}
            description="Administradoras cadastradas na plataforma."
          />

          <StatCard
            title="Ativas"
            value={totalAtivas}
            description="Administradoras disponíveis para operação."
          />

          <StatCard
            title="Inativas"
            value={totalInativas}
            description="Administradoras suspensas ou desativadas."
          />
        </section>



        {/* =====================================================
           LISTAGEM
           ===================================================== */}

        <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                Lista de administradoras
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#64736A]">
                Clique em uma administradora para visualizar os dados e editar o cadastro.
              </p>
            </div>

            <span className="inline-flex w-fit rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
              {administradoras.length} registro
              {administradoras.length === 1 ? "" : "s"}
            </span>
          </div>

          {administradoras.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-10 text-center">
              <p className="text-sm font-semibold text-[#17211B]">
                Nenhuma administradora cadastrada.
              </p>

              <p className="mt-1 text-sm text-[#64736A]">
                Cadastre a primeira administradora para iniciar a operação da plataforma.
              </p>

              <Link
                href="/elogest/administradoras/nova"
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
              >
                Cadastrar administradora
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-[#DDE5DF]">
              <div className="hidden grid-cols-[1.3fr_0.9fr_0.75fr_0.7fr_0.6fr] border-b border-[#DDE5DF] bg-[#F7F9F8] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F] lg:grid">
                <div>Administradora</div>
                <div>Contato</div>
                <div>Estrutura</div>
                <div>Status</div>
                <div className="text-right">Cadastro</div>
              </div>

              <div className="divide-y divide-[#EEF2EF] bg-white">
                {administradoras.map((administradora) => (
                  <Link
                    key={administradora.id}
                    href={`/elogest/administradoras/${administradora.id}`}
                    className="group grid gap-3 px-4 py-4 transition hover:bg-[#F7FBF8] lg:grid-cols-[1.3fr_0.9fr_0.75fr_0.7fr_0.6fr] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#17211B] group-hover:text-[#256D3C]">
                        {administradora.name}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-[#64736A]">
                        {administradora.cnpj || "CNPJ não informado"}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#17211B]">
                        {administradora.email || "Sem e-mail"}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-[#64736A]">
                        {administradora.phone || "Sem telefone"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
                        {administradora._count.condominiums} condomínio
                        {administradora._count.condominiums === 1 ? "" : "s"}
                      </span>

                      <span className="rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
                        {administradora._count.users} usuário
                        {administradora._count.users === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div>
                      <span
                        className={[
                          "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                          statusClasses(administradora.status),
                        ].join(" ")}
                      >
                        {statusLabel(administradora.status)}
                      </span>
                    </div>

                    <div className="text-sm font-medium text-[#64736A] lg:text-right">
                      {formatDate(administradora.createdAt)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </EloGestShell>
  );
}