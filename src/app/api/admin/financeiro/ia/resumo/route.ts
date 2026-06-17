import { handleFinancialAiSummaryRequest } from "@/lib/ai/financial-operational-ai";

export async function POST(request: Request) {
  return handleFinancialAiSummaryRequest(request);
}
