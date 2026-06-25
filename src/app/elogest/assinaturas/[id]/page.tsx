import EloGestShell from "@/components/EloGestShell";
import { AssinaturaCommercialConfigurationClient } from "@/components/elogest/assinaturas/assinatura-commercial-configuration-client";
import { AssinaturaDetailClient } from "@/components/elogest/assinaturas/assinatura-detail-client";
import { AssinaturaLifecycleClient } from "@/components/elogest/assinaturas/assinatura-lifecycle-client";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EloGestAssinaturaDetailPage({
  params,
}: PageProps) {
  const { id } = await params;

  return (
    <EloGestShell current="assinaturas">
      <div className="space-y-6">
        <AssinaturaDetailClient
          subscriptionId={id}
          commercialConfiguration={
            <AssinaturaCommercialConfigurationClient
              subscriptionId={id}
            />
          }
        />

        <AssinaturaLifecycleClient
          subscriptionId={id}
        />
      </div>
    </EloGestShell>
  );
}
