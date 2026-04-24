"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function NovaUnidadePage() {
  const router = useRouter();

  const [condominios, setCondominios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    condominiumId: "",
    block: "",
    unitNumber: "",
    unitType: "",
  });

  useEffect(() => {
    fetch("/api/admin/condominios")
      .then((res) => res.json())
      .then((data) => setCondominios(data));
  }, []);

  async function handleSubmit(e: any) {
    e.preventDefault();

    setLoading(true);

    const res = await fetch("/api/admin/unidades", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    setLoading(false);

    if (res.ok) {
      router.push("/admin/unidades");
    } else {
      alert(data.error || "Erro ao cadastrar unidade");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Nova Unidade</h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-slate-900 p-6 rounded-2xl border border-slate-800"
        >
          {/* CONDOMÍNIO */}
          <div>
            <label className="text-sm text-slate-400">
              Condomínio *
            </label>
            <select
              required
              className="w-full mt-1 p-3 bg-slate-950 border border-slate-800 rounded-lg"
              value={form.condominiumId}
              onChange={(e) =>
                setForm({ ...form, condominiumId: e.target.value })
              }
            >
              <option value="">Selecione</option>
              {condominios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* BLOCO */}
          <div>
            <label className="text-sm text-slate-400">
              Bloco
            </label>
            <input
              className="w-full mt-1 p-3 bg-slate-950 border border-slate-800 rounded-lg"
              placeholder="Ex: A"
              value={form.block}
              onChange={(e) =>
                setForm({ ...form, block: e.target.value })
              }
            />
          </div>

          {/* NÚMERO */}
          <div>
            <label className="text-sm text-slate-400">
              Número da Unidade *
            </label>
            <input
              required
              className="w-full mt-1 p-3 bg-slate-950 border border-slate-800 rounded-lg"
              placeholder="Ex: 101"
              value={form.unitNumber}
              onChange={(e) =>
                setForm({ ...form, unitNumber: e.target.value })
              }
            />
          </div>

          {/* TIPO */}
          <div>
            <label className="text-sm text-slate-400">
              Tipo
            </label>
            <input
              className="w-full mt-1 p-3 bg-slate-950 border border-slate-800 rounded-lg"
              placeholder="Ex: Apartamento"
              value={form.unitType}
              onChange={(e) =>
                setForm({ ...form, unitType: e.target.value })
              }
            />
          </div>

          {/* BOTÃO */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 transition p-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Salvar Unidade"}
          </button>
        </form>
      </div>
    </main>
  );
}