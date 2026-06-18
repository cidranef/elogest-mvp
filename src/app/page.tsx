import Link from "next/link";

/* =========================================================
   ELOGEST — ETAPA 56.3
   Página Comercial Pública

   Rota:
   / 

   Objetivo:
   - Substituir a tela inicial técnica do MVP por uma landing
     comercial pública do EloGest.
   - Apresentar posicionamento, benefícios, módulos, planos
     e chamadas para planos, onboarding e login.
   - Não cria administradora automaticamente.
   - Não depende de WhatsApp real, e-mail externo ou APIs privadas.
   ========================================================= */

const platformModules = [
  {
    title: "Chamados E Atendimento",
    description:
      "Organize solicitações, acompanhe responsáveis e mantenha histórico por condomínio, unidade e perfil de acesso.",
  },
  {
    title: "Comunicados Oficiais",
    description:
      "Publique avisos com confirmação de leitura, anexos e controle de quem ainda precisa ser lembrado.",
  },
  {
    title: "Assembleias Pelo Celular",
    description:
      "Convocação, procurações, votação, apuração e ata oficial em um fluxo digital auditável.",
  },
  {
    title: "Enquetes Condominiais",
    description:
      "Consulte moradores, proprietários e grupos específicos com resultados controlados pela administração.",
  },
  {
    title: "Reuniões De Conselho",
    description:
      "Registre pautas, decisões, responsáveis e pendências de reuniões de governança condominial.",
  },
  {
    title: "Financeiro Inicial",
    description:
      "Controle receitas, despesas, mensalidades, comprovantes, baixas e indicadores financeiros por carteira.",
  },
  {
    title: "Relatórios Gerenciais",
    description:
      "Acompanhe chamados, finanças, assembleias e indicadores operacionais para tomada de decisão.",
  },
  {
    title: "IA Operacional",
    description:
      "Apoio à priorização, resumos, auditoria, relatórios e análise operacional com revisão humana e rastreabilidade.",
  },
];

const planHighlights = [
  {
    name: "Free",
    description: "Para conhecer a plataforma com uma operação reduzida.",
  },
  {
    name: "Essencial",
    description: "Para administradoras que estão iniciando a organização digital.",
  },
  {
    name: "Profissional",
    description: "Para gestão completa de comunicação, chamados e cadastros.",
  },
  {
    name: "Premium",
    description: "Para operações com assembleias, financeiro, relatórios e IA.",
  },
  {
    name: "Enterprise",
    description: "Para carteiras maiores, redes e contratos personalizados.",
  },
];

const operatingSteps = [
  {
    label: "01",
    title: "Solicite O Acesso",
    description:
      "A administradora informa seus dados, tamanho aproximado da carteira e plano de interesse.",
  },
  {
    label: "02",
    title: "Análise Comercial",
    description:
      "O time EloGest analisa a solicitação antes de liberar qualquer ambiente operacional.",
  },
  {
    label: "03",
    title: "Onboarding Controlado",
    description:
      "A administradora é criada de forma segura, com plano, responsável e estrutura inicial revisados.",
  },
];

function EloGestMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      className={className}
      role="img"
      aria-label="Ícone EloGest"
    >
      <defs>
        <linearGradient id="egPublicFrameDark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egPublicFrameLight" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egPublicFrameDark)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egPublicFrameLight)"
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

function PublicLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white shadow-[0_18px_50px_rgba(23,33,27,0.08)]">
        <EloGestMark className="h-9 w-9" />
      </div>

      <div>
        <p className="text-2xl font-bold tracking-tight">
          <span className="text-[#256D3C]">Elo</span>
          <span className="text-[#17211B]">Gest</span>
        </p>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7A877F]">
          Governança Condominial
        </p>
      </div>
    </div>
  );
}

function PublicIcon({ type }: { type: "check" | "arrow" | "shield" | "chart" }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      {type === "check" && <path {...common} d="M5 13l4 4L19 7" />}
      {type === "arrow" && (
        <>
          <path {...common} d="M5 12h14" />
          <path {...common} d="M13 6l6 6-6 6" />
        </>
      )}
      {type === "shield" && (
        <>
          <path {...common} d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
          <path {...common} d="M9 12l2 2 4-5" />
        </>
      )}
      {type === "chart" && (
        <>
          <path {...common} d="M4 19V5" />
          <path {...common} d="M4 19h16" />
          <path {...common} d="M8 15l3-3 3 2 5-7" />
        </>
      )}
    </svg>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#256D3C]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#17211B] md:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-8 text-[#5E6B63] md:text-lg">
        {description}
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F6F8F7] text-[#17211B]">
      <header className="sticky top-0 z-40 border-b border-[#DDE5DF] bg-white/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link href="/" aria-label="Página inicial EloGest">
            <PublicLogo />
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-bold text-[#5E6B63] lg:flex">
            <a href="#modulos" className="transition hover:text-[#256D3C]">
              Módulos
            </a>
            <a href="#planos" className="transition hover:text-[#256D3C]">
              Planos
            </a>
            <a href="#onboarding" className="transition hover:text-[#256D3C]">
              Onboarding
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm font-bold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C] sm:inline-flex"
            >
              Login
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex rounded-2xl bg-[#256D3C] px-4 py-3 text-sm font-bold text-white shadow-[0_18px_35px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]"
            >
              Solicitar Acesso
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.28),transparent_34%),radial-gradient(circle_at_80%_12%,rgba(37,109,60,0.14),transparent_28%)]" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#CFE2D3] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#8ED08E]" />
              Plataforma SaaS Para Administradoras
            </div>

            <h1 className="mt-7 max-w-4xl text-4xl font-bold tracking-tight text-[#17211B] md:text-6xl md:leading-[1.05]">
              Gestão condominial, governança e operação em um só lugar.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#5E6B63] md:text-xl">
              O EloGest conecta administradoras, síndicos, conselhos,
              moradores e proprietários em uma plataforma segura para chamados,
              comunicados, assembleias, financeiro, relatórios e IA operacional.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/onboarding"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#256D3C] px-6 py-4 text-sm font-bold text-white shadow-[0_22px_45px_rgba(37,109,60,0.24)] transition hover:bg-[#174B2A]"
              >
                Solicitar Acesso
                <PublicIcon type="arrow" />
              </Link>

              <Link
                href="/planos"
                className="inline-flex items-center justify-center rounded-2xl border border-[#CFE2D3] bg-white px-6 py-4 text-sm font-bold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Ver Planos
              </Link>
            </div>

            <div className="mt-8 grid gap-3 text-sm font-semibold text-[#5E6B63] sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#EAF7EE] text-[#256D3C]">
                  <PublicIcon type="check" />
                </span>
                Multiadministradora
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#EAF7EE] text-[#256D3C]">
                  <PublicIcon type="shield" />
                </span>
                Acesso Por Perfil
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#EAF7EE] text-[#256D3C]">
                  <PublicIcon type="chart" />
                </span>
                Indicadores Gerenciais
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-[2rem] border border-white/70 bg-white/80 p-4 shadow-[0_30px_90px_rgba(23,33,27,0.14)] backdrop-blur-xl">
              <div className="rounded-[1.5rem] border border-[#DDE5DF] bg-[#17211B] p-5 text-white">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8ED08E]">
                      Painel EloGest
                    </p>
                    <h2 className="mt-2 text-2xl font-bold">Carteira Em Operação</h2>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <EloGestMark className="h-10 w-10" />
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Chamados", "128", "em acompanhamento"],
                    ["Comunicados", "94%", "leituras confirmadas"],
                    ["Assembleias", "7", "processos ativos"],
                    ["Financeiro", "R$", "visão gerencial"],
                  ].map(([label, value, caption]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                        {label}
                      </p>
                      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
                      <p className="mt-1 text-sm text-white/55">{caption}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-[#8ED08E]/25 bg-[#8ED08E]/10 p-4">
                  <p className="text-sm font-bold text-[#EAF7EE]">
                    IA Operacional Com Governança
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/65">
                    Apoio inteligente para priorização, relatórios e análise,
                    mantendo revisão humana e registros auditáveis.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="modulos" className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <SectionHeader
            eyebrow="Módulos Integrados"
            title="Da solicitação do morador ao relatório gerencial."
            description="O EloGest foi estruturado para operar a rotina condominial com isolamento por administradora, perfis ativos, histórico e visão estratégica."
          />

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {platformModules.map((module) => (
              <article
                key={module.title}
                className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-5 shadow-sm transition hover:-translate-y-1 hover:border-[#CFE2D3] hover:shadow-[0_22px_55px_rgba(23,33,27,0.08)]"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#EAF7EE] text-[#256D3C]">
                  <PublicIcon type="check" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-[#17211B]">
                  {module.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
                  {module.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="planos" className="py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <SectionHeader
            eyebrow="Planos Comerciais"
            title="Comece pequeno e evolua conforme a carteira cresce."
            description="Os planos do EloGest permitem organizar a entrada da administradora e liberar módulos conforme a necessidade operacional."
          />

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {planHighlights.map((plan) => (
              <article
                key={plan.name}
                className="rounded-3xl border border-[#DDE5DF] bg-white p-5 shadow-sm"
              >
                <p className="text-xl font-bold text-[#17211B]">{plan.name}</p>
                <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
                  {plan.description}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/planos"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#CFE2D3] bg-white px-6 py-4 text-sm font-bold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Comparar Planos
              <PublicIcon type="arrow" />
            </Link>
          </div>
        </div>
      </section>

      <section id="onboarding" className="bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#256D3C]">
                Onboarding Público Controlado
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#17211B] md:text-4xl">
                Solicitação pública, análise interna e liberação segura.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#5E6B63] md:text-lg">
                A entrada comercial do EloGest foi desenhada para evitar criação
                automática irrestrita de administradoras. Toda solicitação passa
                por análise antes da conversão em ambiente operacional.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#256D3C] px-6 py-4 text-sm font-bold text-white shadow-[0_22px_45px_rgba(37,109,60,0.24)] transition hover:bg-[#174B2A]"
                >
                  Solicitar Acesso
                  <PublicIcon type="arrow" />
                </Link>

                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-2xl border border-[#CFE2D3] bg-white px-6 py-4 text-sm font-bold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  Já Tenho Acesso
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              {operatingSteps.map((step) => (
                <article
                  key={step.label}
                  className="rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-6 shadow-sm"
                >
                  <div className="flex gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#17211B] text-sm font-bold text-[#8ED08E]">
                      {step.label}
                    </span>
                    <div>
                      <h3 className="text-lg font-bold text-[#17211B]">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#17211B] p-8 text-white shadow-[0_30px_90px_rgba(23,33,27,0.18)] md:p-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8ED08E]">
                EloGest Para Administradoras
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight md:text-4xl">
                Modernize a operação condominial sem perder controle, governança e segurança.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-8 text-white/65">
                Solicite o acesso e dê o primeiro passo para estruturar sua carteira com uma plataforma criada para escalar.
              </p>
            </div>

            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-bold text-[#17211B] shadow-sm transition hover:bg-[#EAF7EE]"
            >
              Começar Onboarding
              <PublicIcon type="arrow" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#DDE5DF] bg-white px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-[#7A877F] md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-bold text-[#17211B]">EloGest — Governança Condominial</p>
            <p className="mt-1">© 2026 EloGest. Todos os direitos reservados.</p>
          </div>

          <div className="flex flex-wrap gap-5 font-bold">
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
