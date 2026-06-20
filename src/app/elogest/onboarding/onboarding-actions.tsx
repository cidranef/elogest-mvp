"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/* =========================================================
   ELOGEST — ETAPA 56.10.5
   AÇÕES DE ONBOARDING E CONVERSÃO EM TRIAL
   ========================================================= */

type OnboardingActionsProps = {
  requestId: string;
  status: string;
  convertedAdminId?: string | null;
};

type ConversionMode = "ACTIVE" | "TRIAL";

async function updateOnboardingRequest(params: {
  requestId: string;
  action: "markInContact" | "approve" | "reject";
  rejectionReason?: string;
}) {
  const response = await fetch(`/api/elogest/onboarding/${params.requestId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: params.action,
      rejectionReason: params.rejectionReason,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Não foi possível atualizar a solicitação.");
  }

  return payload;
}

async function convertOnboardingRequest(params: {
  requestId: string;
  conversionMode: ConversionMode;
  trialDays?: number;
}) {
  const response = await fetch(
    `/api/elogest/onboarding/${params.requestId}/converter`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversionMode: params.conversionMode,
        trialDays: params.trialDays,
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
    administrator?: { id: string };
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Não foi possível converter a solicitação.");
  }

  return payload;
}

export default function OnboardingActions({
  requestId,
  status,
  convertedAdminId,
}: OnboardingActionsProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isConverted = status === "CONVERTED" || Boolean(convertedAdminId);
  const isRejected = status === "REJECTED";
  const canConvert = status === "APPROVED" && !isConverted;

  async function runAction(action: "markInContact" | "approve" | "reject") {
    try {
      setError(null);
      setLoadingAction(action);

      let rejectionReason: string | undefined;

      if (action === "reject") {
        const typedReason = window.prompt(
          "Informe o motivo da rejeição desta solicitação:",
        );

        if (typedReason === null) {
          return;
        }

        rejectionReason = typedReason.trim();

        if (rejectionReason.length < 5) {
          setError("Informe um motivo com pelo menos 5 caracteres.");
          return;
        }
      }

      await updateOnboardingRequest({
        requestId,
        action,
        rejectionReason,
      });

      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Não foi possível atualizar a solicitação.",
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function runConversion(conversionMode: ConversionMode) {
    try {
      setError(null);

      let trialDays: number | undefined;

      if (conversionMode === "TRIAL") {
        const typedDays = window.prompt(
          "Informe a duração do trial em dias (1 a 90):",
          "14",
        );

        if (typedDays === null) {
          return;
        }

        const parsedDays = Number(typedDays);

        if (
          !Number.isInteger(parsedDays) ||
          parsedDays < 1 ||
          parsedDays > 90
        ) {
          setError("Informe uma duração inteira entre 1 e 90 dias.");
          return;
        }

        trialDays = parsedDays;
      }

      const confirmationMessage =
        conversionMode === "TRIAL"
          ? `Converter esta solicitação em administradora com trial de ${trialDays} dias? Nenhuma senha será criada automaticamente.`
          : "Converter esta solicitação em administradora ativa? Nenhuma senha será criada automaticamente.";

      if (!window.confirm(confirmationMessage)) {
        return;
      }

      setLoadingAction(
        conversionMode === "TRIAL" ? "convertTrial" : "convertActive",
      );

      const payload = await convertOnboardingRequest({
        requestId,
        conversionMode,
        trialDays,
      });

      if (payload?.administrator?.id) {
        router.push(`/elogest/administradoras/${payload.administrator.id}`);
        router.refresh();
        return;
      }

      router.refresh();
    } catch (conversionError) {
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : "Não foi possível converter a solicitação.",
      );
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => runAction("markInContact")}
          disabled={Boolean(loadingAction) || isConverted || isRejected}
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[#DDE5DF] bg-white px-3 py-2 text-xs font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loadingAction === "markInContact" ? "Atualizando..." : "Em Contato"}
        </button>

        <button
          type="button"
          onClick={() => runAction("approve")}
          disabled={Boolean(loadingAction) || isConverted || isRejected}
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-2 text-xs font-semibold text-[#256D3C] shadow-sm transition hover:border-[#256D3C] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loadingAction === "approve" ? "Aprovando..." : "Aprovar"}
        </button>

        <button
          type="button"
          onClick={() => runAction("reject")}
          disabled={Boolean(loadingAction) || isConverted || isRejected}
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 shadow-sm transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loadingAction === "reject" ? "Rejeitando..." : "Rejeitar"}
        </button>

        {canConvert && (
          <>
            <button
              type="button"
              onClick={() => runConversion("TRIAL")}
              disabled={Boolean(loadingAction)}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loadingAction === "convertTrial"
                ? "Criando Trial..."
                : "Converter Em Trial"}
            </button>

            <button
              type="button"
              onClick={() => runConversion("ACTIVE")}
              disabled={Boolean(loadingAction)}
              className="inline-flex min-h-9 items-center justify-center rounded-xl bg-[#256D3C] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
            >
              {loadingAction === "convertActive"
                ? "Convertendo..."
                : "Converter Ativa"}
            </button>
          </>
        )}
      </div>

      {status === "APPROVED" && !isConverted && (
        <p className="text-[11px] leading-4 text-[#64736A]">
          Escolha entre trial controlado ou ativação comercial. O trial usa o
          plano de interesse; sem plano válido, utiliza Profissional e depois
          Free como fallback.
        </p>
      )}

      {isConverted && (
        <p className="text-[11px] leading-4 text-[#256D3C]">
          Solicitação convertida. O primeiro acesso administrativo deve ser
          criado com senha segura no cadastro da administradora.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
