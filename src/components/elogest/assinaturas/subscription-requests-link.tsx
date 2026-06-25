"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function SubscriptionRequestsLink() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(
          "/api/elogest/assinaturas/solicitacoes",
          { cache: "no-store" },
        );

        if (!response.ok || !active) {
          return;
        }

        const data = (await response.json()) as {
          requests?: Array<{ status?: string }>;
        };

        const count = (data.requests ?? []).filter(
          (request) => request.status === "PENDING",
        ).length;

        setPendingCount(count);
      } catch {
        if (active) {
          setPendingCount(null);
        }
      }
    }

    void load();

    const interval = window.setInterval(() => {
      void load();
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <Link
      href="/elogest/assinaturas/solicitacoes"
      className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-bold text-[#256D3C] shadow-sm transition hover:border-[#256D3C] hover:bg-[#EAF7EE]"
    >
      Solicitações Comerciais
      {pendingCount !== null && pendingCount > 0 && (
        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
          {pendingCount}
        </span>
      )}
    </Link>
  );
}
