"use client";



/* =========================================================
   ELOGEST LOADING SCREEN

   Tela neutra de carregamento da marca EloGest.

   Uso recomendado:
   - Verificando perfil...
   - Carregando dashboard...
   - Carregando notificações...
   - Carregando preferências...
   - Carregando chamados...

   Objetivo:
   - Evitar flash de AdminShell/PortalShell errado.
   - Padronizar carregamentos com identidade visual EloGest.
   ========================================================= */

export default function EloGestLoadingScreen({
  title = "Verificando perfil...",
  description = "Aguarde enquanto identificamos seu perfil de acesso.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F8F7] px-4 text-[#17211B]">
      <section className="w-full max-w-md rounded-[32px] border border-[#DDE5DF] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#EAF7EE]">
          <svg
            viewBox="0 0 80 80"
            className="h-12 w-12"
            role="img"
            aria-label="Ícone EloGest"
          >
            <defs>
              <linearGradient id="egFrameDarkLoading" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#256D3C" />
                <stop offset="100%" stopColor="#174B2A" />
              </linearGradient>

              <linearGradient id="egFrameLightLoading" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#8ED08E" />
                <stop offset="100%" stopColor="#5FAE68" />
              </linearGradient>
            </defs>

            <path
              d="M39 8 L15 20 L15 55 L39 72"
              fill="none"
              stroke="url(#egFrameDarkLoading)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="7"
            />

            <path
              d="M41 8 L65 20 L65 55 L41 72"
              fill="none"
              stroke="url(#egFrameLightLoading)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="7"
            />

            <path d="M26 50 L34 45 L34 60 L26 56 Z" fill="#17211B" />
            <path d="M37 28 L45 24 L45 61 L37 61 Z" fill="#17211B" />
            <path d="M49 40 L57 45 L57 58 L49 62 Z" fill="#17211B" />
          </svg>
        </div>

        <div className="mb-2 text-2xl font-semibold tracking-tight">
          <span className="text-[#256D3C]">Elo</span>
          <span className="text-[#17211B]">Gest</span>
        </div>

        <p className="text-sm font-semibold text-[#17211B]">
          {title}
        </p>

        <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
          {description}
        </p>

        <div className="mx-auto mt-6 h-2 w-32 overflow-hidden rounded-full bg-[#EAF7EE]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[#256D3C]" />
        </div>
      </section>
    </main>
  );
}