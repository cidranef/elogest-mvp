import EloGestShell from "@/components/EloGestShell";
import { AssinaturasClient } from "@/components/elogest/assinaturas/assinaturas-client";
import { SubscriptionRequestsLink } from "@/components/elogest/assinaturas/subscription-requests-link";

export default function EloGestAssinaturasPage() {
  return (
    <EloGestShell
      current="assinaturas"
      actions={<SubscriptionRequestsLink />}
    >
      <AssinaturasClient />
    </EloGestShell>
  );
}
