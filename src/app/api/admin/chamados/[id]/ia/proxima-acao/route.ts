import { handleTicketOperationalAiRequest } from "@/lib/ai/ticket-operational-ai";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return handleTicketOperationalAiRequest(id, {
    actionType: "next_action",
    logAction: "TICKET_NEXT_ACTION",
    title: "Próxima Ação Recomendada",
  });
}
