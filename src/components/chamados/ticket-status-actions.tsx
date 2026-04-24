"use client";

import { TicketStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type TicketStatusActionsProps = {
  ticketId: string;
  currentStatus: TicketStatus;
};

export function TicketStatusActions({
  ticketId,
  currentStatus,
}: TicketStatusActionsProps) {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState<TicketStatus | null>(null);

  async function updateStatus(status: TicketStatus) {
    setLoadingStatus(status);

    try {
      const response = await fetch(`/api/admin/chamados/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Erro ao atualizar chamado.");
        return;
      }

      router.refresh();
    } catch {
      alert("Erro ao atualizar chamado.");
    } finally {
      setLoadingStatus(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {currentStatus !== "OPEN" && (
        <button
          type="button"
          disabled={!!loadingStatus}
          onClick={() => updateStatus("OPEN")}
          className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
        >
          {loadingStatus === "OPEN" ? "Atualizando..." : "Reabrir"}
        </button>
      )}

      {currentStatus !== "IN_PROGRESS" && currentStatus !== "RESOLVED" && (
        <button
          type="button"
          disabled={!!loadingStatus}
          onClick={() => updateStatus("IN_PROGRESS")}
          className="rounded-lg bg-yellow-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-yellow-700 disabled:opacity-50"
        >
          {loadingStatus === "IN_PROGRESS"
            ? "Atualizando..."
            : "Em andamento"}
        </button>
      )}

      {currentStatus !== "RESOLVED" && (
        <button
          type="button"
          disabled={!!loadingStatus}
          onClick={() => updateStatus("RESOLVED")}
          className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
        >
          {loadingStatus === "RESOLVED" ? "Atualizando..." : "Resolver"}
        </button>
      )}

      {currentStatus !== "CANCELED" && currentStatus !== "RESOLVED" && (
        <button
          type="button"
          disabled={!!loadingStatus}
          onClick={() => updateStatus("CANCELED")}
          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
        >
          {loadingStatus === "CANCELED" ? "Atualizando..." : "Cancelar"}
        </button>
      )}
    </div>
  );
}