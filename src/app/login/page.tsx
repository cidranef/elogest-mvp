"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";



/* =========================================================
   LOGIN - ELOGEST

   ETAPA 14:
   Redirecionamento automático por perfil após login.

   SUPER_ADMIN / ADMINISTRADORA:
   → /admin/dashboard

   SINDICO / MORADOR:
   → /portal/dashboard

   ETAPA 34.1.2:
   Ajuste pós-teste ponta a ponta.

   Problema identificado:
   - Usuário com múltiplos contextos, por exemplo:
     SÍNDICO + MORADOR,
     estava caindo direto no dashboard de síndico.
   - Isso acontecia porque o login usava apenas session.user.role.

   Correção:
   - Após login bem-sucedido, buscamos /api/user/accesses.
   - Se houver mais de um contexto ativo, redireciona para /contexto.
   - Se houver apenas um contexto, redireciona conforme o papel dele.
   - Se a API de acessos falhar, usa fallback pela role da sessão.

   ETAPA 38.9 — REVISÃO DE TEXTOS FINAIS E MICROCOPY DO MVP

   - Textos visíveis ajustados para "perfil de acesso".
   - Mensagens de erro ficaram mais claras para o usuário.
   - Botão principal ajustado para "Acessar plataforma".
   - Subtítulo do login ficou mais institucional.
   - Adicionado bloco explicativo sobre perfil de acesso.
   - Mantida a rota técnica /contexto.
   - Mantida toda a lógica funcional de autenticação e redirecionamento.

   ETAPA 39.1 — FUNDAÇÃO DO DESIGN FINAL DO ELOGEST

   Atualização visual:
   - Login passa a usar a identidade escolhida como referência inicial.
   - Ícone geométrico inspirado na moldura/shield hexagonal.
   - Wordmark "EloGest" com "Elo" verde e "Gest" grafite.
   - Paleta aplicada:
     #256D3C, #17211B, #8ED08E, #EAF7EE, #FFFFFF.
   - Mantida integralmente a lógica funcional validada.

   ETAPA 39.1.1 — ACESSO E RECUPERAÇÃO DE SENHA

   Atualização:
   - Adicionado link "Esqueci minha senha".
   - Link aponta para /recuperar-senha.
   - Adicionado aviso de que o acesso é criado pela administradora.
   - Evitado botão "Criar conta" para não sugerir cadastro livre.

   ETAPA 40.1 — AUDITORIA FUNCIONAL FINAL DO MVP
   AUTENTICAÇÃO E REDIRECIONAMENTO

   Ajustes:
   - Tipagem segura do FormEvent.
   - Bloqueio contra duplo clique durante autenticação.
   - Normalização do e-mail antes do login.
   - Limpeza de erro ao alterar campos.
   - Campos marcados como obrigatórios.
   - Ajuste de autocomplete/capitalização no e-mail.

   ETAPA 40.2 — LOGIN EXTERNO PREMIUM / LIMPO

   Ajustes:
   - Layout mantido em duas colunas, porém mais limpo e elegante.
   - Painel institucional ficou mais editorial, com menos cards.
   - Removida a duplicidade visual do logo na área do formulário.
   - Card de login ficou mais calmo, direto e premium.
   - Bloco de perfil de acesso ficou mais discreto.
   - Toda a lógica funcional de autenticação foi preservada.

   ETAPA 40.2.2 — AJUSTE FINO PREMIUM

   Ajustes:
   - Ícones dos benefícios foram valorizados.
   - Cards dos benefícios ficaram mais nobres e com menos ruído.
   - Adicionada textura sutil ao painel esquerdo.
   - Preparada opção futura para imagem de fundo realista.
   - Mantida a versão "classuda" escolhida como base.

   ETAPA 42.2.2 — SEGURANÇA DE REDIRECIONAMENTO SUPER ADMIN

   Ajustes desta revisão:
   - SUPER_ADMIN agora é direcionado para /elogest/dashboard.
   - ADMINISTRADORA permanece em /admin/dashboard.
   - SINDICO, MORADOR e PROPRIETARIO permanecem em /portal/dashboard.
   - E-mail do login passa a ser normalizado com trim + lowercase.
   - Redirecionamento por UserAccess e fallback por sessão usam a mesma regra.
   - Mantida toda a identidade visual aprovada.

   ETAPA 42.9 — LIMPEZA FINAL DE SEGURANÇA / AMBIENTE DEMO

   Ajustes desta revisão:
   - Removido bloco visível de "Usuários demo" da tela de login.
   - Removidas credenciais/senhas de demonstração da interface pública.
   - Removida dependência da variável NEXT_PUBLIC_SHOW_DEMO_USERS nesta página.
   - Mantida toda a lógica de autenticação, recuperação de senha e redirecionamento.
   ========================================================= */



interface UserAccessSummary {
  accessId?: string | null;
  role?: string | null;
  label?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  source?: string | null;
}



/* =========================================================
   MARCA VISUAL TEMPORÁRIA - ELOGEST
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
        <linearGradient id="egFrameDark" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egFrameLight" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egFrameDark)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egFrameLight)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path d="M26 50 L34 45 L34 60 L26 56 Z" fill="#17211B" />
      <path d="M37 28 L45 24 L45 61 L37 61 Z" fill="#17211B" />
      <path d="M49 40 L57 45 L57 58 L49 62 Z" fill="#17211B" />
    </svg>
  );
}



function EloGestLogo({
  dark = false,
  compact = false,
}: {
  dark?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <EloGestMark className={compact ? "h-10 w-10" : "h-12 w-12"} />

      <div
        className={[
          "font-semibold tracking-tight",
          compact ? "text-2xl" : "text-3xl",
        ].join(" ")}
      >
        <span className="text-[#8ED08E]">Elo</span>
        <span className={dark ? "text-white" : "text-[#17211B]"}>
          Gest
        </span>
      </div>
    </div>
  );
}



/* =========================================================
   ÍCONES DO PAINEL INSTITUCIONAL
   ========================================================= */

function InstitutionalIcon({
  type,
  className = "",
}: {
  type: "ticket" | "users" | "shield";
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      className={className || "h-6 w-6"}
      aria-hidden="true"
    >
      {type === "ticket" && (
        <>
          <path
            {...common}
            d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"
          />
          <path {...common} d="M9 9h6" />
          <path {...common} d="M9 15h6" />
        </>
      )}

      {type === "users" && (
        <>
          <circle {...common} cx="9" cy="8" r="3" />
          <path {...common} d="M3 20a6 6 0 0 1 12 0" />
          <path {...common} d="M16 11a3 3 0 0 0 0-6" />
          <path {...common} d="M18 20a5 5 0 0 0-3-4.5" />
        </>
      )}

      {type === "shield" && (
        <>
          <path
            {...common}
            d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z"
          />
          <path {...common} d="M9.5 12l1.7 1.7L14.8 10" />
        </>
      )}
    </svg>
  );
}



function InstitutionalFeature({
  icon,
  title,
  description,
}: {
  icon: "ticket" | "users" | "shield";
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-[26px] border border-white/10 bg-white/[0.065] p-5 shadow-[0_24px_76px_rgba(0,0,0,0.18)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-[#8ED08E]/35 hover:bg-white/[0.09]">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-[24px] border border-[#8ED08E]/22 bg-[#8ED08E]/10 text-[#8ED08E] shadow-[0_18px_55px_rgba(142,208,142,0.11)] transition duration-300 group-hover:bg-[#8ED08E]/15 group-hover:shadow-[0_22px_65px_rgba(142,208,142,0.16)]">
        <div className="absolute inset-2 rounded-[18px] border border-white/8" />

        <InstitutionalIcon type={icon} className="relative h-8 w-8" />
      </div>

      <p className="mt-5 text-sm font-semibold tracking-[-0.01em] text-white">
        {title}
      </p>

      <p className="mt-2 text-sm leading-6 text-white/66">
        {description}
      </p>
    </div>
  );
}



/* =========================================================
   DESTINO POR PAPEL

   Regra final após criação do EloGestShell:

   SUPER_ADMIN
   → /elogest/dashboard

   ADMINISTRADORA
   → /admin/dashboard

   SINDICO / MORADOR / PROPRIETARIO
   → /portal/dashboard

   Importante:
   Esta função usa o papel do perfil de acesso, não apenas
   o role legado da sessão.
   ========================================================= */

function getDestinationByRole(role?: string | null) {
  if (role === "SUPER_ADMIN") {
    return "/elogest/dashboard";
  }

  if (role === "ADMINISTRADORA") {
    return "/admin/dashboard";
  }

  if (
    role === "SINDICO" ||
    role === "MORADOR" ||
    role === "PROPRIETARIO"
  ) {
    return "/portal/dashboard";
  }

  return "/contexto";
}



/* =========================================================
   BUSCAR PERFIS DISPONÍVEIS

   A API /api/user/accesses já considera:
   - UserAccess reais;
   - fallback legado;
   - perfil sintético residencial para Síndico + Morador.
   ========================================================= */

async function fetchUserAccesses(): Promise<UserAccessSummary[]> {
  try {
    const res = await fetch("/api/user/accesses", {
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      return [];
    }

    return Array.isArray(data?.accesses) ? data.accesses : [];
  } catch (error) {
    console.error("Erro ao buscar perfis do usuário:", error);
    return [];
  }
}



export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");



  /* =========================================================
     HELPERS DE FORMULÁRIO
     ========================================================= */

  function handleEmailChange(value: string) {
    setEmail(value);

    if (error) {
      setError("");
    }
  }

  function handleSenhaChange(value: string) {
    setSenha(value);

    if (error) {
      setError("");
    }
  }



  /* =========================================================
     LOGIN COM REDIRECIONAMENTO POR PERFIL DE ACESSO
     ========================================================= */

  async function handleLogin(e?: FormEvent<HTMLFormElement>) {
    if (e) {
      e.preventDefault();
    }

    if (loading) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !senha) {
      setError("Informe seu e-mail e sua senha para continuar.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await signIn("credentials", {
        email: normalizedEmail,
        password: senha,
        redirect: false,
      });

      if (!res || res.error) {
        setError("E-mail ou senha inválidos. Verifique os dados e tente novamente.");
        return;
      }



      /* =======================================================
         BUSCA PERFIS APÓS LOGIN

         Regra final:
         - 0 perfis: fallback pela sessão;
         - 1 perfil: pode redirecionar direto;
         - 2 ou mais perfis: sempre vai para /contexto.

         Observação:
         Quando houver múltiplos perfis ativos, mantemos a escolha
         em /contexto para preservar segurança e intenção do usuário.
         ======================================================= */

      const accesses = await fetchUserAccesses();

      const activeAccesses = accesses.filter((access) => {
        return access.isActive !== false;
      });

      if (activeAccesses.length > 1) {
        router.push("/contexto");
        router.refresh();
        return;
      }

      if (activeAccesses.length === 1) {
        const destination = getDestinationByRole(activeAccesses[0].role);

        router.push(destination);
        router.refresh();
        return;
      }



      /* =======================================================
         FALLBACK PELA SESSÃO

         Mantido para segurança caso a API /api/user/accesses
         falhe ou ainda não retorne dados.
         ======================================================= */

      const session = await getSession();
      const role = session?.user?.role;

      const destination = getDestinationByRole(role);

      if (destination === "/contexto") {
        setError(
          "Não foi possível identificar seu perfil de acesso. Entre em contato com a administradora."
        );
        return;
      }

      router.push(destination);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível realizar o login. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <main className="min-h-screen overflow-hidden bg-[#F6F8F7] text-[#17211B]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.02fr_0.98fr]">



        {/* =====================================================
           PAINEL INSTITUCIONAL

           ETAPA 40.2.2:
           Painel esquerdo com textura sutil e ícones refinados.

           Ajustes:
           - Textura premium aplicada no background.
           - Opção futura de imagem realista preparada.
           - Ícones mais valorizados e com melhor leitura.
           ===================================================== */}

        <section className="relative hidden overflow-hidden bg-[#17211B] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
          <div className="absolute inset-0">
            {/* IMAGEM FUTURA OPCIONAL
                Para ativar:
                1. Adicione a imagem em:
                   /public/images/login/condominio-textura.jpg

                2. Troque a opacidade abaixo, caso queira outro nível visual.
            */}
            <div
              className="absolute inset-0 scale-x-[-1] bg-cover bg-center bg-no-repeat opacity-15"
              style={{
                backgroundImage: "url('/images/login/condominio-textura.jpg')",
              }}
            />

            <div className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-[#256D3C]/35 blur-3xl" />
            <div className="absolute bottom-[-120px] right-[-120px] h-[460px] w-[460px] rounded-full bg-[#8ED08E]/16 blur-3xl" />

            {/* TEXTURA PREMIUM SEM DEPENDER DE IMAGEM */}
            <div className="absolute inset-0 opacity-[0.22] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.20)_1px,transparent_0)] [background-size:22px_22px]" />

            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_34%),radial-gradient(circle_at_top_right,rgba(142,208,142,0.12),transparent_30%)]" />

            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,33,27,0.16)_0%,rgba(23,33,27,0.0)_48%,rgba(23,33,27,0.22)_100%)]" />
          </div>

          <div className="relative z-10">
            <EloGestLogo dark />

            <div className="mt-20 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.07] px-4 py-2 text-xs font-semibold text-[#EAF7EE] shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8ED08E]" />
                Governança Condominial
              </div>

              <h1 className="mt-7 text-5xl font-semibold leading-[1.04] tracking-[-0.055em] text-white xl:text-6xl">
                Gestão condominial mais clara, segura e conectada.
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-white/68 xl:text-lg">
                Centralize chamados, comunicações, acessos e histórico em uma
                experiência simples para administradoras, síndicos, proprietários
                e moradores.
              </p>
            </div>



            {/* ================================================
               DESTAQUES INSTITUCIONAIS COM ÍCONES
               ================================================ */}

            <div className="mt-12 grid max-w-2xl gap-4 sm:grid-cols-3">
              <InstitutionalFeature
                icon="ticket"
                title="Atendimento organizado"
                description="Chamados acompanhados com status, prioridade, responsáveis e evolução."
              />

              <InstitutionalFeature
                icon="users"
                title="Perfis bem definidos"
                description="Acesso separado por administradora, síndico, proprietário e morador."
              />

              <InstitutionalFeature
                icon="shield"
                title="Rotina mais segura"
                description="Mais transparência, rastreabilidade e menos ruído na comunicação."
              />
            </div>
          </div>

          <div className="relative z-10">
            <div className="flex items-center justify-between gap-6 border-t border-white/10 pt-6">
              <p className="max-w-md text-sm leading-6 text-white/56">
                EloGest transforma solicitações dispersas em uma jornada clara
                de acompanhamento, atendimento e resolução.
              </p>

              <div className="hidden xl:flex xl:items-center xl:gap-4">
  <div className="relative flex h-14 w-14 items-center justify-center rounded-[22px] border border-[#8ED08E]/25 bg-[#8ED08E]/10 text-[#8ED08E] shadow-[0_18px_55px_rgba(142,208,142,0.14)] backdrop-blur">
    <span className="absolute inset-0 rounded-[22px] border border-[#8ED08E]/20 animate-ping opacity-20" />

    <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-[#17211B] bg-[#8ED08E] shadow-[0_0_22px_rgba(142,208,142,0.75)]" />

    <InstitutionalIcon type="shield" className="relative h-7 w-7" />
  </div>

  <div className="text-left">
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8ED08E]">
      Ambiente protegido
    </p>

    <p className="mt-1 text-sm font-semibold text-white">
      Acesso seguro e rastreável
    </p>
  </div>
</div>
            </div>
          </div>
        </section>



        {/* =====================================================
           ÁREA DE LOGIN

           ETAPA 40.2:
           Card de acesso mais limpo e elegante.

           ETAPA 42.9:
           Bloco de usuários demo removido da interface pública.
           ===================================================== */}

        <section className="relative flex min-h-screen items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#EAF7EE_0%,#F6F8F7_35%,#FFFFFF_100%)]" />

          <div className="relative z-10 w-full max-w-[440px]">
            <div className="mb-8 lg:hidden">
              <EloGestLogo compact />
            </div>

            <div className="mb-7">
              <div className="inline-flex rounded-full border border-[#CFE6D4] bg-white px-3 py-1 text-xs font-semibold text-[#256D3C] shadow-sm">
                Acesso seguro
              </div>

              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-[#17211B]">
                Acesse sua conta.
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#64736A]">
                Entre com o e-mail e senha cadastrados pela administradora para
                acessar seu painel no EloGest.
              </p>
            </div>

            <section className="rounded-[30px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_28px_80px_rgba(23,33,27,0.10)] backdrop-blur sm:p-8">
              {error && (
                <div
                  className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
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
                    onChange={(e) => handleEmailChange(e.target.value)}
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label
                      htmlFor="senha"
                      className="block text-sm font-semibold text-[#17211B]"
                    >
                      Senha
                    </label>

                    <Link
                      href="/recuperar-senha"
                      className="text-xs font-semibold text-[#256D3C] transition hover:text-[#1F5A32] hover:underline"
                    >
                      Esqueci minha senha
                    </Link>
                  </div>

                  <input
                    id="senha"
                    type="password"
                    placeholder="Digite sua senha"
                    className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    value={senha}
                    onChange={(e) => handleSenhaChange(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] focus:outline-none focus:ring-4 focus:ring-[#256D3C]/20 disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
                >
                  {loading ? "Acessando..." : "Acessar plataforma"}
                </button>
              </form>



              {/* =================================================
                 AVISO DE ACESSO
                 ================================================= */}

              <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F7F9F8] px-4 py-3">
                <p className="text-xs leading-5 text-[#64736A]">
                  Seu acesso é criado pela administradora do condomínio. Caso
                  não consiga entrar, confirme seu cadastro ou solicite a
                  redefinição de senha.
                </p>
              </div>



              {/* =================================================
                 BLOCO DE PERFIL DE ACESSO
                 ================================================= */}

              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#CFE6D4] bg-[#F7FBF8] px-4 py-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-[#256D3C] shadow-sm">
                  <EloGestMark className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-xs font-semibold text-[#17211B]">
                    Perfil de acesso
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[#64736A]">
                    Quando houver mais de um vínculo ativo, o EloGest solicitará
                    a escolha do perfil antes de abrir o painel.
                  </p>
                </div>
              </div>
            </section>

            <p className="mt-6 text-center text-xs leading-5 text-[#7A877F]">
              EloGest · Plataforma de governança condominial
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}