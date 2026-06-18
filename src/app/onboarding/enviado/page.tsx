import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Solicitação Recebida — EloGest",
  description: "Confirmação de envio da solicitação pública de acesso ao EloGest.",
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
        <linearGradient id="egSentDark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egSentLight" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egSentDark)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egSentLight)"
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

export default function OnboardingSentPage() {
  return (
    <main className="min-h-screen bg-[#F6F8F7] text-[#17211B]">
      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-[#DDE5DF] bg-white p-8 text-center shadow-[0_28px_80px_rgba(23,33,27,0.12)] sm:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-[#DDE5DF] bg-[#F9FBFA] shadow-sm">
            <EloGestMark className="h-14 w-14" />
          </div>

          <p className="mt-8 inline-flex rounded-full border border-[#8ED08E]/45 bg-[#EAF7EE] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
            Solicitação Recebida
          </p>

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-[#17211B]">
            Obrigado pelo interesse no EloGest.
          </h1>

          <p className="mt-5 text-base leading-7 text-[#5E6B63]">
            Nossa equipe analisará suas informações e entrará em contato para orientar os próximos passos. A ativação da administradora acontece apenas após revisão e aprovação.
          </p>

          <div className="mt-8 grid gap-3 rounded-3xl border border-[#DDE5DF] bg-[#F9FBFA] p-5 text-left text-sm font-semibold text-[#5E6B63]">
            <p>O que acontece agora:</p>
            <ul className="space-y-2 pl-1">
              <li>• A solicitação entra na fila de análise do Super Admin.</li>
              <li>• O plano informado será usado como referência inicial.</li>
              <li>• Nenhum acesso é liberado automaticamente sem validação.</li>
            </ul>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl bg-[#256D3C] px-6 py-3.5 text-sm font-bold text-white shadow-[0_18px_45px_rgba(37,109,60,0.25)] transition hover:bg-[#174B2A]"
            >
              Voltar Para A Página Inicial
            </Link>

            <Link
              href="/planos"
              className="inline-flex items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-6 py-3.5 text-sm font-bold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Ver Planos
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
