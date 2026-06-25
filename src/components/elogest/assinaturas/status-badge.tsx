type StatusBadgeProps = {
  status: string;
};

const labels: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIALING: "Em Trial",
  EXPIRING_SOON: "Expira Em Breve",
  PAST_DUE: "Inadimplente",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
  EXPIRED: "Expirada",
  PENDING: "Pendente",
  PARTIALLY_PAID: "Parcialmente Paga",
  PAID: "Paga",
  OVERDUE: "Vencida",
  WAIVED: "Isenta",
  REFUNDED: "Devolvida",
  PENDING_CONFIRMATION: "Aguardando Conferência",
  CONFIRMED: "Confirmado",
};

const styles: Record<string, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  TRIALING: "border-blue-200 bg-blue-50 text-blue-700",
  EXPIRING_SOON: "border-amber-200 bg-amber-50 text-amber-700",
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  PENDING_CONFIRMATION: "border-amber-200 bg-amber-50 text-amber-700",
  PARTIALLY_PAID: "border-amber-200 bg-amber-50 text-amber-700",
  PAST_DUE: "border-red-200 bg-red-50 text-red-700",
  OVERDUE: "border-red-200 bg-red-50 text-red-700",
  SUSPENDED: "border-orange-200 bg-orange-50 text-orange-700",
  CANCELED: "border-slate-200 bg-slate-50 text-slate-700",
  EXPIRED: "border-slate-200 bg-slate-50 text-slate-700",
  WAIVED: "border-violet-200 bg-violet-50 text-violet-700",
  REFUNDED: "border-violet-200 bg-violet-50 text-violet-700",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        styles[status] ?? "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}
