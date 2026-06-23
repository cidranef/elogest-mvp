import DiagnosisForm from "./DiagnosisForm";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ token: string }> };

export default async function CommercialDiagnosisPage({ params }: Props) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-[#F4F7F4] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-[#256D3C]">EloGest</div>
          <p className="mt-1 text-sm text-[#67736B]">Gestão Condominial Conectada</p>
        </div>
        <DiagnosisForm token={token} />
      </div>
    </main>
  );
}
