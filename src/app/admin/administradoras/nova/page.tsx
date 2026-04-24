"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NovaAdministradoraPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch("/api/admin/administradoras", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, cnpj, phone }),
      });

      router.push("/admin/administradoras");
    } catch (error) {
      alert("Erro ao salvar administradora");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 text-white">
      <h1 className="text-3xl font-bold mb-6">Nova Administradora</h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 max-w-lg bg-gray-900 p-6 rounded-xl border border-gray-800"
      >
        <input
          placeholder="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full p-3 rounded bg-gray-800 border border-gray-700"
        />

        <input
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 rounded bg-gray-800 border border-gray-700"
        />

        <input
          placeholder="CNPJ"
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          className="w-full p-3 rounded bg-gray-800 border border-gray-700"
        />

        <input
          placeholder="Telefone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full p-3 rounded bg-gray-800 border border-gray-700"
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded w-full"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}