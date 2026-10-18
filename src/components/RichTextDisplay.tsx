import { Fragment, type ReactNode } from "react";

function renderNode(value: unknown, key: number, depth = 0): ReactNode {
  if (!value || typeof value !== "object" || depth > 50) return null;
  const node = value as Record<string, unknown>;
  const children = Array.isArray(node.children)
    ? node.children.map((child, index) => renderNode(child, index, depth + 1)) : null;
  if (node.type === "text" && typeof node.text === "string") {
    let text: ReactNode = node.text;
    const format = typeof node.format === "number" ? node.format : 0;
    if (format & 1) text = <strong>{text}</strong>;
    if (format & 2) text = <em>{text}</em>;
    if (format & 4) text = <s>{text}</s>;
    if (format & 8) text = <u>{text}</u>;
    if (format & 16) text = <code>{text}</code>;
    return <Fragment key={key}>{text}</Fragment>;
  }
  switch (node.type) {
    case "linebreak": return <br key={key} />;
    case "paragraph": return <p key={key} className="min-h-7">{children}</p>;
    case "list": return node.listType === "number"
      ? <ol key={key} start={typeof node.start === "number" ? node.start : 1} className="list-decimal pl-6">{children}</ol>
      : <ul key={key} className="list-disc pl-6">{children}</ul>;
    case "listitem": return <li key={key}>{children}</li>;
    case "quote": return <blockquote key={key} className="border-l-2 pl-4">{children}</blockquote>;
    case "heading": return <h3 key={key} className="text-lg font-semibold">{children}</h3>;
    default: return <Fragment key={key}>{children}</Fragment>;
  }
}

export function RichTextDisplay({ value }: { value: unknown }) {
  const root = value && typeof value === "object" ? (value as Record<string, unknown>).root : null;
  return <div className="space-y-3 whitespace-pre-wrap leading-7">{renderNode(root, 0)}</div>;
}
