import crypto from "node:crypto";
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type { CommercialProposalStatus, Prisma } from "@prisma/client";
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  StandardFonts,
  rgb,
} from "pdf-lib";

export const PROPOSAL_STATUSES: Array<{
  value: CommercialProposalStatus;
  label: string;
}> = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "SENT", label: "Enviada" },
  { value: "VIEWED", label: "Visualizada" },
  { value: "NEGOTIATION", label: "Em Negociação" },
  { value: "ACCEPTED", label: "Aceita" },
  { value: "REJECTED", label: "Recusada" },
  { value: "EXPIRED", label: "Expirada" },
  { value: "CANCELLED", label: "Cancelada" },
];

export const money = (cents: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((cents ?? 0) / 100);

export const token = () => crypto.randomBytes(32).toString("hex");

export const tokenHash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const clientIp = (headers: Headers) =>
  headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  headers.get("x-real-ip") ||
  null;

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function snapshot(
  proposal: Record<string, unknown>,
): Prisma.InputJsonObject {
  const { events: _events, versions: _versions, ...clean } = proposal;
  return toPrismaJson(clean) as Prisma.InputJsonObject;
}

type ProposalPdfInput = {
  administratorName: string;
  responsibleName: string;
  email: string;
  title: string;
  planName?: string | null;
  monthlyPriceCents?: number | null;
  implementationFeeCents?: number | null;
  discountCents?: number | null;
  discountPercent?: number | null;
  validUntil?: Date | null;
  paymentTerms?: string | null;
  commercialNotes?: string | null;
  modules: string[];
  version: number;
  status?: CommercialProposalStatus | null;
  createdAt?: Date | null;
  acceptedAt?: Date | null;
  acceptedByName?: string | null;
  acceptedByEmail?: string | null;
  acceptanceStatement?: string | null;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 38;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BRAND = rgb(0.04, 0.45, 0.27);
const BRAND_DARK = rgb(0.02, 0.18, 0.12);
const BRAND_SOFT = rgb(0.92, 0.97, 0.94);
const TEXT = rgb(0.07, 0.10, 0.09);
const MUTED = rgb(0.40, 0.45, 0.42);
const BORDER = rgb(0.84, 0.88, 0.86);
const SOFT = rgb(0.96, 0.98, 0.97);
const WHITE = rgb(1, 1, 1);

function sanitizeText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number) {
  const clean = sanitizeText(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = sanitizeText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function embedImage(pdf: PDFDocument, absolutePath: string) {
  const bytes = await readFile(absolutePath);
  const lower = absolutePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return pdf.embedJpg(bytes);
  }
  if (lower.endsWith(".png")) {
    return pdf.embedPng(bytes);
  }
  return null;
}

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  // O cabeçalho do PDF usa fundo escuro. Por isso, a versão clara da marca
  // deve ser priorizada. Os nomes abaixo refletem os arquivos existentes em
  // public/brand no projeto EloGest.
  const exactCandidates = [
    "public/brand/elogest-logo-horizontal-dark-2400.png",
    "public/brand/elogest-logo-horizontal-dark-2400.jpg",
    "public/brand/elogest-logo-header-640.png",
    "public/brand/elogest-logo-header-640.jpg",
    "public/brand/elogest-logo-pdf-1200.png",
    "public/brand/elogest-logo-pdf-1200.jpg",
    "public/brand/elogest-logo-horizontal-2400.png",
    "public/brand/elogest-logo-horizontal-2400.jpg",
  ];

  for (const relativePath of exactCandidates) {
    try {
      const embedded = await embedImage(pdf, path.join(process.cwd(), relativePath));
      if (embedded) return embedded;
    } catch {
      // Continua procurando.
    }
  }

  try {
    const brandDir = path.join(process.cwd(), "public", "brand");
    const files = await readdir(brandDir);
    const preferred = files
      .filter((file) => /\.(png|jpe?g)$/i.test(file))
      .sort((a, b) => {
        const score = (name: string) => {
          if (/logo-horizontal-dark-2400/i.test(name)) return 0;
          if (/logo-header-640/i.test(name)) return 1;
          if (/logo-pdf-1200/i.test(name)) return 2;
          if (/logo-horizontal-2400/i.test(name)) return 3;
          if (/logo-horizontal/i.test(name) && /dark/i.test(name)) return 4;
          if (/logo-horizontal/i.test(name)) return 5;
          return 9;
        };
        return score(a) - score(b);
      });

    for (const file of preferred) {
      try {
        const embedded = await embedImage(pdf, path.join(brandDir, file));
        if (embedded) return embedded;
      } catch {
        // Ignora arquivo incompatível.
      }
    }
  } catch {
    // Fallback tipográfico abaixo.
  }

  return null;
}

export async function proposalPdf(input: ProposalPdfInput) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Proposta Comercial EloGest - ${input.administratorName}`);
  pdf.setAuthor("EloGest");
  pdf.setSubject("Proposta Comercial");
  pdf.setCreator("EloGest");
  pdf.setProducer("EloGest");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const drawWrapped = (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    options?: {
      size?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
      maxLines?: number;
      lineHeight?: number;
    },
  ) => {
    const size = options?.size ?? 9;
    const font = options?.font ?? regular;
    const color = options?.color ?? TEXT;
    const lineHeight = options?.lineHeight ?? size + 3;
    const maxLines = options?.maxLines ?? 2;
    const lines = wrapText(text, font, size, maxWidth).slice(0, maxLines);
    lines.forEach((line, index) => {
      page.drawText(line, { x, y: y - index * lineHeight, size, font, color });
    });
    return y - lines.length * lineHeight;
  };

  const proposalDate = input.createdAt ?? new Date();
  const validity = input.validUntil?.toLocaleDateString("pt-BR") ?? "Não informada";
  const clientName = truncate(input.administratorName, 48);

  // Cabeçalho premium: marca clara, identificação compacta e melhor equilíbrio.
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 104,
    width: PAGE_WIDTH,
    height: 104,
    color: BRAND_DARK,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 108,
    width: PAGE_WIDTH,
    height: 4,
    color: BRAND,
  });

  if (logo) {
    const dimensions = logo.scaleToFit(176, 46);
    page.drawImage(logo, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 28 - dimensions.height,
      width: dimensions.width,
      height: dimensions.height,
    });
  } else {
    page.drawText("EloGest", {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 57,
      size: 26,
      font: bold,
      color: WHITE,
    });
  }

  const metaX = PAGE_WIDTH - MARGIN_X - 170;
  page.drawText("PROPOSTA COMERCIAL", {
    x: metaX,
    y: PAGE_HEIGHT - 39,
    size: 13,
    font: bold,
    color: WHITE,
  });
  page.drawText(`Versão ${input.version}  |  ${proposalDate.toLocaleDateString("pt-BR")}`, {
    x: metaX,
    y: PAGE_HEIGHT - 58,
    size: 7.7,
    font: regular,
    color: rgb(0.78, 0.89, 0.83),
  });
  page.drawText(`Validade: ${validity}`, {
    x: metaX,
    y: PAGE_HEIGHT - 74,
    size: 7.7,
    font: regular,
    color: rgb(0.78, 0.89, 0.83),
  });

  let y = PAGE_HEIGHT - 136;

  page.drawText("PROPOSTA COMERCIAL PERSONALIZADA", {
    x: MARGIN_X,
    y,
    size: 8,
    font: bold,
    color: BRAND,
  });
  y -= 21;
  drawWrapped(clientName, MARGIN_X, y, CONTENT_WIDTH, {
    size: 20,
    font: bold,
    color: BRAND_DARK,
    maxLines: 1,
  });
  y -= 24;
  page.drawText("Uma solução completa para tornar a gestão mais eficiente, segura e conectada.", {
    x: MARGIN_X,
    y,
    size: 9,
    font: regular,
    color: MUTED,
  });

  // Faixa de identificação do cliente.
  y -= 20;
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 46,
    width: CONTENT_WIDTH,
    height: 46,
    color: SOFT,
    borderColor: BORDER,
    borderWidth: 0.7,
  });
  const infoCol = CONTENT_WIDTH / 3;
  const info = [
    ["RESPONSÁVEL", truncate(input.responsibleName, 30)],
    ["E-MAIL", truncate(input.email, 34)],
    ["PLANO RECOMENDADO", truncate(input.planName ?? "Personalizado", 26)],
  ];
  info.forEach(([label, value], index) => {
    const x = MARGIN_X + 13 + index * infoCol;
    page.drawText(label, { x, y: y - 14, size: 6.8, font: bold, color: MUTED });
    page.drawText(value, { x, y: y - 31, size: 9.4, font: bold, color: TEXT });
  });

  // Resumo financeiro em cards com mais presença visual.
  y -= 64;
  page.drawText("Investimento Proposto", {
    x: MARGIN_X,
    y,
    size: 12.4,
    font: bold,
    color: BRAND_DARK,
  });
  y -= 14;
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: PAGE_WIDTH - MARGIN_X, y },
    thickness: 0.7,
    color: BORDER,
  });
  y -= 12;

  const gap = 8;
  const cardWidth = (CONTENT_WIDTH - gap * 2) / 3;
  const cards = [
    ["PLANO", input.planName ?? "Personalizado"],
    ["MENSALIDADE", money(input.monthlyPriceCents)],
    ["IMPLANTAÇÃO", money(input.implementationFeeCents)],
  ];
  cards.forEach(([label, value], index) => {
    const x = MARGIN_X + index * (cardWidth + gap);
    page.drawRectangle({
      x,
      y: y - 60,
      width: cardWidth,
      height: 60,
      color: WHITE,
      borderColor: BORDER,
      borderWidth: 0.8,
    });
    page.drawRectangle({ x, y: y - 5, width: cardWidth, height: 5, color: BRAND });
    page.drawText(label, {
      x: x + 11,
      y: y - 22,
      size: 6.8,
      font: bold,
      color: MUTED,
    });
    drawWrapped(value, x + 11, y - 43, cardWidth - 22, {
      size: 12.2,
      font: bold,
      color: BRAND_DARK,
      maxLines: 1,
    });
  });
  y -= 70;

  const discountParts: string[] = [];
  if ((input.discountCents ?? 0) > 0) discountParts.push(money(input.discountCents));
  if ((input.discountPercent ?? 0) > 0) discountParts.push(`${input.discountPercent}%`);
  if (discountParts.length) {
    page.drawRectangle({
      x: MARGIN_X,
      y: y - 25,
      width: CONTENT_WIDTH,
      height: 25,
      color: BRAND_SOFT,
    });
    page.drawText(`Condição especial: desconto de ${discountParts.join(" + ")}.`, {
      x: MARGIN_X + 12,
      y: y - 16,
      size: 8.5,
      font: bold,
      color: BRAND,
    });
    y -= 34;
  }

  // Módulos em uma grade limpa e comercial.
  page.drawText("Soluções Incluídas", {
    x: MARGIN_X,
    y,
    size: 12,
    font: bold,
    color: BRAND_DARK,
  });
  y -= 16;
  const modules = input.modules.length
    ? input.modules.slice(0, 12)
    : ["Escopo personalizado conforme proposta"];
  const chipGap = 7;
  const chipWidth = (CONTENT_WIDTH - chipGap * 2) / 3;
  const chipHeight = 25;
  modules.forEach((moduleName, index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    const x = MARGIN_X + column * (chipWidth + chipGap);
    const chipY = y - row * (chipHeight + 6) - chipHeight;
    page.drawRectangle({
      x,
      y: chipY,
      width: chipWidth,
      height: chipHeight,
      color: SOFT,
      borderColor: BORDER,
      borderWidth: 0.6,
    });
    page.drawCircle({ x: x + 10, y: chipY + 12.5, size: 2.6, color: BRAND });
    page.drawText(truncate(moduleName, 27), {
      x: x + 18,
      y: chipY + 9,
      size: 7.7,
      font: regular,
      color: TEXT,
    });
  });
  y -= Math.ceil(modules.length / 3) * (chipHeight + 6) + 10;

  // Condições e observações em cards mais leves.
  const halfGap = 10;
  const halfWidth = (CONTENT_WIDTH - halfGap) / 2;
  const boxHeight = 78;
  const boxes = [
    ["Condições De Pagamento", input.paymentTerms || "Conforme condições comerciais apresentadas."],
    ["Observações Comerciais", input.commercialNotes || "Sem observações adicionais."],
  ];
  boxes.forEach(([title, value], index) => {
    const x = MARGIN_X + index * (halfWidth + halfGap);
    page.drawRectangle({
      x,
      y: y - boxHeight,
      width: halfWidth,
      height: boxHeight,
      color: WHITE,
      borderColor: BORDER,
      borderWidth: 0.8,
    });
    page.drawText(title, {
      x: x + 12,
      y: y - 18,
      size: 9.2,
      font: bold,
      color: BRAND_DARK,
    });
    drawWrapped(truncate(value, 220), x + 12, y - 36, halfWidth - 24, {
      size: 8.1,
      lineHeight: 10.5,
      maxLines: 3,
      color: TEXT,
    });
  });
  y -= boxHeight + 14;

  // Próximos passos em cards, com ênfase no aceite.
  page.drawText("Próximos Passos", {
    x: MARGIN_X,
    y,
    size: 11.7,
    font: bold,
    color: BRAND_DARK,
  });
  y -= 12;
  const steps = [
    ["1", "Validar Escopo", "Confirmar solução e condições."],
    ["2", "Aceitar Proposta", "Concluir o aceite eletrônico."],
    ["3", "Agendar Implantação", "Definir datas e responsáveis."],
  ];
  const stepWidth = (CONTENT_WIDTH - gap * 2) / 3;
  const stepHeight = 47;
  steps.forEach(([number, title, description], index) => {
    const x = MARGIN_X + index * (stepWidth + gap);
    const highlighted = index === 1;
    page.drawRectangle({
      x,
      y: y - stepHeight,
      width: stepWidth,
      height: stepHeight,
      color: highlighted ? BRAND_SOFT : WHITE,
      borderColor: highlighted ? BRAND : BORDER,
      borderWidth: highlighted ? 1 : 0.7,
    });
    page.drawCircle({ x: x + 15, y: y - 17, size: 8, color: BRAND });
    page.drawText(number, {
      x: x + 12.5,
      y: y - 20,
      size: 7,
      font: bold,
      color: WHITE,
    });
    page.drawText(title, {
      x: x + 29,
      y: y - 17,
      size: 8.2,
      font: bold,
      color: BRAND_DARK,
    });
    drawWrapped(description, x + 12, y - 34, stepWidth - 24, {
      size: 7.2,
      lineHeight: 9,
      maxLines: 1,
      color: MUTED,
    });
  });
  y -= stepHeight + 12;

  // Fechamento comercial ocupa melhor a página e conduz para a decisão.
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 56,
    width: CONTENT_WIDTH,
    height: 56,
    color: BRAND_DARK,
  });
  page.drawText("PRONTO PARA AVANÇAR?", {
    x: MARGIN_X + 14,
    y: y - 19,
    size: 8.2,
    font: bold,
    color: rgb(0.67, 0.86, 0.74),
  });
  page.drawText("Conclua o aceite eletrônico para iniciarmos a implantação.", {
    x: MARGIN_X + 14,
    y: y - 36,
    size: 9.7,
    font: bold,
    color: WHITE,
  });
  page.drawText("EloGest - Gestão condominial mais eficiente, segura e conectada.", {
    x: MARGIN_X + 14,
    y: y - 49,
    size: 6.8,
    font: regular,
    color: rgb(0.78, 0.89, 0.83),
  });

  // Aceite eletrônico substitui o CTA quando já realizado.
  if (input.acceptedAt || input.acceptedByName || input.acceptedByEmail) {
    page.drawRectangle({
      x: MARGIN_X,
      y: y - 56,
      width: CONTENT_WIDTH,
      height: 56,
      color: BRAND_SOFT,
      borderColor: BRAND,
      borderWidth: 0.9,
    });
    page.drawText("PROPOSTA ACEITA ELETRONICAMENTE", {
      x: MARGIN_X + 14,
      y: y - 19,
      size: 8.5,
      font: bold,
      color: BRAND,
    });
    const acceptance = `${sanitizeText(input.acceptedByName) || "Nome não informado"} | ${sanitizeText(input.acceptedByEmail) || "E-mail não informado"} | ${input.acceptedAt?.toLocaleString("pt-BR") ?? "Data não informada"}`;
    drawWrapped(acceptance, MARGIN_X + 14, y - 38, CONTENT_WIDTH - 28, {
      size: 7.8,
      font: regular,
      color: TEXT,
      maxLines: 1,
    });
  }

  // Rodapé institucional.
  page.drawLine({
    start: { x: MARGIN_X, y: 39 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: 39 },
    thickness: 0.7,
    color: BORDER,
  });
  page.drawText(`EloGest | Proposta v${input.version}`, {
    x: MARGIN_X,
    y: 23,
    size: 7,
    font: regular,
    color: MUTED,
  });
  page.drawText("Documento comercial confidencial", {
    x: PAGE_WIDTH / 2 - 54,
    y: 23,
    size: 7,
    font: regular,
    color: MUTED,
  });
  page.drawText("Página 1 de 1", {
    x: PAGE_WIDTH - MARGIN_X - 56,
    y: 23,
    size: 7,
    font: regular,
    color: MUTED,
  });

  return Buffer.from(await pdf.save());
}
