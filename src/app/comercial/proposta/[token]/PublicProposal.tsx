"use client";

import { useEffect, useMemo, useState } from "react";

type Proposal = {
  title: string;
  currentVersion: number;
  monthlyPriceCents: number | null;
  implementationFeeCents: number | null;
  discountCents: number | null;
  discountPercent: number | null;
  validUntil: string | null;
  paymentTerms: string | null;
  commercialNotes: string | null;
  modules: string[];
  acceptedAt: string | null;
  plan: { name: string; slug: string } | null;
  lead: {
    administratorName: string;
    responsibleName: string;
    email: string;
  };
};

const brl = (value: number | null) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((value ?? 0) / 100);

function formatDate(value: string | null) {
  if (!value) return "Não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

async function readJson(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();

  if (!contentType.includes("application/json")) {
    throw new Error(
      response.ok
        ? "O servidor retornou uma resposta inesperada."
        : `Não foi possível carregar a proposta (${response.status}).`,
    );
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("A resposta da proposta está inválida.");
  }
}

function EloGestLogo() {
  return (
    <div className="flex items-center gap-3" aria-label="EloGest">
      <svg
        width="34"
        height="40"
        viewBox="0 0 34 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M17 2.5 30 10v20L17 37.5 4 30V10L17 2.5Z"
          stroke="#75C77A"
          strokeWidth="2.4"
        />
        <path d="M10 15.5 16 12v15.5L10 24V15.5Z" fill="#75C77A" />
        <path d="m18 10.8 6 3.5V25l-6 3.5V10.8Z" fill="white" />
      </svg>
      <span className="text-2xl font-semibold tracking-tight text-white">
        EloGest
      </span>
    </div>
  );
}

export default function PublicProposal({ token }: { token: string }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const netMonthlyPrice = useMemo(() => {
    if (!proposal) return 0;
    const gross = proposal.monthlyPriceCents ?? 0;
    const fixedDiscount = proposal.discountCents ?? 0;
    const percentDiscount = Math.round(
      gross * ((proposal.discountPercent ?? 0) / 100),
    );
    return Math.max(0, gross - fixedDiscount - percentDiscount);
  }, [proposal]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(`/api/public/comercial/proposta/${token}`, {
          cache: "no-store",
        });
        const json = await readJson(response);

        if (!response.ok) {
          throw new Error(
            typeof json.error === "string"
              ? json.error
              : "Não foi possível carregar a proposta.",
          );
        }

        if (active) setProposal(json.proposal as Proposal);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar a proposta.",
          );
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [token, reloadKey]);

  async function submit() {
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`/api/public/comercial/proposta/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, accepted }),
      });
      const json = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof json.error === "string"
            ? json.error
            : "Não foi possível registrar o aceite.",
        );
      }

      setDone(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível registrar o aceite.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !proposal) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-20">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-200 bg-white p-8 text-red-700 shadow-xl">
          <h1 className="text-xl font-bold">Não foi possível abrir a proposta</h1>
          <p className="mt-3 text-sm leading-6">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              setProposal(null);
              setReloadKey((value) => value + 1);
            }}
            className="mt-6 rounded-xl bg-emerald-800 px-5 py-3 font-semibold text-white"
          >
            Tentar Novamente
          </button>
        </div>
      </main>
    );
  }

  if (!proposal) {
    return (
      <main className="min-h-screen bg-slate-950 p-10 text-center text-white">
        Carregando proposta…
      </main>
    );
  }

  const hasDiscount =
    (proposal.discountCents ?? 0) > 0 || (proposal.discountPercent ?? 0) > 0;

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-8 sm:py-12">
      <article className="mx-auto max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <header className="border-b-4 border-emerald-600 bg-[#063727] px-6 py-7 text-white sm:px-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <EloGestLogo />
            <div className="sm:text-right">
              <p className="text-sm font-bold uppercase tracking-[0.13em] text-white">
                Proposta Comercial
              </p>
              <p className="mt-2 text-xs text-emerald-100">
                Versão {proposal.currentVersion}
              </p>
              <p className="mt-1 text-xs text-emerald-100">
                Validade: {formatDate(proposal.validUntil)}
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-8 p-6 sm:p-10">
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              Proposta Comercial Personalizada
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              {proposal.lead.administratorName}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Uma solução completa para tornar a gestão mais eficiente, segura e conectada.
            </p>
          </section>

          <section className="grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Responsável</p>
              <p className="mt-2 font-semibold text-slate-950">{proposal.lead.responsibleName}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">E-mail</p>
              <p className="mt-2 break-all font-semibold text-slate-950">{proposal.lead.email}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Plano Recomendado</p>
              <p className="mt-2 font-semibold text-slate-950">{proposal.plan?.name ?? "Personalizado"}</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-950">Investimento Proposto</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="border-t-4 border-emerald-700 bg-slate-50 p-5 ring-1 ring-slate-200">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Plano</span>
                <p className="mt-3 text-xl font-bold text-slate-950">{proposal.plan?.name ?? "Personalizado"}</p>
              </div>
              <div className="border-t-4 border-emerald-700 bg-emerald-50 p-5 ring-1 ring-emerald-200">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Mensalidade</span>
                <p className="mt-3 text-xl font-bold text-emerald-950">{brl(netMonthlyPrice)}</p>
                {hasDiscount ? (
                  <p className="mt-2 text-xs text-emerald-800">
                    Valor original: {brl(proposal.monthlyPriceCents)}
                  </p>
                ) : null}
              </div>
              <div className="border-t-4 border-emerald-700 bg-slate-50 p-5 ring-1 ring-slate-200">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Implantação</span>
                <p className="mt-3 text-xl font-bold text-slate-950">{brl(proposal.implementationFeeCents)}</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-950">Soluções Incluídas</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {proposal.modules.map((module) => (
                <li key={module} className="flex min-h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
                  <span className="mr-3 h-2 w-2 shrink-0 rounded-full bg-emerald-700" />
                  {module}
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-5">
              <h2 className="font-bold text-slate-950">Condições De Pagamento</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{proposal.paymentTerms || "Não informadas."}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <h2 className="font-bold text-slate-950">Observações Comerciais</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{proposal.commercialNotes || "Sem observações adicionais."}</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-950">Próximos Passos</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["1", "Validar Escopo", "Confirmar solução e condições."],
                ["2", "Aceitar Proposta", "Concluir o aceite eletrônico."],
                ["3", "Agendar Implantação", "Definir datas e responsáveis."],
              ].map(([number, title, description], index) => (
                <div key={number} className={`rounded-xl border p-4 ${index === 1 ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">{number}</span>
                    <p className="font-semibold text-slate-950">{title}</p>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">{description}</p>
                </div>
              ))}
            </div>
          </section>

          {done || proposal.acceptedAt ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
              <h2 className="text-xl font-bold">Proposta aceita</h2>
              <p className="mt-2">O aceite foi registrado com segurança. Nossa equipe seguirá com os próximos passos.</p>
            </div>
          ) : (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-7">
              <h2 className="text-xl font-bold text-emerald-950">Aceite Formal</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-900">Confira os dados e confirme o aceite eletrônico para avançar com a implantação.</p>

              {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <input className="rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="Nome completo" value={name} onChange={(event) => setName(event.target.value)} />
                <input className="rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>

              <label className="mt-4 flex cursor-pointer gap-3 text-sm leading-6 text-slate-700">
                <input className="mt-1 h-4 w-4 accent-emerald-700" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
                Declaro que li e aceito integralmente esta proposta comercial.
              </label>

              <button type="button" onClick={submit} disabled={submitting} className="mt-5 rounded-xl bg-emerald-800 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? "Registrando aceite…" : "Aceitar Proposta"}
              </button>
            </section>
          )}

          <footer className="border-t border-slate-200 pt-5 text-center text-xs text-slate-500 sm:flex sm:items-center sm:justify-between sm:text-left">
            <span>EloGest · Gestão condominial mais eficiente, segura e conectada.</span>
            <span className="mt-2 block sm:mt-0">Documento comercial confidencial · Versão {proposal.currentVersion}</span>
          </footer>
        </div>
      </article>
    </main>
  );
}
