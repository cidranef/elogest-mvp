import Link from "next/link";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";



/* =========================================================
   ELOGEST - ADMINISTRADORAS

   Rota:
   /elogest/administradoras

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   Objetivo:
   - Listar todas as administradoras cadastradas na plataforma.
   - Representar a visão global da dona da plataforma EloGest.
   - Permitir acesso ao detalhe da administradora.
   - Preparar criação de novas administradoras.
   - Exibir indicadores de estrutura vinculada:
     condomínios, usuários e status operacional.

   Segurança:
   - A proteção principal da área /elogest é feita em:
     src/app/elogest/layout.tsx
   - Esta página herda o guard da área EloGest e deve ser usada
     apenas pelo SUPER_ADMIN.

   Regra estratégica:
   - Esta página não usa administratorId.
   - SUPER_ADMIN visualiza todas as administradoras.
   - ADMINISTRADORA deve operar apenas em /admin.
   ========================================================= */

export const dynamic = "force-dynamic";



/* =========================================================
   HELPERS
   ========================================================= */

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}



function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
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



function planStatusLabel(status?: string | null) {
  if (status === "ACTIVE") return "Plano ativo";
  if (status === "TRIALING") return "Em teste";
  if (status === "PAST_DUE") return "Pendente";
  if (status === "SUSPENDED") return "Suspenso";
  if (status === "CANCELED") return "Cancelado";

  return "Sem status";
}



function planBadgeClasses(status?: string | null) {
  if (status === "ACTIVE" || status === "TRIALING") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (status === "PAST_DUE") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  if (status === "SUSPENDED" || status === "CANCELED") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-[#DDE5DF] bg-[#F7F9F8] text-[#64736A]";
}



function pluralize(value: number, singular: string, plural: string) {
  return value === 1 ? singular : plural;
}



function formatCnpj(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length !== 14) {
    return value || "CNPJ não informado";
  }

  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}



function formatPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "Sem telefone";
  }

  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }

  return value || digits;
}



/* =========================================================
   COMPONENTES INTERNOS
   ========================================================= */

function StatCard({
  title,
  value,
  description,
  tone = "default",
}: {
  title: string;
  value: number;
  description: string;
  tone?: "default" | "success" | "muted";
}) {
  const toneClasses = {
    default: "border-[#DDE5DF] bg-white/92",
    success: "border-[#CFE6D4] bg-[#F7FBF8]",
    muted: "border-[#DDE5DF] bg-[#F7F9F8]",
  };

  return (
    <div
      className={[
        "rounded-[26px] border p-5 shadow-[0_16px_48px_rgba(23,33,27,0.06)]",
        toneClasses[tone],
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-[#64736A]">
        {title}
      </p>

      <p className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#17211B]">
        {formatNumber(value)}
      </p>

      <p className="mt-2 text-sm leading-6 text-[#7A877F]">
        {description}
      </p>
    </div>
  );
}



function EmptyState() {
  return (
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
  );
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default async function EloGestAdministradorasPage() {



  /* =========================================================
     DADOS GLOBAIS DA PLATAFORMA

     Importante:
     - Sem filtro por administratorId.
     - Esta é a visão global do SUPER_ADMIN.
     ========================================================= */

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
        planStatus: true,
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            condominiums: true,
            users: true,
          },
        },
      },
      orderBy: [
        {
          status: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
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



  const totalAdministradoras = administradoras.length;

  const totalCondominiosVinculados = administradoras.reduce(
    (total, item) => total + item._count.condominiums,
    0
  );

  const totalUsuariosVinculados = administradoras.reduce(
    (total, item) => total + item._count.users,
    0
  );



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
                Gestão global EloGest
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                Administradoras
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64736A] sm:text-base sm:leading-7">
                Gerencie as administradoras clientes da plataforma, acompanhe
                seus condomínios vinculados, usuários operacionais, plano contratado e status de
                operação. Esta é uma visão global da EloGest, sem vínculo com
                uma carteira específica.
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
                href="/elogest/planos"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-5 py-3 text-sm font-semibold text-[#256D3C] shadow-sm transition hover:border-[#256D3C]"
              >
                Ver Planos
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total"
            value={totalAdministradoras}
            description="Administradoras cadastradas na plataforma."
          />

          <StatCard
            title="Ativas"
            value={totalAtivas}
            description="Administradoras disponíveis para operação."
            tone="success"
          />

          <StatCard
            title="Inativas"
            value={totalInativas}
            description="Administradoras pausadas, suspensas ou desativadas."
            tone="muted"
          />

          <StatCard
            title="Estrutura vinculada"
            value={totalCondominiosVinculados}
            description={`${formatNumber(totalUsuariosVinculados)} ${pluralize(
              totalUsuariosVinculados,
              "usuário vinculado",
              "usuários vinculados"
            )}.`}
          />
        </section>



        {/* =====================================================
           RESUMO DE ESCOPO
           ===================================================== */}

        <section className="rounded-[28px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.025em] text-[#17211B]">
                Escopo multiadministradora
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#64736A]">
                Esta listagem exibe todas as administradoras da plataforma.
                A operação individual de cada administradora continua isolada
                dentro de /admin pelo respectivo administratorId.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Visão global
              </span>

              <span className="rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
                Sem filtro de carteira
              </span>
            </div>
          </div>
        </section>



        {/* =====================================================
           LISTAGEM
           ===================================================== */}

        <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                Lista de administradoras
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#64736A]">
                Clique em uma administradora para visualizar dados, editar o
                cadastro e gerenciar usuários administrativos vinculados.
              </p>
            </div>

            <span className="inline-flex w-fit rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
              {formatNumber(totalAdministradoras)} registro
              {totalAdministradoras === 1 ? "" : "s"}
            </span>
          </div>

          {administradoras.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-[#DDE5DF]">
              <div className="hidden grid-cols-[1.18fr_0.95fr_0.82fr_0.75fr_0.58fr_0.55fr] border-b border-[#DDE5DF] bg-[#F7F9F8] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F] lg:grid">
                <div>Administradora</div>
                <div>Contato</div>
                <div>Estrutura</div>
                <div>Plano</div>
                <div>Status</div>
                <div className="text-right">Cadastro</div>
              </div>

              <div className="max-h-[680px] divide-y divide-[#EEF2EF] overflow-y-auto bg-white">
                {administradoras.map((administradora) => (
                  <Link
                    key={administradora.id}
                    href={`/elogest/administradoras/${administradora.id}`}
                    className="group grid gap-3 px-4 py-4 transition hover:bg-[#F7FBF8] lg:grid-cols-[1.18fr_0.95fr_0.82fr_0.75fr_0.58fr_0.55fr] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[#17211B] group-hover:text-[#256D3C]">
                          {administradora.name}
                        </p>

                        {administradora.status !== "ACTIVE" && (
                          <span className="rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-2 py-0.5 text-[11px] font-semibold text-[#64736A]">
                            Pausada
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-xs leading-5 text-[#64736A]">
                        {formatCnpj(administradora.cnpj)}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#17211B]">
                        {administradora.email || "Sem e-mail"}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-[#64736A]">
                        {formatPhone(administradora.phone)}
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

                    <div className="min-w-0">
                      <span
                        className={[
                          "inline-flex max-w-full rounded-full border px-3 py-1 text-xs font-semibold",
                          planBadgeClasses(administradora.planStatus),
                        ].join(" ")}
                      >
                        <span className="truncate">
                          {administradora.plan?.name || "Sem Plano"}
                        </span>
                      </span>

                      <p className="mt-1 text-xs leading-5 text-[#7A877F]">
                        {planStatusLabel(administradora.planStatus)}
                      </p>
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
