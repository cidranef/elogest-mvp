export class SubscriptionDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionDomainError";
  }
}

export class ActiveSubscriptionAlreadyExistsError extends SubscriptionDomainError {
  constructor(administratorId: string) {
    super(
      `A administradora ${administratorId} já possui uma assinatura principal em andamento.`,
    );
    this.name = "ActiveSubscriptionAlreadyExistsError";
  }
}

export class SubscriptionNotFoundError extends SubscriptionDomainError {
  constructor(subscriptionId: string) {
    super(`Assinatura ${subscriptionId} não encontrada.`);
    this.name = "SubscriptionNotFoundError";
  }
}

export class InvalidSubscriptionOperationError extends SubscriptionDomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSubscriptionOperationError";
  }
}
