"use client";

import { useMemo, useState } from "react";

export type OperationalAnnouncementAiContext = {
  title: string;
  content: string;
  type: string;
  priority: string;
  targetScope: string;
  condominiumName?: string | null;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  expiresAt?: string | null;
  requireReadingConfirmation?: boolean;
};

type OperationalAnnouncementAiResult = {
  ok?: boolean;
  moduleEnabled?: boolean;
  aiEnabled?: boolean;
  provider?: string;
  message?: string;
  title?: string | null;
  content?: string | null;
  output?: string | null;
};

type AssistantAction = "improve" | "summary" | "reminder";

type AssistantState = {
  action: AssistantAction | null;
  loading: boolean;
  error: string;
  result: OperationalAnnouncementAiResult | null;
};

const ACTION_ENDPOINTS: Record<AssistantAction, string> = {
  improve: "/api/admin/comunicados/ia/melhorar",
  summary: "/api/admin/comunicados/ia/resumir",
  reminder: "/api/admin/comunicados/ia/lembrete",
};

const ACTION_LABELS: Record<AssistantAction, string> = {
  improve: "Melhorar Com IA",
  summary: "Gerar Versão Resumida",
  reminder: "Gerar Lembrete Para Não Lidos",
};

async function readApiJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return res.json();
  }

  const text = await res.text();

  throw new Error(
    `Resposta inesperada da API. HTTP ${res.status}. ${text.slice(0, 180)}`,
  );
}

export default function OperationalAnnouncementAiAssistant({
  context,
  onApplySuggestion,
}: {
  context: OperationalAnnouncementAiContext;
  onApplySuggestion: (suggestion: { title?: string | null; content?: string | null }) => void;
}) {
  const [state, setState] = useState<AssistantState>({
    action: null,
    loading: false,
    error: "",
    result: null,
  });

  const hasMinimumContent = useMemo(() => {
    return context.title.trim().length >= 3 || context.content.trim().length >= 10;
  }, [context.content, context.title]);

  async function runAction(action: AssistantAction) {
    if (!hasMinimumContent) {
      setState({
        action,
        loading: false,
        error: "Informe pelo menos um título ou conteúdo inicial para usar a IA.",
        result: null,
      });
      return;
    }

    try {
      setState({
        action,
        loading: true,
        error: "",
        result: null,
      });

      const res = await fetch(ACTION_ENDPOINTS[action], {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(context),
      });

      const data = (await readApiJson(res)) as OperationalAnnouncementAiResult;

      if (!res.ok) {
        setState({
          action,
          loading: false,
          error: data?.message || "Não foi possível gerar a sugestão com IA.",
          result: null,
        });
        return;
      }

      setState({
        action,
        loading: false,
        error: "",
        result: data,
      });
    } catch (error) {
      console.error(error);
      setState({
        action,
        loading: false,
        error: "Erro ao acionar o assistente de IA para comunicados.",
        result: null,
      });
    }
  }

  async function copyResult() {
    const text = [state.result?.title, state.result?.content || state.result?.output]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!text) return;

    await navigator.clipboard.writeText(text);
  }

  const currentContent = state.result?.content || state.result?.output || "";
  const canApply = Boolean(state.result?.title || state.result?.content || state.result?.output);

  return (
    <section className="md:col-span-2 rounded-[24px] border border-[#CFE6D4] bg-[#F6FFF8] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
            Assistente De Redação
          </p>

          <h3 className="mt-1 text-lg font-semibold text-[#17211B]">
            IA Para Comunicados
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
            Gere sugestões de texto para revisão humana. A IA não publica, agenda ou envia comunicados automaticamente.
          </p>
        </div>

        <span className="inline-flex w-fit rounded-full border border-[#CFE6D4] bg-white px-3 py-1 text-xs font-bold text-[#256D3C]">
          Revisão Obrigatória
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => void runAction("improve")}
          disabled={state.loading}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-xs font-bold text-white transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.loading && state.action === "improve" ? "Gerando..." : ACTION_LABELS.improve}
        </button>

        <button
          type="button"
          onClick={() => void runAction("summary")}
          disabled={state.loading}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-white px-4 text-xs font-bold text-[#256D3C] transition hover:border-[#256D3C] hover:bg-[#F9FBFA] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.loading && state.action === "summary" ? "Gerando..." : ACTION_LABELS.summary}
        </button>

        <button
          type="button"
          onClick={() => void runAction("reminder")}
          disabled={state.loading}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-xs font-bold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.loading && state.action === "reminder" ? "Gerando..." : ACTION_LABELS.reminder}
        </button>
      </div>

      {state.error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {state.error}
        </div>
      )}

      {state.result && (
        <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7A877F]">
                Sugestão Gerada
              </p>

              <p className="mt-1 text-xs font-semibold text-[#5E6B63]">
                {state.result.message || "Texto gerado para revisão da administradora."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyResult()}
                className="inline-flex h-9 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-3 text-xs font-bold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Copiar
              </button>

              {canApply && (
                <button
                  type="button"
                  onClick={() =>
                    onApplySuggestion({
                      title: state.result?.title || null,
                      content: state.result?.content || state.result?.output || null,
                    })
                  }
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#256D3C] px-3 text-xs font-bold text-white transition hover:bg-[#174B2A]"
                >
                  Usar No Comunicado
                </button>
              )}
            </div>
          </div>

          {state.result.title && (
            <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                Título Sugerido
              </p>

              <p className="mt-1 text-sm font-semibold text-[#17211B]">
                {state.result.title}
              </p>
            </div>
          )}

          {currentContent && (
            <div className="mt-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">
                Texto Sugerido
              </p>

              <p className="mt-2 whitespace-pre-line text-sm font-medium leading-6 text-[#17211B]">
                {currentContent}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
