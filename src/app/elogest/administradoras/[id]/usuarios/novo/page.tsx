"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EloGestShell from "@/components/EloGestShell";



/* =========================================================
   ELOGEST - NOVO USUÁRIO DA ADMINISTRADORA

   Rota:
   /elogest/administradoras/[id]/usuarios/novo

   ETAPA 42.2.1 — USUÁRIOS DA ADMINISTRADORA

   Objetivo:
   - Permitir que o Super Admin EloGest crie usuários
     vinculados a uma administradora.
   - Criar User com role ADMINISTRADORA.
   - Criar UserAccess com AccessRole ADMINISTRADORA.
   - Redirecionar de volta ao detalhe da administradora.
   ========================================================= */



export default function NovoUsuarioAdministradoraPage() {
  const router = useRouter();
  const params = useParams();

  const administratorId = useMemo(() => {
    const rawId = params?.id;

    if (Array.isArray(rawId)) {
      return rawId[0] || "";
    }

    return rawId || "";
  }, [params]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Heloisa100%");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");



  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!administratorId) {
      setError("Administradora não identificada.");
      return;
    }

    if (!normalizedName) {
      setError("Informe o nome do usuário.");
      return;
    }

    if (!normalizedEmail) {
      setError("Informe o e-mail do usuário.");
      return;
    }

    if (!password || password.length < 8) {
      setError("A senha inicial deve ter pelo menos 8 caracteres.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/elogest/administradoras/${administratorId}/usuarios`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: normalizedName,
            email: normalizedEmail,
            password,
            isActive,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Não foi possível criar o usuário.");
        return;
      }

      router.push(`/elogest/administradoras/${administratorId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível criar o usuário. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }



  return (
    <EloGestShell current="administradoras">
      <div className="space-y-8">
        <section className="rounded-[34px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Usuário administrativo
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                Novo usuário da administradora
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64736A] sm:text-base sm:leading-7">
                Crie um usuário vinculado à administradora para que ele possa
                acessar a área administrativa e operar a carteira.
              </p>
            </div>

            <Link
              href={`/elogest/administradoras/${administratorId}`}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Voltar
            </Link>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur sm:p-8">
          {error && (
            <div
              className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                Dados de acesso
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#64736A]">
                Esse usuário será criado com perfil administrativo dentro da
                administradora selecionada.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="mb-2 block text-sm font-semibold text-[#17211B]"
                >
                  Nome do usuário
                </label>

                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                  placeholder="Ex.: Mariana Almeida"
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-[#17211B]"
                >
                  E-mail de acesso
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                  placeholder="usuario@administradora.com.br"
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-[#17211B]"
                >
                  Senha inicial
                </label>

                <input
                  id="password"
                  type="text"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  required
                />

                <p className="mt-2 text-xs leading-5 text-[#64736A]">
                  Futuramente, esse fluxo poderá ser substituído por convite por
                  e-mail com definição de senha pelo próprio usuário.
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#DDE5DF] bg-[#F7F9F8] p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => {
                    setIsActive(event.target.checked);
                    setError("");
                  }}
                  className="mt-1 h-4 w-4 accent-[#256D3C]"
                />

                <div>
                  <p className="text-sm font-semibold text-[#17211B]">
                    Usuário ativo
                  </p>

                  <p className="mt-1 text-sm leading-6 text-[#64736A]">
                    Usuários ativos podem acessar a plataforma imediatamente.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <Link
                href={`/elogest/administradoras/${administratorId}`}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Cancelar
              </Link>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
              >
                {loading ? "Criando..." : "Criar usuário"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </EloGestShell>
  );
}