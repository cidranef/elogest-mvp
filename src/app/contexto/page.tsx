"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";



/* =========================================================
   ETAPA 28.2 / 28.5 - SELETOR DE PERFIL DE ACESSO - ROTA NEUTRA

   Rota técnica:
   /contexto

   Observação:
   A rota permanece /contexto para evitar alteração estrutural.
   Na interface, usamos "perfil de acesso", que é mais claro
   para o usuário final.

   Objetivo:
   Permitir que um mesmo usuário escolha com qual vínculo deseja
   acessar a plataforma.

   Fluxo:
   - lista os perfis disponíveis em /api/user/accesses;
   - salva o perfil escolhido em /api/user/active-access;
   - redireciona para a área correta.

   ETAPA 39.2.3 — CORREÇÃO DO SELECT E PADRONIZAÇÃO DO BOTÃO SAIR

   Correção:
   - O select não usa mais accessId diretamente como value.
   - Alguns perfis sintéticos/fallback podem vir com accessId nulo.
   - Quando accessId era nulo, o option ficava com value="", igual ao
     placeholder "Escolha um perfil de acesso".
   - Criada chave visual estável para cada option.
   - O perfil selecionado agora é controlado por selectedAccessKey.
   - O envio para /api/user/active-access continua usando access.accessId.

   Ajuste visual:
   - Botão Sair recebeu wrapper de padronização visual.
   - Evita combinação ruim de vermelho com texto preto.
   - Mantida a lógica interna do componente LogoutButton.

   ETAPA 40.1 — AUDITORIA FUNCIONAL FINAL DO MVP
   AUTENTICAÇÃO, PERFIL ATIVO E REDIRECIONAMENTO

   Ajustes desta revisão:
   - A lista visível agora considera apenas perfis ativos.
   - Mantida seleção estável para perfis sintéticos/fallback.
   - Envio para /api/user/active-access passa também dados contextuais
     como fallback quando accessId for nulo.
   - Select fica bloqueado durante salvamento.
   - Bloco de erro recebe role="alert".
   - Badge "Perfil atual" agora usa isCurrent, não isActive.
   - Seleção inicial prioriza o perfil realmente ativo no cookie.
   - Mantida a rota técnica /contexto e a linguagem "perfil de acesso".

   ETAPA 40.5 — CONTEXTO MINIMALISTA / MENOS É MAIS

   Ajustes desta revisão:
   - Removidos labels visuais desnecessários como destino e padrão.
   - Reduzida a repetição do mesmo nome/vínculo na tela.
   - Resumo do perfil selecionado ficou mais curto e mais humano.
   - Card central ficou mais limpo e com menos ruído visual.
   - Mantida toda a lógica funcional de carregamento, seleção e
     redirecionamento.

   ETAPA 42.2.2 — SEGURANÇA DE REDIRECIONAMENTO SUPER ADMIN

   Ajuste desta revisão:
   - Perfil SUPER_ADMIN agora redireciona para /elogest/dashboard.
   - Perfil ADMINISTRADORA permanece em /admin/dashboard.
   - Perfis de portal permanecem em /portal/dashboard.
   ========================================================= */



interface AccessItem {
  accessId: string | null;
  role: string;
  label: string;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  source?: string;
  roleLabel?: string;
  isDefault?: boolean;
  isActive?: boolean;
  isCurrent?: boolean;
}

interface AccessResponse {
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  defaultAccess?: AccessItem | null;
  activeAccess?: AccessItem | null;
  accesses?: AccessItem[];
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
        <linearGradient id="egFrameDarkContext" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#256D3C" />
          <stop offset="100%" stopColor="#174B2A" />
        </linearGradient>

        <linearGradient id="egFrameLightContext" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8ED08E" />
          <stop offset="100%" stopColor="#5FAE68" />
        </linearGradient>
      </defs>

      <path
        d="M39 8 L15 20 L15 55 L39 72"
        fill="none"
        stroke="url(#egFrameDarkContext)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />

      <path
        d="M41 8 L65 20 L65 55 L41 72"
        fill="none"
        stroke="url(#egFrameLightContext)"
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



function EloGestLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <EloGestMark className={compact ? "h-10 w-10" : "h-12 w-12"} />

      <div
        className={[
          "font-semibold tracking-tight",
          compact ? "text-2xl" : "text-3xl",
        ].join(" ")}
      >
        <span className="text-[#256D3C]">Elo</span>
        <span className="text-[#17211B]">Gest</span>
      </div>
    </div>
  );
}



/* =========================================================
   WRAPPER VISUAL DO BOTÃO SAIR
   ========================================================= */

function StyledLogoutButton() {
  return (
    <div
      className="
        [&_button]:!rounded-2xl
        [&_button]:!border
        [&_button]:!border-[#DDE5DF]
        [&_button]:!bg-white/80
        [&_button]:!px-4
        [&_button]:!py-2.5
        [&_button]:!text-sm
        [&_button]:!font-semibold
        [&_button]:!text-[#64736A]
        [&_button]:!shadow-sm
        [&_button]:!backdrop-blur
        [&_button]:!transition
        hover:[&_button]:!border-red-200
        hover:[&_button]:!bg-red-50
        hover:[&_button]:!text-red-700

        [&_a]:!rounded-2xl
        [&_a]:!border
        [&_a]:!border-[#DDE5DF]
        [&_a]:!bg-white/80
        [&_a]:!px-4
        [&_a]:!py-2.5
        [&_a]:!text-sm
        [&_a]:!font-semibold
        [&_a]:!text-[#64736A]
        [&_a]:!shadow-sm
        [&_a]:!backdrop-blur
        [&_a]:!transition
        hover:[&_a]:!border-red-200
        hover:[&_a]:!bg-red-50
        hover:[&_a]:!text-red-700
      "
    >
      <LogoutButton />
    </div>
  );
}



/* =========================================================
   HELPERS VISUAIS
   ========================================================= */

function roleLabel(role?: string | null) {
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "ADMINISTRADORA") return "Administradora";
  if (role === "SINDICO") return "Síndico";
  if (role === "MORADOR") return "Morador";
  if (role === "PROPRIETARIO") return "Proprietário";
  if (role === "CONSELHEIRO") return "Conselheiro";

  return "Usuário";
}



function roleBadgeClass(role?: string | null) {
  if (role === "SUPER_ADMIN") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (role === "ADMINISTRADORA") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (role === "SINDICO") {
    return "border-purple-200 bg-purple-50 text-purple-700";
  }

  if (role === "MORADOR") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (role === "PROPRIETARIO") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (role === "CONSELHEIRO") {
    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }

  return "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";
}



/* =========================================================
   DESTINO CENTRALIZADO POR PERFIL
   ========================================================= */

function getRedirectPathForRole(role?: string | null) {
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

  return "/login";
}



function getPageTitle(total: number) {
  if (total === 0) {
    return "Não encontramos um perfil ativo.";
  }

  if (total === 1) {
    return "Perfil de acesso encontrado.";
  }

  return "Escolha seu perfil de acesso.";
}



function getPageDescription(total: number) {
  if (total === 0) {
    return "Seu usuário ainda não possui vínculo ativo configurado no EloGest.";
  }

  if (total === 1) {
    return "Confirme abaixo para entrar na área correspondente.";
  }

  return "Selecione como deseja acessar a plataforma agora.";
}



function getAccessCountLabel(total: number) {
  if (total === 0) {
    return "Nenhum perfil disponível";
  }

  if (total === 1) {
    return "1 perfil disponível";
  }

  return `${total} perfis disponíveis`;
}



function getSelectLabel(access: AccessItem) {
  const parts = [roleLabel(access.role), access.label].filter(Boolean);
  return parts.join(" • ");
}



function getAccessHint(access: AccessItem) {
  if (access.role === "SUPER_ADMIN") {
    return "Acesso global à plataforma, cadastros e configurações.";
  }

  if (access.role === "ADMINISTRADORA") {
    return "Acesso à área administrativa da carteira vinculada.";
  }

  if (access.role === "SINDICO") {
    return "Acesso ao portal do síndico para acompanhar chamados e solicitações.";
  }

  if (access.role === "MORADOR") {
    return "Acesso ao portal do morador para acompanhar chamados da unidade.";
  }

  if (access.role === "PROPRIETARIO") {
    return "Acesso ao portal do proprietário para acompanhar solicitações.";
  }

  if (access.role === "CONSELHEIRO") {
    return "Acesso de conselheiro conforme permissões definidas.";
  }

  return "Acesso conforme as permissões deste perfil.";
}



function getRecommendedAction(total: number, selectedAccess?: AccessItem | null) {
  if (total === 0) {
    return "Entre em contato com a administradora para solicitar a liberação do acesso.";
  }

  if (!selectedAccess) {
    return "Escolha um perfil para continuar.";
  }

  return `Você acessará a plataforma como ${roleLabel(selectedAccess.role)}.`;
}



/* =========================================================
   CHAVE VISUAL ESTÁVEL PARA O SELECT

   Importante:
   Não podemos depender apenas de access.accessId porque perfis
   sintéticos/fallback podem vir com accessId nulo.

   A chave abaixo é usada apenas na interface.
   O envio para API continua usando access.accessId.
   ========================================================= */

function getAccessOptionKey(access: AccessItem, index: number) {
  if (access.accessId) {
    return `access:${access.accessId}`;
  }

  return [
    "synthetic",
    index,
    access.role || "role",
    access.label || "label",
    access.administratorId || "administrator",
    access.condominiumId || "condominium",
    access.unitId || "unit",
    access.residentId || "resident",
  ].join(":");
}



function accessMatchesSummary(access: AccessItem, summary?: AccessItem | null) {
  if (!summary) {
    return false;
  }

  if (access.accessId && summary.accessId) {
    return access.accessId === summary.accessId;
  }

  return (
    access.role === summary.role &&
    (access.administratorId || null) === (summary.administratorId || null) &&
    (access.condominiumId || null) === (summary.condominiumId || null) &&
    (access.unitId || null) === (summary.unitId || null) &&
    (access.residentId || null) === (summary.residentId || null)
  );
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function ContextoPage() {
  const router = useRouter();

  const [data, setData] = useState<AccessResponse | null>(null);
  const [selectedAccessKey, setSelectedAccessKey] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");



  const accesses = useMemo(() => {
    const rawAccesses = Array.isArray(data?.accesses) ? data.accesses : [];

    return rawAccesses.filter((access) => {
      return access.isActive !== false;
    });
  }, [data]);



  const selectedAccess = useMemo(() => {
    return (
      accesses.find((item, index) => {
        return getAccessOptionKey(item, index) === selectedAccessKey;
      }) || null
    );
  }, [accesses, selectedAccessKey]);



  /* =========================================================
     CARREGAR PERFIS DE ACESSO
     ========================================================= */

  async function loadAccesses() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/user/accesses", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || "Não foi possível carregar seus perfis de acesso.");
        setData(null);
        return;
      }

      const loadedAccesses: AccessItem[] = Array.isArray(json?.accesses)
        ? json.accesses.filter((access: AccessItem) => access.isActive !== false)
        : [];

      const safeData: AccessResponse = {
        ...json,
        accesses: loadedAccesses,
      };

      setData(safeData);



      /* =======================================================
         DEFINE SELEÇÃO INICIAL COM CHAVE VISUAL

         Prioridade:
         1. Perfil atual informado pela API em isCurrent.
         2. activeAccess informado pela API.
         3. defaultAccess informado pela API.
         4. Perfil marcado como isDefault.
         5. Primeiro perfil disponível.
         ======================================================= */

      const preferredIndex = loadedAccesses.findIndex((item) => item.isCurrent);

      const activeIndex =
        preferredIndex >= 0
          ? preferredIndex
          : loadedAccesses.findIndex((item) => {
              return accessMatchesSummary(item, json?.activeAccess);
            });

      const defaultIndex =
        activeIndex >= 0
          ? activeIndex
          : loadedAccesses.findIndex((item) => {
              return accessMatchesSummary(item, json?.defaultAccess);
            });

      const fallbackIndex =
        defaultIndex >= 0
          ? defaultIndex
          : loadedAccesses.findIndex((item) => item.isDefault);

      const safeIndex =
        fallbackIndex >= 0 ? fallbackIndex : loadedAccesses.length > 0 ? 0 : -1;

      const defaultKey =
        safeIndex >= 0
          ? getAccessOptionKey(loadedAccesses[safeIndex], safeIndex)
          : "";

      setSelectedAccessKey(defaultKey);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar seus perfis de acesso.");
      setData(null);
      setSelectedAccessKey("");
    } finally {
      setLoading(false);
    }
  }



  /* =========================================================
     SELECIONAR PERFIL DE ACESSO
     ========================================================= */

  async function selectAccess(access: AccessItem) {
    if (saving) return;

    try {
      setSaving(true);
      setError("");

      const res = await fetch("/api/user/active-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessId: access.accessId,
          role: access.role,
          administratorId: access.administratorId ?? null,
          condominiumId: access.condominiumId ?? null,
          unitId: access.unitId ?? null,
          residentId: access.residentId ?? null,
          source: access.source ?? null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || "Não foi possível selecionar este perfil de acesso.");
        return;
      }

      router.push(getRedirectPathForRole(access.role));
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Erro ao selecionar perfil de acesso.");
    } finally {
      setSaving(false);
    }
  }



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    loadAccesses();
  }, []);



  /* =========================================================
     LOADING
     ========================================================= */

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_right,#EAF7EE_0%,#F6F8F7_36%,#FFFFFF_100%)] px-6 text-[#17211B]">
        <section className="w-full max-w-md rounded-[28px] border border-[#DDE5DF] bg-white/90 p-8 text-center shadow-[0_20px_60px_rgba(23,33,27,0.08)] backdrop-blur">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF7EE]">
            <EloGestMark className="h-10 w-10" />
          </div>

          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#17211B]">
            Carregando perfis...
          </h1>

          <p className="mt-2 text-sm leading-6 text-[#64736A]">
            Estamos identificando os perfis de acesso disponíveis.
          </p>
        </section>
      </main>
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <main className="min-h-screen overflow-hidden bg-[#F6F8F7] text-[#17211B]">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#EAF7EE_0%,#F6F8F7_34%,#FFFFFF_100%)]" />
        <div className="absolute -right-44 top-24 h-96 w-96 rounded-full bg-[#8ED08E]/14 blur-3xl" />
        <div className="absolute -bottom-48 -left-36 h-[420px] w-[420px] rounded-full bg-[#256D3C]/08 blur-3xl" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6 sm:px-8 lg:px-10">



        {/* =====================================================
           TOPO DISCRETO
           ===================================================== */}

        <header className="flex items-center justify-between gap-4">
          <EloGestLogo compact />
          <StyledLogoutButton />
        </header>



        {/* =====================================================
           BLOCO CENTRAL
           ===================================================== */}

        <div className="flex flex-1 items-center justify-center py-10">
          <section className="w-full max-w-xl">
            <div className="text-center">
              <div className="mx-auto mb-5 inline-flex rounded-full border border-[#CFE6D4] bg-white/85 px-3 py-1 text-xs font-semibold text-[#256D3C] shadow-sm backdrop-blur">
                {getAccessCountLabel(accesses.length)}
              </div>

              <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                {getPageTitle(accesses.length)}
              </h1>

              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#64736A] sm:text-base">
                {getPageDescription(accesses.length)}
              </p>

              {data?.user?.email && (
                <p className="mt-3 text-xs leading-5 text-[#7A877F]">
                  Conta conectada:{" "}
                  <span className="font-semibold text-[#17211B]">
                    {data.user.email}
                  </span>
                </p>
              )}
            </div>



            {/* =================================================
               ERRO
               ================================================= */}

            {error && (
              <div
                className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
                role="alert"
              >
                {error}
              </div>
            )}



            {/* =================================================
               CARD ÚNICO
               ================================================= */}

            <div className="mt-8 rounded-[28px] border border-[#DDE5DF] bg-white/94 p-6 shadow-[0_20px_60px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
              {accesses.length === 0 ? (
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-50">
                    <span className="text-xl font-semibold text-yellow-700">
                      !
                    </span>
                  </div>

                  <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#17211B]">
                    Acesso não liberado
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-[#64736A]">
                    Confirme com a administradora do condomínio se seu cadastro
                    está ativo e vinculado ao e-mail utilizado no login.
                  </p>
                </div>
              ) : (
                <>
                  {/* =============================================
                     SELETOR PRINCIPAL
                     ============================================= */}

                  <div>
                    <label
                      htmlFor="accessSelector"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      Perfil de acesso
                    </label>

                    <div className="relative">
                      <select
                        id="accessSelector"
                        value={selectedAccessKey}
                        onChange={(event) => {
                          setSelectedAccessKey(event.target.value);
                          setError("");
                        }}
                        disabled={saving}
                        className="h-14 w-full appearance-none rounded-2xl border border-[#CFE6D4] bg-[#F9FBFA] px-4 pr-11 text-sm font-semibold text-[#17211B] shadow-sm outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10 disabled:cursor-not-allowed disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]"
                      >
                        <option value="" disabled>
                          Escolha um perfil de acesso
                        </option>

                        {accesses.map((access, index) => (
                          <option
                            key={getAccessOptionKey(access, index)}
                            value={getAccessOptionKey(access, index)}
                          >
                            {getSelectLabel(access)}
                          </option>
                        ))}
                      </select>

                      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#64736A]">
                        ▾
                      </div>
                    </div>
                  </div>



                  {/* =============================================
                     RESUMO ENXUTO

                     Nesta revisão:
                     - removemos badges como dashboard e padrão;
                     - não repetimos novamente o label completo;
                     - mantemos apenas papel + descrição curta.
                     ============================================= */}

                  {selectedAccess ? (
                    <div className="mt-5 rounded-2xl border border-[#E4EAE6] bg-[#F8FAF9] px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${roleBadgeClass(
                            selectedAccess.role
                          )}`}
                        >
                          {roleLabel(selectedAccess.role)}
                        </span>

                        {selectedAccess.isCurrent && (
                          <span className="inline-flex rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#64736A]">
                            Atual
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-sm leading-6 text-[#17211B]">
                        {getRecommendedAction(accesses.length, selectedAccess)}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-[#64736A]">
                        {getAccessHint(selectedAccess)}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-4">
                      <p className="text-sm font-semibold text-yellow-700">
                        Escolha um perfil para continuar.
                      </p>
                    </div>
                  )}



                  {/* =============================================
                     AÇÃO PRINCIPAL
                     ============================================= */}

                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedAccess) {
                          setError("Escolha um perfil de acesso para continuar.");
                          return;
                        }

                        selectAccess(selectedAccess);
                      }}
                      disabled={saving || !selectedAccess}
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] focus:outline-none focus:ring-4 focus:ring-[#256D3C]/20 disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
                    >
                      {saving ? "Acessando..." : "Continuar"}
                    </button>
                  </div>
                </>
              )}
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-[#7A877F]">
              EloGest · Plataforma de governança condominial
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}