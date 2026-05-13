"use client";

import Link from "next/link";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";



/* =========================================================
   REDEFINIR SENHA - ELOGEST

   Rota:
   /redefinir-senha?token=...

   ETAPA 41.3:
   - Recebe token pela URL.
   - Permite definir nova senha.
   - Envia token + nova senha para /api/auth/reset-password.

   ETAPA 41.3.2 — REFINO VISUAL SIMPLIFICADO

   Ajustes desta revisão:
   - Página alinhada ao padrão simplificado de /recuperar-senha.
   - Removido excesso visual.
   - Mantido card central premium e objetivo.
   - Fundo recebeu textura sutil.
   - Toda a lógica funcional foi preservada.

   ETAPA 42.8 — SEGURANÇA DE SENHA
   - Front passa a orientar e validar os requisitos mínimos.
   - API continua sendo a autoridade final da regra.
   - Mensagens ficam mais claras para o usuário.
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
        <linearGradient id="egFrameDarkReset" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egFrameLightReset" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egFrameDarkReset)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egFrameLightReset)"
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



function getPasswordChecks(password: string) {
  return [
    {
      label: "Mínimo de 8 caracteres",
      passed: password.length >= 8,
    },
    {
      label: "Uma letra maiúscula",
      passed: /[A-ZÀ-Ý]/.test(password),
    },
    {
      label: "Uma letra minúscula",
      passed: /[a-zà-ÿ]/.test(password),
    },
    {
      label: "Um número",
      passed: /\d/.test(password),
    },
    {
      label: "Um caractere especial",
      passed: /[^A-Za-zÀ-ÿ0-9]/.test(password),
    },
  ];
}



function isBlockedPassword(password: string) {
  const blockedPasswords = new Set([
    "12345678",
    "123456789",
    "1234567890",
    "senha123",
    "senha1234",
    "password",
    "password123",
    "admin123",
    "admin1234",
    "elogest123",
    "elogest1234",
    "heloisa100%",
    "qwerty123",
    "abc12345",
  ]);

  return blockedPasswords.has(String(password || "").trim().toLowerCase());
}



function PasswordChecklist({ password }: { password: string }) {
  const checks = getPasswordChecks(password);
  const hasPassword = password.length > 0;

  return (
    <div className="mt-3 rounded-2xl border border-[#DDE5DF] bg-[#F7F9F8] px-4 py-3">
      <p className="mb-2 text-xs font-semibold text-[#17211B]">
        Sua senha precisa conter:
      </p>

      <div className="grid gap-1.5">
        {checks.map((check) => (
          <div
            key={check.label}
            className="flex items-center gap-2 text-xs leading-5"
          >
            <span
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                check.passed
                  ? "bg-[#256D3C] text-white"
                  : "bg-white text-[#9AA7A0] ring-1 ring-[#DDE5DF]"
              }`}
            >
              {check.passed ? "✓" : "•"}
            </span>

            <span
              className={check.passed ? "text-[#256D3C]" : "text-[#64736A]"}
            >
              {check.label}
            </span>
          </div>
        ))}
      </div>

      {hasPassword && isBlockedPassword(password) && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          Esta senha é muito previsível. Escolha uma combinação diferente.
        </p>
      )}
    </div>
  );
}



function RedefinirSenhaContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");



  const passwordChecks = useMemo(() => getPasswordChecks(senha), [senha]);

  const isPasswordStrong = useMemo(() => {
    return (
      passwordChecks.every((check) => check.passed) &&
      !isBlockedPassword(senha)
    );
  }, [passwordChecks, senha]);



  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setError("Link de recuperação inválido ou incompleto.");
      return;
    }

    if (!isPasswordStrong) {
      setError(
        "A senha deve ter pelo menos 8 caracteres, incluindo letra maiúscula, letra minúscula, número e caractere especial."
      );
      return;
    }

    if (senha !== confirmarSenha) {
      setError("As senhas informadas não conferem.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password: senha,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Não foi possível redefinir a senha.");
        return;
      }

      setSuccess(true);
      setSenha("");
      setConfirmarSenha("");
    } catch (err) {
      console.error(err);
      setError("Não foi possível redefinir a senha. Tente novamente em instantes.");
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
              Nova senha
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B]">
              Crie uma nova senha.
            </h1>

            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#64736A]">
              Informe uma nova senha segura para recuperar o acesso à plataforma.
            </p>
          </div>



          {/* =====================================================
             CARD PRINCIPAL
             ===================================================== */}

          <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_24px_70px_rgba(23,33,27,0.09)] backdrop-blur sm:p-8">
            {!token && (
              <div
                className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
                role="alert"
              >
                Link inválido ou incompleto. Solicite uma nova recuperação de senha.
              </div>
            )}

            {error && (
              <div
                className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
                role="alert"
              >
                {error}
              </div>
            )}

            {success ? (
              <div>
                <div
                  className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-4 text-sm leading-6 text-[#256D3C]"
                  role="status"
                >
                  Sua senha foi redefinida com sucesso. Você já pode acessar o
                  EloGest com a nova senha.
                </div>

                <Link
                  href="/login"
                  className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
                >
                  Voltar para o login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="senha"
                    className="mb-2 block text-sm font-semibold text-[#17211B]"
                  >
                    Nova senha
                  </label>

                  <input
                    id="senha"
                    type="password"
                    placeholder="Digite a nova senha"
                    className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    value={senha}
                    onChange={(event) => {
                      setSenha(event.target.value);
                      setError("");
                    }}
                    autoComplete="new-password"
                    required
                  />

                  <PasswordChecklist password={senha} />
                </div>

                <div>
                  <label
                    htmlFor="confirmarSenha"
                    className="mb-2 block text-sm font-semibold text-[#17211B]"
                  >
                    Confirmar nova senha
                  </label>

                  <input
                    id="confirmarSenha"
                    type="password"
                    placeholder="Repita a nova senha"
                    className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    value={confirmarSenha}
                    onChange={(event) => {
                      setConfirmarSenha(event.target.value);
                      setError("");
                    }}
                    autoComplete="new-password"
                    required
                  />

                  {confirmarSenha && senha !== confirmarSenha && (
                    <p className="mt-2 text-xs leading-5 text-red-700">
                      As senhas informadas ainda não conferem.
                    </p>
                  )}

                  {confirmarSenha && senha === confirmarSenha && (
                    <p className="mt-2 text-xs leading-5 text-[#256D3C]">
                      As senhas conferem.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] focus:outline-none focus:ring-4 focus:ring-[#256D3C]/20 disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
                >
                  {loading ? "Salvando..." : "Redefinir senha"}
                </button>
              </form>
            )}



            {/* =================================================
               APOIO DISCRETO
               ================================================= */}

            {!success && (
              <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F7F9F8] px-4 py-3">
                <p className="text-xs leading-5 text-[#64736A]">
                  Após a redefinição, o link de recuperação não poderá ser
                  reutilizado. Para sua segurança, evite usar senhas previsíveis
                  ou compartilhadas com outros serviços.
                </p>
              </div>
            )}

            <div className="mt-6 text-center">
              <Link
                href="/recuperar-senha"
                className="text-sm font-semibold text-[#256D3C] hover:underline"
              >
                Solicitar novo link
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



export default function RedefinirSenhaPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#F6F8F7] px-6 text-[#17211B]">
          <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-[0_20px_60px_rgba(23,33,27,0.08)]">
            <p className="text-sm font-semibold text-[#64736A]">
              Carregando...
            </p>
          </div>
        </main>
      }
    >
      <RedefinirSenhaContent />
    </Suspense>
  );
}