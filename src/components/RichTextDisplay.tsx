interface RichTextNode {
  text?: string;
  children?: RichTextNode[];
}

function collectText(node: RichTextNode): string[] {
  const ownText = node.text ? [node.text] : [];
  return [...ownText, ...(node.children?.flatMap(collectText) ?? [])];
}

export function RichTextDisplay({ value }: { value: unknown }) {
  const root = value as { root?: RichTextNode };
  const text = root.root ? collectText(root.root).join("") : "";
  return <div className="whitespace-pre-wrap leading-7">{text}</div>;
}
