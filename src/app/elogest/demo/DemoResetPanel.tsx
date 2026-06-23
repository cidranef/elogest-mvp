"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const REQUIRED_TEXT = "RESETAR DEMO";

type ResetResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  code?: string;
};

export default function DemoResetPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openModal() {
    setOpen(true);
    setConfirmation("");
    setError(null);
    setMessage(null);
  }

  function closeModal() {
    if (loading) return;

    setOpen(false);
    setConfirmation("");
    setError(null);
  }

  async function handleReset() {
    if (loading) return;

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/elogest/demo/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });

      const data = (await response.json().catch(() => null)) as
        | ResetResponse
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Não foi possível restaurar o Ambiente Demo. Consulte os logs do servidor.",
        );
      }

      setMessage(data?.message || "Ambiente Demo restaurado com sucesso.");
      setConfirmation("");
      setOpen(false);
      router.refresh();
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Não foi possível restaurar o Ambiente Demo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">
            Zona De Segurança
          </p>

          <h2 className="mt-2 text-xl font-semibold text-[#17211B]">
            Resetar Ambiente Demo
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5B665F]">
            Arquiva tecnicamente a carteira demonstrativa atual, desativa seus
            acessos e cria uma nova base limpa com os cenários oficiais. Nenhuma
            administradora normal é alterada.
          </p>
        </div>

        <button
          type="button"
          onClick={openModal}
          disabled={loading}
          className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Resetar Ambiente Demo
        </button>
      </div>

      {message && (
        <p className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {message}
        </p>
      )}

      {error && !open && (
        <p className="mt-4 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-reset-title"
        >
          <div className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="overflow-y-auto p-6">
              <h3
                id="demo-reset-title"
                className="text-xl font-semibold text-[#17211B]"
              >
                Confirmar Reset Da Demo
              </h3>

              <p className="mt-3 text-sm leading-6 text-[#5B665F]">
                A demonstração atual será retirada de operação e uma nova
                carteira limpa será criada. O processo pode levar alguns
                minutos.
              </p>

              <p className="mt-4 text-sm font-semibold text-[#17211B]">
                Digite <strong>{REQUIRED_TEXT}</strong>:
              </p>

              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={loading}
                className="mt-2 w-full rounded-2xl border border-[#CCD7CF] px-4 py-3 outline-none focus:border-[#256D3C] disabled:bg-gray-100"
                autoComplete="off"
                autoFocus
              />

              {error && (
                <div className="mt-3 max-h-40 overflow-y-auto rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-semibold text-red-800">
                    Não Foi Possível Concluir O Reset
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-red-700">
                    {error}
                  </p>
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-[#E6ECE8] bg-white p-6">
              <button
                type="button"
                onClick={closeModal}
                disabled={loading}
                className="rounded-2xl border border-[#CCD7CF] px-5 py-3 text-sm font-semibold text-[#17211B] disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={
                  loading ||
                  confirmation.trim().toUpperCase() !== REQUIRED_TEXT
                }
                className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Resetando Ambiente Demo..." : "Confirmar Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
