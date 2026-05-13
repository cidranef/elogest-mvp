"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";



/* =========================================================
   ACTIVE ACCESS BADGE - ELOGEST

   ETAPA 39.16 — BADGE COMPACTO DE PERFIL ATIVO

   Atualização:
   - Badge deixa de ocupar muito espaço na topbar.
   - Remove texto fixo "Perfil ativo" da área principal.
   - Exibe ícone pequeno + perfil + label truncada.
   - "Trocar perfil" passa a ficar dentro do dropdown.
   - Mantém rota técnica /contexto.
   - Mantém leitura defensiva da quantidade de perfis.
   - Evita sobrepor elementos da topbar em telas menores.

   Visual:
   [ ícone ] Síndico • Condomínio X [v]

   Dropdown:
   - Perfil ativo
   - Contexto/label
   - Trocar perfil, apenas se houver mais de um perfil
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



function roleLabel(role?: string | null) {
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "ADMINISTRADORA") return "Administradora";
  if (role === "SINDICO") return "Síndico";
  if (role === "MORADOR") return "Morador";
  if (role === "PROPRIETARIO") return "Proprietário";
  if (role === "CONSELHEIRO") return "Conselheiro";

  return "Usuário";
}



function roleTone(role?: string | null) {
  if (role === "SUPER_ADMIN") {
    return {
      icon: "border-red-100 bg-red-50 text-red-700",
      badge: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (role === "ADMINISTRADORA") {
    return {
      icon: "border-blue-100 bg-blue-50 text-blue-700",
      badge: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  if (role === "SINDICO") {
    return {
      icon: "border-purple-100 bg-purple-50 text-purple-700",
      badge: "border-purple-200 bg-purple-50 text-purple-700",
    };
  }

  if (role === "MORADOR") {
    return {
      icon: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      badge: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    };
  }

  if (role === "PROPRIETARIO") {
    return {
      icon: "border-emerald-100 bg-emerald-50 text-emerald-700",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (role === "CONSELHEIRO") {
    return {
      icon: "border-yellow-100 bg-yellow-50 text-yellow-700",
      badge: "border-yellow-200 bg-yellow-50 text-yellow-700",
    };
  }

  return {
    icon: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    badge: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
  };
}



/* =========================================================
   EXTRAIR QUANTIDADE DE PERFIS DISPONÍVEIS
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

  if (Array.isArray(value?.accesses)) {
    return value.accesses.length;
  }

  if (Array.isArray(value?.user?.accesses)) {
    return value.user.accesses.length;
  }

  if (Array.isArray(value?.availableAccesses)) {
    return value.availableAccesses.length;
  }

  if (Array.isArray(value?.items)) {
    return value.items.length;
  }

  return 0;
}



/* =========================================================
   ÍCONE
   ========================================================= */

function ProfileIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className || "h-4 w-4"}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3.5 18 6v5.2c0 3.8-2.4 7.3-6 8.6-3.6-1.3-6-4.8-6-8.6V6l6-2.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m9.5 12 1.6 1.6 3.7-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}



function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className || "h-4 w-4"}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}



/* =========================================================
   COMPONENTE
   ========================================================= */

export default function ActiveAccessBadge({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [activeAccess, setActiveAccess] = useState<ActiveAccess | null>(null);
  const [accessCount, setAccessCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);



  /* =========================================================
     CARREGAR PERFIL ATIVO + QUANTIDADE DE PERFIS
     ========================================================= */

  async function loadActiveAccess() {
    try {
      setLoading(true);

      const [activeAccessResult, accessesResult] = await Promise.allSettled([
        fetch("/api/user/active-access", {
          cache: "no-store",
        }),
        fetch("/api/user/accesses", {
          cache: "no-store",
        }),
      ]);

      if (activeAccessResult.status === "fulfilled") {
        const activeAccessResponse = activeAccessResult.value;
        const activeAccessData = await activeAccessResponse.json();

        if (activeAccessResponse.ok) {
          setActiveAccess(activeAccessData?.activeAccess || null);
        } else {
          setActiveAccess(null);
        }
      } else {
        setActiveAccess(null);
      }

      if (accessesResult.status === "fulfilled") {
        const accessesResponse = accessesResult.value;
        const accessesData = await accessesResponse.json();

        if (accessesResponse.ok) {
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
    } finally {
      setLoading(false);
    }
  }



  useEffect(() => {
    loadActiveAccess();
  }, []);



  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;

      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);



  const canSwitchProfile = accessCount > 1;
  const tone = roleTone(activeAccess?.role);
  const currentRoleLabel = roleLabel(activeAccess?.role);
  const contextLabel = activeAccess?.label || "Perfil de acesso ativo";



  if (loading) {
    return (
      <div className="inline-flex h-12 max-w-[280px] items-center gap-3 rounded-2xl border border-[#DDE5DF] bg-white px-3 text-sm text-[#7A877F] shadow-sm">
        <span className="h-8 w-8 animate-pulse rounded-xl bg-[#EAF7EE]" />
        <span className="hidden animate-pulse sm:inline">Carregando perfil...</span>
      </div>
    );
  }



  if (!activeAccess) {
    return (
      <div className="inline-flex h-12 max-w-[320px] items-center gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-3 text-sm text-yellow-800 shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-yellow-200 bg-white">
          <ProfileIcon className="h-4 w-4" />
        </span>

        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">Nenhum perfil ativo</p>

          <Link
            href="/contexto"
            className="text-xs font-semibold underline hover:text-yellow-900"
          >
            Selecionar perfil
          </Link>
        </div>
      </div>
    );
  }



  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={[
          "inline-flex h-12 items-center gap-3 rounded-2xl border border-[#DDE5DF] bg-white px-3 shadow-sm transition",
          "hover:border-[#256D3C] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#256D3C]/10",
          compact ? "max-w-[180px]" : "max-w-[220px]",
        ].join(" ")}
        title={`${currentRoleLabel}${contextLabel ? ` - ${contextLabel}` : ""}`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${tone.icon}`}
        >
          <ProfileIcon className="h-4 w-4" />
        </span>

        <span className="min-w-0 text-left">
  <span className="block truncate text-sm font-semibold leading-5 text-[#17211B]">
    {currentRoleLabel}
  </span>
</span>

        <ChevronIcon
          className={[
            "h-4 w-4 shrink-0 text-[#7A877F] transition",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-3xl border border-[#DDE5DF] bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${tone.icon}`}
            >
              <ProfileIcon className="h-5 w-5" />
            </span>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Perfil ativo
              </p>

              <p className="mt-1 truncate text-base font-semibold text-[#17211B]">
                {currentRoleLabel}
              </p>

              {activeAccess.label && (
                <p className="mt-1 break-words text-sm leading-5 text-[#5E6B63]">
                  {activeAccess.label}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone.badge}`}
            >
              {currentRoleLabel}
            </span>

            <span className="inline-flex rounded-full border border-[#DDE5DF] bg-[#F6F8F7] px-3 py-1 text-xs font-semibold text-[#5E6B63]">
              Perfil de acesso
            </span>
          </div>

          {canSwitchProfile && (
            <Link
              href="/contexto"
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
            >
              Trocar perfil
            </Link>
          )}

          {!canSwitchProfile && (
            <p className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-3 text-xs leading-5 text-[#5E6B63]">
              Este usuário possui apenas um perfil de acesso disponível.
            </p>
          )}
        </div>
      )}
    </div>
  );
}