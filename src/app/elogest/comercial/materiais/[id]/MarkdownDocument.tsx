import type { ReactNode } from "react";

type Props = {
  content: string;
};

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "divider" };

function isSafeHref(href: string) {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

function renderInline(text: string): ReactNode[] {
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    if (match[2] && match[3]) {
      const href = match[3].trim();
      if (isSafeHref(href)) {
        nodes.push(
          <a
            key={`inline-${key++}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-[#256D3C] underline decoration-[#A9C9B2] underline-offset-4 hover:text-[#184B2A]"
          >
            {match[2]}
          </a>,
        );
      } else {
        nodes.push(match[0]);
      }
    } else if (match[4] || match[5]) {
      nodes.push(
        <strong key={`inline-${key++}`} className="font-semibold text-[#17211B]">
          {match[4] || match[5]}
        </strong>,
      );
    } else if (match[6] || match[7]) {
      nodes.push(
        <em key={`inline-${key++}`} className="italic">
          {match[6] || match[7]}
        </em>,
      );
    } else if (match[8]) {
      nodes.push(
        <code
          key={`inline-${key++}`}
          className="rounded-md bg-[#EEF2EF] px-1.5 py-0.5 font-mono text-[0.9em] text-[#27352D]"
        >
          {match[8]}
        </code>,
      );
    }

    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function parseMarkdown(content: string): Block[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (/^(---|___|\*\*\*)$/.test(line)) {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", lines: quoteLines });
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "unordered-list", items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ordered-list", items });
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;

    while (index < lines.length) {
      const next = lines[index].trim();
      if (
        !next ||
        /^(#{1,3})\s+/.test(next) ||
        /^(---|___|\*\*\*)$/.test(next) ||
        /^>\s?/.test(next) ||
        /^[-*+]\s+/.test(next) ||
        /^\d+[.)]\s+/.test(next)
      ) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }

    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

export default function MarkdownDocument({ content }: Props) {
  const blocks = parseMarkdown(content);

  return (
    <article className="mx-auto max-w-4xl text-[#344139]">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          if (block.level === 1) {
            return (
              <h1
                key={`block-${index}`}
                className="mb-6 mt-2 text-3xl font-semibold tracking-tight text-[#17211B] sm:text-4xl"
              >
                {renderInline(block.text)}
              </h1>
            );
          }

          if (block.level === 2) {
            return (
              <h2
                key={`block-${index}`}
                className="mb-3 mt-10 border-b border-[#E5EBE7] pb-3 text-2xl font-semibold tracking-tight text-[#17211B]"
              >
                {renderInline(block.text)}
              </h2>
            );
          }

          return (
            <h3
              key={`block-${index}`}
              className="mb-2 mt-7 text-lg font-semibold text-[#1F3528]"
            >
              {renderInline(block.text)}
            </h3>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={`block-${index}`} className="my-4 text-[15px] leading-7 sm:text-base">
              {block.lines.map((line, lineIndex) => (
                <span key={`line-${lineIndex}`}>
                  {lineIndex > 0 ? " " : null}
                  {renderInline(line)}
                </span>
              ))}
            </p>
          );
        }

        if (block.type === "unordered-list") {
          return (
            <ul
              key={`block-${index}`}
              className="my-5 list-disc space-y-2 pl-6 text-[15px] leading-7 marker:text-[#256D3C] sm:text-base"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "ordered-list") {
          return (
            <ol
              key={`block-${index}`}
              className="my-5 list-decimal space-y-2 pl-6 text-[15px] leading-7 marker:font-semibold marker:text-[#256D3C] sm:text-base"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={`block-${index}`}
              className="my-6 rounded-r-2xl border-l-4 border-[#256D3C] bg-[#F3F8F4] px-5 py-4 text-[15px] italic leading-7 text-[#344139] sm:text-base"
            >
              {block.lines.map((line, lineIndex) => (
                <p key={`quote-${lineIndex}`}>{renderInline(line)}</p>
              ))}
            </blockquote>
          );
        }

        return <hr key={`block-${index}`} className="my-8 border-[#DDE5DF]" />;
      })}
    </article>
  );
}
