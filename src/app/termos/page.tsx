import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos De Uso — EloGest",
  description:
    "Conheça as regras de acesso e utilização da plataforma EloGest.",
};

const sections = [
  {
    title: "1. Objeto E Aceitação",
    paragraphs: [
      "Estes Termos De Uso regulam o acesso e a utilização da plataforma EloGest, destinada à gestão condominial, governança, comunicação, operação, financeiro, relatórios e recursos de apoio por inteligência artificial.",
      "Ao acessar ou utilizar o EloGest, a administradora contratante e os usuários vinculados declaram que leram, compreenderam e concordam com estes termos, respeitando também as regras comerciais do plano contratado.",
    ],
  },
  {
    title: "2. Cadastro, Acesso E Perfis",
    paragraphs: [
      "O cadastro público representa uma solicitação comercial e não cria acesso operacional automaticamente. A ativação depende de análise, aprovação e configuração pela equipe autorizada do EloGest.",
      "Cada usuário deve utilizar credenciais próprias, manter seus dados atualizados e preservar a confidencialidade de senhas, códigos e dispositivos utilizados para acesso.",
      "Os acessos são concedidos conforme perfis, vínculos, administradoras, condomínios e unidades. É proibido compartilhar credenciais ou tentar acessar informações fora do escopo autorizado.",
    ],
  },
  {
    title: "3. Responsabilidades Da Administradora",
    paragraphs: [
      "A administradora contratante é responsável por cadastrar informações corretas, definir usuários autorizados, manter os vínculos atualizados e orientar sua equipe e os usuários do portal.",
      "Também cabe à administradora validar conteúdos, lançamentos, comunicados, assembleias, documentos, resultados, dados financeiros e demais informações inseridas ou publicadas em seu ambiente.",
      "A administradora deve utilizar a plataforma em conformidade com a legislação aplicável, convenções, regulamentos internos e decisões condominiais.",
    ],
  },
  {
    title: "4. Responsabilidades Dos Usuários",
    paragraphs: [
      "Os usuários devem agir de boa-fé, utilizar a plataforma apenas para finalidades legítimas e respeitar os limites de seus perfis e vínculos.",
      "É vedado inserir conteúdo ilícito, ofensivo, fraudulento, discriminatório, malicioso ou que viole direitos de terceiros.",
      "O usuário é responsável pelas informações, mensagens, votos, anexos, comprovantes, documentos e demais conteúdos enviados por sua conta.",
    ],
  },
  {
    title: "5. Conteúdos, Documentos E Anexos",
    paragraphs: [
      "A plataforma permite o armazenamento e a circulação de informações operacionais, documentos, imagens, comprovantes e anexos relacionados à gestão condominial.",
      "A administradora e os usuários devem assegurar que possuem autorização e base legítima para inserir, compartilhar ou publicar esses conteúdos.",
      "O EloGest poderá aplicar controles técnicos de acesso, armazenamento privado, registro de downloads, histórico e auditoria, conforme o módulo utilizado.",
    ],
  },
  {
    title: "6. Assembleias, Enquetes E Decisões",
    paragraphs: [
      "Os módulos de assembleias, enquetes e reuniões de conselho oferecem ferramentas digitais de apoio à organização, participação, votação, apuração e registro.",
      "A responsabilidade pela validade jurídica, regras de convocação, quórum, elegibilidade, procurações, resultados e publicação pertence à administradora e aos responsáveis pela governança condominial.",
      "O EloGest não substitui assessoria jurídica, contábil ou administrativa especializada.",
    ],
  },
  {
    title: "7. Financeiro",
    paragraphs: [
      "Os recursos financeiros do EloGest apoiam lançamentos, mensalidades, baixas, comprovantes, pagamentos informados, indicadores e relatórios gerenciais.",
      "A administradora é responsável pela conferência, classificação, conciliação, aprovação e exatidão dos dados financeiros.",
      "Salvo quando expressamente contratado em módulo específico, o EloGest não atua como instituição financeira, banco, processador de pagamentos ou garantidor de liquidação.",
    ],
  },
  {
    title: "8. Inteligência Artificial",
    paragraphs: [
      "Os recursos de inteligência artificial fornecem apoio à redação, resumo, classificação, priorização, análise e leitura executiva.",
      "As respostas da IA podem conter imprecisões e devem ser revisadas por pessoa responsável antes de qualquer utilização oficial, publicação ou tomada de decisão.",
      "A IA não substitui avaliação humana, assessoria profissional, deliberação condominial ou responsabilidade administrativa.",
    ],
  },
  {
    title: "9. Planos, Limites E Disponibilidade",
    paragraphs: [
      "Os módulos, limites, preços e condições de uso variam de acordo com o plano contratado e eventuais ajustes comerciais autorizados.",
      "O EloGest poderá realizar manutenções, correções e atualizações. Sempre que possível, intervenções relevantes serão planejadas para reduzir impactos na operação.",
      "Não se garante disponibilidade ininterrupta em situações de manutenção emergencial, falhas de terceiros, indisponibilidade de infraestrutura, eventos de força maior ou uso inadequado.",
    ],
  },
  {
    title: "10. Segurança E Uso Indevido",
    paragraphs: [
      "O EloGest adota controles de autenticação, autorização, isolamento de dados, registros de atividade e proteção de arquivos conforme a arquitetura da plataforma.",
      "Tentativas de invasão, fraude, exploração de vulnerabilidades, automação abusiva, engenharia reversa indevida ou acesso não autorizado poderão resultar em bloqueio imediato e adoção das medidas cabíveis.",
      "A administradora deve comunicar prontamente qualquer suspeita de comprometimento de conta ou uso irregular.",
    ],
  },
  {
    title: "11. Suspensão E Encerramento",
    paragraphs: [
      "O acesso poderá ser suspenso por inadimplência, violação destes termos, risco de segurança, fraude, determinação legal ou uso incompatível com a finalidade da plataforma.",
      "O encerramento da relação comercial observará as condições contratadas, incluindo prazos, obrigações pendentes e regras aplicáveis à exportação ou retenção de dados.",
    ],
  },
  {
    title: "12. Propriedade Intelectual",
    paragraphs: [
      "A marca EloGest, o software, a interface, os componentes, os fluxos, a documentação e os conteúdos institucionais são protegidos pela legislação de propriedade intelectual.",
      "A contratação concede direito limitado de uso da plataforma durante a vigência da relação comercial, sem transferência de propriedade sobre o software.",
    ],
  },
  {
    title: "13. Alterações Dos Termos",
    paragraphs: [
      "Estes termos poderão ser atualizados para refletir mudanças legais, técnicas, operacionais ou comerciais.",
      "A versão vigente será disponibilizada nesta página, com indicação da data de atualização. Mudanças relevantes poderão ser comunicadas pelos canais disponíveis.",
    ],
  },
  {
    title: "14. Legislação E Foro",
    paragraphs: [
      "Estes termos são regidos pela legislação brasileira.",
      "Eventuais controvérsias serão tratadas inicialmente por tentativa de solução amigável. Persistindo o conflito, será aplicado o foro definido no instrumento contratual celebrado com a administradora.",
    ],
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
        <linearGradient id="egTermsDark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>
        <linearGradient id="egTermsLight" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egTermsDark)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />
      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egTermsLight)"
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
          <Link href="/faq" className="transition hover:text-[#256D3C]">
            FAQ
          </Link>
          <Link href="/termos" className="text-[#256D3C]">
            Termos
          </Link>
          <Link href="/privacidade" className="transition hover:text-[#256D3C]">
            Privacidade
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

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#F6F8F7] text-[#17211B]">
      <PublicHeader />

      <section className="relative overflow-hidden border-b border-[#DDE5DF] bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.28),transparent_34%),radial-gradient(circle_at_top_right,rgba(37,109,60,0.12),transparent_32%)]" />

        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="inline-flex rounded-full border border-[#8ED08E]/45 bg-[#EAF7EE] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
              Termos De Uso
            </p>

            <h1 className="mt-6 text-4xl font-bold tracking-tight text-[#17211B] sm:text-5xl lg:text-6xl">
              Regras para utilização segura e responsável do EloGest.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#5E6B63]">
              Estes termos apresentam as condições gerais de acesso e uso da plataforma por administradoras, responsáveis e usuários vinculados.
            </p>

            <p className="mt-5 text-sm font-semibold text-[#7A877F]">
              Última atualização: 20 de junho de 2026.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-14 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-[#DDE5DF] bg-white p-6 shadow-[0_20px_60px_rgba(23,33,27,0.06)] sm:p-8 lg:p-10">
          <div className="rounded-3xl border border-[#CFE2D3] bg-[#EAF7EE] p-5">
            <p className="text-sm font-bold text-[#256D3C]">
              Importante
            </p>
            <p className="mt-2 text-sm leading-6 text-[#4F6657]">
              Este documento estabelece condições gerais da plataforma. Condições comerciais específicas, níveis de serviço, preços, limites e obrigações adicionais poderão constar em contrato próprio.
            </p>
          </div>

          <div className="mt-10 space-y-10">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-bold tracking-tight text-[#17211B] sm:text-2xl">
                  {section.title}
                </h2>

                <div className="mt-4 space-y-4">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-7 text-[#5E6B63] sm:text-base"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] bg-[#17211B] p-8 text-white shadow-[0_28px_80px_rgba(23,33,27,0.22)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8ED08E]">
            Conheça O EloGest
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight">
            Avalie os planos e solicite uma análise comercial.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/70">
            O envio do formulário não ativa uma administradora automaticamente. A equipe EloGest avalia as informações antes da liberação.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/planos"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Ver Planos
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center rounded-2xl bg-[#8ED08E] px-6 py-3.5 text-sm font-bold text-[#17211B] transition hover:bg-white"
            >
              Solicitar Acesso
            </Link>
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
            <Link href="/faq" className="hover:text-[#256D3C]">
              FAQ
            </Link>
            <Link href="/termos" className="hover:text-[#256D3C]">
              Termos De Uso
            </Link>
            <Link href="/privacidade" className="hover:text-[#256D3C]">
              Política De Privacidade
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
