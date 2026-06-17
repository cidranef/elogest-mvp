"use client";

import { useMemo, useState } from "react";

type AiActionType = "summary" | "suggested_response" | "next_action";

type AiResponse = {
  ok: boolean;
  title?: string;
  content?: string;
  actionType?: AiActionType;
  aiEnabled?: boolean;
  moduleEnabled?: boolean;
  provider?: string;
  message?: string;
  error?: string;
};

type ButtonConfig = {
  type: AiActionType;
  label: string;
  description: string;
  endpoint: string;
};

const BUTTONS: ButtonConfig[] = [
  {
    type: "summary",
    label: "Resumir Chamado",
    description: "Gera uma leitura curta do histórico, status e pontos de atenção.",
    endpoint: "resumo",
  },
  {
    type: "suggested_response",
    label: "Sugerir Resposta",
    description: "Cria uma sugestão de resposta pública para revisão humana.",
    endpoint: "sugestao-resposta",
  },
  {
    type: "next_action",
    label: "Sugerir Próxima Ação",
    description: "Indica o próximo passo operacional recomendado.",
    endpoint: "proxima-acao",
  },
];

export default function OperationalTicketAiAssistant({
  ticketId,
  disabled = false,
  disabledReason,
  onUsePublicSuggestion,
}: {
  ticketId: string;
  disabled?: boolean;
  disabledReason?: string;
  onUsePublicSuggestion?: (suggestion: string) => void;
}) {
  const [loadingType, setLoadingType] = useState<AiActionType | null>(null);
  const [result, setResult] = useState<AiResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const isLoading = Boolean(loadingType);

  const currentButton = useMemo(() => {
    if (!result?.actionType) return null;

    return BUTTONS.find((button) => button.type === result.actionType) || null;
  }, [result]);

  async function readApiJson(res: Response, fallbackMessage: string) {
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return res.json();
    }

    const text = await res.text();

    console.error("Resposta inesperada da API de IA do chamado.", {
      status: res.status,
      statusText: res.statusText,
      contentType,
      preview: text.slice(0, 300),
    });

    throw new Error(`${fallbackMessage} Código HTTP: ${res.status}.`);
  }

  async function runAiAction(button: ButtonConfig) {
    if (!ticketId || disabled || isLoading) return;

    try {
      setCopied(false);
      setError("");
      setLoadingType(button.type);

      const res = await fetch(
        `/api/admin/chamados/${encodeURIComponent(ticketId)}/ia/${button.endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      const data = (await readApiJson(
        res,
        "Erro ao executar a IA Operacional do chamado.",
      )) as AiResponse;

      if (!res.ok || !data?.ok) {
        setResult(null);
        setError(
          data?.message ||
            data?.error ||
            "Não foi possível gerar a análise da IA Operacional.",
        );
        return;
      }

      setResult(data);
    } catch (err) {
      console.error(err);
      setResult(null);
      setError("Erro ao executar a IA Operacional do chamado.");
    } finally {
      setLoadingType(null);
    }
  }

  async function copyResult() {
    if (!result?.content) return;

    try {
      await navigator.clipboard.writeText(result.content);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch (err) {
      console.error(err);
      setError("Não foi possível copiar o texto gerado.");
    }
  }

  return (
    <section className="overflow-hidden rounded-[32px] border border-[#CFE6D4] bg-white shadow-sm">
      <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_58%,#EAF7EE_135%)] p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              IA Operacional
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
              Assistente Operacional Do Chamado
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
              Use a IA para resumir o chamado, sugerir uma resposta ou orientar
              a próxima ação. As sugestões devem ser revisadas antes de qualquer
              envio ou decisão operacional.
            </p>
          </div>

          <span className="inline-flex w-fit rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
            Copiloto, Não Execução Automática
          </span>
        </div>
      </div>

      <div className="p-6">
        {disabled ? (
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm leading-6 text-yellow-800">
            {disabledReason ||
              "A IA Operacional não está disponível para este perfil de acesso."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {BUTTONS.map((button) => (
              <button
                key={button.type}
                type="button"
                onClick={() => runAiAction(button)}
                disabled={isLoading}
                className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-left transition hover:border-[#256D3C]/50 hover:bg-[#EAF7EE] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-[#17211B]">
                    {button.label}
                  </p>

                  {loadingType === button.type && (
                    <span className="text-xs font-semibold text-[#256D3C]">
                      Gerando...
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {button.description}
                </p>
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {result?.content && (
          <div className="mt-6 rounded-[26px] border border-[#DDE5DF] bg-[#F9FBFA] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  {currentButton?.label || "Resultado da IA"}
                </p>

                <h3 className="mt-1 text-xl font-semibold text-[#17211B]">
                  {result.title || "Análise gerada"}
                </h3>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyResult}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  {copied ? "Copiado" : "Copiar"}
                </button>

                {result.actionType === "suggested_response" &&
                  onUsePublicSuggestion && (
                    <button
                      type="button"
                      onClick={() => onUsePublicSuggestion(result.content || "")}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
                    >
                      Usar Como Resposta
                    </button>
                  )}
              </div>
            </div>

            <div className="mt-4 whitespace-pre-line rounded-2xl border border-[#DDE5DF] bg-white p-4 text-sm leading-7 text-[#17211B]">
              {result.content}
            </div>

            <p className="mt-3 text-xs leading-5 text-[#7A877F]">
              Análise gerada com base nos dados disponíveis do chamado. Revise
              antes de enviar mensagem ao morador, alterar status ou tomar
              qualquer decisão operacional.
              {!result.aiEnabled &&
                " A geração está usando a leitura operacional segura porque a chave de IA não está configurada no ambiente."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
