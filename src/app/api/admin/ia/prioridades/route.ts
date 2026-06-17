import { handleTicketPriorityAiRequest } from "@/lib/ai/ticket-priority-ai";

export async function GET(request: Request) {
  return handleTicketPriorityAiRequest(request);
}
