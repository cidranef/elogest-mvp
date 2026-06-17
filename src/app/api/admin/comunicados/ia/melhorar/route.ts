import { handleAnnouncementAiRequest } from "@/lib/ai/announcement-operational-ai";

export async function POST(request: Request) {
  return handleAnnouncementAiRequest(request, "IMPROVE");
}
