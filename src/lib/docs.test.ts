import { describe, expect, it } from "vite-plus/test";
import { parseGuideMarkdown } from "./docs";

describe("parseGuideMarkdown", () => {
  it("parses headings, paragraphs, lists, links, inline code, and code fences", () => {
    const guide = parseGuideMarkdown(`# Guide

Intro with **strong text**, \`inline code\`, and [a link](/dashboard).

## Steps

1. Open the dashboard.
2. Press Replay.

\`\`\`bash
npm run validate:locales
\`\`\`
`);

    expect(guide.title).toBe("Guide");
    expect(guide.blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "list",
      "code",
    ]);
    expect(guide.blocks[2]).toMatchObject({ type: "heading", slug: "steps" });
    expect(guide.blocks[3]).toMatchObject({
      type: "list",
      ordered: true,
      items: expect.arrayContaining([
        expect.objectContaining({
          children: [expect.objectContaining({ text: "Open the dashboard." })],
        }),
      ]),
    });
    expect(guide.blocks[4]).toMatchObject({
      type: "code",
      language: "bash",
      code: "npm run validate:locales",
    });
  });

  it("normalizes unsafe relative links to an inert target", () => {
    const guide = parseGuideMarkdown("[bad](javascript:alert(1)) [ok](https://example.com)");
    const paragraph = guide.blocks[0];

    expect(paragraph).toMatchObject({ type: "paragraph" });
    if (paragraph.type !== "paragraph") throw new Error("expected paragraph");

    expect(paragraph.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "link", href: "#" }),
        expect.objectContaining({ type: "link", href: "https://example.com" }),
      ]),
    );
  });

  it("uses rendered heading text for slugs and titles", () => {
    const guide = parseGuideMarkdown("# **Use** `rowplay` [docs](/docs)");
    const heading = guide.blocks[0];

    expect(guide.title).toBe("Use rowplay docs");
    expect(heading).toMatchObject({ type: "heading", slug: "use-rowplay-docs" });
  });

  it("parses multi-line blockquotes with inline formatting", () => {
    const guide = parseGuideMarkdown(`> First line
>
> Second **line** with [docs](/docs)`);
    const quote = guide.blocks[0];

    expect(quote).toMatchObject({ type: "quote" });
    if (quote.type !== "quote") throw new Error("expected quote");

    expect(JSON.stringify(quote.children)).toContain("First line");
    expect(JSON.stringify(quote.children)).toContain("Second ");
    expect(quote.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "strong" }),
        expect.objectContaining({ type: "link", href: "/docs" }),
      ]),
    );
  });
});
