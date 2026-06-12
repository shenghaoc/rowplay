import { describe, expect, it } from "vite-plus/test";
import { DOCS_SECTIONS, docsSectionPath, isActiveDocsSection, parseGuideMarkdown } from "./docs";

describe("DOCS_SECTIONS", () => {
  it("has unique slugs and keys, with the overview first", () => {
    const slugs = DOCS_SECTIONS.map((section) => section.slug);
    const keys = DOCS_SECTIONS.map((section) => section.key);

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DOCS_SECTIONS[0]).toEqual({ slug: "", key: "overview" });
  });

  it("uses URL-safe slugs", () => {
    for (const section of DOCS_SECTIONS.slice(1)) {
      expect(section.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("docsSectionPath", () => {
  it("maps the overview to /docs and sections to /docs/<slug>", () => {
    expect(docsSectionPath("")).toBe("/docs");
    expect(docsSectionPath("getting-started")).toBe("/docs/getting-started");
  });
});

describe("isActiveDocsSection", () => {
  it("matches the overview only on the docs root", () => {
    expect(isActiveDocsSection("", "/docs")).toBe(true);
    expect(isActiveDocsSection("", "/docs/")).toBe(true);
    expect(isActiveDocsSection("", "/docs/faq")).toBe(false);
  });

  it("matches a section on its own route without prefix collisions", () => {
    expect(isActiveDocsSection("faq", "/docs/faq")).toBe(true);
    expect(isActiveDocsSection("faq", "/docs/faq-other")).toBe(false);
    expect(isActiveDocsSection("faq", "/docs")).toBe(false);
  });
});

describe("parseGuideMarkdown", () => {
  it("parses headings, paragraphs, lists, links, inline code, and code fences", () => {
    const guide = parseGuideMarkdown(`# Guide

Intro with **strong text**, \`inline code\`, and [a link](/dashboard).

## Steps

1. Open the dashboard.
2. Press Replay.

\`\`\`bash
pnpm validate:locales
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
      code: "pnpm validate:locales",
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
