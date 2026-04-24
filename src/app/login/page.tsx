"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  async function handleLogin() {
    const res = await signIn("credentials", {
      email,
      password: senha,
      redirect: true,
      callbackUrl: "/dashboard",
    });

    console.log(res);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0f1c]">
      <div className="bg-[#111827] p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-white text-center">
          Login
        </h1>

        <input
          type="email"
          placeholder="Email"
          className="w-full mb-4 p-3 rounded bg-gray-800 text-white"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Senha"
          className="w-full mb-4 p-3 rounded bg-gray-800 text-white"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        <button
          onClick={handleLogin}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded"
        >
          Entrar
        </button>
      </div>
    </div>
  );
}