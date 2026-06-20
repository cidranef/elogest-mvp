import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Perguntas Frequentes — EloGest",
  description:
    "Tire dúvidas sobre planos, onboarding, segurança, módulos, financeiro, assembleias e IA do EloGest.",
};

const faqGroups = [
  {
    title: "Acesso E Onboarding",
    description: "Como funciona a entrada de uma administradora na plataforma.",
    items: [
      { question: "O preenchimento do formulário cria acesso imediatamente?", answer: "Não. O formulário registra uma solicitação comercial. A equipe EloGest analisa os dados antes de criar qualquer ambiente operacional." },
      { question: "Quem pode solicitar acesso ao EloGest?", answer: "Administradoras de condomínios interessadas em organizar sua operação, comunicação, governança e acompanhamento gerencial." },
      { question: "O plano escolhido no formulário é definitivo?", answer: "Não. Ele funciona como indicação inicial de interesse. A equipe pode recomendar outro plano conforme o tamanho e as necessidades da carteira." },
      { question: "Como acontece a ativação da administradora?", answer: "Após análise e aprovação, a solicitação pode ser convertida em administradora pelo Super Admin EloGest, com plano, status e estrutura inicial controlados." },
    ],
  },
  {
    title: "Planos E Contratação",
    description: "Dúvidas sobre planos, limites e evolução comercial.",
    items: [
      { question: "Quais planos estão disponíveis?", answer: "O EloGest possui os planos Free, Essencial, Profissional, Premium e Enterprise. A disponibilidade e os recursos são exibidos na página pública de planos." },
      { question: "É possível mudar de plano depois?", answer: "Sim. A administradora pode evoluir de plano conforme aumenta sua carteira ou passa a precisar de novos módulos e limites." },
      { question: "O plano Enterprise possui valor fixo?", answer: "Não necessariamente. O Enterprise é voltado a operações maiores, contratos personalizados e necessidades específicas." },
      { question: "Existe período de teste gratuito?", answer: "A estrutura de trial controlado está prevista como complemento comercial. A liberação dependerá de regras de ativação, prazo e expiração definidas pelo EloGest." },
    ],
  },
  {
    title: "Módulos E Operação",
    description: "Recursos disponíveis para a rotina condominial.",
    items: [
      { question: "Quais áreas o EloGest reúne?", answer: "Chamados, comunicados, fornecedores, reuniões de conselho, enquetes, assembleias, financeiro, relatórios gerenciais e IA operacional." },
      { question: "Moradores e síndicos acessam o mesmo ambiente da administradora?", answer: "Não. A administradora opera na área administrativa, enquanto síndicos, conselheiros, moradores e proprietários usam o portal conforme seus perfis e vínculos." },
      { question: "Os módulos são liberados para todos os planos?", answer: "Não. Cada plano possui módulos e limites próprios, com possibilidade de ajustes controlados pela plataforma." },
      { question: "O EloGest atende mais de uma administradora?", answer: "Sim. A plataforma foi estruturada como ambiente multiadministradora, mantendo isolamento de dados e operação por cliente." },
    ],
  },
  {
    title: "Assembleias, Enquetes E Governança",
    description: "Participação digital com histórico e controle.",
    items: [
      { question: "O EloGest permite votação pelo celular?", answer: "Sim. O módulo de assembleias contempla convocação, elegibilidade, procurações, votação, apuração e publicação de resultados." },
      { question: "As enquetes substituem assembleias?", answer: "Não. Enquetes são consultas rápidas. Assembleias atendem deliberações formais com regras próprias de participação e votação." },
      { question: "As reuniões de conselho ficam registradas?", answer: "Sim. É possível registrar pautas, discussões, decisões, responsáveis, prazos e pendências." },
      { question: "As atas podem ser geradas com apoio de IA?", answer: "Sim. A IA pode aprimorar a redação da minuta, mas a revisão humana continua obrigatória antes da aprovação e publicação oficial." },
    ],
  },
  {
    title: "Financeiro E Relatórios",
    description: "Controle gerencial da operação condominial.",
    items: [
      { question: "O módulo financeiro emite boletos automaticamente?", answer: "O escopo atual concentra-se em lançamentos, mensalidades, baixas, comprovantes, pagamentos informados e indicadores. Integrações bancárias e boletos automáticos dependem de etapa específica." },
      { question: "Moradores podem informar pagamentos?", answer: "Sim. O portal permite informar pagamento e enviar comprovante para conferência da administradora." },
      { question: "Quais relatórios estão disponíveis?", answer: "Há relatórios de chamados, financeiro, comunicados, assembleias, enquetes e fornecedores, além de leitura executiva com apoio de IA." },
    ],
  },
  {
    title: "Segurança, Dados E IA",
    description: "Regras de proteção, acesso e rastreabilidade.",
    items: [
      { question: "Os dados de uma administradora ficam separados das outras?", answer: "Sim. O EloGest aplica isolamento por administradora, condomínio, unidade e perfil ativo." },
      { question: "A IA toma decisões automaticamente?", answer: "Não. A IA oferece apoio operacional, resumos, sugestões e análises. A decisão final continua sob responsabilidade humana." },
      { question: "As ações importantes ficam registradas?", answer: "Os módulos críticos utilizam histórico, logs e trilhas de auditoria conforme o tipo de operação." },
      { question: "O formulário público ativa WhatsApp ou e-mail automaticamente?", answer: "Não. O envio atual apenas registra a solicitação. Integrações externas serão tratadas em etapa específica." },
    ],
  },
];

function EloGestMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} role="img" aria-label="Ícone EloGest">
      <defs>
        <linearGradient id="egFaqDark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>
        <linearGradient id="egFaqLight" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>
      <path d="M39 8 L15 20 L15 55 L39 72" fill="none" stroke="url(#egFaqDark)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="7" />
      <path d="M41 8 L65 20 L65 55 L41 72" fill="none" stroke="url(#egFaqLight)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="7" />
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
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] shadow-sm"><EloGestMark className="h-8 w-8" /></span>
          <span>
            <span className="block text-xl font-semibold tracking-tight text-[#17211B]"><span className="text-[#256D3C]">Elo</span>Gest</span>
            <span className="block text-xs font-semibold text-[#7A877F]">Governança Condominial</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-[#5E6B63] md:flex">
          <Link href="/" className="transition hover:text-[#256D3C]">Início</Link>
          <Link href="/planos" className="transition hover:text-[#256D3C]">Planos</Link>
          <Link href="/onboarding" className="transition hover:text-[#256D3C]">Solicitar Acesso</Link>
          <Link href="/faq" className="text-[#256D3C]">FAQ</Link>
          <Link href="/login" className="transition hover:text-[#256D3C]">Login</Link>
        </nav>
        <Link href="/onboarding" className="inline-flex items-center justify-center rounded-2xl bg-[#256D3C] px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_35px_rgba(37,109,60,0.22)] transition hover:bg-[#174B2A]">Solicitar Acesso</Link>
      </div>
    </header>
  );
}

export default function PublicFaqPage() {
  return (
    <main className="min-h-screen bg-[#F6F8F7] text-[#17211B]">
      <PublicHeader />
      <section className="relative overflow-hidden border-b border-[#DDE5DF] bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.28),transparent_34%),radial-gradient(circle_at_top_right,rgba(37,109,60,0.12),transparent_32%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="inline-flex rounded-full border border-[#8ED08E]/45 bg-[#EAF7EE] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">Perguntas Frequentes</p>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-[#17211B] sm:text-5xl lg:text-6xl">Tire suas dúvidas antes de solicitar acesso.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#5E6B63]">Entenda como funcionam os planos, o onboarding controlado, os módulos, a segurança dos dados e a operação do EloGest.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/planos" className="inline-flex items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-6 py-3.5 text-sm font-bold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]">Ver Planos</Link>
              <Link href="/onboarding" className="inline-flex items-center justify-center rounded-2xl bg-[#256D3C] px-6 py-3.5 text-sm font-bold text-white shadow-[0_18px_45px_rgba(37,109,60,0.25)] transition hover:bg-[#174B2A]">Solicitar Acesso</Link>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {faqGroups.map((group) => (
            <section key={group.title} className="rounded-[2rem] border border-[#DDE5DF] bg-white p-6 shadow-[0_20px_60px_rgba(23,33,27,0.06)]">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">{group.title}</p>
              <p className="mt-3 text-sm leading-6 text-[#5E6B63]">{group.description}</p>
              <div className="mt-6 space-y-3">
                {group.items.map((item) => (
                  <details key={item.question} className="group rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] px-5 py-4 open:border-[#8ED08E]/55 open:bg-[#F7FBF8]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-[#17211B]">
                      <span>{item.question}</span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-lg text-[#256D3C] shadow-sm transition group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-4 pr-10 text-sm leading-6 text-[#5E6B63]">{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] bg-[#17211B] p-8 text-white shadow-[0_28px_80px_rgba(23,33,27,0.22)] lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8ED08E]">Ainda Tem Dúvidas?</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight">Envie uma solicitação com informações sobre sua operação.</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/70">O formulário permite informar o tamanho aproximado da carteira, o plano de interesse e uma mensagem para análise comercial.</p>
            </div>
            <Link href="/onboarding" className="inline-flex items-center justify-center rounded-2xl bg-[#8ED08E] px-6 py-3.5 text-sm font-bold text-[#17211B] transition hover:bg-white">Solicitar Acesso</Link>
          </div>
        </div>
      </section>
      <footer className="border-t border-[#DDE5DF] bg-white px-5 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-[#7A877F] md:flex-row md:items-center md:justify-between">
          <p className="font-semibold text-[#5E6B63]">© 2026 EloGest — Governança Condominial</p>
          <div className="flex flex-wrap gap-4 font-semibold">
            <Link href="/" className="hover:text-[#256D3C]">Início</Link>
            <Link href="/planos" className="hover:text-[#256D3C]">Planos</Link>
            <Link href="/onboarding" className="hover:text-[#256D3C]">Solicitar Acesso</Link>
            <Link href="/faq" className="hover:text-[#256D3C]">FAQ</Link>
            <Link href="/login" className="hover:text-[#256D3C]">Login</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
