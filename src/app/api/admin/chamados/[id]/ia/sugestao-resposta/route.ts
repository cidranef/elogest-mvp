import { handleTicketOperationalAiRequest } from "@/lib/ai/ticket-operational-ai";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return handleTicketOperationalAiRequest(id, {
    actionType: "suggested_response",
    logAction: "TICKET_SUGGESTED_RESPONSE",
    title: "Sugestão De Resposta Pública",
  });
}
