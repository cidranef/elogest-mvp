import type { Metadata } from "next";
import Link from "next/link";
import { Status } from "@prisma/client";
import { db } from "@/lib/db";
import OnboardingForm from "./onboarding-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Solicitar Acesso — EloGest",
  description:
    "Envie uma solicitação de acesso ao EloGest para sua administradora.",
};

type SearchParams =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>;

type OnboardingPageProps = {
  searchParams?: SearchParams;
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
        <linearGradient id="egOnboardingDark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egOnboardingLight" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egOnboardingDark)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egOnboardingLight)"
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
          <Link href="/planos" className="transition hover:text-[#256D3C]">
            Planos
          </Link>
          <Link href="/onboarding" className="text-[#256D3C]">
            Solicitar Acesso
          </Link>
          <Link href="/login" className="transition hover:text-[#256D3C]">
            Login
          </Link>
        </nav>

        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 py-2.5 text-sm font-bold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
        >
          Login
        </Link>
      </div>
    </header>
  );
}

async function getPublicPlans() {
  return db.plan.findMany({
    where: {
      status: Status.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

function getFirstSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function PublicOnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const initialPlanSlug = getFirstSearchParam(resolvedSearchParams, "plan");
  const plans = await getPublicPlans();

  return (
    <main className="min-h-screen bg-[#F6F8F7] text-[#17211B]">
      <PublicHeader />

      <section className="relative overflow-hidden border-b border-[#DDE5DF] bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.28),transparent_34%),radial-gradient(circle_at_top_right,rgba(37,109,60,0.12),transparent_32%)]" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-18">
          <div className="self-center">
            <p className="inline-flex rounded-full border border-[#8ED08E]/45 bg-[#EAF7EE] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
              Onboarding Público
            </p>

            <h1 className="mt-6 text-4xl font-bold tracking-tight text-[#17211B] sm:text-5xl">
              Solicite acesso ao EloGest para sua administradora.
            </h1>

            <p className="mt-6 text-lg leading-8 text-[#5E6B63]">
              Envie os dados principais da operação. A equipe EloGest analisa a solicitação e orienta os próximos passos antes da ativação.
            </p>

            <div className="mt-8 grid gap-3 text-sm font-semibold text-[#5E6B63]">
              {[
                "Nenhuma administradora é criada automaticamente.",
                "O plano informado é tratado como interesse inicial.",
                "O Super Admin acompanha a solicitação antes da conversão.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#256D3C] text-[11px] font-bold text-white">
                    ✓
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <OnboardingForm plans={plans} initialPlanSlug={initialPlanSlug} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["1", "Envio Da Solicitação", "A administradora informa dados básicos, tamanho aproximado da carteira e plano de interesse."],
            ["2", "Análise Comercial", "A equipe EloGest avalia o pedido e pode entrar em contato para confirmar informações."],
            ["3", "Ativação Controlada", "A conversão em administradora ocorre apenas após aprovação e configuração segura."],
          ].map(([number, title, description]) => (
            <article key={number} className="rounded-[2rem] border border-[#DDE5DF] bg-white p-6 shadow-[0_20px_60px_rgba(23,33,27,0.06)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#256D3C] text-sm font-bold text-white">
                {number}
              </div>

              <h2 className="mt-5 text-lg font-bold text-[#17211B]">
                {title}
              </h2>

              <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
                {description}
              </p>
            </article>
          ))}
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
            <Link href="/login" className="hover:text-[#256D3C]">
              Login
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
