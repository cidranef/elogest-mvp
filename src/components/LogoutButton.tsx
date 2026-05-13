"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";



/* =========================================================
   BOTÃO DE LOGOUT - ELOGEST

   Usa o signOut do NextAuth e redireciona para /login.
   Pode ser usado em páginas admin e portal.

   ETAPA 29.1:
   - Adicionado estado de carregamento.
   - Evita clique duplo no botão de sair.
   - Permite customizar callbackUrl, mantendo /login como padrão.

   ETAPA 39.2.4 — PADRONIZAÇÃO VISUAL DO BOTÃO SAIR

   Ajuste:
   - O padrão anterior usava fundo vermelho forte sem garantir
     cor de texto branca.
   - Em algumas páginas, o botão ficava vermelho com escrita preta.
   - Novo padrão usa vermelho suave, borda discreta e texto legível.
   - Visual mais alinhado ao design system do EloGest.
   - Mantida a possibilidade de sobrescrever com className.
   ========================================================= */



interface LogoutButtonProps {
  label?: string;
  loadingLabel?: string;
  className?: string;
  callbackUrl?: string;
}



export default function LogoutButton({
  label = "Sair",
  loadingLabel = "Saindo...",
  className = "",
  callbackUrl = "/login",
}: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);



  /* =========================================================
     SAIR DO SISTEMA
     ========================================================= */

  async function handleLogout() {
    if (loading) return;

    try {
      setLoading(true);

      await signOut({
        callbackUrl,
        redirect: true,
      });
    } catch (error) {
      console.error("Erro ao sair:", error);
      setLoading(false);
    }
  }



  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={
        className ||
        [
          "inline-flex h-11 items-center justify-center rounded-2xl",
          "border border-red-200 bg-red-50 px-4",
          "text-sm font-semibold text-red-700 shadow-sm",
          "transition hover:border-red-300 hover:bg-red-100 hover:text-red-800",
          "focus:outline-none focus:ring-4 focus:ring-red-500/10",
          "disabled:cursor-not-allowed disabled:border-[#DDE5DF]",
          "disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]",
        ].join(" ")
      }
    >
      {loading ? loadingLabel : label}
    </button>
  );
}