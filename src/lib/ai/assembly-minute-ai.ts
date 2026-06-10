/* =========================================================
   ELOGEST — ETAPA 52.6.2
   CAMADA OPCIONAL DE IA PARA REDAÇÃO NARRATIVA DA ATA

   Arquivo:
   src/lib/ai/assembly-minute-ai.ts

   Objetivo:
   - Aprimorar a redação de uma minuta estruturada já existente.
   - Produzir uma ata narrativa, formal, fluida e menos robotizada.
   - Utilizar somente o texto público seguro e fatos públicos filtrados.
   - Não enviar snapshots internos completos, votos sigilosos,
     e-mails ou dados pessoais da auditoria administrativa.
   - Preservar a minuta atual quando a IA estiver indisponível,
     quando a validação rejeitar a resposta ou quando não houver
     melhoria textual relevante.

   Variáveis opcionais:
   - OPENAI_API_KEY
   - OPENAI_ASSEMBLY_MINUTE_MODEL
   - OPENAI_ASSEMBLY_MINUTE_ENABLED
   - OPENAI_ASSEMBLY_MINUTE_TIMEOUT_MS
   ========================================================= */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_SOURCE_TEXT_LENGTH = 120_000;
const MAX_OUTPUT_TOKENS = 14_000;
const PROMPT_VERSION = "assembly-minute-ai-52.6.2.2";

type JsonRecord = Record<string, unknown>;

type SafeAgendaFact = {
  order: number | null;
  title: string | null;
  visibility: string | null;
  resultStatus: string | null;
  resultSummary: string | null;
  participatingUnits: number | null;
  participatingWeight: number | null;
  abstentionUnits: number | null;
  abstentionWeight: number | null;
  validWeight: number | null;
  options: Array<{
    label: string | null;
    votes: number | null;
    weight: number | null;
  }>;
};

type SafeOfficialFacts = {
  assembly: {
    title: string | null;
    type: string | null;
    mode: string | null;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    openedAt: string | null;
    closedAt: string | null;
    resultsPublishedAt: string | null;
    convocationPublishedAt: string | null;
    location: string | null;
  };
  condominium: {
    name: string | null;
    legalName: string | null;
    cnpj: string | null;
    address: string | null;
  };
  eligibleUnits: {
    total: number | null;
    eligible: number | null;
    blocked: number | null;
    totalEligibleWeight: number | null;
  };
  participation: {
    participatingUnits: number | null;
    participatingWeight: number | null;
  };
  agendaItems: SafeAgendaFact[];
  publicRepresentationCount: number;
  publicAttachmentNames: string[];
};

export type AssemblyMinuteAiConfiguration = {
  configured: boolean;
  provider: "OPENAI";
  model: string;
  promptVersion: string;
};

export type ImproveAssemblyMinuteWithAiInput = {
  title: string;
  executiveSummary: string | null;
  content: string;
  sourceSnapshot?: unknown;
};

export type ImproveAssemblyMinuteWithAiResult = {
  usedFallback: boolean;
  noRelevantChange: boolean;
  title: string;
  executiveSummary: string | null;
  content: string;
  warnings: string[];
  fallbackReason: string | null;
  metadata: {
    provider: "OPENAI";
    model: string;
    promptVersion: string;
    responseId: string | null;
    usedFallback: boolean;
    noRelevantChange: boolean;
    fallbackReason: string | null;
  };
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeBooleanEnvironment(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "sim"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "não"].includes(normalized)) return false;

  return fallback;
}

function normalizeTimeout(value: string | undefined) {
  const parsed = Number(value || "");

  if (!Number.isFinite(parsed) || parsed < 5_000 || parsed > 120_000) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.floor(parsed);
}

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

function getModel() {
  return process.env.OPENAI_ASSEMBLY_MINUTE_MODEL?.trim() || DEFAULT_MODEL;
}

function isFeatureEnabled() {
  return normalizeBooleanEnvironment(
    process.env.OPENAI_ASSEMBLY_MINUTE_ENABLED,
    true,
  );
}

export function getAssemblyMinuteAiConfiguration(): AssemblyMinuteAiConfiguration {
  return {
    configured: Boolean(getOpenAiApiKey()) && isFeatureEnabled(),
    provider: "OPENAI",
    model: getModel(),
    promptVersion: PROMPT_VERSION,
  };
}

function buildFallbackResult(params: {
  input: ImproveAssemblyMinuteWithAiInput;
  reason: string;
  responseId?: string | null;
  noRelevantChange?: boolean;
}): ImproveAssemblyMinuteWithAiResult {
  const configuration = getAssemblyMinuteAiConfiguration();
  const noRelevantChange = Boolean(params.noRelevantChange);

  return {
    usedFallback: true,
    noRelevantChange,
    title: params.input.title,
    executiveSummary: params.input.executiveSummary,
    content: params.input.content,
    warnings: [
      noRelevantChange
        ? "A IA não identificou uma melhoria textual relevante. A versão atual foi preservada."
        : "O aprimoramento com IA não foi aplicado. A minuta segura atual foi preservada integralmente.",
    ],
    fallbackReason: params.reason,
    metadata: {
      provider: "OPENAI",
      model: configuration.model,
      promptVersion: PROMPT_VERSION,
      responseId: params.responseId || null,
      usedFallback: true,
      noRelevantChange,
      fallbackReason: params.reason,
    },
  };
}

function buildSafeOfficialFacts(sourceSnapshot: unknown): SafeOfficialFacts {
  const snapshot = asRecord(sourceSnapshot);
  const assembly = asRecord(snapshot.assembly);
  const condominium = asRecord(snapshot.condominium);
  const eligibleUnits = asRecord(snapshot.eligibleUnits);
  const participation = asRecord(snapshot.participation);

  const agendaItems = asArray(snapshot.agendaItems).map<SafeAgendaFact>((rawItem) => {
    const item = asRecord(rawItem);

    return {
      order: normalizeNullableNumber(item.order),
      title: normalizeNullableString(item.title),
      visibility: normalizeNullableString(item.voteVisibility),
      resultStatus: normalizeNullableString(item.resultStatus),
      resultSummary: normalizeNullableString(item.resultSummary),
      participatingUnits: normalizeNullableNumber(item.participatingUnits),
      participatingWeight: normalizeNullableNumber(item.participatingWeight),
      abstentionUnits: normalizeNullableNumber(item.abstentionUnits),
      abstentionWeight: normalizeNullableNumber(item.abstentionWeight),
      validWeight: normalizeNullableNumber(item.validWeight),
      options: asArray(item.options).map((rawOption) => {
        const option = asRecord(rawOption);
        return {
          label: normalizeNullableString(option.label),
          votes: normalizeNullableNumber(option.votes),
          weight: normalizeNullableNumber(option.weight),
        };
      }),
    };
  });

  return {
    assembly: {
      title: normalizeNullableString(assembly.title),
      type: normalizeNullableString(assembly.type),
      mode: normalizeNullableString(assembly.mode),
      scheduledStartAt: normalizeNullableString(assembly.scheduledStartAt),
      scheduledEndAt: normalizeNullableString(assembly.scheduledEndAt),
      openedAt: normalizeNullableString(assembly.openedAt),
      closedAt: normalizeNullableString(assembly.closedAt),
      resultsPublishedAt: normalizeNullableString(assembly.resultsPublishedAt),
      convocationPublishedAt: normalizeNullableString(assembly.convocationPublishedAt),
      location: normalizeNullableString(assembly.location),
    },
    condominium: {
      name: normalizeNullableString(condominium.name),
      legalName: normalizeNullableString(condominium.legalName),
      cnpj: normalizeNullableString(condominium.cnpj),
      address: normalizeNullableString(condominium.address),
    },
    eligibleUnits: {
      total: normalizeNullableNumber(eligibleUnits.total),
      eligible: normalizeNullableNumber(eligibleUnits.eligible),
      blocked: normalizeNullableNumber(eligibleUnits.blocked),
      totalEligibleWeight: normalizeNullableNumber(eligibleUnits.totalEligibleWeight),
    },
    participation: {
      participatingUnits: normalizeNullableNumber(participation.participatingUnits),
      participatingWeight: normalizeNullableNumber(participation.participatingWeight),
    },
    agendaItems,
    publicRepresentationCount: asArray(snapshot.representations).length,
    publicAttachmentNames: asArray(snapshot.attachments)
      .map((item) => normalizeNullableString(asRecord(item).originalName))
      .filter((item): item is string => Boolean(item)),
  };
}

function extractNumericTokens(value: string) {
  return value.match(/\d+(?:[.,/:\-]\d+)*/g) || [];
}

function normalizeNumericToken(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeNumericAtom(value: string) {
  const digits = digitsOnly(value);
  if (!digits) return "";

  const normalized = digits.replace(/^0+(?=\d)/, "");
  return normalized || "0";
}

function normalizeDecimalValue(value: string) {
  const normalized = value.trim();

  // Aceita somente números simples com separador decimal opcional.
  // Datas, horários, CNPJs e identificadores compostos continuam
  // validados pelas representações exata, canônica e por átomos.
  if (!/^\d+(?:[.,]\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized.replace(",", "."));
  if (!Number.isFinite(parsed)) return null;

  return parsed.toString();
}

function buildNumericSafetyIndex(value: string) {
  const tokens = extractNumericTokens(value).map(normalizeNumericToken);
  const exactTokens = new Set(tokens);
  const canonicalTokens = new Set<string>();
  const atoms = new Set<string>();
  const decimalValues = new Set<string>();

  for (const token of tokens) {
    const canonical = digitsOnly(token);
    if (canonical) canonicalTokens.add(canonical);

    const decimalValue = normalizeDecimalValue(token);
    if (decimalValue) decimalValues.add(decimalValue);

    const parts = token.split(/[.,/:\-]/g);
    for (const part of parts) {
      const atom = normalizeNumericAtom(part);
      if (atom) atoms.add(atom);

      const decimalAtom = normalizeDecimalValue(part);
      if (decimalAtom) decimalValues.add(decimalAtom);
    }
  }

  return { exactTokens, canonicalTokens, atoms, decimalValues };
}

function containsEmail(value: string) {
  return /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i.test(value);
}

function normalizeComparableText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([#*_—–:;,.!?()\-])\s*/g, "$1")
    .trim()
    .toLowerCase();
}

function hasMeaningfulTextChange(params: {
  input: ImproveAssemblyMinuteWithAiInput;
  title: string;
  executiveSummary: string | null;
  content: string;
}) {
  return (
    normalizeComparableText(params.input.title) !== normalizeComparableText(params.title) ||
    normalizeComparableText(params.input.executiveSummary) !== normalizeComparableText(params.executiveSummary) ||
    normalizeComparableText(params.input.content) !== normalizeComparableText(params.content)
  );
}

function extractNumericTokenContext(params: {
  content: string;
  token: string;
  radius?: number;
}) {
  const radius = params.radius ?? 90;
  const tokenIndex = params.content.indexOf(params.token);

  if (tokenIndex < 0) return "Trecho não localizado.";

  const start = Math.max(0, tokenIndex - radius);
  const end = Math.min(params.content.length, tokenIndex + params.token.length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < params.content.length ? "..." : "";

  return `${prefix}${params.content.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

function validateNumericSafety(params: {
  originalContent: string;
  generatedContent: string;
}) {
  const source = buildNumericSafetyIndex(params.originalContent);
  const generatedTokens = new Set(
    extractNumericTokens(params.generatedContent).map(normalizeNumericToken),
  );

  for (const token of generatedTokens) {
    if (source.exactTokens.has(token)) continue;

    const canonical = digitsOnly(token);
    if (canonical && source.canonicalTokens.has(canonical)) continue;

    const atom = normalizeNumericAtom(token);
    if (atom && source.atoms.has(atom)) continue;

    // Permite apenas equivalências numéricas de apresentação, como
    // 2 -> 2,00 ou 100 -> 100,00. O valor matemático precisa existir
    // previamente na minuta segura.
    const decimalValue = normalizeDecimalValue(token);
    if (decimalValue && source.decimalValues.has(decimalValue)) continue;

    const context = extractNumericTokenContext({
      content: params.generatedContent,
      token,
    });

    return [
      `A validação de segurança identificou um dado numérico novo ou alterado: ${token}.`,
      `Trecho da resposta: ${context}`,
    ].join(" ");
  }

  return "";
}

function validateAiOutput(params: {
  input: ImproveAssemblyMinuteWithAiInput;
  title: string;
  executiveSummary: string | null;
  content: string;
}) {
  if (params.title.length < 3) {
    return "A IA retornou um título inválido.";
  }

  if (params.content.length < 120) {
    return "A IA retornou um texto insuficiente para a ata.";
  }

  if (
    containsEmail(params.title) ||
    containsEmail(params.executiveSummary || "") ||
    containsEmail(params.content)
  ) {
    return "A IA retornou dado pessoal não autorizado para a minuta pública.";
  }

  return validateNumericSafety({
    originalContent: params.input.content,
    generatedContent: params.content,
  });
}

function parseWarnings(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];

  return value
    .map((item) => normalizeString(item))
    .filter(Boolean)
    .slice(0, 20);
}

function getOutputText(response: JsonRecord) {
  const directOutputText = normalizeString(response.output_text);
  if (directOutputText) return directOutputText;

  if (!Array.isArray(response.output)) return "";

  for (const outputItem of response.output) {
    if (!outputItem || typeof outputItem !== "object") continue;

    const content = (outputItem as JsonRecord).content;
    if (!Array.isArray(content)) continue;

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue;

      const text = normalizeString((contentItem as JsonRecord).text);
      if (text) return text;
    }
  }

  return "";
}

function getResponseErrorMessage(response: JsonRecord) {
  const error = response.error;

  if (error && typeof error === "object") {
    const message = normalizeString((error as JsonRecord).message);
    if (message) return message;
  }

  return "O provedor de IA não retornou uma resposta válida.";
}

function buildSystemPrompt() {
  return [
    "Você é um redator jurídico-administrativo especializado em atas condominiais brasileiras.",
    "Sua tarefa é transformar uma minuta técnica do EloGest em uma ata narrativa, formal, clara, natural e pronta para revisão humana.",
    "O documento deve parecer redigido por uma secretária de assembleia experiente, não exportado automaticamente por um sistema.",
    "Mantenha uma estrutura organizada em Markdown, mas prefira parágrafos conectados e fluidos em vez de longas listas de campos isolados.",
    "Utilize títulos objetivos para as seções: Identificação Da Assembleia, Convocação, Participação E Representações, Pautas E Deliberações, Documentos Oficiais, Pendências Para Deliberação Futura e Encerramento.",
    "Na identificação, incorpore os dados essenciais em um parágrafo narrativo sempre que possível.",
    "Na participação, redija frases naturais como 'não houve unidades bloqueadas' ou 'as três unidades aptas participaram da votação' quando isso corresponder aos fatos recebidos.",
    "Nas deliberações, descreva cada pauta em linguagem formal e apresente a apuração em tabela Markdown quando houver opções de voto.",
    "No encerramento, utilize uma fórmula documental natural, como 'Nada mais havendo a tratar', somente quando compatível com os registros recebidos.",
    "Elimine construções robotizadas como pauta(s), unidade(s), voto(s), registrada(s), encaminhada(s), representado(a) e expressões equivalentes.",
    "Ajuste singular e plural naturalmente. Prefira 'uma pauta', 'três unidades', 'dois votos favoráveis' e 'não houve abstenções'.",
    "Você pode formatar dados para melhorar a leitura sem alterar o valor, por exemplo apresentar um CNPJ com pontuação e escrever datas em formato textual.",
    "Não invente, altere, omita de forma enganosa ou contradiga qualquer fato oficial recebido.",
    "Não acrescente datas, números, percentuais, pesos, unidades, votos, resultados, quóruns, nomes, documentos ou encaminhamentos inexistentes.",
    "Não exponha e-mails, telefones, identificadores ou dados pessoais adicionais.",
    "Respeite integralmente o nível de transparência pública de cada pauta.",
    "Em votações sigilosas ou consolidadas, não revele votos individuais.",
    "Em votações nominais, preserve somente o detalhamento público por unidade que já estiver presente.",
    "Quando um texto cadastral parecer incompleto ou estranho, não invente correção: use uma descrição neutra no documento e registre um alerta para revisão humana.",
    "Não inclua comentários sobre a própria IA no corpo da ata.",
    "Produza somente JSON aderente ao schema solicitado.",
  ].join(" ");
}

function buildUserPrompt(input: ImproveAssemblyMinuteWithAiInput) {
  const safeFacts = buildSafeOfficialFacts(input.sourceSnapshot);

  return JSON.stringify(
    {
      objetivo:
        "Redigir uma versão narrativa e formal da ata, com leitura fluida e aparência documental, preservando integralmente os fatos oficiais e o nível de transparência pública.",
      estruturaEditorialEsperada: [
        "Título da ata e identificação do condomínio.",
        "Parágrafo narrativo de abertura com data, condomínio, CNPJ, endereço, modalidade e horários relevantes.",
        "Seção de convocação com texto efetivamente registrado.",
        "Seção narrativa de participação e representações.",
        "Uma subseção por pauta, com contexto, participação, tabela de apuração quando aplicável e encaminhamento formal.",
        "Seção objetiva de documentos oficiais.",
        "Seção de pendências futuras.",
        "Encerramento formal e natural.",
      ],
      orientacoesEditoriais: [
        "Produza uma melhoria perceptível, não apenas alterações de espaçamento ou pontuação.",
        "Converta listas excessivamente técnicas em parágrafos formais quando isso melhorar a leitura.",
        "Use tabelas Markdown para apuração por opção quando isso facilitar a compreensão.",
        "Evite repetir a mesma informação em lista e em parágrafo.",
        "Substitua pluralizações artificiais por redação natural conforme a quantidade.",
        "Quando a quantidade for zero, prefira construções como 'não houve abstenções' ou 'não foram registradas pendências'.",
        "Quando houver uma única ocorrência, use singular corretamente.",
        "Formate o CNPJ para leitura humana sem alterar os dígitos.",
        "Não inclua comentários sobre a própria IA no texto da ata.",
        "Quando uma descrição cadastrada parecer incompleta, utilize formulação neutra e registre um alerta para revisão humana.",
      ],
      fatosPublicosOficiais: safeFacts,
      tituloAtual: input.title,
      resumoExecutivoAtual: input.executiveSummary,
      textoAtual: input.content,
    },
    null,
    2,
  );
}

function buildRequestBody(input: ImproveAssemblyMinuteWithAiInput) {
  return {
    model: getModel(),
    store: false,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [
      {
        role: "system",
        content: buildSystemPrompt(),
      },
      {
        role: "user",
        content: buildUserPrompt(input),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "elogest_assembly_minute_narrative_revision",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: {
              type: "string",
              description: "Título formal da ata sem inclusão de novos dados.",
            },
            executiveSummary: {
              type: ["string", "null"],
              description: "Resumo executivo humanizado ou null.",
            },
            content: {
              type: "string",
              description: "Texto integral humanizado da ata sem alteração de fatos.",
            },
            warnings: {
              type: "array",
              description: "Alertas opcionais para revisão humana.",
              items: {
                type: "string",
              },
            },
          },
          required: ["title", "executiveSummary", "content", "warnings"],
        },
      },
    },
  };
}

export async function improveAssemblyMinuteWithAi(
  input: ImproveAssemblyMinuteWithAiInput,
): Promise<ImproveAssemblyMinuteWithAiResult> {
  const normalizedInput: ImproveAssemblyMinuteWithAiInput = {
    title: normalizeString(input.title),
    executiveSummary: normalizeNullableString(input.executiveSummary),
    content: normalizeString(input.content),
    sourceSnapshot: input.sourceSnapshot,
  };

  if (!normalizedInput.title || !normalizedInput.content) {
    return buildFallbackResult({
      input: normalizedInput,
      reason: "A minuta atual não possui conteúdo suficiente para o aprimoramento.",
    });
  }

  if (normalizedInput.content.length > MAX_SOURCE_TEXT_LENGTH) {
    return buildFallbackResult({
      input: normalizedInput,
      reason: "A minuta excede o limite seguro definido para o aprimoramento automático.",
    });
  }

  const configuration = getAssemblyMinuteAiConfiguration();

  if (!configuration.configured) {
    return buildFallbackResult({
      input: normalizedInput,
      reason: "A integração opcional de IA ainda não está configurada.",
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    normalizeTimeout(process.env.OPENAI_ASSEMBLY_MINUTE_TIMEOUT_MS),
  );

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAiApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildRequestBody(normalizedInput)),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as JsonRecord;
    const responseId = normalizeNullableString(payload.id);

    if (!response.ok) {
      console.error("[EloGest IA] Provedor retornou erro controlado:", {
        status: response.status,
        responseId,
      });

      return buildFallbackResult({
        input: normalizedInput,
        reason: getResponseErrorMessage(payload),
        responseId,
      });
    }

    const outputText = getOutputText(payload);

    if (!outputText) {
      return buildFallbackResult({
        input: normalizedInput,
        reason: "A IA não retornou o conteúdo estruturado esperado.",
        responseId,
      });
    }

    let parsed: JsonRecord;

    try {
      parsed = JSON.parse(outputText) as JsonRecord;
    } catch {
      return buildFallbackResult({
        input: normalizedInput,
        reason: "A IA retornou uma resposta que não pôde ser validada.",
        responseId,
      });
    }

    const title = normalizeString(parsed.title);
    const executiveSummary = normalizeNullableString(parsed.executiveSummary);
    const content = normalizeString(parsed.content);
    const warnings = parseWarnings(parsed.warnings);

    const validationError = validateAiOutput({
      input: normalizedInput,
      title,
      executiveSummary,
      content,
    });

    if (validationError) {
      console.warn("[EloGest IA] Resposta rejeitada pela validação local:", {
        reason: validationError,
        responseId,
      });

      return buildFallbackResult({
        input: normalizedInput,
        reason: validationError,
        responseId,
      });
    }

    if (
      !hasMeaningfulTextChange({
        input: normalizedInput,
        title,
        executiveSummary,
        content,
      })
    ) {
      console.info("[EloGest IA] Resposta válida sem melhoria textual relevante:", {
        responseId,
      });

      return buildFallbackResult({
        input: normalizedInput,
        reason: "A IA não identificou melhorias textuais relevantes para esta minuta.",
        responseId,
        noRelevantChange: true,
      });
    }

    return {
      usedFallback: false,
      noRelevantChange: false,
      title,
      executiveSummary,
      content,
      warnings,
      fallbackReason: null,
      metadata: {
        provider: "OPENAI",
        model: configuration.model,
        promptVersion: PROMPT_VERSION,
        responseId,
        usedFallback: false,
        noRelevantChange: false,
        fallbackReason: null,
      },
    };
  } catch (error) {
    console.error("[EloGest IA] Falha controlada no aprimoramento da ata:", {
      name: error instanceof Error ? error.name : "UnknownError",
    });

    return buildFallbackResult({
      input: normalizedInput,
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "O provedor de IA excedeu o tempo limite."
          : "O provedor de IA ficou indisponível durante a solicitação.",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
