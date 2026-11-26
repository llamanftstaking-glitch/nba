import type { ReactNode } from "react";

/**
 * Small, safe Markdown renderer for assistant answers: headings, bullet and numbered lists, tables,
 * fenced code, paragraphs; inline bold, italic, code and links. It builds React elements only — model
 * text is never injected as HTML — and links are limited to http(s) and in-app paths.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[2] !== undefined) out.push(<strong key={k} className="font-semibold text-ink">{m[2]}</strong>);
    else if (m[3] !== undefined) out.push(<code key={k} className="num rounded bg-raised px-1 py-0.5 text-[0.92em] text-soft">{m[3]}</code>);
    else if (m[4] !== undefined && m[5] !== undefined) {
      const href = m[5];
      const safe = /^https?:\/\//i.test(href) || (href.startsWith("/") && !href.startsWith("//"));
      out.push(
        safe ? (
          <a key={k} href={href} className="text-accent underline-offset-2 hover:underline" {...(href.startsWith("/") ? {} : { target: "_blank", rel: "noreferrer noopener" })}>
            {m[4]}
          </a>
        ) : (
          m[4]
        ),
      );
    } else if (m[6] !== undefined) out.push(<em key={k}>{m[6]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const key = `b${n++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) body.push(lines[i++] ?? "");
      i++;
      blocks.push(
        <pre key={key} className="num overflow-x-auto rounded-md bg-raised/70 p-3 text-xs text-soft">
          {body.join("\n")}
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = (h[1] ?? "#").length;
      const cls = level <= 2 ? "font-display text-lg font-semibold uppercase tracking-wide text-ink" : "text-sm font-semibold text-ink";
      blocks.push(level <= 2 ? <h3 key={key} className={cls}>{inline(h[2] ?? "", key)}</h3> : <h4 key={key} className={cls}>{inline(h[2] ?? "", key)}</h4>);
      i++;
      continue;
    }
    if (line.includes("|") && isSep(lines[i + 1] ?? "")) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim()) rows.push(cells(lines[i++] ?? ""));
      blocks.push(
        <div key={key} className="overflow-x-auto rounded-md bg-raised/40" data-testid="md-table">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                {head.map((c, k) => (
                  <th key={k} scope="col" className="px-2.5 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-muted">{inline(c, `${key}h${k}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line/40 last:border-0">
                  {head.map((_, k) => (
                    <td key={k} className="num px-2.5 py-1.5 align-top text-soft">{inline(r[k] ?? "", `${key}r${ri}c${k}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*])\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      const re = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      while (i < lines.length && re.test(lines[i] ?? "")) items.push((re.exec(lines[i++] ?? "") ?? [])[1] ?? "");
      const lis = items.map((t, k) => (
        <li key={k} className="break-words">{inline(t, `${key}l${k}`)}</li>
      ));
      blocks.push(ordered ? <ol key={key} className="list-decimal space-y-1 pl-5 text-soft">{lis}</ol> : <ul key={key} className="list-disc space-y-1 pl-5 text-soft marker:text-faint">{lis}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() && !/^(#{1,4}\s|```|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i] ?? "") && !((lines[i] ?? "").includes("|") && isSep(lines[i + 1] ?? ""))) para.push(lines[i++] ?? "");
    blocks.push(
      <p key={key} className="break-words text-soft">
        {inline(para.join(" "), key)}
      </p>,
    );
  }
  return <div className="space-y-2.5 text-sm leading-relaxed" data-testid="markdown">{blocks}</div>;
}
