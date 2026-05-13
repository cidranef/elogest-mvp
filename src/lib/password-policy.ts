/* =========================================================
   PASSWORD POLICY - ELOGEST

   ETAPA 42.8 — SEGURANÇA DE SENHA

   Objetivo:
   - Centralizar as regras de força de senha.
   - Reutilizar a mesma validação em:
     recuperação de senha, criação de usuários e futuras trocas.
   - Evitar senhas óbvias ou previsíveis.
   ========================================================= */

export type PasswordValidationResult = {
  valid: boolean;
  errors: string[];
};



const PASSWORD_MIN_LENGTH = 8;



const BLOCKED_PASSWORDS = new Set(
  [
    "12345678",
    "123456789",
    "1234567890",
    "senha123",
    "senha1234",
    "password",
    "password123",
    "admin123",
    "admin1234",
    "elogest123",
    "elogest1234",
    "heloisa100%",
    "qwerty123",
    "abc12345",
  ].map((item) => item.toLowerCase())
);



function normalize(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}



function getEmailLocalPart(email?: string | null) {
  const normalizedEmail = normalize(email);

  if (!normalizedEmail.includes("@")) {
    return "";
  }

  return normalizedEmail.split("@")[0] || "";
}



export function validateStrongPassword(
  password: string,
  options?: {
    email?: string | null;
    name?: string | null;
  }
): PasswordValidationResult {
  const errors: string[] = [];
  const rawPassword = String(password || "");
  const normalizedPassword = normalize(rawPassword);

  if (rawPassword.length < PASSWORD_MIN_LENGTH) {
    errors.push("A senha deve ter pelo menos 8 caracteres.");
  }

  if (!/[A-ZÀ-Ý]/.test(rawPassword)) {
    errors.push("Inclua pelo menos uma letra maiúscula.");
  }

  if (!/[a-zà-ÿ]/.test(rawPassword)) {
    errors.push("Inclua pelo menos uma letra minúscula.");
  }

  if (!/\d/.test(rawPassword)) {
    errors.push("Inclua pelo menos um número.");
  }

  if (!/[^A-Za-zÀ-ÿ0-9]/.test(rawPassword)) {
    errors.push("Inclua pelo menos um caractere especial.");
  }

  if (BLOCKED_PASSWORDS.has(normalizedPassword)) {
    errors.push("Escolha uma senha menos previsível.");
  }

  const emailLocalPart = getEmailLocalPart(options?.email);

  if (
    emailLocalPart &&
    emailLocalPart.length >= 4 &&
    normalizedPassword.includes(emailLocalPart)
  ) {
    errors.push("A senha não deve conter parte do e-mail.");
  }

  const normalizedName = normalize(options?.name).replace(/\s+/g, "");

  if (
    normalizedName &&
    normalizedName.length >= 4 &&
    normalizedPassword.includes(normalizedName)
  ) {
    errors.push("A senha não deve conter o nome do usuário.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}



export function getPasswordPolicyMessage() {
  return "A senha deve ter pelo menos 8 caracteres, incluindo letra maiúscula, letra minúscula, número e caractere especial.";
}



export function getPasswordPolicyRules() {
  return [
    "Mínimo de 8 caracteres",
    "Pelo menos uma letra maiúscula",
    "Pelo menos uma letra minúscula",
    "Pelo menos um número",
    "Pelo menos um caractere especial",
    "Não usar senhas óbvias ou previsíveis",
    "Não usar parte do e-mail ou nome do usuário",
  ];
}