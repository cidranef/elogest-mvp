"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EloGestShell from "@/components/EloGestShell";



/* =========================================================
   ELOGEST - NOVO RESPONSÁVEL PELO ACESSO DA ADMINISTRADORA

   Rota:
   /elogest/administradoras/[id]/usuarios/novo

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   Objetivo:
   - Permitir que o Super Admin EloGest crie novos responsáveis
     pelo acesso administrativo de uma administradora.
   - Criar usuário vinculado à administradora.
   - Criar acesso administrativo para esse usuário.
   - Redirecionar de volta ao detalhe da administradora.
   - Preparar o fluxo futuro de convite por e-mail.

   Segurança:
   - Não existe senha padrão preenchida.
   - A senha temporária precisa seguir a política forte.
   - A API também deve validar a política central de senha.
   - A API deve validar se o Super Admin está autorizado.
   ========================================================= */



function StepCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
      <p className="text-sm font-semibold text-[#17211B]">
        {title}
      </p>

      <p className="mt-1 text-sm leading-6 text-[#64736A]">
        {description}
      </p>
    </div>
  );
}




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
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");



  function getPasswordChecklist(value: string) {
    return [
      {
        label: "Mínimo de 8 caracteres",
        valid: value.length >= 8,
      },
      {
        label: "Pelo menos 1 letra maiúscula",
        valid: /[A-Z]/.test(value),
      },
      {
        label: "Pelo menos 1 letra minúscula",
        valid: /[a-z]/.test(value),
      },
      {
        label: "Pelo menos 1 número",
        valid: /\d/.test(value),
      },
      {
        label: "Pelo menos 1 caractere especial",
        valid: /[^A-Za-z0-9]/.test(value),
      },
    ];
  }



  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }






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
      setError("Informe o nome do responsável pelo acesso.");
      return;
    }

    if (!normalizedEmail) {
      setError("Informe o e-mail de acesso.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError("Informe um e-mail válido para o responsável pelo acesso.");
      return;
    }

    const passwordChecklist = getPasswordChecklist(password);
    const hasStrongPasswordBase = passwordChecklist.every((item) => item.valid);

    if (!hasStrongPasswordBase) {
      setError(
        "A senha temporária deve ter no mínimo 8 caracteres, com letra maiúscula, letra minúscula, número e caractere especial."
      );
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
        setError(data?.error || "Não foi possível criar o responsável pelo acesso.");
        return;
      }

      router.push(`/elogest/administradoras/${administratorId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível criar o responsável pelo acesso. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }



  return (
    <EloGestShell current="administradoras">
      <div className="space-y-8">



        {/* =====================================================
           HEADER
           ===================================================== */}

        <section className="rounded-[34px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                Acesso administrativo
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                Novo responsável pelo acesso
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64736A] sm:text-base sm:leading-7">
                Crie um novo responsável para acessar o painel administrativo
                da administradora e operar a carteira vinculada.
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



        {/* =====================================================
           ORIENTAÇÃO
           ===================================================== */}

        <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur sm:p-8">
          <div className="mb-5">
            <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
              Como funciona este acesso
            </h2>

            <p className="mt-1 text-sm leading-6 text-[#64736A]">
              Este cadastro cria um acesso administrativo vinculado à
              administradora selecionada. Em uma próxima etapa, este fluxo
              poderá ser substituído por convite automático por e-mail.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <StepCard
              title="Responsável"
              description="Informe nome e e-mail da pessoa que acessará o painel administrativo."
            />

            <StepCard
              title="Senha temporária"
              description="Crie uma senha forte e oriente o usuário a alterá-la quando possível."
            />

            <StepCard
              title="Operação"
              description="Usuários ativos podem acessar o painel da administradora enquanto a carteira estiver ativa."
            />
          </div>
        </section>



        {/* =====================================================
           FORMULÁRIO
           ===================================================== */}

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
                Este responsável será vinculado à administradora selecionada e
                poderá acessar o painel administrativo da carteira.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="mb-2 block text-sm font-semibold text-[#17211B]"
                >
                  Nome do responsável
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
                  Senha temporária
                </label>

                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="Crie uma senha temporária forte"
                  autoComplete="new-password"
                  className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                  required
                />

                <div className="mt-3 grid gap-2 rounded-2xl border border-[#DDE5DF] bg-white/70 p-4 sm:grid-cols-2">
                  {getPasswordChecklist(password).map((item) => (
                    <div
                      key={item.label}
                      className={[
                        "flex items-center gap-2 text-xs font-semibold",
                        item.valid ? "text-[#256D3C]" : "text-[#7A877F]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                          item.valid
                            ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                            : "border-[#DDE5DF] bg-[#F7F9F8] text-[#9AA7A0]",
                        ].join(" ")}
                      >
                        {item.valid ? "✓" : "•"}
                      </span>
                      {item.label}
                    </div>
                  ))}
                </div>

                <p className="mt-2 text-xs leading-5 text-[#64736A]">
                  A senha temporária deve ser forte e não deve conter partes
                  do nome ou e-mail do responsável. A validação final também
                  acontece no servidor.
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
                    Liberar acesso após o cadastro
                  </p>

                  <p className="mt-1 text-sm leading-6 text-[#64736A]">
                    Quando liberado, o responsável poderá acessar o painel
                    administrativo imediatamente, desde que a administradora
                    esteja ativa.
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
                {loading ? "Criando..." : "Criar responsável"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </EloGestShell>
  );
}
