import Link from "next/link";
import { redirect } from "next/navigation";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";



/* =========================================================
   DASHBOARD ELOGEST - SUPER ADMIN

   Rota:
   /elogest/dashboard

   ETAPA 42.2 — AMBIENTE SUPER ADMIN ELOGEST

   Objetivo:
   - Criar a primeira tela da área interna da própria EloGest.
   - Separar claramente:
     EloGest = dona da plataforma
     Administradora = cliente operacional
     Portal = usuário final.
   - Exibir visão geral da plataforma:
     administradoras, condomínios, usuários e chamados.
   - Preparar caminho para:
     cadastro de administradoras,
     indicadores SaaS,
     planos,
     suporte,
     auditoria e gestão global.

   Segurança:
   - Apenas SUPER_ADMIN pode acessar.
   ========================================================= */

export const dynamic = "force-dynamic";



type AuthUser = {
  id: string;
  role?: string | null;
  name?: string | null;
  email?: string | null;
};



function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}



function kpiLabel(value: number, singular: string, plural: string) {
  return value === 1 ? singular : plural;
}



function KpiCard({
  title,
  value,
  description,
  href,
}: {
  title: string;
  value: number;
  description: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-[28px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] transition hover:border-[#CFE6D4] hover:shadow-[0_22px_70px_rgba(23,33,27,0.09)]">
      <p className="text-sm font-semibold text-[#64736A]">
        {title}
      </p>

      <p className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-[#17211B]">
        {formatNumber(value)}
      </p>

      <p className="mt-2 text-sm leading-6 text-[#7A877F]">
        {description}
      </p>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}



function StatusCard({
  title,
  value,
  description,
  tone = "default",
}: {
  title: string;
  value: string;
  description: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClasses = {
    default: "border-[#DDE5DF] bg-white text-[#17211B]",
    success: "border-[#CFE6D4] bg-[#F7FBF8] text-[#256D3C]",
    warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
  };

  return (
    <div
      className={[
        "rounded-[24px] border p-5 shadow-[0_14px_38px_rgba(23,33,27,0.05)]",
        toneClasses[tone],
      ].join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
        {title}
      </p>

      <p className="mt-3 text-xl font-semibold tracking-[-0.025em]">
        {value}
      </p>

      <p className="mt-2 text-sm leading-6 opacity-70">
        {description}
      </p>
    </div>
  );
}



function QuickAction({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-[24px] border border-[#DDE5DF] bg-[#F9FBFA] p-5 transition hover:border-[#CFE6D4] hover:bg-white hover:shadow-[0_18px_52px_rgba(23,33,27,0.08)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[#17211B] group-hover:text-[#256D3C]">
            {title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-[#64736A]">
            {description}
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
          {label}
        </span>
      </div>
    </Link>
  );
}



export default async function EloGestDashboardPage() {
  const authUser = (await getAuthUser()) as AuthUser | null;

  if (!authUser) {
    redirect("/login");
  }

  if (authUser.role !== "SUPER_ADMIN") {
    redirect("/admin/dashboard");
  }



  /* =========================================================
     INDICADORES GERAIS DA PLATAFORMA
     ========================================================= */

  const [
    totalAdministradoras,
    administradorasAtivas,
    totalCondominios,
    condominiosAtivos,
    totalUsuarios,
    usuariosAtivos,
    totalChamados,
    chamadosAbertos,
    chamadosEmAtendimento,
    chamadosResolvidos,
  ] = await Promise.all([
    db.administrator.count(),
    db.administrator.count({
      where: {
        status: "ACTIVE",
      },
    }),
    db.condominium.count(),
    db.condominium.count({
      where: {
        status: "ACTIVE",
      },
    }),
    db.user.count(),
    db.user.count({
      where: {
        isActive: true,
      },
    }),
    db.ticket.count(),
    db.ticket.count({
      where: {
        status: "OPEN",
      },
    }),
    db.ticket.count({
      where: {
        status: "IN_PROGRESS",
      },
    }),
    db.ticket.count({
      where: {
        status: "RESOLVED",
      },
    }),
  ]);



  const administradorasRecentes = await db.administrator.findMany({
    select: {
      id: true,
      name: true,
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
    take: 5,
  });



  return (
    <EloGestShell current="dashboard">
      <div className="space-y-8">



        {/* =====================================================
           HERO
           ===================================================== */}

        <section className="overflow-hidden rounded-[34px] border border-[#DDE5DF] bg-white/90 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur">
          <div className="relative p-6 sm:p-8">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#8ED08E]/20 blur-3xl" />
              <div className="absolute -bottom-32 left-20 h-80 w-80 rounded-full bg-[#256D3C]/10 blur-3xl" />
            </div>

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                  Ambiente interno EloGest
                </div>

                <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                  Gestão global da plataforma.
                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64736A] sm:text-base sm:leading-7">
                  Acompanhe administradoras, condomínios, usuários, chamados e
                  indicadores gerais da operação EloGest em um único ambiente.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link
                  href="/elogest/administradoras/nova"
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
                >
                  Nova administradora
                </Link>

                <Link
                  href="/elogest/administradoras"
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  Ver administradoras
                </Link>
              </div>
            </div>
          </div>
        </section>



        {/* =====================================================
           KPIS
           ===================================================== */}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Administradoras"
            value={totalAdministradoras}
            description={`${formatNumber(administradorasAtivas)} ${kpiLabel(
              administradorasAtivas,
              "ativa",
              "ativas"
            )} na plataforma.`}
            href="/elogest/administradoras"
          />

          <KpiCard
            title="Condomínios"
            value={totalCondominios}
            description={`${formatNumber(condominiosAtivos)} ${kpiLabel(
              condominiosAtivos,
              "condomínio ativo",
              "condomínios ativos"
            )}.`}
          />

          <KpiCard
            title="Usuários"
            value={totalUsuarios}
            description={`${formatNumber(usuariosAtivos)} ${kpiLabel(
              usuariosAtivos,
              "usuário ativo",
              "usuários ativos"
            )}.`}
            href="/elogest/usuarios"
          />

          <KpiCard
            title="Chamados"
            value={totalChamados}
            description="Volume geral registrado na plataforma."
            href="/elogest/indicadores"
          />
        </section>



        {/* =====================================================
           STATUS OPERACIONAL
           ===================================================== */}

        <section className="grid gap-4 lg:grid-cols-3">
          <StatusCard
            title="Chamados abertos"
            value={formatNumber(chamadosAbertos)}
            description="Solicitações aguardando primeira tratativa."
            tone={chamadosAbertos > 0 ? "warning" : "success"}
          />

          <StatusCard
            title="Em atendimento"
            value={formatNumber(chamadosEmAtendimento)}
            description="Chamados em acompanhamento pelas administradoras."
            tone="default"
          />

          <StatusCard
            title="Resolvidos"
            value={formatNumber(chamadosResolvidos)}
            description="Chamados concluídos no ambiente atual."
            tone="success"
          />
        </section>



        {/* =====================================================
           CONTEÚDO PRINCIPAL
           ===================================================== */}

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">



          {/* =================================================
             ADMINISTRADORAS RECENTES
             ================================================= */}

          <div className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                  Administradoras recentes
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#64736A]">
                  Visão inicial das administradoras cadastradas na plataforma.
                </p>
              </div>

              <Link
                href="/elogest/administradoras"
                className="inline-flex w-fit rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C] transition hover:bg-[#DDF2E3]"
              >
                Ver todas
              </Link>
            </div>

            {administradorasRecentes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-8 text-center">
                <p className="text-sm font-semibold text-[#17211B]">
                  Nenhuma administradora cadastrada.
                </p>

                <p className="mt-1 text-sm text-[#64736A]">
                  Cadastre a primeira administradora para iniciar a operação.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#EEF2EF]">
                {administradorasRecentes.map((administradora) => (
                  <Link
                    key={administradora.id}
                    href={`/elogest/administradoras/${administradora.id}`}
                    className="group flex flex-col gap-3 py-4 transition first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#17211B] group-hover:text-[#256D3C]">
                        {administradora.name}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-[#64736A]">
                        {[administradora.email, administradora.phone]
                          .filter(Boolean)
                          .join(" • ") || "Sem dados de contato"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <span className="rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
                        {administradora._count.condominiums} condomínio
                        {administradora._count.condominiums === 1 ? "" : "s"}
                      </span>

                      <span className="rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
                        {administradora._count.users} usuário
                        {administradora._count.users === 1 ? "" : "s"}
                      </span>

                      <span
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-semibold",
                          administradora.status === "ACTIVE"
                            ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                            : "border-[#DDE5DF] bg-[#F7F9F8] text-[#64736A]",
                        ].join(" ")}
                      >
                        {administradora.status === "ACTIVE" ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>



          {/* =================================================
             PRÓXIMAS AÇÕES
             ================================================= */}

          <div className="space-y-4">
            <QuickAction
              title="Cadastrar administradora"
              description="Crie uma nova administradora cliente da plataforma."
              href="/elogest/administradoras/nova"
              label="Agora"
            />

            <QuickAction
              title="Gestão de planos"
              description="Estrutura futura para planos, limites, cobranças e uso."
              href="/elogest/planos"
              label="Futuro"
            />

            <QuickAction
              title="Indicadores SaaS"
              description="Acompanhe crescimento, uso e saúde da plataforma."
              href="/elogest/indicadores"
              label="Em breve"
            />
          </div>
        </section>
      </div>
    </EloGestShell>
  );
}