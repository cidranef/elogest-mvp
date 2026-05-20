import { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import { db } from "@/lib/db";
import { getAuthUser, isAuthError } from "@/lib/auth-guard";
import {
  canUseAdminAreaAccess,
  getActiveUserAccessFromCookies,
} from "@/lib/user-access";



/* =========================================================
   ADMIN LAYOUT GUARD - ELOGEST

   Arquivo:
   src/app/admin/layout.tsx

   Protege toda a área:
   /admin/*

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   Regras:
   - Não autenticado → /login
   - SUPER_ADMIN → /elogest/dashboard
   - ADMINISTRADORA com administratorId ativo → permite
   - ADMINISTRADORA vinculada a administradora INATIVA → bloqueia
   - Qualquer outro perfil → /contexto

   Correção crítica desta revisão:
   - A validação não pode considerar apenas o perfil ativo UserAccess.
   - Uma administradora com status INACTIVE não pode acessar /admin,
     mesmo que o usuário e o UserAccess estejam ativos.
   - O status da administradora passa a ser consultado diretamente
     no banco antes de renderizar qualquer página da área /admin.

   Ajuste pontual:
   - O antigo link "Voltar ao login" foi substituído por LogoutButton.
   - Apenas navegar para /login não encerra a sessão ativa; por isso,
     o usuário podia continuar autenticado e ser redirecionado novamente.
   - Agora o botão executa signOut do NextAuth e redireciona para /login.

   Observação:
   /admin é a área operacional da administradora cliente.
   O Super Admin deve usar /elogest.
   ========================================================= */

export const dynamic = "force-dynamic";



/* =========================================================
   TELA DE BLOQUEIO

   Renderizada quando o usuário pertence a uma administradora
   inativa, suspensa ou inexistente.
   ========================================================= */

function AdministradoraInativaBlock() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F8F7] px-4 text-[#17211B]">
      <section className="w-full max-w-xl rounded-[32px] border border-[#DDE5DF] bg-white p-8 text-center shadow-[0_24px_80px_rgba(23,33,27,0.08)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#F7F9F8]">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-[#64736A]"
            aria-hidden="true"
          >
            <path
              d="M12 9v4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
            <path
              d="M12 17h.01"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
            <path
              d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z"
              fill="none"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </div>

        <div className="mb-2 text-2xl font-semibold tracking-tight">
          <span className="text-[#256D3C]">Elo</span>
          <span className="text-[#17211B]">Gest</span>
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-[#17211B]">
          Acesso administrativo temporariamente indisponível
        </h1>

        <p className="mt-3 text-sm leading-6 text-[#64736A]">
          A administradora vinculada a este perfil está inativa no momento.
          Por segurança, o acesso ao dashboard administrativo e às rotinas
          operacionais foi bloqueado.
        </p>

        <p className="mt-3 text-sm leading-6 text-[#64736A]">
          Caso isso não seja esperado, entre em contato com o responsável pela
          plataforma EloGest.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/contexto"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
          >
            Trocar perfil
          </Link>

          <LogoutButton
            label="Sair e voltar ao login"
            loadingLabel="Saindo..."
            callbackUrl="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:bg-[#7A877F]"
          />
        </div>
      </section>
    </main>
  );
}



/* =========================================================
   LAYOUT
   ========================================================= */

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    const sessionUser = await getAuthUser();

    /*
       Bloqueio imediato por sessão.
       Mesmo que exista cookie antigo de contexto, SUPER_ADMIN
       não deve renderizar nenhuma rota dentro de /admin.
    */
    if (sessionUser.role === "SUPER_ADMIN") {
      redirect("/elogest/dashboard");
    }

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: sessionUser.id,
    });

    if (activeAccess?.role === "SUPER_ADMIN") {
      redirect("/elogest/dashboard");
    }

    if (!canUseAdminAreaAccess(activeAccess)) {
      redirect("/contexto");
    }

    /*
       ETAPA 44 — BLOQUEIO POR STATUS DA ADMINISTRADORA

       O UserAccess pode estar ativo, mas a administradora cliente
       pode ter sido inativada pelo Super Admin EloGest.

       Neste caso, o usuário não deve acessar /admin.
    */
    const administratorId = activeAccess?.administratorId || null;

    if (!administratorId) {
      redirect("/contexto");
    }

    const administrator = await db.administrator.findUnique({
      where: {
        id: administratorId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!administrator || administrator.status !== "ACTIVE") {
      return <AdministradoraInativaBlock />;
    }

    return <>{children}</>;
  } catch (error) {
    if (isAuthError(error)) {
      redirect("/login");
    }

    throw error;
  }
}
