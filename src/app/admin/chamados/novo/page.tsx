"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Unit = {
  id: string;
  block: string | null;
  unitNumber: string;
  condominiumId: string;
  condominium: {
    name: string;
  };
};

type Resident = {
  id: string;
  name: string;
  unitId: string;
};

export default function NovoChamadoPage() {
  const router = useRouter();

  const [unidades, setUnidades] = useState<Unit[]>([]);
  const [moradores, setMoradores] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    unitId: "",
    residentId: "",
    title: "",
    description: "",
    category: "",
    priority: "MEDIUM",
  });

  const unidadeSelecionada = useMemo(() => {
    return unidades.find((u) => u.id === form.unitId);
  }, [unidades, form.unitId]);

  const moradoresFiltrados = useMemo(() => {
    return moradores.filter((m) => m.unitId === form.unitId);
  }, [moradores, form.unitId]);

  useEffect(() => {
    fetch("/api/admin/unidades")
      .then((res) => res.json())
      .then((data) => setUnidades(data));

    fetch("/api/admin/moradores")
      .then((res) => res.json())
      .then((data) => setMoradores(data));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!unidadeSelecionada) {
      alert("Selecione uma unidade.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/admin/chamados", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        condominiumId: unidadeSelecionada.condominiumId,
        unitId: form.unitId,
        residentId: form.residentId || null,
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
      }),
    });

    const data = await res.json();

    setLoading(false);

    if (res.ok) {
      router.push("/admin/chamados");
      router.refresh();
    } else {
      alert(data.error || "Erro ao cadastrar chamado.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Novo Chamado</h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6"
        >
          <div>
            <label className="text-sm text-slate-400">Unidade *</label>
            <select
              required
              className="w-full mt-1 rounded-lg border border-slate-800 bg-slate-950 p-3"
              value={form.unitId}
              onChange={(e) =>
                setForm({
                  ...form,
                  unitId: e.target.value,
                  residentId: "",
                })
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
            <label className="text-sm text-slate-400">Morador</label>
            <select
              className="w-full mt-1 rounded-lg border border-slate-800 bg-slate-950 p-3"
              value={form.residentId}
              onChange={(e) =>
                setForm({ ...form, residentId: e.target.value })
              }
            >
              <option value="">Sem morador vinculado</option>
              {moradoresFiltrados.map((morador) => (
                <option key={morador.id} value={morador.id}>
                  {morador.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-400">Título *</label>
            <input
              required
              className="w-full mt-1 rounded-lg border border-slate-800 bg-slate-950 p-3"
              placeholder="Ex: Vazamento na garagem"
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">Descrição *</label>
            <textarea
              required
              rows={5}
              className="w-full mt-1 rounded-lg border border-slate-800 bg-slate-950 p-3"
              placeholder="Descreva a ocorrência..."
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">Categoria</label>
            <input
              className="w-full mt-1 rounded-lg border border-slate-800 bg-slate-950 p-3"
              placeholder="Ex: Manutenção, Segurança, Limpeza"
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value })
              }
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">Prioridade</label>
            <select
              className="w-full mt-1 rounded-lg border border-slate-800 bg-slate-950 p-3"
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: e.target.value })
              }
            >
              <option value="LOW">Baixa</option>
              <option value="MEDIUM">Média</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-600 p-3 font-semibold transition hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Salvar Chamado"}
          </button>
        </form>
      </div>
    </main>
  );
}