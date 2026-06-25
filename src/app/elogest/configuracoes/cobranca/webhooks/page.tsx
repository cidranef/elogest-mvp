import EloGestShell from "@/components/EloGestShell";
import { BillingWebhooksClient } from "@/components/elogest/cobranca/billing-webhooks-client";

export default function EloGestBillingWebhooksPage() {
  return (
    <EloGestShell current="configuracoes">
      <BillingWebhooksClient />
    </EloGestShell>
  );
}
