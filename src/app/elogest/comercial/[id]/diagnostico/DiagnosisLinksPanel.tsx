"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Item = {
  id: string;
  tokenHint: string;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  openedAt: string | null;
  startedAt: string | null;
  lastSavedAt: string | null;
  completedAt: string | null;
  revokedAt: string | null;
  respondentName: string | null;
  respondentEmail: string | null;
  importedAt: string | null;
  createdAt: string;
  createdByUser: { name: string | null; email: string } | null;
  events: Array<{ id: string; type: string; createdAt: string }>;
};

type Props = {
  leadId: string;
};

type ImportResponse = {
  ok?: boolean;
  message?: string;
  qualificationUrl?: string;
  created?: boolean;
  reopenedForReview?: boolean;
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

const STATUS: Record<Item["status"], string> = {
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  EXPIRED: "Expirado",
  REVOKED: "Revogado",
};

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Não foi possível copiar automaticamente.");
  }
}

export default function DiagnosisLinksPanel({ leadId }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [validDays, setValidDays] = useState(7);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [qualificationUrl, setQualificationUrl] = useState("");
  const [pendingImportId, setPendingImportId] = useState<string | null>(null);
  const confirmationRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/elogest/comercial/${leadId}/diagnostico`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        items?: Item[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível carregar os links.");
      }

      setItems(payload.items || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (pendingImportId) {
      confirmationRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [pendingImportId]);

  async function createLink() {
    setWorking(true);
    setGeneratedUrl("");
    setQualificationUrl("");
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/elogest/comercial/${leadId}/diagnostico`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ validDays }),
        },
      );
      const payload = (await response.json()) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Não foi possível criar o link.");
      }

      setGeneratedUrl(payload.url);
      setMessage("Link seguro criado. Copie e envie ao potencial cliente.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Erro ao criar o link.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleCopy() {
    setMessage("");
    setError("");

    try {
      await copyText(generatedUrl);
      setMessage("Link copiado com sucesso.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${cause.message} Selecione o endereço e copie manualmente.`
          : "Selecione o endereço e copie manualmente.",
      );
    }
  }

  async function action(linkId: string, actionName: "REVOKE" | "IMPORT") {
    setWorking(true);
    setMessage("");
    setError("");
    setQualificationUrl("");

    try {
      const response = await fetch(
        `/api/elogest/comercial/${leadId}/diagnostico`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkId, action: actionName }),
        },
      );
      const payload = (await response.json()) as ImportResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível concluir a ação.");
      }

      if (actionName === "IMPORT") {
        setMessage(
          payload.message ||
            "Respostas importadas para revisão na Qualificação Comercial.",
        );
        setQualificationUrl(
          payload.qualificationUrl ||
            `/elogest/comercial/${leadId}/qualificacao`,
        );
      } else {
        setMessage("Link revogado com sucesso.");
      }

      setPendingImportId(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Erro ao concluir a ação.",
      );
    } finally {
      setWorking(false);
    }
  }

  const counters = useMemo(
    () => ({
      total: items.length,
      active: items.filter((item) => item.status === "ACTIVE").length,
      completed: items.filter((item) => item.status === "COMPLETED").length,
    }),
    [items],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Links Criados", counters.total],
          ["Ativos", counters.active],
          ["Concluídos", counters.completed],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-3xl border border-[#DDE5DF] bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A847D]">
              {label}
            </p>
            <p className="mt-2 text-3xl font-semibold text-[#17211B]">
              {value}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-[#17211B]">
          Criar Novo Link Seguro
        </h2>
        <p className="mt-2 text-sm text-[#5B665F]">
          O token completo é exibido somente no momento da criação. Depois
          disso, o sistema armazena apenas o hash.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm font-semibold text-[#344139]">
            Validade Em Dias
            <input
              type="number"
              min="1"
              max="30"
              value={validDays}
              onChange={(event) =>
                setValidDays(
                  Math.min(
                    30,
                    Math.max(1, Number(event.target.value) || 7),
                  ),
                )
              }
              className="mt-2 min-h-11 w-36 rounded-xl border border-[#C9D6CD] px-3 font-normal"
            />
          </label>

          <button
            type="button"
            disabled={working}
            onClick={createLink}
            className="min-h-11 rounded-xl bg-[#256D3C] px-5 font-semibold text-white disabled:opacity-60"
          >
            Criar Link De Diagnóstico
          </button>
        </div>

        {generatedUrl ? (
          <div className="mt-5 rounded-2xl border border-[#CFE0D3] bg-[#F5FAF6] p-4">
            <p className="text-sm font-semibold text-[#344139]">Copie agora:</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={generatedUrl}
                className="min-h-11 flex-1 rounded-xl border border-[#C9D6CD] bg-white px-3 text-sm"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="min-h-11 rounded-xl border border-[#256D3C] px-4 font-semibold text-[#256D3C]"
              >
                Copiar Link
              </button>
              <a
                href={generatedUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#C9D6CD] px-4 font-semibold text-[#344139]"
              >
                Abrir Link
              </a>
            </div>
          </div>
        ) : null}
      </section>

      {pendingImportId ? (
        <section
          ref={confirmationRef}
          className="rounded-3xl border border-amber-200 bg-amber-50 p-6"
        >
          <h2 className="text-lg font-semibold text-amber-950">
            Confirmar Importação
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Já pode existir uma qualificação para este lead. As respostas do
            diagnóstico atualizarão os campos operacionais da qualificação
            atual. Notas dos critérios, pontuação, classificação e análises
            internas serão preservadas. Se a qualificação estiver concluída,
            ela voltará para rascunho para revisão humana.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={working}
              onClick={() => action(pendingImportId, "IMPORT")}
              className="min-h-10 rounded-xl bg-[#256D3C] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Confirmar E Atualizar Qualificação
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => setPendingImportId(null)}
              className="min-h-10 rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900"
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      {message ? (
        <div className="rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
          {message}
          {qualificationUrl ? (
            <div className="mt-3">
              <Link
                href={qualificationUrl}
                className="inline-flex min-h-10 items-center rounded-xl bg-[#256D3C] px-4 text-sm font-semibold text-white"
              >
                Abrir Qualificação Atualizada
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-[#DDE5DF] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[#17211B]">
            Histórico De Links
          </h2>
          <button
            type="button"
            onClick={() => load()}
            className="text-sm font-semibold text-[#256D3C]"
          >
            Atualizar
          </button>
        </div>

        {loading ? (
          <p className="mt-5 text-sm">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="mt-5 text-sm text-[#6F7B73]">Nenhum link criado.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-[#E0E7E2] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-[#17211B]">
                        {STATUS[item.status]}
                      </strong>
                      <span className="rounded-full bg-[#F0F4F1] px-2 py-1 text-xs text-[#5B665F]">
                        Token final: {item.tokenHint}
                      </span>
                      {item.importedAt ? (
                        <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                          Importado Em {formatDate(item.importedAt)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-[#5B665F]">
                      Criado em {formatDate(item.createdAt)} · expira em{" "}
                      {formatDate(item.expiresAt)}
                    </p>
                    {item.respondentName ? (
                      <p className="mt-1 text-sm">
                        Respondente: {item.respondentName}
                        {item.respondentEmail
                          ? ` · ${item.respondentEmail}`
                          : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-[#7A847D]">
                      Aberto: {formatDate(item.openedAt)} · iniciado:{" "}
                      {formatDate(item.startedAt)} · concluído:{" "}
                      {formatDate(item.completedAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.status === "ACTIVE" ? (
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => action(item.id, "REVOKE")}
                        className="min-h-10 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700"
                      >
                        Revogar
                      </button>
                    ) : null}

                    {item.status === "COMPLETED" && !item.importedAt ? (
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => setPendingImportId(item.id)}
                        className="min-h-10 rounded-xl bg-[#256D3C] px-3 text-sm font-semibold text-white"
                      >
                        Importar Para Qualificação
                      </button>
                    ) : null}

                    {item.importedAt ? (
                      <Link
                        href={`/elogest/comercial/${leadId}/qualificacao`}
                        className="inline-flex min-h-10 items-center rounded-xl border border-[#256D3C] px-3 text-sm font-semibold text-[#256D3C]"
                      >
                        Revisar Qualificação
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
