"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import ActiveAccessBadge from "@/components/ActiveAccessBadge";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   PORTAL CONTEXT GUARD - ELOGEST

   ETAPA 30.2:
   Proteção visual e de navegação para páginas do portal.

   Regras:
   - SINDICO: permitido
   - MORADOR: permitido
   - PROPRIETARIO: permitido
   - ADMINISTRADORA: bloqueado e direcionado ao admin
   - SUPER_ADMIN: bloqueado e direcionado ao admin
   - Sem perfil ativo: direciona para /contexto

   ETAPA 39.17 — PADRONIZAÇÃO DOS "ENTRE PÁGINAS"

   Atualização:
   - Loading antigo escuro foi substituído por EloGestLoadingScreen.
   - Estados de "sem perfil ativo" e "perfil administrativo no portal"
     migraram para o novo visual claro EloGest.
   - Mantida a rota técnica /contexto.
   - Mantida a regra de exibir "Trocar perfil" apenas quando houver
     mais de um perfil de acesso.
   - Este guard continua sendo proteção visual; as APIs seguem como
     camada real de segurança.

   ETAPA 40.1 — AUDITORIA FUNCIONAL FINAL DO MVP
   AUTENTICAÇÃO, PERFIL ATIVO E REDIRECIONAMENTO

   Ajustes desta revisão:
   - Tratamento específico para sessão expirada/não autorizada.
   - Contagem considera apenas perfis ativos.
   - Falha em /api/user/accesses não bloqueia o guard principal.
   - Mensagens mais claras para acesso ao portal com perfil admin.
   - Mantida proteção visual sem substituir validação server-side/API.
   ========================================================= */



interface ActiveAccess {
  accessId?: string | null;
  role?: string | null;
  label?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  source?: string | null;
}



interface PortalContextGuardProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}



function isPortalRole(role?: string | null) {
  return (
    role === "SINDICO" ||
    role === "MORADOR" ||
    role === "PROPRIETARIO"
  );
}



function roleLabel(role?: string | null) {
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "ADMINISTRADORA") return "Administradora";
  if (role === "SINDICO") return "Síndico";
  if (role === "MORADOR") return "Morador";
  if (role === "PROPRIETARIO") return "Proprietário";
  if (role === "CONSELHEIRO") return "Conselheiro";

  return "Usuário";
}



function getPortalBlockedBadgeLabel(role?: string | null) {
  if (role === "SUPER_ADMIN") return "Perfil Super Admin";
  if (role === "ADMINISTRADORA") return "Perfil de administradora";

  return "Perfil sem acesso ao portal";
}



/* =========================================================
   EXTRAIR QUANTIDADE DE PERFIS DISPONÍVEIS

   A API /api/user/accesses retorna:
   {
     accesses: [...]
   }

   Consideramos apenas perfis ativos, porque perfis inativos não
   devem habilitar a opção "Trocar perfil".
   ========================================================= */

function extractAccessCount(data: unknown) {
  const value = data as {
    accesses?: unknown;
    user?: {
      accesses?: unknown;
    };
    availableAccesses?: unknown;
    items?: unknown;
  };

  const possibleLists = [
    value?.accesses,
    value?.user?.accesses,
    value?.availableAccesses,
    value?.items,
  ];

  const list = possibleLists.find((item) => Array.isArray(item));

  if (!Array.isArray(list)) {
    return 0;
  }

  return list.filter((item: any) => item?.isActive !== false).length;
}



/* =========================================================
   COMPONENTE
   ========================================================= */

export default function PortalContextGuard({
  children,
  fallbackTitle = "Portal indisponível neste perfil de acesso",
  fallbackDescription = "O perfil ativo não possui acesso ao portal. Para continuar, acesse a área administrativa ou selecione outro perfil de acesso.",
}: PortalContextGuardProps) {
  const [activeAccess, setActiveAccess] = useState<ActiveAccess | null>(null);
  const [accessCount, setAccessCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");



  /* =========================================================
     CARREGAR PERFIL DE ACESSO ATIVO + PERFIS DISPONÍVEIS
     ========================================================= */

  async function loadAccessData() {
    try {
      setLoading(true);
      setUnauthorized(false);
      setError("");

      const [activeAccessResult, accessesResult] = await Promise.allSettled([
        fetch("/api/user/active-access", {
          cache: "no-store",
        }),
        fetch("/api/user/accesses", {
          cache: "no-store",
        }),
      ]);



      /* =====================================================
         PERFIL ATIVO

         Esta é a validação principal do guard.
         ===================================================== */

      if (activeAccessResult.status === "fulfilled") {
        const activeAccessResponse = activeAccessResult.value;
        const activeAccessData = await activeAccessResponse.json();

        if (activeAccessResponse.status === 401) {
          setUnauthorized(true);
          setActiveAccess(null);
          setError("Sua sessão expirou ou não foi possível validar seu acesso.");
        } else if (activeAccessResponse.ok) {
          setActiveAccess(activeAccessData?.activeAccess || null);
        } else {
          setActiveAccess(null);
          setError(
            activeAccessData?.error ||
              "Não foi possível identificar o perfil ativo."
          );
        }
      } else {
        setActiveAccess(null);
        setError("Não foi possível identificar o perfil ativo.");
      }



      /* =====================================================
         QUANTIDADE DE PERFIS DISPONÍVEIS

         Esta informação é complementar.
         Se falhar, não deve impedir a validação principal.
         ===================================================== */

      if (accessesResult.status === "fulfilled") {
        const accessesResponse = accessesResult.value;

        if (accessesResponse.status === 401) {
          setUnauthorized(true);
          setAccessCount(0);
        } else if (accessesResponse.ok) {
          const accessesData = await accessesResponse.json();
          setAccessCount(extractAccessCount(accessesData));
        } else {
          setAccessCount(0);
        }
      } else {
        setAccessCount(0);
      }
    } catch (err) {
      console.error(err);
      setActiveAccess(null);
      setAccessCount(0);
      setError("Erro ao verificar o perfil de acesso.");
    } finally {
      setLoading(false);
    }
  }



  useEffect(() => {
    loadAccessData();
  }, []);



  const canSwitchProfile = accessCount > 1;



  /* =========================================================
     LOADING
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Verificando perfil..."
        description="Aguarde enquanto identificamos seu perfil de acesso."
      />
    );
  }



  /* =========================================================
     SESSÃO EXPIRADA / NÃO AUTORIZADO
     ========================================================= */

  if (unauthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F8F7] px-4 py-8 text-[#17211B]">
        <section className="w-full max-w-2xl rounded-[32px] border border-yellow-200 bg-white p-8 shadow-sm">
          <div className="mb-5">
            <span className="inline-flex rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
              Sessão não identificada
            </span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-[#17211B]">
            Faça login para continuar
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
            {error ||
              "Não foi possível validar sua sessão. Entre novamente para acessar o portal."}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
            >
              Ir para login
            </Link>
          </div>
        </section>
      </main>
    );
  }



  /* =========================================================
     SEM PERFIL DE ACESSO
     ========================================================= */

  if (!activeAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F8F7] px-4 py-8 text-[#17211B]">
        <section className="w-full max-w-2xl rounded-[32px] border border-yellow-200 bg-white p-8 shadow-sm">
          <div className="mb-5">
            <span className="inline-flex rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
              Perfil não selecionado
            </span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-[#17211B]">
            Selecione um perfil de acesso
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
            {error ||
              "Antes de continuar, selecione com qual perfil deseja acessar a plataforma."}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/contexto"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
            >
              Selecionar perfil
            </Link>

            <LogoutButton />
          </div>
        </section>
      </main>
    );
  }



  /* =========================================================
     PERFIL DE PORTAL PERMITIDO
     ========================================================= */

  if (isPortalRole(activeAccess.role)) {
    return <>{children}</>;
  }



  /* =========================================================
     PERFIL ADMINISTRATIVO EM PÁGINA DE PORTAL
     ========================================================= */

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F8F7] px-4 py-8 text-[#17211B]">
      <section className="w-full max-w-3xl rounded-[32px] border border-yellow-200 bg-white p-8 shadow-sm">
        <div className="mb-5 flex flex-col gap-4">
          <div>
            <span className="inline-flex rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
              {getPortalBlockedBadgeLabel(activeAccess.role)}
            </span>
          </div>

          <div className="w-fit">
            <ActiveAccessBadge />
          </div>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-[#17211B]">
          {fallbackTitle}
        </h1>

        <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
          {fallbackDescription}
        </p>

        <div className="mt-6 rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4">
          <p className="text-sm text-[#7A877F]">Perfil atual</p>

          <p className="mt-1 font-semibold text-[#17211B]">
            {roleLabel(activeAccess.role)}
            {activeAccess.label ? ` • ${activeAccess.label}` : ""}
          </p>

          {!canSwitchProfile && (
            <p className="mt-2 text-sm leading-6 text-[#7A877F]">
              Este usuário possui apenas este perfil de acesso disponível.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/admin/dashboard"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
          >
            Ir para o admin
          </Link>

          {canSwitchProfile && (
            <Link
              href="/contexto"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-6 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Trocar perfil
            </Link>
          )}

          <LogoutButton />
        </div>
      </section>
    </main>
  );
}