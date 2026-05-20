/* =========================================================
   ELOGEST - TEMPLATES DE WHATSAPP

   ETAPA 42.10:
   Templates curtos e objetivos para notificações via WhatsApp.

   Esta camada NÃO envia mensagens.
   Apenas monta o texto que será entregue ao serviço:
   src/lib/whatsapp.ts

   A ideia é manter mensagens diferentes do e-mail:
   - mais curtas;
   - diretas;
   - adequadas ao WhatsApp;
   - com linguagem humanizada.
   ========================================================= */



/* =========================================================
   TIPOS
   ========================================================= */

export interface WhatsAppTemplateInput {
  eventType: string;

  recipientName?: string | null;

  ticketId?: string | null;
  ticketTitle?: string | null;
  ticketStatus?: string | null;
  ticketPriority?: string | null;

  condominiumName?: string | null;
  unitLabel?: string | null;

  actorName?: string | null;
  comment?: string | null;

  appUrl?: string | null;
}



/* =========================================================
   HELPERS
   ========================================================= */

function safeText(value: string | null | undefined, fallback = "") {
  const text = value?.trim();

  if (!text) return fallback;

  return text;
}



function greeting(name?: string | null) {
  const safeName = safeText(name);

  if (!safeName) {
    return "Olá.";
  }

  return `Olá, ${safeName}.`;
}



function getAppUrl(input: WhatsAppTemplateInput) {
  return (
    safeText(input.appUrl) ||
    safeText(process.env.APP_URL) ||
    safeText(process.env.NEXTAUTH_URL) ||
    "Acesse a plataforma EloGest."
  );
}



function ticketLine(input: WhatsAppTemplateInput) {
  const title = safeText(input.ticketTitle, "um chamado");

  return `Chamado: ${title}`;
}



function locationLine(input: WhatsAppTemplateInput) {
  const condominium = safeText(input.condominiumName);
  const unit = safeText(input.unitLabel);

  if (condominium && unit) {
    return `Local: ${condominium} — ${unit}`;
  }

  if (condominium) {
    return `Condomínio: ${condominium}`;
  }

  if (unit) {
    return `Unidade: ${unit}`;
  }

  return "";
}



function footer(input: WhatsAppTemplateInput) {
  const appUrl = getAppUrl(input);

  if (appUrl.startsWith("http")) {
    return `Acompanhe pelo EloGest: ${appUrl}`;
  }

  return appUrl;
}



function buildDefaultMessage(input: WhatsAppTemplateInput) {
  const lines = [
    greeting(input.recipientName),
    "",
    "Você recebeu uma nova notificação no EloGest.",
    ticketLine(input),
    locationLine(input),
    "",
    footer(input),
  ];

  return lines.filter((line) => line !== "").join("\n");
}



/* =========================================================
   LABELS DE STATUS
   ========================================================= */

function statusLabel(status?: string | null) {
  switch (status) {
    case "OPEN":
      return "Aberto";

    case "IN_PROGRESS":
      return "Em atendimento";

    case "RESOLVED":
      return "Resolvido";

    case "CANCELED":
      return "Cancelado";

    default:
      return safeText(status, "Atualizado");
  }
}



/* =========================================================
   TEMPLATE PRINCIPAL
   ========================================================= */

export function buildNotificationWhatsAppMessage(
  input: WhatsAppTemplateInput
) {
  const eventType = input.eventType;

  switch (eventType) {
    case "TICKET_CREATED":
    case "TICKET_CREATED_BY_PORTAL":
    case "TICKET_OPENED":
      return [
        greeting(input.recipientName),
        "",
        "Um novo chamado foi aberto no EloGest.",
        ticketLine(input),
        locationLine(input),
        "",
        footer(input),
      ]
        .filter((line) => line !== "")
        .join("\n");

    case "TICKET_COMMENT_PUBLIC":
    case "TICKET_PUBLIC_COMMENT":
    case "COMMENT_PUBLIC":
      return [
        greeting(input.recipientName),
        "",
        "Seu chamado recebeu uma nova resposta pública.",
        ticketLine(input),
        input.actorName ? `Respondido por: ${input.actorName}` : "",
        "",
        footer(input),
      ]
        .filter((line) => line !== "")
        .join("\n");

    case "TICKET_ASSIGNED":
    case "TICKET_ASSIGNED_PUBLIC":
      return [
        greeting(input.recipientName),
        "",
        "O responsável pelo atendimento do chamado foi atualizado.",
        ticketLine(input),
        locationLine(input),
        "",
        footer(input),
      ]
        .filter((line) => line !== "")
        .join("\n");

    case "TICKET_STATUS_CHANGED":
    case "STATUS_CHANGED":
      return [
        greeting(input.recipientName),
        "",
        `O status do chamado foi atualizado para: ${statusLabel(
          input.ticketStatus
        )}.`,
        ticketLine(input),
        locationLine(input),
        "",
        footer(input),
      ]
        .filter((line) => line !== "")
        .join("\n");

    case "TICKET_RESOLVED":
    case "RESOLVED":
      return [
        greeting(input.recipientName),
        "",
        "O chamado foi marcado como resolvido.",
        ticketLine(input),
        locationLine(input),
        "",
        "Caso necessário, acesse o EloGest para acompanhar os detalhes.",
        footer(input),
      ]
        .filter((line) => line !== "")
        .join("\n");

    case "TICKET_CANCELED":
    case "CANCELED":
      return [
        greeting(input.recipientName),
        "",
        "O chamado foi cancelado.",
        ticketLine(input),
        locationLine(input),
        "",
        footer(input),
      ]
        .filter((line) => line !== "")
        .join("\n");

    case "PASSWORD_RESET":
    case "AUTH_PASSWORD_RESET":
      return [
        greeting(input.recipientName),
        "",
        "Recebemos uma solicitação de redefinição de senha no EloGest.",
        "Por segurança, utilize o link enviado por e-mail para continuar.",
        "",
        footer(input),
      ]
        .filter((line) => line !== "")
        .join("\n");

    default:
      return buildDefaultMessage(input);
  }
}