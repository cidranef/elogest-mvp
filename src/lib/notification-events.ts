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

   Ajustes:
   - EMAIL passa a ficar ativo em enabledChannels para eventos de
     chamados preparados para envio externo.
   - GENERAL, EMAIL_PENDING e WHATSAPP_PENDING continuam somente SYSTEM.
   - A tela de preferências passa a reconhecer E-mail como canal
     disponível agora nos eventos de chamados.

   ETAPA 42.10 — WHATSAPP EM MODO DEV

   Ajustes:
   - WHATSAPP passa a existir na matriz para eventos de chamados
     preparados para comunicação externa.
   - O envio real NÃO é ativado aqui.
   - O bloqueio de envio real continua em src/lib/whatsapp.ts.

   ETAPA 42.10.3 — MATRIZ FINAL DO WHATSAPP DEV CONTROLADO

   Ajustes desta revisão:
   - WHATSAPP fica ativo agora apenas nos eventos públicos/controlados
     já testados no fluxo real:
       TICKET_CREATED
       TICKET_ASSIGNED_PUBLIC
       TICKET_PUBLIC_COMMENT
       TICKET_RESOLVED

   - WHATSAPP fica disponível para evolução futura, mas não ativo agora,
     nos eventos:
       TICKET_ASSIGNED
       TICKET_STATUS_CHANGED

   - Eventos internos/sensíveis continuam sem WhatsApp ativo:
       TICKET_INTERNAL_COMMENT
       TICKET_RATED

   - Essa separação reduz risco antes do Railway/provedor real:
       availableChannels -> canais possíveis/futuros;
       enabledChannels   -> canais ativos agora no MVP.

   ETAPA 49 — REUNIÕES DE CONSELHO

   Ajustes desta revisão:
   - Adicionados eventos de reunião de conselho.
   - Eventos principais usam SYSTEM + EMAIL no MVP.
   - WHATSAPP fica disponível para evolução futura, mas não ativo
     automaticamente nesses eventos.
   - Confirmação/recusa de presença ficam somente internas no MVP para
     evitar excesso de e-mails.

   ETAPA 50 — ENQUETES

   Ajustes desta revisão:
   - Adicionados eventos de publicação, prorrogação de prazo e
     publicação oficial de resultados de enquetes.
   - Eventos de enquetes usam notificação interna SYSTEM no MVP.
   - EMAIL e WHATSAPP permanecem disponíveis para evolução futura,
     mas não são ativados automaticamente nesta etapa.
   - O contador de pendências no menu do portal continua independente
     da notificação interna e considera apenas enquetes abertas ainda
     não respondidas pelo perfil ativo.
   - Adicionado POLL_EXPIRED_ADMIN_REMINDER como aviso operacional interno
     para a administradora revisar enquete com prazo encerrado.

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
  | "COUNCIL_MEETING_CREATED"
  | "COUNCIL_MEETING_UPDATED"
  | "COUNCIL_MEETING_CANCELED"
  | "COUNCIL_MEETING_ROOM_OPENED"
  | "COUNCIL_MEETING_ROOM_CLOSED"
  | "COUNCIL_MEETING_RECORD_KEEPER_ASSIGNED"
  | "COUNCIL_MEETING_ATTENDANCE_CONFIRMED"
  | "COUNCIL_MEETING_ATTENDANCE_DECLINED"
  | "POLL_PUBLISHED"
  | "POLL_EXTENDED"
  | "POLL_RESULTS_PUBLISHED"
  | "POLL_EXPIRED_ADMIN_REMINDER"
  | "ASSEMBLY_CONVOCATION_PUBLISHED"
  | "ASSEMBLY_VOTING_REMINDER"
  | "ASSEMBLY_VOTING_DEADLINE_EXTENDED"
  | "ASSEMBLY_RESULTS_PUBLISHED"
  | "FINANCIAL_CHARGE_BATCH_GENERATED_ADMIN"
  | "FINANCIAL_CHARGE_AVAILABLE_PORTAL"
  | "FINANCIAL_SETTLEMENT_REGISTERED_ADMIN"
  | "FINANCIAL_PAYMENT_REGISTERED_PORTAL"
  | "FINANCIAL_SETTLEMENT_REVERSED_ADMIN"
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
    Canais que o evento poderá usar hoje ou em etapa futura.
  */
  availableChannels: NotificationChannel[];

  /*
    Canais ativos neste momento do MVP.

    Regra importante:
    - A tela de preferências usa enabledChannels para liberar switches.
    - APIs também podem usar enabledChannels para validar alterações.
    - O disparo real/simulado continua protegido em camadas adicionais.
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

const SYSTEM_EMAIL_WHATSAPP: NotificationChannel[] = [
  "SYSTEM",
  "EMAIL",
  "WHATSAPP",
];



/* =========================================================
   MATRIZ PRINCIPAL DE EVENTOS

   Regra atual:
   - SYSTEM fica ativo para todos os eventos configuráveis.
   - EMAIL fica ativo para eventos externos de chamados.
   - WHATSAPP fica ativo apenas nos eventos públicos já testados.
   - WHATSAPP pode ficar disponível em alguns eventos futuros sem
     estar habilitado agora.
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
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_EMAIL_WHATSAPP,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_ASSIGNED: {
    type: "TICKET_ASSIGNED",
    label: "Chamado atribuído",
    description:
      "Gerada quando um chamado é atribuído a um responsável operacional.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_ASSIGNED_PUBLIC: {
    type: "TICKET_ASSIGNED_PUBLIC",
    label: "Responsável definido",
    description:
      "Gerada quando um responsável é definido e o morador ou criador do chamado precisa ser avisado de forma pública e amigável.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_EMAIL_WHATSAPP,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_PUBLIC_COMMENT: {
    type: "TICKET_PUBLIC_COMMENT",
    label: "Resposta pública",
    description:
      "Gerada quando uma mensagem pública é adicionada ao chamado e pode ser vista pelo portal.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_EMAIL_WHATSAPP,
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
    description: "Gerada quando o status de um chamado é alterado.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  TICKET_RESOLVED: {
    type: "TICKET_RESOLVED",
    label: "Chamado resolvido",
    description: "Gerada quando um chamado é finalizado como resolvido.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_EMAIL_WHATSAPP,
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

  COUNCIL_MEETING_CREATED: {
    type: "COUNCIL_MEETING_CREATED",
    label: "Reunião de conselho criada",
    description:
      "Gerada quando uma nova reunião de conselho é criada ou agendada pela administradora.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  COUNCIL_MEETING_UPDATED: {
    type: "COUNCIL_MEETING_UPDATED",
    label: "Reunião de conselho alterada",
    description:
      "Gerada quando uma reunião de conselho tem dados importantes alterados.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  COUNCIL_MEETING_CANCELED: {
    type: "COUNCIL_MEETING_CANCELED",
    label: "Reunião de conselho cancelada",
    description:
      "Gerada quando uma reunião de conselho é cancelada pela administradora.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  COUNCIL_MEETING_ROOM_OPENED: {
    type: "COUNCIL_MEETING_ROOM_OPENED",
    label: "Sala da reunião aberta",
    description:
      "Gerada quando a Sala De Reunião EloGest de uma reunião de conselho é aberta.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  COUNCIL_MEETING_ROOM_CLOSED: {
    type: "COUNCIL_MEETING_ROOM_CLOSED",
    label: "Sala da reunião encerrada",
    description:
      "Gerada quando a Sala De Reunião EloGest de uma reunião de conselho é encerrada.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  COUNCIL_MEETING_RECORD_KEEPER_ASSIGNED: {
    type: "COUNCIL_MEETING_RECORD_KEEPER_ASSIGNED",
    label: "Responsável pelo registro definido",
    description:
      "Gerada quando um participante é escolhido como responsável por registrar as informações oficiais da reunião de conselho.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  COUNCIL_MEETING_ATTENDANCE_CONFIRMED: {
    type: "COUNCIL_MEETING_ATTENDANCE_CONFIRMED",
    label: "Presença confirmada",
    description:
      "Gerada quando um participante confirma presença em uma reunião de conselho.",
    availableChannels: SYSTEM_AND_EMAIL,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: true,
  },

  COUNCIL_MEETING_ATTENDANCE_DECLINED: {
    type: "COUNCIL_MEETING_ATTENDANCE_DECLINED",
    label: "Presença recusada",
    description:
      "Gerada quando um participante informa que não participará de uma reunião de conselho.",
    availableChannels: SYSTEM_AND_EMAIL,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: true,
  },

  POLL_PUBLISHED: {
    type: "POLL_PUBLISHED",
    label: "Nova enquete disponível",
    description:
      "Gerada quando uma enquete é publicada e fica disponível para participação no portal.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: true,
  },

  POLL_EXTENDED: {
    type: "POLL_EXTENDED",
    label: "Prazo de enquete prorrogado",
    description:
      "Gerada quando o prazo final de uma enquete publicada é prorrogado ou quando uma enquete encerrada é reaberta com novo prazo.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: true,
  },

  POLL_RESULTS_PUBLISHED: {
    type: "POLL_RESULTS_PUBLISHED",
    label: "Resultado de enquete publicado",
    description:
      "Gerada quando a administradora publica oficialmente o resultado de uma enquete encerrada.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: true,
  },

  POLL_EXPIRED_ADMIN_REMINDER: {
    type: "POLL_EXPIRED_ADMIN_REMINDER",
    label: "Prazo da enquete encerrado",
    description:
      "Lembrete operacional interno enviado à administradora quando uma enquete publicada atinge o prazo final e precisa ser revisada.",
    availableChannels: SYSTEM_ONLY,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: false,
  },


  ASSEMBLY_CONVOCATION_PUBLISHED: {
    type: "ASSEMBLY_CONVOCATION_PUBLISHED",
    label: "Convocação de assembleia publicada",
    description:
      "Gerada quando a administradora publica oficialmente a convocação de uma assembleia.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  ASSEMBLY_VOTING_REMINDER: {
    type: "ASSEMBLY_VOTING_REMINDER",
    label: "Lembrete de votação da assembleia",
    description:
      "Gerada quando a administradora envia um lembrete para unidades com votação pendente em uma assembleia publicada.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  ASSEMBLY_VOTING_DEADLINE_EXTENDED: {
    type: "ASSEMBLY_VOTING_DEADLINE_EXTENDED",
    label: "Prazo da votação da assembleia prorrogado",
    description:
      "Gerada quando a administradora amplia o prazo final da votação de uma assembleia publicada.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  ASSEMBLY_RESULTS_PUBLISHED: {
    type: "ASSEMBLY_RESULTS_PUBLISHED",
    label: "Resultados da assembleia publicados",
    description:
      "Gerada quando a administradora publica oficialmente a apuração de uma assembleia encerrada.",
    availableChannels: SYSTEM_EMAIL_WHATSAPP,
    enabledChannels: SYSTEM_AND_EMAIL,
    externalReady: true,
    userPreferenceEnabled: true,
  },

  FINANCIAL_CHARGE_BATCH_GENERATED_ADMIN: {
    type: "FINANCIAL_CHARGE_BATCH_GENERATED_ADMIN",
    label: "Mensalidades geradas",
    description:
      "Aviso operacional interno para a administradora quando um lote de mensalidades é gerado no Financeiro.",
    availableChannels: SYSTEM_ONLY,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: false,
  },

  FINANCIAL_CHARGE_AVAILABLE_PORTAL: {
    type: "FINANCIAL_CHARGE_AVAILABLE_PORTAL",
    label: "Nova cobrança disponível",
    description:
      "Aviso interno no portal quando uma mensalidade ou cobrança da unidade fica disponível para consulta.",
    availableChannels: SYSTEM_ONLY,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: false,
  },

  FINANCIAL_SETTLEMENT_REGISTERED_ADMIN: {
    type: "FINANCIAL_SETTLEMENT_REGISTERED_ADMIN",
    label: "Baixa financeira registrada",
    description:
      "Aviso operacional interno para a administradora quando uma baixa financeira é registrada.",
    availableChannels: SYSTEM_ONLY,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: false,
  },

  FINANCIAL_PAYMENT_REGISTERED_PORTAL: {
    type: "FINANCIAL_PAYMENT_REGISTERED_PORTAL",
    label: "Pagamento registrado",
    description:
      "Aviso interno no portal quando uma baixa é registrada para uma cobrança da unidade.",
    availableChannels: SYSTEM_ONLY,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: false,
  },

  FINANCIAL_SETTLEMENT_REVERSED_ADMIN: {
    type: "FINANCIAL_SETTLEMENT_REVERSED_ADMIN",
    label: "Baixa financeira estornada",
    description:
      "Aviso operacional interno para a administradora quando uma baixa financeira é estornada.",
    availableChannels: SYSTEM_ONLY,
    enabledChannels: SYSTEM_ONLY,
    externalReady: false,
    userPreferenceEnabled: false,
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