import EloGestShell from "@/components/EloGestShell";
import { BillingAutomationControlClient } from "@/components/elogest/cobranca/billing-automation-control-client";
import { CobrancaGatewayClient } from "@/components/elogest/cobranca/cobranca-gateway-client";
import { DelinquencyControlClient } from "@/components/elogest/cobranca/delinquency-control-client";
import { RecurringBillingControlClient } from "@/components/elogest/cobranca/recurring-billing-control-client";

export default function EloGestConfiguracaoCobrancaPage() {
  return (
    <EloGestShell current="configuracoes">
      <div className="space-y-6">
        <CobrancaGatewayClient />
        <DelinquencyControlClient />
        <RecurringBillingControlClient />
        <BillingAutomationControlClient />
      </div>
    </EloGestShell>
  );
}
