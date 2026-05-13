"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";



/* =========================================================
   LOGOUT - ELOGEST

   Esta página encerra a sessão do usuário via NextAuth
   e redireciona para /login.

   Uso:
   /logout
   ========================================================= */

export default function LogoutPage() {
  const [manualFallback, setManualFallback] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setManualFallback(true);
    }, 2500);

    signOut({
      callbackUrl: "/login",
      redirect: true,
    });

    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen bg-[#050816] text-white flex items-center justify-center p-8">
      <section className="w-full max-w-md bg-[#111827] border border-gray-800 rounded-2xl p-8 text-center">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Saindo...</h1>

          <p className="text-gray-400 mt-3">
            Estamos encerrando sua sessão com segurança.
          </p>
        </div>

        <div className="bg-black/30 border border-gray-800 rounded-xl p-4 text-sm text-gray-300">
          Aguarde o redirecionamento para a tela de login.
        </div>

        {manualFallback && (
          <div className="mt-6">
            <button
              onClick={() =>
                signOut({
                  callbackUrl: "/login",
                  redirect: true,
                })
              }
              className="inline-flex h-12 items-center justify-center bg-red-700 hover:bg-red-600 px-6 rounded-xl font-bold"
            >
              Tentar sair novamente
            </button>
          </div>
        )}
      </section>
    </main>
  );
}