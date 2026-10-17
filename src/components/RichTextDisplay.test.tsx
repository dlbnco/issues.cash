import { renderToStaticMarkup } from "react-dom/server";
import { RichTextDisplay } from "./RichTextDisplay";

const text = (text: string, format = 0) => ({ type: "text", text, format });

describe("RichTextDisplay", () => {
  it("preserves paragraphs, line breaks, lists and inline formatting", () => {
    const value = { root: { type: "root", children: [
      { type: "paragraph", children: [text("First", 1), { type: "linebreak" }, text("second", 2)] },
      { type: "paragraph", children: [text("Next paragraph")] },
      { type: "list", listType: "number", start: 2, children: [
        { type: "listitem", children: [text("First item")] },
        { type: "listitem", children: [text("Second item")] },
      ] },
    ] } };
    const html = renderToStaticMarkup(<RichTextDisplay value={value} />);
    expect(html).toContain("<strong>First</strong><br/><em>second</em>");
    expect(html).toContain("Next paragraph</p>");
    expect(html).toContain('<ol start="2"');
    expect(html).toContain("<li>First item</li><li>Second item</li>");
  });

  it("escapes text and ignores malformed nodes instead of crashing the page", () => {
    const html = renderToStaticMarkup(<RichTextDisplay value={{ root: { type: "root", children: [
      null, { type: "text", text: "<script>alert(1)</script>" }, { children: "invalid" },
    ] } }} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(() => renderToStaticMarkup(<RichTextDisplay value={null} />)).not.toThrow();
  });
});
