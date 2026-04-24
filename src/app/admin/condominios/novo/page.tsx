"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Administrator = {
  id: string;
  name: string;
};

export default function NovoCondominioPage() {
  const router = useRouter();

  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [administratorId, setAdministratorId] = useState("");
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAdministrators, setLoadingAdministrators] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAdministrators() {
      try {
        const response = await fetch("/api/admin/administradoras");
        const data = await response.json();

        setAdministrators(data);

        if (data.length > 0) {
          setAdministratorId(data[0].id);
        }
      } catch {
        setError("Erro ao carregar administradoras.");
      } finally {
        setLoadingAdministrators(false);
      }
    }

    loadAdministrators();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!administratorId) {
      setError("Selecione uma administradora.");
      return;
    }

    if (!name.trim()) {
      setError("Informe o nome do condomínio.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/admin/condominios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          administratorId,
          name,
          cnpj,
          email,
          phone,
          cep,
          address,
          number,
          complement,
          district,
          city,
          state: stateUf,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || "Erro ao salvar condomínio.");
      }

      router.push("/admin/condominios");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao salvar condomínio."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Novo Condomínio</h1>
          <p className="text-slate-400">
            Cadastre um condomínio e vincule a uma administradora.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
        >
          {error ? (
            <div className="mb-6 rounded-xl border border-red-900 bg-red-950 p-4 text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-slate-300">
                Administradora *
              </label>
              <select
                value={administratorId}
                onChange={(e) => setAdministratorId(e.target.value)}
                disabled={loadingAdministrators}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
              >
                {loadingAdministrators ? (
                  <option>Carregando...</option>
                ) : administrators.length === 0 ? (
                  <option value="">Nenhuma administradora cadastrada</option>
                ) : (
                  administrators.map((administrator) => (
                    <option key={administrator.id} value={administrator.id}>
                      {administrator.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-slate-300">
                Nome do condomínio *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
                placeholder="Ex: Edifício Skorpios"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">CNPJ</label>
              <input
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
                placeholder="Somente números"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Telefone
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
                placeholder="11999999999"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                E-mail
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
                placeholder="contato@condominio.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">CEP</label>
              <input
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
                placeholder="01001000"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm text-slate-300">
                Endereço
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
                placeholder="Rua, avenida, praça..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Número
              </label>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
                placeholder="100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Complemento
              </label>
              <input
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
                placeholder="Bloco A"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Bairro
              </label>
              <input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
                placeholder="Sé"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                Cidade
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-green-500"
                placeholder="São Paulo"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">UF</label>
              <input
                value={stateUf}
                onChange={(e) => setStateUf(e.target.value.toUpperCase())}
                maxLength={2}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 uppercase outline-none focus:border-green-500"
                placeholder="SP"
              />
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-green-600 hover:bg-green-700 px-5 py-3 font-semibold transition disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar Condomínio"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin/condominios")}
              className="rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 hover:bg-slate-800 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}