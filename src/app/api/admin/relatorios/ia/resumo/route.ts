import { handleReportsAiSummaryRequest } from "@/lib/ai/reports-operational-ai";

export async function POST(request: Request) {
  return handleReportsAiSummaryRequest(request);
}
