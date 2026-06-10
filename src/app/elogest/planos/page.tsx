import Link from "next/link";
import { Status } from "@prisma/client";
import EloGestShell from "@/components/EloGestShell";
import { db } from "@/lib/db";



/* =========================================================
   ELOGEST - PLANOS E MÓDULOS

   Rota:
   /elogest/planos

   ETAPA 47 — PLANOS, MÓDULOS E LIMITES

   Objetivo:
   - Exibir os planos comerciais cadastrados no EloGest.
   - Mostrar limites operacionais por plano.
   - Mostrar módulos incluídos em cada plano.
   - Acompanhar quantas administradoras estão vinculadas a cada plano.

   Observação:
   - Nesta primeira entrega a tela é de consulta/controle.
   - Edição de plano, alteração de preços e overrides por
     administradora podem evoluir em subetapas futuras.
   ========================================================= */

export const dynamic = "force-dynamic";



/* =========================================================
   HELPERS
   ========================================================= */

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) {
    return "Ilimitado";
  }

  return new Intl.NumberFormat("pt-BR").format(value);
}



function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) {
    return "Personalizado";
  }

  if (value === 0) {
    return "R$ 0,00";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}



function statusLabel(status: string) {
  if (status === Status.ACTIVE) return "Ativo";
  if (status === Status.INACTIVE) return "Inativo";

  return status;
}



function statusClasses(status: string) {
  if (status === Status.ACTIVE) {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  return "border-[#DDE5DF] bg-[#F7F9F8] text-[#64736A]";
}



function getPlanTone(slug: string) {
  if (slug === "free") {
    return "border-[#DDE5DF] bg-white";
  }

  if (slug === "essential") {
    return "border-[#CFE6D4] bg-[#F7FBF8]";
  }

  if (slug === "professional") {
    return "border-[#BDDCC5] bg-[#F2F8F4]";
  }

  if (slug === "premium") {
    return "border-[#A8D7B4] bg-[#EAF7EE]";
  }

  return "border-[#17211B]/15 bg-white";
}



function getPlanLabel(slug: string) {
  if (slug === "free") return "Avaliação";
  if (slug === "essential") return "Entrada";
  if (slug === "professional") return "Crescimento";
  if (slug === "premium") return "Avançado";
  if (slug === "enterprise") return "Personalizado";

  return "Plano";
}



function pluralize(value: number, singular: string, plural: string) {
  return value === 1 ? singular : plural;
}



/* =========================================================
   COMPONENTES
   ========================================================= */

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
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



function LimitPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-white/80 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7A877F]">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-[#17211B]">
        {value}
      </p>
    </div>
  );
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default async function EloGestPlanosPage() {
  const [plans, modules, administratorsByPlan] = await Promise.all([
    db.plan.findMany({
      include: {
        modules: {
          include: {
            module: true,
          },
          orderBy: {
            module: {
              name: "asc",
            },
          },
        },
      },
      orderBy: [
        {
          monthlyPriceCents: "asc",
        },
        {
          name: "asc",
        },
      ],
    }),

    db.platformModule.findMany({
      where: {
        status: Status.ACTIVE,
      },
      orderBy: {
        name: "asc",
      },
    }),

    db.administrator.groupBy({
      by: ["planId"],
      _count: {
        _all: true,
      },
    }),
  ]);

  const administratorsCountMap = new Map<string, number>();

  for (const item of administratorsByPlan) {
    if (item.planId) {
      administratorsCountMap.set(item.planId, item._count._all);
    }
  }

  const activePlans = plans.filter((plan) => plan.status === Status.ACTIVE).length;

  const totalLinkedAdministrators = Array.from(administratorsCountMap.values()).reduce(
    (total, value) => total + value,
    0
  );

  return (
    <EloGestShell current="planos">
      <div className="space-y-8">



        {/* =====================================================
           HEADER
           ===================================================== */}

        <section className="rounded-[34px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Etapa 47 — Planos, Módulos E Limites
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                Planos E Módulos
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64736A] sm:text-base sm:leading-7">
                Controle a base comercial do EloGest: planos disponíveis,
                módulos incluídos e limites operacionais que serão aplicados
                pelas APIs administrativas da plataforma.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/elogest/dashboard"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Voltar Ao Dashboard
              </Link>

              <Link
                href="/elogest/administradoras"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
              >
                Ver Administradoras
              </Link>
            </div>
          </div>
        </section>



        {/* =====================================================
           KPIS
           ===================================================== */}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Planos"
            value={formatNumber(plans.length)}
            description="Planos comerciais cadastrados."
          />

          <StatCard
            title="Planos Ativos"
            value={formatNumber(activePlans)}
            description="Disponíveis para vínculo com administradoras."
          />

          <StatCard
            title="Módulos"
            value={formatNumber(modules.length)}
            description="Módulos ativos controláveis pela plataforma."
          />

          <StatCard
            title="Administradoras"
            value={formatNumber(totalLinkedAdministrators)}
            description="Administradoras com plano vinculado."
          />
        </section>



        {/* =====================================================
           REGRA COMERCIAL APROVADA
           ===================================================== */}

        <section className="rounded-[28px] border border-[#CFE6D4] bg-[#F7FBF8] p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.025em] text-[#17211B]">
                Regra Comercial Inicial
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#64736A]">
                O Plano Free permite a avaliação da plataforma com limite
                controlado. O Plano Essencial amplia a operação inicial para
                pequenas administradoras.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[#CFE6D4] bg-white px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Free: 3 Fornecedores
              </span>

              <span className="rounded-full border border-[#CFE6D4] bg-white px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Essencial: 10 Fornecedores
              </span>
            </div>
          </div>
        </section>



        {/* =====================================================
           PLANOS
           ===================================================== */}

        <section className="grid gap-5 xl:grid-cols-2">
          {plans.map((plan) => {
            const enabledModules = plan.modules.filter((item) => item.enabled);
            const administratorsCount = administratorsCountMap.get(plan.id) || 0;

            return (
              <article
                key={plan.id}
                className={[
                  "rounded-[30px] border p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)]",
                  getPlanTone(plan.slug),
                ].join(" ")}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#DDE5DF] bg-white/80 px-3 py-1 text-xs font-semibold text-[#64736A]">
                        {getPlanLabel(plan.slug)}
                      </span>

                      <span
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-semibold",
                          statusClasses(plan.status),
                        ].join(" ")}
                      >
                        {statusLabel(plan.status)}
                      </span>
                    </div>

                    <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[#17211B]">
                      {plan.name}
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-[#64736A]">
                      {plan.description || "Plano sem descrição cadastrada."}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#DDE5DF] bg-white/80 px-4 py-3 text-right">
                    <p className="text-xs font-semibold text-[#64736A]">
                      Mensalidade
                    </p>

                    <p className="mt-1 text-lg font-semibold text-[#17211B]">
                      {formatCurrency(plan.monthlyPriceCents)}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <LimitPill
                    label="Condomínios"
                    value={formatNumber(plan.maxCondominiums)}
                  />

                  <LimitPill
                    label="Unidades"
                    value={formatNumber(plan.maxUnits)}
                  />

                  <LimitPill
                    label="Usuários"
                    value={formatNumber(plan.maxUsers)}
                  />

                  <LimitPill
                    label="Chamados/Mês"
                    value={formatNumber(plan.maxMonthlyTickets)}
                  />

                  <LimitPill
                    label="Fornecedores"
                    value={formatNumber(plan.maxProviders)}
                  />

                  <LimitPill
                    label="Administradoras"
                    value={`${formatNumber(administratorsCount)} ${pluralize(
                      administratorsCount,
                      "vínculo",
                      "vínculos"
                    )}`}
                  />
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[#17211B]">
                      Módulos Incluídos
                    </h3>

                    <span className="rounded-full border border-[#DDE5DF] bg-white/80 px-3 py-1 text-xs font-semibold text-[#64736A]">
                      {enabledModules.length} módulo
                      {enabledModules.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {enabledModules.length === 0 ? (
                      <span className="rounded-full border border-[#DDE5DF] bg-white/80 px-3 py-1 text-xs font-semibold text-[#64736A]">
                        Nenhum módulo liberado
                      </span>
                    ) : (
                      enabledModules.map((item) => (
                        <span
                          key={item.id}
                          className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]"
                        >
                          {item.module.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>



        {/* =====================================================
           OBSERVAÇÃO
           ===================================================== */}

        <section className="rounded-[28px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
          <h2 className="text-lg font-semibold tracking-[-0.025em] text-[#17211B]">
            Próximas Evoluções
          </h2>

          <p className="mt-2 text-sm leading-6 text-[#64736A]">
            A estrutura técnica de planos já está aplicada nas APIs principais.
            As próximas subetapas podem incluir edição visual dos planos,
            alteração de plano por administradora, overrides de módulos,
            overrides de limites e integração futura com cobrança.
          </p>
        </section>
      </div>
    </EloGestShell>
  );
}
