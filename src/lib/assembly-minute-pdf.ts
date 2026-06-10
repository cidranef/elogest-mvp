import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { deflateSync, inflateSync } from "zlib";

/* =========================================================
   ELOGEST — ETAPA 52.7.1
   GERADOR DO PDF OFICIAL DA ATA

   Arquivo:
   src/lib/assembly-minute-pdf.ts

   Objetivo:
   - Gerar PDF oficial sem dependência externa.
   - Preservar o texto publicado da ata.
   - Aplicar identidade visual EloGest no cabeçalho.
   - Exibir dados disponíveis da administradora responsável.
   - Adequar o encerramento ao estágio oficial publicado.
   - Aplicar cabeçalho, rodapé, paginação e controle documental.
   - Retornar os bytes do documento para a camada central de storage.
   - Manter o gerador independente do provedor de armazenamento.

   Observação importante:
   - O hash exibido dentro do documento é o hash SHA-256 do conteúdo
     oficial efetivamente renderizado no PDF.
   - O hash SHA-256 do arquivo PDF final é calculado após a geração e
     deve ser salvo no banco em officialPdfHash.
   ========================================================= */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT_MARGIN = 52;
const RIGHT_MARGIN = 52;
const TOP_MARGIN = 84;
const BOTTOM_MARGIN = 58;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
const LOGO_RELATIVE_PATH = path.join(
  "public",
  "brand",
  "elogest-logo-horizontal-dark-2400.png",
);
const OFFICIAL_CLOSING =
  "Nada mais havendo a tratar, lavra-se a presente ata, que fica registrada e publicada para os devidos fins.";

type FontName = "regular" | "bold" | "mono";

type PdfLine = {
  text: string;
  font: FontName;
  size: number;
  leading: number;
  spacingBefore?: number;
  spacingAfter?: number;
};

type PdfPage = {
  lines: Array<PdfLine & { y: number }>;
};

type PdfImage = {
  width: number;
  height: number;
  compressedRgb: Buffer;
  compressedAlpha: Buffer;
};

export type AssemblyMinutePdfAdministrator = {
  name?: string | null;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type AssemblyMinutePdfInput = {
  assemblyId: string;
  minuteId: string;
  condominiumName: string;
  assemblyTitle: string;
  minuteTitle: string;
  minuteContent: string;
  minuteVersion: number;
  publishedAt: Date;
  publishedByLabel: string;
  administrator?: AssemblyMinutePdfAdministrator | null;
};

export type AssemblyMinutePdfDocument = {
  bytes: Buffer;
  contentHash: string;
  fileHash: string;
  documentCode: string;
  fileName: string;
  officialContent: string;
  officializationApplied: boolean;
  logoEmbedded: boolean;
};

function normalizeText(value: string) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

function normalizeComparableText(value: string) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function sanitizeFileName(value: string) {
  const normalized = String(value || "ata")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return normalized || "ata";
}

function normalizeNullableString(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function formatCnpj(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length !== 14) {
    return normalizeNullableString(value);
  }

  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

function hashSha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function escapePdfText(value: string) {
  const bytes = Buffer.from(normalizeText(value), "latin1");
  let result = "";

  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      result += `\\${String.fromCharCode(byte)}`;
      continue;
    }

    if (byte < 0x20 || byte > 0x7e) {
      result += `\\${byte.toString(8).padStart(3, "0")}`;
      continue;
    }

    result += String.fromCharCode(byte);
  }

  return result;
}

function approximateTextWidth(text: string, size: number, font: FontName) {
  const ratio = font === "mono" ? 0.6 : font === "bold" ? 0.54 : 0.5;
  return normalizeText(text).length * size * ratio;
}

function wrapText(
  text: string,
  size: number,
  font: FontName,
  maxWidth = CONTENT_WIDTH,
) {
  const normalized = normalizeText(text).trim();

  if (!normalized) return [""];

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (approximateTextWidth(candidate, size, font) <= maxWidth || !current) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function stripInlineMarkdown(value: string) {
  return normalizeText(value)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s?/, "")
    .trim();
}

function officializePublishedMinuteContent(value: string) {
  const original = normalizeText(value).trim();
  let official = original;

  official = official.replace(
    /Nada mais havendo a tratar,\s*lavra-se a presente ata\s*para fins de revisão e\s*aprovação humana\.?/gi,
    OFFICIAL_CLOSING,
  );

  official = official.replace(
    /Nada mais havendo a tratar,\s*lavra-se a presente ata[^.\n]*(?:revisão|aprovação humana)[^.\n]*\.?/gi,
    OFFICIAL_CLOSING,
  );

  official = official.replace(
    /\n*Esta minuta foi (?:gerada|elaborada)[\s\S]*?(?:deverá|deve) ser revisada[^.]*\.?\s*$/i,
    "",
  );

  official = official.trim();

  if (!official.includes(OFFICIAL_CLOSING)) {
    official = `${official}\n\n${OFFICIAL_CLOSING}`;
  }

  return {
    content: official,
    applied:
      normalizeComparableText(official) !== normalizeComparableText(original),
  };
}

function markdownToLines(markdown: string): PdfLine[] {
  const output: PdfLine[] = [];
  const rows = normalizeText(markdown).split("\n");
  let inTable = false;

  for (const rawRow of rows) {
    const row = rawRow.trimEnd();
    const trimmed = row.trim();

    if (!trimmed) {
      output.push({
        text: "",
        font: "regular",
        size: 10,
        leading: 8,
        spacingAfter: 2,
      });
      inTable = false;
      continue;
    }

    if (/^\|?[\s:|-]+\|[\s:|-]+/.test(trimmed)) {
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => stripInlineMarkdown(cell).trim());

      const tableText = cells.join(" | ");
      const wrapped = wrapText(tableText, 8.5, "mono");

      for (const [index, line] of wrapped.entries()) {
        output.push({
          text: line,
          font: "mono",
          size: 8.5,
          leading: 11,
          spacingBefore: !inTable && index === 0 ? 3 : 0,
        });
      }

      inTable = true;
      continue;
    }

    inTable = false;

    if (trimmed.startsWith("# ")) {
      const text = stripInlineMarkdown(trimmed.slice(2));
      for (const line of wrapText(text, 16, "bold")) {
        output.push({
          text: line,
          font: "bold",
          size: 16,
          leading: 20,
          spacingBefore: 8,
          spacingAfter: 3,
        });
      }
      continue;
    }

    if (trimmed.startsWith("## ")) {
      const text = stripInlineMarkdown(trimmed.slice(3));
      for (const line of wrapText(text, 12, "bold")) {
        output.push({
          text: line,
          font: "bold",
          size: 12,
          leading: 16,
          spacingBefore: 9,
          spacingAfter: 2,
        });
      }
      continue;
    }

    if (trimmed.startsWith("### ")) {
      const text = stripInlineMarkdown(trimmed.slice(4));
      for (const line of wrapText(text, 10.5, "bold")) {
        output.push({
          text: line,
          font: "bold",
          size: 10.5,
          leading: 14,
          spacingBefore: 6,
          spacingAfter: 1,
        });
      }
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const text = `- ${stripInlineMarkdown(trimmed.replace(/^[-*]\s+/, ""))}`;
      for (const line of wrapText(text, 9.5, "regular", CONTENT_WIDTH - 8)) {
        output.push({
          text: line,
          font: "regular",
          size: 9.5,
          leading: 13,
          spacingBefore: 1,
        });
      }
      continue;
    }

    const text = stripInlineMarkdown(trimmed);

    for (const line of wrapText(text, 9.5, "regular")) {
      output.push({
        text: line,
        font: "regular",
        size: 9.5,
        leading: 13,
        spacingBefore: 1,
      });
    }
  }

  return output;
}

function buildAdministratorLines(input: AssemblyMinutePdfInput): PdfLine[] {
  const administratorName = normalizeNullableString(input.administrator?.name);
  const administratorCnpj = formatCnpj(input.administrator?.cnpj);
  const administratorEmail = normalizeNullableString(input.administrator?.email);
  const administratorPhone = normalizeNullableString(input.administrator?.phone);

  const details = [
    administratorName ? `Administradora: ${administratorName}` : null,
    administratorCnpj ? `CNPJ: ${administratorCnpj}` : null,
    administratorEmail ? `E-mail: ${administratorEmail}` : null,
    administratorPhone ? `Telefone: ${administratorPhone}` : null,
  ].filter((item): item is string => Boolean(item));

  if (details.length === 0) return [] as PdfLine[];

  return [
    {
      text: "ADMINISTRADORA RESPONSAVEL",
      font: "bold",
      size: 9,
      leading: 12,
      spacingBefore: 6,
      spacingAfter: 1,
    },
    ...details.map((text) => ({
      text,
      font: "regular" as const,
      size: 8.5,
      leading: 11,
    })),
  ];
}

function buildDocumentLines(input: AssemblyMinutePdfInput, contentHash: string) {
  const publicationLabel = formatDateTime(input.publishedAt);
  const lines: PdfLine[] = [
    {
      text: "ATA OFICIAL DA ASSEMBLEIA",
      font: "bold",
      size: 11,
      leading: 15,
      spacingAfter: 5,
    },
    {
      text: input.condominiumName,
      font: "bold",
      size: 12,
      leading: 15,
      spacingAfter: 2,
    },
    {
      text: input.assemblyTitle,
      font: "regular",
      size: 10,
      leading: 13,
      spacingAfter: 7,
    },
    {
      text: `Documento: ${buildDocumentCode(input)}`,
      font: "regular",
      size: 8.5,
      leading: 11,
    },
    {
      text: `Versao oficial: ${input.minuteVersion}`,
      font: "regular",
      size: 8.5,
      leading: 11,
    },
    {
      text: `Publicacao: ${publicationLabel}`,
      font: "regular",
      size: 8.5,
      leading: 11,
    },
    {
      text: `Responsavel pela publicacao: ${input.publishedByLabel}`,
      font: "regular",
      size: 8.5,
      leading: 11,
    },
    ...buildAdministratorLines(input),
    {
      text: `Hash SHA-256 do conteudo oficial: ${contentHash}`,
      font: "mono",
      size: 7.5,
      leading: 10,
      spacingBefore: 6,
      spacingAfter: 10,
    },
  ];

  return [...lines, ...markdownToLines(input.minuteContent)];
}

function paginate(lines: PdfLine[]) {
  const pages: PdfPage[] = [];
  let currentPage: PdfPage = { lines: [] };
  let y = PAGE_HEIGHT - TOP_MARGIN;

  for (const line of lines) {
    const spacingBefore = line.spacingBefore || 0;
    const spacingAfter = line.spacingAfter || 0;
    const requiredHeight = spacingBefore + line.leading + spacingAfter;

    if (y - requiredHeight < BOTTOM_MARGIN) {
      pages.push(currentPage);
      currentPage = { lines: [] };
      y = PAGE_HEIGHT - TOP_MARGIN;
    }

    y -= spacingBefore;
    currentPage.lines.push({ ...line, y });
    y -= line.leading + spacingAfter;
  }

  pages.push(currentPage);
  return pages;
}

function paethPredictor(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);

  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function parseRgbaPng(bytes: Buffer): PdfImage {
  const signature = bytes.subarray(0, 8);
  const expectedSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  if (!signature.equals(expectedSignature)) {
    throw new Error("Arquivo de logotipo PNG invalido.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const idatChunks: Buffer[] = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlaceMethod = data[12];
    }

    if (type === "IDAT") {
      idatChunks.push(data);
    }

    if (type === "IEND") break;
  }

  if (
    !width ||
    !height ||
    bitDepth !== 8 ||
    colorType !== 6 ||
    interlaceMethod !== 0
  ) {
    throw new Error(
      "O logotipo deve ser um PNG RGBA de 8 bits sem entrelacamento.",
    );
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const raw = Buffer.alloc(height * stride);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;

    for (let column = 0; column < stride; column += 1) {
      const source = inflated[sourceOffset + column];
      const targetOffset = row * stride + column;
      const left = column >= bytesPerPixel ? raw[targetOffset - bytesPerPixel] : 0;
      const above = row > 0 ? raw[targetOffset - stride] : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel
        ? raw[targetOffset - stride - bytesPerPixel]
        : 0;

      let value = source;

      if (filterType === 1) value = (source + left) & 0xff;
      if (filterType === 2) value = (source + above) & 0xff;
      if (filterType === 3) value = (source + Math.floor((left + above) / 2)) & 0xff;
      if (filterType === 4) value = (source + paethPredictor(left, above, upperLeft)) & 0xff;

      if (filterType < 0 || filterType > 4) {
        throw new Error("Filtro PNG nao suportado no logotipo.");
      }

      raw[targetOffset] = value;
    }

    sourceOffset += stride;
  }

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const rgbaOffset = pixel * 4;
    const rgbOffset = pixel * 3;

    rgb[rgbOffset] = raw[rgbaOffset];
    rgb[rgbOffset + 1] = raw[rgbaOffset + 1];
    rgb[rgbOffset + 2] = raw[rgbaOffset + 2];
    alpha[pixel] = raw[rgbaOffset + 3];
  }

  return {
    width,
    height,
    compressedRgb: deflateSync(rgb),
    compressedAlpha: deflateSync(alpha),
  };
}

async function loadOfficialLogo() {
  try {
    const absolutePath = path.join(process.cwd(), LOGO_RELATIVE_PATH);
    const bytes = await readFile(absolutePath);
    return parseRgbaPng(bytes);
  } catch (error) {
    console.warn(
      "[EloGest PDF] Logotipo oficial nao localizado ou invalido. O PDF sera gerado com cabecalho textual.",
      error,
    );
    return null;
  }
}

function buildPageStream(
  page: PdfPage,
  pageNumber: number,
  totalPages: number,
  logo: PdfImage | null,
) {
  const commands: string[] = [];

  commands.push("q");
  commands.push("0.09 0.18 0.13 rg");
  commands.push(`0 ${PAGE_HEIGHT - 52} ${PAGE_WIDTH} 52 re f`);
  commands.push("Q");

  if (logo) {
    const logoHeight = 28;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    const logoY = PAGE_HEIGHT - 40;

    commands.push("q");
    commands.push(`${logoWidth} 0 0 ${logoHeight} ${LEFT_MARGIN} ${logoY} cm`);
    commands.push("/Logo Do");
    commands.push("Q");
  } else {
    commands.push("BT");
    commands.push("/F2 11 Tf");
    commands.push("1 1 1 rg");
    commands.push(`${LEFT_MARGIN} ${PAGE_HEIGHT - 31} Td`);
    commands.push(`(${escapePdfText("EloGest - Governanca Condominial")}) Tj`);
    commands.push("ET");
  }

  commands.push("BT");
  commands.push("/F2 8.5 Tf");
  commands.push("1 1 1 rg");
  commands.push(`${PAGE_WIDTH - RIGHT_MARGIN - 105} ${PAGE_HEIGHT - 24} Td`);
  commands.push(`(${escapePdfText("ATA OFICIAL")}) Tj`);
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1 7 Tf");
  commands.push("0.82 0.94 0.86 rg");
  commands.push(`${PAGE_WIDTH - RIGHT_MARGIN - 105} ${PAGE_HEIGHT - 36} Td`);
  commands.push(`(${escapePdfText("Documento verificavel")}) Tj`);
  commands.push("ET");

  for (const line of page.lines) {
    const font = line.font === "bold" ? "/F2" : line.font === "mono" ? "/F3" : "/F1";
    commands.push("BT");
    commands.push(`${font} ${line.size} Tf`);
    commands.push("0.08 0.13 0.10 rg");
    commands.push(`${LEFT_MARGIN} ${line.y} Td`);
    commands.push(`(${escapePdfText(line.text)}) Tj`);
    commands.push("ET");
  }

  commands.push("BT");
  commands.push("/F1 7.5 Tf");
  commands.push("0.35 0.42 0.38 rg");
  commands.push(`${LEFT_MARGIN} 27 Td`);
  commands.push(
    `(${escapePdfText(
      `EloGest - Governanca Condominial | Documento oficial | Pagina ${pageNumber} de ${totalPages}`,
    )}) Tj`,
  );
  commands.push("ET");

  return Buffer.from(commands.join("\n"), "latin1");
}

function buildPdfBytes(pages: PdfPage[], logo: PdfImage | null) {
  const objects = new Map<number, Buffer>();
  const logoObjectId = logo ? 6 : null;
  const logoMaskObjectId = logo ? 7 : null;
  const firstPageObjectId = logo ? 8 : 6;
  const kids: string[] = [];

  objects.set(
    1,
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"),
  );

  objects.set(
    3,
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "latin1",
    ),
  );

  objects.set(
    4,
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      "latin1",
    ),
  );

  objects.set(
    5,
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
      "latin1",
    ),
  );

  if (logo && logoObjectId && logoMaskObjectId) {
    objects.set(
      logoMaskObjectId,
      Buffer.concat([
        Buffer.from(
          [
            "<<",
            "/Type /XObject",
            "/Subtype /Image",
            `/Width ${logo.width}`,
            `/Height ${logo.height}`,
            "/ColorSpace /DeviceGray",
            "/BitsPerComponent 8",
            "/Filter /FlateDecode",
            `/Length ${logo.compressedAlpha.length}`,
            ">>",
            "stream",
          ].join("\n") + "\n",
          "latin1",
        ),
        logo.compressedAlpha,
        Buffer.from("\nendstream", "latin1"),
      ]),
    );

    objects.set(
      logoObjectId,
      Buffer.concat([
        Buffer.from(
          [
            "<<",
            "/Type /XObject",
            "/Subtype /Image",
            `/Width ${logo.width}`,
            `/Height ${logo.height}`,
            "/ColorSpace /DeviceRGB",
            "/BitsPerComponent 8",
            "/Filter /FlateDecode",
            `/SMask ${logoMaskObjectId} 0 R`,
            `/Length ${logo.compressedRgb.length}`,
            ">>",
            "stream",
          ].join("\n") + "\n",
          "latin1",
        ),
        logo.compressedRgb,
        Buffer.from("\nendstream", "latin1"),
      ]),
    );
  }

  pages.forEach((page, index) => {
    const pageObjectId = firstPageObjectId + index * 2;
    const streamObjectId = pageObjectId + 1;
    kids.push(`${pageObjectId} 0 R`);

    const stream = buildPageStream(page, index + 1, pages.length, logo);
    const xObjectResources = logoObjectId
      ? ` /XObject << /Logo ${logoObjectId} 0 R >>`
      : "";

    objects.set(
      pageObjectId,
      Buffer.from(
        [
          "<<",
          "/Type /Page",
          "/Parent 2 0 R",
          `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]`,
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xObjectResources} >>`,
          `/Contents ${streamObjectId} 0 R`,
          ">>",
        ].join("\n"),
        "latin1",
      ),
    );

    objects.set(
      streamObjectId,
      Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "latin1"),
        stream,
        Buffer.from("\nendstream", "latin1"),
      ]),
    );
  });

  objects.set(
    2,
    Buffer.from(
      `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(" ")}] >>`,
      "latin1",
    ),
  );

  const maxObjectId = Math.max(...objects.keys());
  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets = new Array<number>(maxObjectId + 1).fill(0);
  let cursor = chunks[0].length;

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    const body = objects.get(objectId);

    if (!body) {
      throw new Error(`Objeto PDF ${objectId} nao foi gerado.`);
    }

    offsets[objectId] = cursor;
    const objectBuffer = Buffer.concat([
      Buffer.from(`${objectId} 0 obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);

    chunks.push(objectBuffer);
    cursor += objectBuffer.length;
  }

  const xrefOffset = cursor;
  const xref: string[] = [
    "xref",
    `0 ${maxObjectId + 1}`,
    "0000000000 65535 f ",
  ];

  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    xref.push(`${String(offsets[objectId]).padStart(10, "0")} 00000 n `);
  }

  xref.push(
    "trailer",
    `<< /Size ${maxObjectId + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  );

  chunks.push(Buffer.from(`${xref.join("\n")}\n`, "latin1"));
  return Buffer.concat(chunks);
}

function buildDocumentCode(input: AssemblyMinutePdfInput) {
  const compactAssemblyId = sanitizeFileName(input.assemblyId).slice(-10).toUpperCase();
  return `ATA-${compactAssemblyId}-V${input.minuteVersion}`;
}

export async function generateAssemblyMinutePdf(
  input: AssemblyMinutePdfInput,
): Promise<AssemblyMinutePdfDocument> {
  const documentCode = buildDocumentCode(input);
  const officialized = officializePublishedMinuteContent(input.minuteContent);
  const logo = await loadOfficialLogo();
  const administrator = input.administrator || null;
  const contentHash = hashSha256(
    [
      input.assemblyId,
      input.minuteId,
      String(input.minuteVersion),
      input.publishedAt.toISOString(),
      officialized.content,
      administrator?.name || "",
      administrator?.cnpj || "",
      administrator?.email || "",
      administrator?.phone || "",
    ].join("\n"),
  );

  const lines = buildDocumentLines(
    {
      ...input,
      minuteContent: officialized.content,
    },
    contentHash,
  );
  const pages = paginate(lines);
  const bytes = buildPdfBytes(pages, logo);
  const fileHash = hashSha256(bytes);

  const fileName = `${sanitizeFileName(
    input.condominiumName,
  )}-${documentCode.toLowerCase()}.pdf`;

  return {
    bytes,
    contentHash,
    fileHash,
    documentCode,
    fileName,
    officialContent: officialized.content,
    officializationApplied: officialized.applied,
    logoEmbedded: Boolean(logo),
  };
}
