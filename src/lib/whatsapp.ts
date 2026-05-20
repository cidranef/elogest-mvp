/* =========================================================
   ELOGEST - WHATSAPP SERVICE

   ETAPA 42.10:
   Camada inicial para notificações por WhatsApp.

   ETAPA 42.10.3 — REVISÃO PARA DEV / RAILWAY / PRODUÇÃO

   Objetivos:
   - Manter funcionamento em modo dev local.
   - Evitar envio real acidental em produção.
   - Padronizar variáveis usadas pelo módulo:
       WHATSAPP_NOTIFICATIONS_ENABLED
       WHATSAPP_PROVIDER
       WHATSAPP_DEV_LOGS
       WHATSAPP_AUTO_DISPATCH_ENABLED
   - Manter compatibilidade com WHATSAPP_ENABLED, caso exista.
   - Preparar estrutura para futura integração com provedor real.

   ETAPA 42.10.6.2 — PREPARAÇÃO TÉCNICA PARA PROVEDOR REAL

   Ajustes:
   - Tipagem central de provedores aceitos.
   - Normalização segura do provider.
   - Separação clara entre:
       dev
       meta
       zapi
       twilio
       custom
   - Blocos futuros preparados sem envio real.
   - Proteção reforçada contra envio acidental.
   - Logs mais claros quando provider real for informado.
   - Modo dev preservado exatamente como já funcionava.

   ETAPA 42.10.7 — META WHATSAPP CLOUD API EM MODO SEGURO

   Ajustes desta revisão:
   - Provider meta passa a ter estrutura real de integração.
   - Envio real continua bloqueado por padrão.
   - Só envia se:
       WHATSAPP_PROVIDER=meta
       WHATSAPP_REAL_SEND_ENABLED=true
       WHATSAPP_META_ACCESS_TOKEN estiver definido
       WHATSAPP_META_PHONE_NUMBER_ID estiver definido
   - Valida variáveis obrigatórias antes do envio.
   - Não exibe token nos logs.
   - Retorna messageId da Meta quando disponível.
   - Mantém stubs seguros para zapi, twilio e custom.

   Variáveis para Meta:
   - WHATSAPP_PROVIDER=meta
   - WHATSAPP_REAL_SEND_ENABLED=false
   - WHATSAPP_META_ACCESS_TOKEN=
   - WHATSAPP_META_PHONE_NUMBER_ID=
   - WHATSAPP_META_API_VERSION=v21.0

   Importante:
   - Nesta primeira implementação Meta usamos mensagem de texto.
   - Para produção com mensagens proativas, provavelmente vamos evoluir
     para templates utilitários aprovados.
   ========================================================= */



/* =========================================================
   TIPOS
   ========================================================= */

export type WhatsAppProvider =
  | "dev"
  | "meta"
  | "zapi"
  | "twilio"
  | "custom"
  | "unknown";



export interface SendWhatsAppMessageInput {
  to: string | null | undefined;
  message: string;
  eventType?: string;
  recipientName?: string | null;
  ticketId?: string | null;
}



export interface SendWhatsAppMessageResult {
  ok: boolean;
  mode: "dev" | "disabled" | "real";
  skipped?: boolean;
  reason?: string;
  provider?: WhatsAppProvider;
  messageId?: string | null;
  raw?: unknown;
}



type MetaWhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
};



/* =========================================================
   CONFIGURAÇÕES
   ========================================================= */

function isProduction() {
  return process.env.NODE_ENV === "production";
}



function readBooleanEnv(value: string | undefined, defaultValue: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;

  return defaultValue;
}



/*
  Canal WhatsApp habilitado globalmente.

  Variável principal:
  - WHATSAPP_NOTIFICATIONS_ENABLED

  Compatibilidade:
  - WHATSAPP_ENABLED

  Regra:
  - se WHATSAPP_NOTIFICATIONS_ENABLED estiver definida, ela manda;
  - senão, usamos WHATSAPP_ENABLED;
  - se nenhuma estiver definida, em dev deixamos true para facilitar testes;
  - em produção, se nenhuma estiver definida, deixamos false.
*/
export function isWhatsAppEnabled() {
  if (process.env.WHATSAPP_NOTIFICATIONS_ENABLED !== undefined) {
    return readBooleanEnv(process.env.WHATSAPP_NOTIFICATIONS_ENABLED, false);
  }

  if (process.env.WHATSAPP_ENABLED !== undefined) {
    return readBooleanEnv(process.env.WHATSAPP_ENABLED, false);
  }

  return !isProduction();
}



export function getWhatsAppProvider(): WhatsAppProvider {
  const provider = String(process.env.WHATSAPP_PROVIDER || "dev")
    .trim()
    .toLowerCase();

  if (provider === "dev") return "dev";
  if (provider === "meta") return "meta";
  if (provider === "zapi") return "zapi";
  if (provider === "twilio") return "twilio";
  if (provider === "custom") return "custom";

  return "unknown";
}



function getRawWhatsAppProvider() {
  return String(process.env.WHATSAPP_PROVIDER || "dev")
    .trim()
    .toLowerCase();
}



function shouldLogDevWhatsApp() {
  /*
    Em desenvolvimento local:
    - padrão true.

    Em produção/Railway:
    - padrão false.

    Para controlar explicitamente:
    - WHATSAPP_DEV_LOGS=true
    - WHATSAPP_DEV_LOGS=false
  */
  if (process.env.WHATSAPP_DEV_LOGS !== undefined) {
    return readBooleanEnv(process.env.WHATSAPP_DEV_LOGS, false);
  }

  return !isProduction();
}



/*
  Envio real.

  Segurança:
  - padrão sempre false;
  - só ativa se WHATSAPP_REAL_SEND_ENABLED=true;
  - mesmo ativo, cada provider valida suas credenciais.
*/
function isRealSendAllowed() {
  return readBooleanEnv(process.env.WHATSAPP_REAL_SEND_ENABLED, false);
}



function getMetaWhatsAppConfig(): {
  ok: true;
  config: MetaWhatsAppConfig;
} | {
  ok: false;
  reason: string;
} {
  const accessToken = String(process.env.WHATSAPP_META_ACCESS_TOKEN || "").trim();
  const phoneNumberId = String(
    process.env.WHATSAPP_META_PHONE_NUMBER_ID || ""
  ).trim();

  const apiVersion = String(
    process.env.WHATSAPP_META_API_VERSION || "v21.0"
  ).trim();

  if (!accessToken) {
    return {
      ok: false,
      reason: "WHATSAPP_META_ACCESS_TOKEN não configurado.",
    };
  }

  if (!phoneNumberId) {
    return {
      ok: false,
      reason: "WHATSAPP_META_PHONE_NUMBER_ID não configurado.",
    };
  }

  if (!apiVersion) {
    return {
      ok: false,
      reason: "WHATSAPP_META_API_VERSION não configurado.",
    };
  }

  return {
    ok: true,
    config: {
      accessToken,
      phoneNumberId,
      apiVersion,
    },
  };
}



/* =========================================================
   NORMALIZAÇÃO DE TELEFONE
   ========================================================= */

export function normalizeBrazilianPhone(phone: string | null | undefined) {
  if (!phone) return null;

  const onlyNumbers = phone.replace(/\D/g, "");

  if (!onlyNumbers) return null;



  /*
    Casos esperados:

    11999999999      -> 5511999999999
    5511999999999    -> 5511999999999
    +55 11 99999...  -> 5511999999999
  */
  if (onlyNumbers.startsWith("55")) {
    return onlyNumbers;
  }



  /*
    Telefones brasileiros com DDD normalmente têm 10 ou 11 dígitos.
  */
  if (onlyNumbers.length === 10 || onlyNumbers.length === 11) {
    return `55${onlyNumbers}`;
  }



  /*
    Se não conseguir garantir o padrão, retorna como está,
    mas ainda sem caracteres especiais.
  */
  return onlyNumbers;
}



export function maskPhoneForLog(phone: string | null | undefined) {
  if (!phone) return "telefone não informado";

  const normalized = normalizeBrazilianPhone(phone);

  if (!normalized || normalized.length < 6) {
    return "telefone inválido";
  }

  const start = normalized.slice(0, 4);
  const end = normalized.slice(-4);

  return `${start}********${end}`;
}



/* =========================================================
   RESULTADOS PADRONIZADOS
   ========================================================= */

function skipped(
  reason: string,
  provider: WhatsAppProvider = getWhatsAppProvider()
): SendWhatsAppMessageResult {
  return {
    ok: true,
    mode: "disabled",
    skipped: true,
    reason,
    provider,
  };
}



function failedReal(
  reason: string,
  provider: WhatsAppProvider = getWhatsAppProvider(),
  raw?: unknown
): SendWhatsAppMessageResult {
  return {
    ok: false,
    mode: "real",
    skipped: true,
    reason,
    provider,
    raw,
  };
}



/* =========================================================
   LOG DEV
   ========================================================= */

function logDevWhatsAppMessage({
  input,
  normalizedPhone,
  provider,
}: {
  input: SendWhatsAppMessageInput;
  normalizedPhone: string;
  provider: WhatsAppProvider;
}) {
  console.info("\n==================================================");
  console.info("[WHATSAPP DEV] Mensagem simulada");
  console.info("==================================================");
  console.info("Evento:", input.eventType || "não informado");
  console.info("Destinatário:", input.recipientName || "não informado");
  console.info("Telefone:", maskPhoneForLog(normalizedPhone));
  console.info("Ticket ID:", input.ticketId || "não informado");
  console.info("Ambiente:", process.env.NODE_ENV || "não informado");
  console.info("Provedor:", provider);
  console.info("--------------------------------------------------");
  console.info(input.message);
  console.info("==================================================\n");
}



/* =========================================================
   LOG DE PROVEDOR REAL BLOQUEADO
   ========================================================= */

function logRealProviderBlocked({
  input,
  normalizedPhone,
  provider,
  reason,
}: {
  input: SendWhatsAppMessageInput;
  normalizedPhone: string;
  provider: WhatsAppProvider;
  reason: string;
}) {
  console.warn("[WHATSAPP] Envio real bloqueado.", {
    provider,
    rawProvider: getRawWhatsAppProvider(),
    reason,
    eventType: input.eventType || null,
    recipientName: input.recipientName || null,
    phone: maskPhoneForLog(normalizedPhone),
    ticketId: input.ticketId || null,
    environment: process.env.NODE_ENV || null,
  });
}



/* =========================================================
   LOG DE ERRO REAL

   Nunca logar token ou credenciais.
   ========================================================= */

function logRealProviderError({
  input,
  normalizedPhone,
  provider,
  status,
  response,
}: {
  input: SendWhatsAppMessageInput;
  normalizedPhone: string;
  provider: WhatsAppProvider;
  status?: number | null;
  response?: unknown;
}) {
  console.error("[WHATSAPP] Falha no envio real.", {
    provider,
    status: status || null,
    eventType: input.eventType || null,
    recipientName: input.recipientName || null,
    phone: maskPhoneForLog(normalizedPhone),
    ticketId: input.ticketId || null,
    environment: process.env.NODE_ENV || null,
    response,
  });
}



/* =========================================================
   META WHATSAPP CLOUD API
   ========================================================= */

async function sendViaMetaWhatsAppCloudApi({
  input,
  normalizedPhone,
}: {
  input: SendWhatsAppMessageInput;
  normalizedPhone: string;
}): Promise<SendWhatsAppMessageResult> {
  const provider: WhatsAppProvider = "meta";

  if (!isRealSendAllowed()) {
    logRealProviderBlocked({
      input,
      normalizedPhone,
      provider,
      reason:
        "WHATSAPP_REAL_SEND_ENABLED está false. Meta configurada, mas envio real bloqueado.",
    });

    return failedReal(
      "Meta configurada, mas envio real bloqueado por WHATSAPP_REAL_SEND_ENABLED=false.",
      provider
    );
  }

  const metaConfig = getMetaWhatsAppConfig();

  if (!metaConfig.ok) {
    logRealProviderBlocked({
      input,
      normalizedPhone,
      provider,
      reason: metaConfig.reason,
    });

    return failedReal(metaConfig.reason, provider);
  }

  const { accessToken, phoneNumberId, apiVersion } = metaConfig.config;

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;



  /*
    Primeira versão real:
    - Envio de texto simples.
    - Para produção com mensagens proativas, vamos evoluir para templates.
  */
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedPhone,
    type: "text",
    text: {
      preview_url: false,
      body: input.message,
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      logRealProviderError({
        input,
        normalizedPhone,
        provider,
        status: response.status,
        response: data,
      });

      return failedReal(
        `Meta WhatsApp Cloud API retornou erro HTTP ${response.status}.`,
        provider,
        data
      );
    }

    const messageId =
      Array.isArray(data?.messages) && data.messages[0]?.id
        ? String(data.messages[0].id)
        : null;

    console.info("[WHATSAPP] Mensagem enviada via Meta Cloud API.", {
      provider,
      messageId,
      eventType: input.eventType || null,
      recipientName: input.recipientName || null,
      phone: maskPhoneForLog(normalizedPhone),
      ticketId: input.ticketId || null,
      environment: process.env.NODE_ENV || null,
    });

    return {
      ok: true,
      mode: "real",
      skipped: false,
      provider,
      messageId,
      raw: data,
    };
  } catch (error) {
    logRealProviderError({
      input,
      normalizedPhone,
      provider,
      status: null,
      response: error instanceof Error ? error.message : error,
    });

    return failedReal(
      "Falha ao chamar Meta WhatsApp Cloud API.",
      provider,
      error instanceof Error ? error.message : error
    );
  }
}



/* =========================================================
   PROVEDORES FUTUROS — STUBS SEGUROS

   Importante:
   Estes métodos NÃO enviam mensagem real ainda.
   Eles existem apenas para deixar a arquitetura pronta.
   ========================================================= */

async function sendViaZapi({
  input,
  normalizedPhone,
}: {
  input: SendWhatsAppMessageInput;
  normalizedPhone: string;
}): Promise<SendWhatsAppMessageResult> {
  const provider: WhatsAppProvider = "zapi";

  logRealProviderBlocked({
    input,
    normalizedPhone,
    provider,
    reason: "Provider zapi reconhecido, mas integração ainda não foi implementada.",
  });

  return failedReal(
    "Provider zapi reconhecido, mas envio real ainda não implementado.",
    provider
  );
}



async function sendViaTwilioWhatsApp({
  input,
  normalizedPhone,
}: {
  input: SendWhatsAppMessageInput;
  normalizedPhone: string;
}): Promise<SendWhatsAppMessageResult> {
  const provider: WhatsAppProvider = "twilio";

  logRealProviderBlocked({
    input,
    normalizedPhone,
    provider,
    reason:
      "Provider twilio reconhecido, mas integração ainda não foi implementada.",
  });

  return failedReal(
    "Provider twilio reconhecido, mas envio real ainda não implementado.",
    provider
  );
}



async function sendViaCustomProvider({
  input,
  normalizedPhone,
}: {
  input: SendWhatsAppMessageInput;
  normalizedPhone: string;
}): Promise<SendWhatsAppMessageResult> {
  const provider: WhatsAppProvider = "custom";

  logRealProviderBlocked({
    input,
    normalizedPhone,
    provider,
    reason:
      "Provider custom reconhecido, mas integração ainda não foi implementada.",
  });

  return failedReal(
    "Provider custom reconhecido, mas envio real ainda não implementado.",
    provider
  );
}



/* =========================================================
   ENVIO PRINCIPAL
   ========================================================= */

export async function sendWhatsAppMessage(
  input: SendWhatsAppMessageInput
): Promise<SendWhatsAppMessageResult> {
  const normalizedPhone = normalizeBrazilianPhone(input.to);

  if (!normalizedPhone) {
    return skipped("Telefone do destinatário não informado.");
  }

  if (!input.message?.trim()) {
    return skipped("Mensagem de WhatsApp vazia.");
  }

  if (!isWhatsAppEnabled()) {
    return skipped("Canal WhatsApp globalmente desabilitado.");
  }

  const provider = getWhatsAppProvider();



  /* =========================================================
     PROVIDER DESCONHECIDO

     Evita que erro de digitação em WHATSAPP_PROVIDER gere
     falso positivo.
     ========================================================= */

  if (provider === "unknown") {
    logRealProviderBlocked({
      input,
      normalizedPhone,
      provider,
      reason: `WHATSAPP_PROVIDER inválido: ${getRawWhatsAppProvider()}`,
    });

    return failedReal(
      `WHATSAPP_PROVIDER inválido: ${getRawWhatsAppProvider()}`,
      provider
    );
  }



  /* =========================================================
     MODO DEV

     Regra:
     - WHATSAPP_PROVIDER=dev nunca envia mensagem real.
     - Em dev local, exibe log quando WHATSAPP_DEV_LOGS=true.
     - Em Railway/produção, se WHATSAPP_DEV_LOGS=false, não polui logs.
     ========================================================= */

  if (provider === "dev") {
    if (shouldLogDevWhatsApp()) {
      logDevWhatsAppMessage({
        input,
        normalizedPhone,
        provider,
      });
    }

    return {
      ok: true,
      mode: "dev",
      skipped: false,
      provider,
    };
  }



  /* =========================================================
     PROVEDOR META

     Primeira integração real preparada com proteção:
     - se WHATSAPP_REAL_SEND_ENABLED=false, não envia;
     - se credenciais faltarem, não envia;
     - se tudo estiver habilitado, chama Cloud API.
     ========================================================= */

  if (provider === "meta") {
    return sendViaMetaWhatsAppCloudApi({
      input,
      normalizedPhone,
    });
  }



  /* =========================================================
     OUTROS PROVEDORES

     Ainda permanecem como stubs seguros.
     ========================================================= */

  if (provider === "zapi") {
    return sendViaZapi({
      input,
      normalizedPhone,
    });
  }

  if (provider === "twilio") {
    return sendViaTwilioWhatsApp({
      input,
      normalizedPhone,
    });
  }

  if (provider === "custom") {
    return sendViaCustomProvider({
      input,
      normalizedPhone,
    });
  }



  /*
    Defesa final:
    Se algum fluxo futuro chegar aqui antes da implementação real,
    bloqueia mesmo assim.
  */
  logRealProviderBlocked({
    input,
    normalizedPhone,
    provider,
    reason: "Envio real bloqueado por defesa final.",
  });

  return failedReal(
    "Envio real de WhatsApp ainda não implementado. Canal preparado apenas em modo dev.",
    provider
  );
}