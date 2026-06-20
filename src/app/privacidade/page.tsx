import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política De Privacidade — EloGest",
  description:
    "Saiba como o EloGest trata dados pessoais, protege informações e atende aos direitos dos titulares.",
};

const sections = [
  {
    title: "1. Objetivo E Abrangência",
    paragraphs: [
      "Esta Política De Privacidade explica como os dados pessoais podem ser coletados, utilizados, armazenados, compartilhados e protegidos no contexto da plataforma EloGest.",
      "A política se aplica à página comercial, ao formulário público de solicitação, à área administrativa, ao portal de usuários e aos módulos operacionais disponibilizados pela plataforma.",
    ],
  },
  {
    title: "2. Papéis No Tratamento De Dados",
    paragraphs: [
      "Dependendo da operação, a administradora de condomínios poderá atuar como controladora dos dados inseridos em seu ambiente, definindo as finalidades e os meios essenciais do tratamento.",
      "A empresa responsável pelo EloGest poderá atuar como operadora, tratando dados em nome da administradora, e também como controladora em atividades próprias, como relacionamento comercial, segurança, faturamento e gestão da plataforma.",
      "As responsabilidades específicas poderão ser detalhadas em contrato e documentos complementares.",
    ],
  },
  {
    title: "3. Dados Que Podem Ser Coletados",
    items: [
      "Dados de identificação, como nome, documento, perfil e vínculo.",
      "Dados de contato, como e-mail, telefone, cidade e estado.",
      "Dados da administradora, condomínio, bloco, unidade e carteira.",
      "Dados de acesso, autenticação, permissões e contexto ativo.",
      "Chamados, comentários, comunicados, confirmações de leitura e anexos.",
      "Informações de assembleias, procurações, votos, enquetes e reuniões.",
      "Dados financeiros, lançamentos, comprovantes e pagamentos informados.",
      "Registros técnicos, endereço IP, dispositivo, navegador, data, hora e logs.",
      "Informações enviadas voluntariamente em formulários e mensagens.",
    ],
  },
  {
    title: "4. Finalidades Do Tratamento",
    items: [
      "Receber e analisar solicitações comerciais e de onboarding.",
      "Criar, administrar e proteger contas e perfis de acesso.",
      "Disponibilizar módulos contratados e executar funcionalidades.",
      "Organizar a comunicação e a governança condominial.",
      "Processar registros financeiros e documentos relacionados.",
      "Gerar relatórios, indicadores e histórico operacional.",
      "Prevenir fraude, abuso, incidentes e acessos não autorizados.",
      "Cumprir obrigações legais, regulatórias, contratuais e de auditoria.",
      "Atender solicitações, suporte e exercício de direitos.",
      "Melhorar a estabilidade, segurança e experiência da plataforma.",
    ],
  },
  {
    title: "5. Bases Legais",
    paragraphs: [
      "O tratamento poderá ocorrer com fundamento na execução de contrato ou de procedimentos preliminares, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse, proteção do crédito, prevenção à fraude, consentimento ou outras bases previstas na legislação aplicável.",
      "A base legal utilizada dependerá da finalidade, do contexto, da categoria de dados e do papel desempenhado por cada agente de tratamento.",
    ],
  },
  {
    title: "6. Dados Sensíveis E Dados De Crianças",
    paragraphs: [
      "A plataforma não foi concebida para coletar dados sensíveis ou dados de crianças e adolescentes de forma indiscriminada.",
      "Quando o tratamento dessas informações for necessário para uma finalidade legítima da gestão condominial, a administradora deverá assegurar base legal adequada, minimização, transparência e controles de acesso compatíveis.",
    ],
  },
  {
    title: "7. Compartilhamento E Prestadores De Serviço",
    paragraphs: [
      "Os dados poderão ser compartilhados com prestadores de infraestrutura, hospedagem, banco de dados, armazenamento, autenticação, envio de comunicações, suporte, segurança e outros serviços necessários à operação.",
      "O compartilhamento será limitado ao necessário, com medidas contratuais e técnicas compatíveis com a natureza do serviço.",
      "Os dados também poderão ser compartilhados quando exigido por lei, ordem judicial, autoridade competente, defesa de direitos ou prevenção de fraude e incidentes.",
    ],
  },
  {
    title: "8. Armazenamento E Transferência",
    paragraphs: [
      "Os dados podem ser armazenados em infraestrutura própria ou de terceiros contratados, inclusive em ambientes de computação em nuvem.",
      "Quando houver armazenamento ou processamento fora do Brasil, serão adotadas medidas compatíveis com a legislação aplicável e com o nível de proteção necessário.",
    ],
  },
  {
    title: "9. Segurança Da Informação",
    paragraphs: [
      "O EloGest utiliza controles de autenticação, autorização por perfil e vínculo, isolamento entre administradoras, armazenamento privado de arquivos, trilhas de auditoria e registros de atividade conforme o módulo.",
      "Apesar das medidas adotadas, nenhum ambiente é totalmente imune a riscos. Usuários e administradoras também devem proteger credenciais, dispositivos e canais de acesso.",
      "Suspeitas de incidente, acesso indevido ou comprometimento de conta devem ser comunicadas pelos canais oficiais disponíveis.",
    ],
  },
  {
    title: "10. Retenção E Exclusão",
    paragraphs: [
      "Os dados serão mantidos pelo período necessário para cumprir as finalidades informadas, executar contratos, preservar histórico, atender obrigações legais, exercer direitos e manter a segurança da plataforma.",
      "Após o término da necessidade, os dados poderão ser eliminados, anonimizados ou conservados nas hipóteses autorizadas pela legislação.",
      "Prazos específicos poderão variar conforme o tipo de dado, o módulo utilizado, a relação contratual e as obrigações aplicáveis.",
    ],
  },
  {
    title: "11. Direitos Dos Titulares",
    items: [
      "Confirmação da existência de tratamento.",
      "Acesso aos dados pessoais.",
      "Correção de dados incompletos, inexatos ou desatualizados.",
      "Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade.",
      "Portabilidade, quando aplicável e regulamentada.",
      "Informação sobre compartilhamentos.",
      "Revogação do consentimento, quando essa for a base utilizada.",
      "Revisão de decisões tomadas unicamente com base em tratamento automatizado, quando aplicável.",
      "Oposição ao tratamento nas hipóteses legais.",
    ],
    paragraphs: [
      "A solicitação poderá exigir confirmação de identidade e será analisada considerando o papel de controlador ou operador, as obrigações legais e os direitos de terceiros.",
    ],
  },
  {
    title: "12. Cookies E Dados Técnicos",
    paragraphs: [
      "A página pública e a plataforma podem utilizar cookies estritamente necessários e tecnologias semelhantes para autenticação, segurança, preferências, estabilidade e funcionamento.",
      "Cookies analíticos, de publicidade ou outras categorias não essenciais somente deverão ser utilizados de forma compatível com a legislação e com mecanismos adequados de transparência e escolha.",
      "O usuário pode gerenciar cookies por meio das configurações do navegador, observando que o bloqueio de cookies necessários poderá afetar funcionalidades.",
    ],
  },
  {
    title: "13. Inteligência Artificial",
    paragraphs: [
      "Alguns módulos utilizam inteligência artificial para gerar resumos, sugestões, classificações, priorizações e análises.",
      "Os dados enviados a recursos de IA devem ser limitados ao necessário para a finalidade e tratados de acordo com as configurações e contratos aplicáveis.",
      "As respostas geradas devem ser revisadas por pessoa responsável. O EloGest não utiliza a IA como substituta da decisão humana em atos oficiais.",
    ],
  },
  {
    title: "14. Formulário Público E Leads",
    paragraphs: [
      "Ao enviar o formulário público, o interessado fornece dados de contato, informações da administradora, estimativas da carteira, plano de interesse e mensagem opcional.",
      "Esses dados são utilizados para analisar a solicitação, realizar contato comercial, prevenir duplicidade, registrar o andamento e, após aprovação, permitir a conversão controlada em administradora.",
      "O envio do formulário não cria conta, usuário, senha, contratação ou ativação automática.",
    ],
  },
  {
    title: "15. Comunicações",
    paragraphs: [
      "Comunicações transacionais ou operacionais poderão ser enviadas quando necessárias à execução do serviço, segurança, suporte ou cumprimento de obrigações.",
      "Comunicações comerciais deverão observar as preferências, bases legais e mecanismos de cancelamento aplicáveis.",
      "A versão atual do formulário público não realiza envio externo automático por e-mail ou WhatsApp.",
    ],
  },
  {
    title: "16. Como Exercer Direitos",
    paragraphs: [
      "Solicitações relacionadas à privacidade podem ser apresentadas pelos canais oficiais da empresa responsável pelo EloGest, informados no atendimento comercial, contrato ou ambiente autenticado.",
      "Quando a solicitação estiver relacionada a dados controlados por uma administradora, o titular poderá ser orientado a contatar diretamente essa administradora.",
    ],
  },
  {
    title: "17. Alterações Desta Política",
    paragraphs: [
      "Esta política poderá ser atualizada para refletir mudanças legais, técnicas, operacionais ou comerciais.",
      "A versão vigente será publicada nesta página com a indicação da data de atualização. Alterações relevantes poderão ser comunicadas pelos canais disponíveis.",
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
        <linearGradient id="egPrivacyDark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>
        <linearGradient id="egPrivacyLight" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egPrivacyDark)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />
      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egPrivacyLight)"
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
          <Link href="/termos" className="transition hover:text-[#256D3C]">
            Termos
          </Link>
          <Link href="/privacidade" className="text-[#256D3C]">
            Privacidade
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

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#F6F8F7] text-[#17211B]">
      <PublicHeader />

      <section className="relative overflow-hidden border-b border-[#DDE5DF] bg-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(142,208,142,0.28),transparent_34%),radial-gradient(circle_at_top_right,rgba(37,109,60,0.12),transparent_32%)]" />

        <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="inline-flex rounded-full border border-[#8ED08E]/45 bg-[#EAF7EE] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
              Política De Privacidade
            </p>

            <h1 className="mt-6 text-4xl font-bold tracking-tight text-[#17211B] sm:text-5xl lg:text-6xl">
              Transparência sobre o tratamento de dados no EloGest.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#5E6B63]">
              Conheça os dados tratados, suas finalidades, os controles de segurança e os direitos dos titulares.
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
              Compromisso Com A Privacidade
            </p>
            <p className="mt-2 text-sm leading-6 text-[#4F6657]">
              O EloGest foi estruturado com controle de acesso por perfil e vínculo, isolamento entre administradoras, histórico operacional e proteção de arquivos conforme a finalidade de cada módulo.
            </p>
          </div>

          <div className="mt-10 space-y-10">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-bold tracking-tight text-[#17211B] sm:text-2xl">
                  {section.title}
                </h2>

                {section.paragraphs && (
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
                )}

                {section.items && (
                  <ul className="mt-4 space-y-3">
                    {section.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 text-sm leading-7 text-[#5E6B63] sm:text-base"
                      >
                        <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-[#256D3C]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] bg-[#17211B] p-8 text-white shadow-[0_28px_80px_rgba(23,33,27,0.22)]">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8ED08E]">
            Documentos Públicos
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight">
            Consulte também os Termos De Uso.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/70">
            Os Termos De Uso apresentam as regras gerais de acesso, responsabilidades e utilização da plataforma.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/termos"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Ler Termos De Uso
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
          </div>
        </div>
      </footer>
    </main>
  );
}
