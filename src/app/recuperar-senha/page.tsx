"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";



/* =========================================================
   RECUPERAR SENHA - ELOGEST

   Rota:
   /recuperar-senha

   ETAPA 41.3:
   - Tela pública para solicitar recuperação de senha.
   - Envia e-mail para /api/auth/forgot-password.
   - Como ainda não temos serviço de e-mail configurado, em ambiente
     de desenvolvimento a API poderá retornar um link de teste.

   ETAPA 41.3.2 — REFINO VISUAL SIMPLIFICADO

   Ajustes desta revisão:
   - Removido painel institucional lateral.
   - Página ficou mais leve e direta que o login.
   - Mantido padrão visual premium, mas sem excesso de elementos.
   - Fundo recebeu textura sutil.
   - Card central ficou objetivo: logo, título, e-mail e ação.
   - Toda a lógica funcional foi preservada.
   ========================================================= */



function EloGestMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      className={className}
      role="img"
      aria-label="Ícone EloGest"
    >
      <defs>
        <linearGradient id="egFrameDarkRecover" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egFrameLightRecover" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egFrameDarkRecover)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egFrameLightRecover)"
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



function EloGestLogo() {
  return (
    <div className="flex items-center justify-center gap-3">
      <EloGestMark className="h-11 w-11" />

      <div className="text-3xl font-semibold tracking-[-0.04em]">
        <span className="text-[#256D3C]">Elo</span>
        <span className="text-[#17211B]">Gest</span>
      </div>
    </div>
  );
}



export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");



  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Informe seu e-mail para continuar.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccessMessage("");
      setDevResetUrl("");

      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Não foi possível solicitar a recuperação de senha.");
        return;
      }

      setSuccessMessage(
        data?.message ||
          "Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir sua senha."
      );

      if (data?.devResetUrl) {
        setDevResetUrl(data.devResetUrl);
      }
    } catch (err) {
      console.error(err);
      setError("Não foi possível solicitar a recuperação. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }



  return (
    <main className="min-h-screen overflow-hidden bg-[#F6F8F7] text-[#17211B]">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#EAF7EE_0%,#F6F8F7_34%,#FFFFFF_100%)]" />

        <div className="absolute inset-0 opacity-[0.18] bg-[radial-gradient(circle_at_1px_1px,rgba(37,109,60,0.22)_1px,transparent_0)] [background-size:24px_24px]" />

        <div className="absolute -right-44 top-24 h-96 w-96 rounded-full bg-[#8ED08E]/18 blur-3xl" />

        <div className="absolute -bottom-48 -left-36 h-[420px] w-[420px] rounded-full bg-[#256D3C]/10 blur-3xl" />
      </div>

      <section className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">



          {/* =====================================================
             CABEÇALHO SIMPLIFICADO
             ===================================================== */}

          <div className="mb-8 text-center">
            <EloGestLogo />

            <div className="mt-8 inline-flex rounded-full border border-[#CFE6D4] bg-white/85 px-3 py-1 text-xs font-semibold text-[#256D3C] shadow-sm backdrop-blur">
              Recuperação de acesso
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B]">
              Redefina sua senha.
            </h1>

            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#64736A]">
              Informe seu e-mail cadastrado para receber as instruções de
              recuperação.
            </p>
          </div>



          {/* =====================================================
             CARD PRINCIPAL
             ===================================================== */}

          <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_24px_70px_rgba(23,33,27,0.09)] backdrop-blur sm:p-8">
            {error && (
              <div
                className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
                role="alert"
              >
                {error}
              </div>
            )}

            {successMessage && (
              <div
                className="mb-5 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-3 text-sm leading-6 text-[#256D3C]"
                role="status"
              >
                {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-[#17211B]"
                >
                  E-mail
                </label>

                <input
                  id="email"
                  type="email"
                  placeholder="seuemail@exemplo.com"
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] focus:outline-none focus:ring-4 focus:ring-[#256D3C]/20 disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
              >
                {loading ? "Enviando..." : "Enviar instruções"}
              </button>
            </form>



            {/* =================================================
               LINK DE TESTE EM DESENVOLVIMENTO
               ================================================= */}

            {devResetUrl && (
              <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3">
                <p className="text-xs font-semibold text-yellow-800">
                  Link de teste em desenvolvimento:
                </p>

                <Link
                  href={devResetUrl}
                  className="mt-2 block break-all text-xs font-semibold text-[#256D3C] hover:underline"
                >
                  {devResetUrl}
                </Link>
              </div>
            )}



            {/* =================================================
               APOIO DISCRETO
               ================================================= */}

            <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F7F9F8] px-4 py-3">
              <p className="text-xs leading-5 text-[#64736A]">
                Por segurança, o link de recuperação possui validade limitada.
                Caso expire, solicite uma nova recuperação.
              </p>
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/login"
                className="text-sm font-semibold text-[#256D3C] hover:underline"
              >
                Voltar para o login
              </Link>
            </div>
          </section>

          <p className="mt-6 text-center text-xs leading-5 text-[#7A877F]">
            EloGest · Plataforma de governança condominial
          </p>
        </div>
      </section>
    </main>
  );
}