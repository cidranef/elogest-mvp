import { handleTicketOperationalAiRequest } from "@/lib/ai/ticket-operational-ai";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return handleTicketOperationalAiRequest(id, {
    actionType: "summary",
    logAction: "TICKET_SUMMARY",
    title: "Resumo Do Chamado",
  });
}
