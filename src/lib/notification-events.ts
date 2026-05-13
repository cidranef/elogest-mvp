/* =========================================================
   ETAPA 25.1 - MATRIZ DE EVENTOS DE NOTIFICAÇÃO

   Este arquivo centraliza a configuração dos eventos que podem
   gerar notificações no EloGest.

   Objetivo:
   - preparar o sistema para notificações externas futuras;
   - manter controle dos canais por evento;
   - evitar regras espalhadas pelas rotas;
   - permitir evoluir para e-mail e WhatsApp sem refatorar tudo.

   ETAPA 35.7.4:
   - Adicionado evento TICKET_ASSIGNED_PUBLIC.
   - Esse evento é usado quando a administradora define um responsável
     e o morador/criador precisa ser avisado de forma amigável.
   - Diferença importante:
     TICKET_ASSIGNED        -> notificação operacional para o responsável.
     TICKET_ASSIGNED_PUBLIC -> notificação pública para o morador/criador.

   ETAPA 40.4 — AUDITORIA DAS NOTIFICAÇÕES E CENTRAL DE NOTIFICAÇÕES

   Ajustes:
   - TICKET_INTERNAL_COMMENT usa label "Comunicado interno".
   - Descrição deixa explícito que é comunicação exclusiva entre
     usuários da administradora.
   - Mantida separação entre:
     TICKET_ASSIGNED         -> operacional;
     TICKET_ASSIGNED_PUBLIC  -> público para morador/criador;
     TICKET_INTERNAL_COMMENT -> interno da administradora.

   ETAPA 42.3.4 — ATIVAÇÃO DE E-MAIL PARA EVENTOS DE CHAMADOS

   Ajustes desta revisão:
   - EMAIL passa a ficar ativo em enabledChannels para eventos de
     chamados já preparados para envio externo.
   - WHATSAPP permanece apenas como canal futuro em availableChannels,
     sem entrar em enabledChannels.
   - GENERAL, EMAIL_PENDING e WHATSAPP_PENDING continuam somente SYSTEM.
   - A tela de preferências passa a reconhecer E-mail como canal
     disponível agora nos eventos de chamados.
   ========================================================= */



/* =========================================================
   CANAIS DISPONÍVEIS
   ========================================================= */

export type NotificationChannel = "SYSTEM" | "EMAIL" | "WHATSAPP";



/* =========================================================
   TIPOS DE EVENTOS DE NOTIFICAÇÃO

   Estes nomes precisam conversar com os tipos já usados no
   módulo de notificações internas.
   ========================================================= */

export type NotificationEventType =
  | "GENERAL"
  | "TICKET_CREATED"
  | "TICKET_ASSIGNED"
  | "TICKET_ASSIGNED_PUBLIC"
  | "TICKET_PUBLIC_COMMENT"
  | "TICKET_INTERNAL_COMMENT"
  | "TICKET_STATUS_CHANGED"
  | "TICKET_RESOLVED"
  | "TICKET_RATED"
  | "EMAIL_PENDING"
  | "WHATSAPP_PENDING";



/* =========================================================
   CONFIGURAÇÃO DE UM EVENTO
   ========================================================= */

export interface NotificationEventConfig {
  type: NotificationEventType;

  label: string;

  description: string;

  /*
    Canais que o evento poderá usar.
    WHATSAPP pode aparecer aqui como canal futuro.
  */
  availableChannels: NotificationChannel[];

  /*
    Canais ativos neste momento do MVP.
    Nesta etapa, SYSTEM e EMAIL ficam ativos para eventos de chamados.
    WHATSAPP permanece fora até a integração própria.
  */
  enabledChannels: NotificationChannel[];

  /*
    Define se o evento é importante o suficiente para disparar
    comunicação externa.
  */
  externalReady: boolean;

  /*
    Define se o evento deve respeitar preferências do usuário.
  */
  userPreferenceEnabled: boolean;
}



/* =========================================================
   HELPERS INTERNOS DA MATRIZ

   Mantemos arrays centralizados para reduzir risco de divergência
   entre eventos.
   ========================================================= */

const SYSTEM_ONLY: NotificationChannel[] = ["SYSTEM"];

const SYSTEM_AND_EMAIL: NotificationChannel[] = ["SYSTEM", "EMAIL"];

const SYSTEM_EMAIL_WHATSAPP_AVAILABLE: NotificationChannel[] = [
  "SYSTEM",
  "EMAIL",
  "WHATSAPP",
];



/* =========================================================
   MATRIZ PRINCIPAL DE EVENTOS

   Regra atual:
   - Eventos de chamados: SYSTEM + EMAIL ativos.
   - WHATSAPP: disponível como futuro quando fizer sentido,
     mas ainda não ativo.
   - Eventos técnicos/pendentes: apenas SYSTEM.
   ========================================================= */

export const NOTIFICATION_EVENTS: Record<
  NotificationEventType,
  NotificationEventConfig
> = {
  GENERAL: {
    type: "GENERAL",
    label: "Geral",
    description: "Notificação geral do sistema.",
    availableChannels: SYSTEM_ONLY,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: false,
  },

  TICKET_CREATED: {
    type: "TICKET_CREATED",
    label: "Chamado criado",
    description:
      "Gerada quando um novo chamado é aberto pela administradora, síndico, morador ou proprietário.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP_AVAILABLE,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_ASSIGNED: {
    type: "TICKET_ASSIGNED",
    label: "Chamado atribuído",
    description:
      "Gerada quando um chamado é atribuído a um responsável operacional.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP_AVAILABLE,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_ASSIGNED_PUBLIC: {
    type: "TICKET_ASSIGNED_PUBLIC",
    label: "Responsável definido",
    description:
      "Gerada quando um responsável é definido e o morador ou criador do chamado precisa ser avisado de forma pública e amigável.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP_AVAILABLE,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_PUBLIC_COMMENT: {
    type: "TICKET_PUBLIC_COMMENT",
    label: "Resposta pública",
    description:
      "Gerada quando uma mensagem pública é adicionada ao chamado e pode ser vista pelo portal.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP_AVAILABLE,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_INTERNAL_COMMENT: {
    type: "TICKET_INTERNAL_COMMENT",
    label: "Comunicado interno",
    description:
      "Gerada quando uma comunicação interna exclusiva da administradora é adicionada ao chamado.",
    availableChannels: SYSTEM_AND_EMAIL,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_STATUS_CHANGED: {
    type: "TICKET_STATUS_CHANGED",
    label: "Status alterado",
    description:
      "Gerada quando o status de um chamado é alterado.",
    availableChannels: SYSTEM_AND_EMAIL,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_RESOLVED: {
    type: "TICKET_RESOLVED",
    label: "Chamado resolvido",
    description:
      "Gerada quando um chamado é finalizado como resolvido.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP_AVAILABLE,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_RATED: {
    type: "TICKET_RATED",
    label: "Chamado avaliado",
    description:
      "Gerada quando o morador, proprietário ou perfil permitido avalia o atendimento de um chamado resolvido.",
    availableChannels: SYSTEM_AND_EMAIL,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  EMAIL_PENDING: {
    type: "EMAIL_PENDING",
    label: "E-mail pendente",
    description:
      "Registro interno para eventos que futuramente deverão gerar e-mail.",
    availableChannels: SYSTEM_AND_EMAIL,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: false,
  },

  WHATSAPP_PENDING: {
    type: "WHATSAPP_PENDING",
    label: "WhatsApp pendente",
    description:
      "Registro interno para eventos que futuramente deverão gerar WhatsApp.",
    availableChannels: ["SYSTEM", "WHATSAPP"],
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: false,
  },
};



/* =========================================================
   FUNÇÕES AUXILIARES
   ========================================================= */

export function getNotificationEventConfig(type?: string | null) {
  const eventType = String(type || "GENERAL") as NotificationEventType;

  return NOTIFICATION_EVENTS[eventType] || NOTIFICATION_EVENTS.GENERAL;
}



export function getNotificationEventLabel(type?: string | null) {
  return getNotificationEventConfig(type).label;
}



export function getNotificationEnabledChannels(type?: string | null) {
  return getNotificationEventConfig(type).enabledChannels;
}



export function getNotificationAvailableChannels(type?: string | null) {
  return getNotificationEventConfig(type).availableChannels;
}



export function isNotificationExternalReady(type?: string | null) {
  return getNotificationEventConfig(type).externalReady;
}



export function shouldRespectUserNotificationPreference(type?: string | null) {
  return getNotificationEventConfig(type).userPreferenceEnabled;
}



/* =========================================================
   LISTAGEM PARA TELAS ADMINISTRATIVAS FUTURAS

   Poderemos usar isso depois em:
   - tela de preferências do usuário;
   - painel da administradora;
   - configuração de quais eventos disparam e-mail/WhatsApp.
   ========================================================= */

export function listNotificationEvents() {
  return Object.values(NOTIFICATION_EVENTS);
}
