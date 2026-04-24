"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Unit = {
  id: string;
  block: string | null;
  unitNumber: string;
  condominium: {
    name: string;
  };
};

export default function NovoMoradorPage() {
  const router = useRouter();

  const [unidades, setUnidades] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    unitId: "",
    name: "",
    cpf: "",
    email: "",
    phone: "",
    residentType: "PROPRIETARIO",
  });

  useEffect(() => {
    fetch("/api/admin/unidades")
      .then((res) => res.json())
      .then((data) => setUnidades(data));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/admin/moradores", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      router.push("/admin/moradores");
      router.refresh();
    } else {
      alert(data.error || "Erro ao cadastrar morador.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Novo Morador</h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-slate-900 p-6 rounded-2xl border border-slate-800"
        >
          <div>
            <label className="text-sm text-slate-400">Unidade *</label>
            <select
              required
              className="w-full mt-1 p-3 bg-slate-950 border border-slate-800 rounded-lg"
              value={form.unitId}
              onChange={(e) =>
                setForm({ ...form, unitId: e.target.value })
              }
            >
              <option value="">Selecione</option>
              {unidades.map((unidade) => (
                <option key={unidade.id} value={unidade.id}>
                  {unidade.condominium.name} -{" "}
                  {unidade.block ? `Bloco ${unidade.block} - ` : ""}
                  Unidade {unidade.unitNumber}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-400">Nome *</label>
            <input
              required
              className="w-full mt-1 p-3 bg-slate-950 border border-slate-800 rounded-lg"
              placeholder="Nome completo"
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">CPF</label>
            <input
              className="w-full mt-1 p-3 bg-slate-950 border border-slate-800 rounded-lg"
              placeholder="Somente números"
              value={form.cpf}
              onChange={(e) =>
                setForm({ ...form, cpf: e.target.value })
              }
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">E-mail</label>
            <input
              type="email"
              className="w-full mt-1 p-3 bg-slate-950 border border-slate-800 rounded-lg"
              placeholder="email@dominio.com"
              value={form.email}
              onChange={(e) =>
                setForm({ ...form, email: e.target.value })
              }
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">Telefone</label>
            <input
              className="w-full mt-1 p-3 bg-slate-950 border border-slate-800 rounded-lg"
              placeholder="11999999999"
              value={form.phone}
              onChange={(e) =>
                setForm({ ...form, phone: e.target.value })
              }
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">Tipo de vínculo</label>
            <select
              className="w-full mt-1 p-3 bg-slate-950 border border-slate-800 rounded-lg"
              value={form.residentType}
              onChange={(e) =>
                setForm({ ...form, residentType: e.target.value })
              }
            >
              <option value="PROPRIETARIO">Proprietário</option>
              <option value="INQUILINO">Inquilino</option>
              <option value="FAMILIAR">Familiar</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 transition p-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Salvar Morador"}
          </button>
        </form>
      </div>
    </main>
  );
}