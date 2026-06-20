import type { Metadata } from "next";
import Link from "next/link";
import { Status } from "@prisma/client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planos EloGest — Governança Condominial",
  description:
    "Conheça os planos do EloGest para administradoras de condomínios.",
};

type PublicPlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  maxCondominiums: number | null;
  maxUnits: number | null;
  maxUsers: number | null;
  maxMonthlyTickets: number | null;
  maxProviders: number | null;
  modules: {
    module: {
      name: string;
      slug: string;
    };
  }[];
};

const PLAN_ORDER = ["free", "essencial", "profissional", "premium", "enterprise"];

const PLAN_COPY: Record<
  string,
  {
    headline: string;
    audience: string;
    highlight: string;
    badge?: string;
  }
> = {
  free: {
    headline: "Para validar a plataforma com uma operação reduzida.",
    audience: "Ideal para administradoras que querem conhecer o EloGest antes de expandir o uso.",
    highlight: "Entrada controlada",
  },
  essencial: {
    headline: "Para iniciar a organização digital da carteira condominial.",
    audience: "Indicado para pequenas administradoras que precisam centralizar cadastros e chamados.",
    highlight: "Primeiros condomínios",
  },
  profissional: {
    headline: "Para gestão condominial completa no dia a dia.",
    audience: "Recomendado para administradoras que já precisam de comunicação, fornecedores e operação estruturada.",
    highlight: "Gestão completa",
    badge: "Mais indicado para operação",
  },
  premium: {
    headline: "Para operações que precisam de governança, financeiro, relatórios e IA.",
    audience: "Plano recomendado para administradoras que querem ampliar eficiência, controle e tomada de decisão.",
    highlight: "Governança avançada",
    badge: "Mais completo",
  },
  enterprise: {
    headline: "Para operações maiores, contratos personalizados e redes de administradoras.",
    audience: "Modelo sob medida para estruturas com alto volume, regras comerciais específicas ou expansão planejada.",
    highlight: "Sob medida",
  },
};

const MODULE_LABELS: Record<string, string> = {
  chamados: "Chamados",
  condominios: "Condomínios",
  unidades: "Unidades",
  moradores: "Moradores",
  usuarios: "Usuários",
  fornecedores: "Fornecedores",
  comunicados: "Comunicados",
  "reunioes-conselho": "Reuniões De Conselho",
  enquetes: "Enquetes",
  assembleias: "Assembleias",
  financeiro: "Financeiro",
  relatorios: "Relatórios",
  whatsapp: "WhatsApp",
  ia: "IA Operacional",
};

function EloGestMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      className={className}
      role="img"
      aria-label="Ícone EloGest"
    >
      <defs>
        <linearGradient id="egPlanDark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egPlanLight" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egPlanDark)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egPlanLight)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path d="M26 50 L34 45 L34 60 L26 56 Z" fill="#17211B" />
      <path d="M37 28 L45 24 L45 61 L37 61 Z" fill="#17211B" />
      <path d="M49 40 L57 45 L57 58 L49 62 Z" fill="#17211B" />
    </svg>
  );
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#DDE5DF] bg-white/92 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Página inicial EloGest">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] shadow-sm">
            <EloGestMark className="h-8 w-8" />
          </span>

          <span>
            <span className="block text-xl font-semibold tracking-tight text-[#17211B]">
              <span className="text-[#256D3C]">Elo</span>Gest
            </span>
            <span className="block text-xs font-semibold text-[#7A877F]">
              Governança Condominial
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-[#5E6B63] md:flex">
          <Link href="/" className="transition hover:text-[#256D3C]">
            Início
          </Link>
          <Link href="/planos" className="text-[#256D3C]">
            Planos
          </Link>
          <Link href="/onboarding" className="transition hover:text-[#256D3C]">
            Solicitar Acesso
          </Link>
          <Link href="/faq" className="transition hover:text-[#256D3C]">
            FAQ
          </Link>
          <Link href="/login" className="transition hover:text-[#256D3C]">
            Login
          </Link>
        </nav>

        <Link
          href="/onboarding"
          className="inline-flex items-center justify-center rounded-2xl bg-[#256D3C] px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_35px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]"
        >
          Solicitar Acesso
        </Link>
      </div>
    </header>
  );
}

function formatCurrency(valueCents: number | null) {
  if (valueCents === null) {
    return "Sob consulta";
  }

  if (valueCents <= 0) {
    return "R$ 0";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(valueCents / 100);
}

function formatLimit(value: number | null, singular: string, plural: string) {
  if (value === null) {
    return "Ilimitado ou personalizado";
  }

  if (value === 1) {
    return `1 ${singular}`;
  }

  return `${value} ${plural}`;
}

function getPublicModules(plan: PublicPlan) {
  const modules = plan.modules
    .map((item) => {
      return MODULE_LABELS[item.module.slug] ?? item.module.name;
    })
    .filter(Boolean);

  return Array.from(new Set(modules)).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

function sortPlans(plans: PublicPlan[]) {
  return [...plans].sort((a, b) => {
    const orderA = PLAN_ORDER.indexOf(a.slug);
    const orderB = PLAN_ORDER.indexOf(b.slug);

    const safeOrderA = orderA === -1 ? 999 : orderA;
    const safeOrderB = orderB === -1 ? 999 : orderB;

    if (safeOrderA !== safeOrderB) {
      return safeOrderA - safeOrderB;
    }

    return a.name.localeCompare(b.name, "pt-BR");
  });
}

async function getPlans() {
  const plans = await db.plan.findMany({
    where: {
      status: Status.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      monthlyPriceCents: true,
      annualPriceCents: true,
      maxCondominiums: true,
      maxUnits: true,
      maxUsers: true,
      maxMonthlyTickets: true,
      maxProviders: true,
      modules: {
        where: {
          enabled: true,
          module: {
            status: Status.ACTIVE,
          },
        },
        select: {
          module: {
            select: {
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  return sortPlans(plans);
}

function PlanCard({ plan }: { plan: PublicPlan }) {
  const copy = PLAN_COPY[plan.slug] ?? {
    headline: plan.description ?? "Plano comercial EloGest.",
    audience: "Indicado para administradoras que querem organizar a operação condominial.",
    highlight: "Plano EloGest",
  };

  const modules = getPublicModules(plan);
  const isEnterprise = plan.slug === "enterprise";
  const isHighlighted = plan.slug === "profissional" || plan.slug === "premium";

  return (
    <article
      className={[
        "relative flex h-full flex-col overflow-hidden rounded-[2rem] border bg-white p-6 shadow-[0_20px_60px_rgba(23,33,27,0.08)]",
        isHighlighted ? "border-[#8ED08E] ring-4 ring-[#8ED08E]/18" : "border-[#DDE5DF]",
      ].join(" ")}
    >
      {copy.badge && (
        <div className="absolute right-5 top-5 rounded-full bg-[#EAF7EE] px-3 py-1 text-xs font-bold text-[#256D3C]">
          {copy.badge}
        </div>
      )}

      <div className="pr-20">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
          {copy.highlight}
        </p>

        <h2 className="mt-3 text-2xl font-bold tracking-tight text-[#17211B]">
          {plan.name}
        </h2>
      </div>

      <p className="mt-4 text-sm font-semibold leading-6 text-[#5E6B63]">
        {copy.headline}
      </p>

      <p className="mt-3 text-sm leading-6 text-[#7A877F]">
        {copy.audience}
      </p>

      <div className="mt-6 rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7A877F]">
          Valor Mensal
        </p>

        <div className="mt-2 flex items-end gap-2">
          <p className="text-3xl font-bold tracking-tight text-[#17211B]">
            {isEnterprise ? "Sob consulta" : formatCurrency(plan.monthlyPriceCents)}
          </p>

          {!isEnterprise && plan.monthlyPriceCents !== null && plan.monthlyPriceCents > 0 && (
            <p className="pb-1 text-sm font-semibold text-[#7A877F]">
              / mês
            </p>
          )}
        </div>

        {plan.annualPriceCents !== null && plan.annualPriceCents > 0 && !isEnterprise && (
          <p className="mt-2 text-xs font-semibold text-[#5E6B63]">
            Anual: {formatCurrency(plan.annualPriceCents)}
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-2 text-sm font-semibold text-[#5E6B63]">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F6F8F7] px-4 py-3">
          <span>Condomínios</span>
          <span className="text-right text-[#17211B]">
            {formatLimit(plan.maxCondominiums, "condomínio", "condomínios")}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F6F8F7] px-4 py-3">
          <span>Unidades</span>
          <span className="text-right text-[#17211B]">
            {formatLimit(plan.maxUnits, "unidade", "unidades")}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F6F8F7] px-4 py-3">
          <span>Usuários</span>
          <span className="text-right text-[#17211B]">
            {formatLimit(plan.maxUsers, "usuário", "usuários")}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F6F8F7] px-4 py-3">
          <span>Fornecedores</span>
          <span className="text-right text-[#17211B]">
            {formatLimit(plan.maxProviders, "fornecedor", "fornecedores")}
          </span>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7A877F]">
          Módulos Incluídos
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {modules.length > 0 ? (
            modules.slice(0, 10).map((module, index) => (
              <span
                key={`${module}-${index}`}
                className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-bold text-[#5E6B63]"
              >
                {module}
              </span>
            ))
          ) : (
            <span className="text-sm font-semibold text-[#7A877F]">
              Módulos definidos conforme contratação.
            </span>
          )}

          {modules.length > 10 && (
            <span className="rounded-full border border-[#8ED08E]/45 bg-[#EAF7EE] px-3 py-1 text-xs font-bold text-[#256D3C]">
              +{modules.length - 10} módulos
            </span>
          )}
        </div>
      </div>

      <div className="mt-auto pt-7">
        <Link
          href={`/onboarding?plan=${encodeURIComponent(plan.slug)}`}
          className={[
            "inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-bold transition",
            isHighlighted
              ? "bg-[#256D3C] text-white shadow-[0_14px_35px_rgba(37,109,60,0.22)] hover:bg-[#174B2A]"
              : "border border-[#DDE5DF] bg-white text-[#17211B] hover:border-[#256D3C] hover:text-[#256D3C]",
          ].join(" ")}
        >
          Solicitar Este Plano
        </Link>
      </div>
    </article>
  );
}

export default async function PublicPlansPage() {
  const plans = await getPlans();

  return (
    <main className="min-h-screen bg-[#F6F8F7] text-[#17211B]">
      <PublicHeader />

      <section className="relative overflow-hidden border-b border-[#DDE5DF] bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.28),transparent_34%),radial-gradient(circle_at_top_right,rgba(37,109,60,0.12),transparent_32%)]" />

        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="inline-flex rounded-full border border-[#8ED08E]/45 bg-[#EAF7EE] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
              Planos EloGest
            </p>

            <h1 className="mt-6 text-4xl font-bold tracking-tight text-[#17211B] sm:text-5xl lg:text-6xl">
              Escolha o plano ideal para a sua administradora.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#5E6B63]">
              Comece com uma operação reduzida, evolua para comunicação e chamados,
              ou avance para assembleias, financeiro, relatórios e IA operacional.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center rounded-2xl bg-[#256D3C] px-6 py-3.5 text-sm font-bold text-white shadow-[0_18px_45px_rgba(37,109,60,0.25)] transition hover:bg-[#174B2A]"
              >
                Solicitar Acesso
              </Link>

              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-6 py-3.5 text-sm font-bold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Voltar Para A Página Inicial
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
        {plans.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-[#DDE5DF] bg-white p-8 text-center shadow-[0_20px_60px_rgba(23,33,27,0.08)]">
            <p className="text-lg font-bold text-[#17211B]">
              Nenhum plano ativo disponível no momento.
            </p>

            <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
              Os planos comerciais precisam estar ativos no cadastro EloGest para aparecerem nesta página.
            </p>
          </div>
        )}
      </section>

      <section className="border-y border-[#DDE5DF] bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
              Onboarding Controlado
            </p>

            <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#17211B]">
              A solicitação passa por análise antes da ativação.
            </h2>

            <p className="mt-4 text-base leading-7 text-[#5E6B63]">
              O EloGest não cria administradoras automaticamente sem revisão.
              Após o envio, a equipe avalia as informações, orienta os próximos
              passos e faz a ativação de forma segura.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["1", "Solicitação", "A administradora informa dados básicos e plano de interesse."],
              ["2", "Análise", "O Super Admin acompanha a solicitação e registra o andamento."],
              ["3", "Ativação", "A conversão em administradora acontece somente após aprovação."],
            ].map(([number, title, description]) => (
              <div key={number} className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#256D3C] text-sm font-bold text-white">
                  {number}
                </div>

                <h3 className="mt-4 text-base font-bold text-[#17211B]">
                  {title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] bg-[#17211B] p-8 text-white shadow-[0_28px_80px_rgba(23,33,27,0.22)] lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8ED08E]">
                Próximo Passo
              </p>

              <h2 className="mt-4 text-3xl font-bold tracking-tight">
                Quer entender qual plano combina com sua carteira?
              </h2>

              <p className="mt-4 max-w-3xl text-base leading-7 text-white/70">
                Envie uma solicitação com o tamanho aproximado da sua operação.
                A análise ajuda a indicar o melhor caminho de entrada no EloGest.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center rounded-2xl bg-[#8ED08E] px-6 py-3.5 text-sm font-bold text-[#17211B] transition hover:bg-white"
              >
                Solicitar Acesso
              </Link>

              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Já Tenho Login
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#DDE5DF] bg-white px-5 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-[#7A877F] md:flex-row md:items-center md:justify-between">
          <p className="font-semibold text-[#5E6B63]">
            © 2026 EloGest — Governança Condominial
          </p>

          <div className="flex flex-wrap gap-4 font-semibold">
            <Link href="/" className="hover:text-[#256D3C]">
              Início
            </Link>
            <Link href="/planos" className="hover:text-[#256D3C]">
              Planos
            </Link>
            <Link href="/onboarding" className="hover:text-[#256D3C]">
              Solicitar Acesso
            </Link>
            <Link href="/faq" className="hover:text-[#256D3C]">
              FAQ
            </Link>
            <Link href="/termos" className="hover:text-[#256D3C]">
              Termos De Uso
            </Link>
            <Link href="/privacidade" className="hover:text-[#256D3C]">
              Política De Privacidade
            </Link>
            <Link href="/login" className="hover:text-[#256D3C]">
              Login
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
