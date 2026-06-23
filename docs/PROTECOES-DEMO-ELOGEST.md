# ETAPA 57.4 — MAPA DE PROTEÇÕES

## Ações estruturais

Antes das operações abaixo, use `requireDemoOperationAllowed`:

- excluir administradora;
- desativar administradora;
- trocar plano;
- excluir condomínio;
- excluir unidade;
- excluir usuário-base;
- alterar e-mails dos logins demo.

Exemplo:

```ts
const protection = await requireDemoOperationAllowed({
  administratorId,
  operation: "DELETE_CONDOMINIUM",
});

if (!protection.allowed) {
  return protection.error;
}
```

## E-mails

Nos fluxos que possuem `administratorId`, use:

```ts
await sendAdministratorMail({
  administratorId,
  to,
  subject,
  html,
  text,
});
```

Não chame `sendMail` diretamente nesses fluxos.

## WhatsApp, pagamentos e webhooks

Antes de chamar o provedor:

```ts
const protection = await requireDemoOperationAllowed({
  administratorId,
  operation: "EXTERNAL_WHATSAPP",
});

if (!protection.allowed) {
  return protection.error;
}
```

Para processos internos em que o bloqueio não deve virar erro ao usuário,
use `canAdministratorPerformOperation` e registre o evento como ignorado.

## Reset seletivo

O reset:

- não executa `prisma migrate reset`;
- não apaga o banco;
- não altera outra administradora;
- valida CNPJ e `isDemo`;
- exige confirmação explícita;
- reaplica os seeds idempotentes;
- valida logins e proteções.

Nesta versão segura, registros extras criados manualmente durante uma
apresentação não são apagados. Os registros canônicos são restaurados.
