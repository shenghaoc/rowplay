# Implementation Plan

## Overview

Replace the single `/docs` page with a multi-section in-app user guide:
SvelteKit route section under `src/routes/docs`, shared layout with sidebar,
`DocsArticle`/`DocsPage` components, `DOCS_SECTIONS` registry in
`src/lib/docs.ts`, localized content across six locales, contextual help
links, and subpath-hosting support via `base` from `$app/paths`.

## Tasks

- [x] 1. Create `src/lib/docs.ts` — registry, helpers, markdown parser
  - Define `DOCS_SECTIONS` array (overview + 7 subsections)
  - Implement `docsSectionPath(slug)` and `isActiveDocsSection(slug, pathname)`
  - Implement `parseGuideMarkdown(markdown)` returning typed block/inline AST
  - Normalize unsafe relative links to `#`
  - Export types: `DocsSectionKey`, `InlineNode`, `MarkdownBlock`, `MarkdownDocument`
  - _Requirements: 1, 5_

- [x] 2. Create `src/lib/docs.test.ts` — registry, path, and parser tests
  - Test unique slugs/keys, URL-safety, overview-first ordering
  - Test `docsSectionPath` mapping
  - Test `isActiveDocsSection` exact/prefix matching
  - Test markdown parser: headings, paragraphs, lists, links, code, blockquotes
  - Test unsafe link normalization, heading slug generation
  - _Requirements: 1_

- [x] 3. Create `src/components/DocsArticle.svelte` — markdown renderer
  - Render parsed `MarkdownDocument` blocks (headings with anchors, paragraphs,
    lists, blockquotes, code fences)
  - Render inline nodes (text, code, strong, links)
  - External links: `target="_blank" rel="external noopener noreferrer"`
  - Internal links: prepend `base` from `$app/paths`
  - Defensive fallback: `markdown || ''` for null safety
  - _Requirements: 1, 5_

- [x] 4. Create `src/components/DocsPage.svelte` — section page wrapper
  - Accept `section: DocsSectionKey` prop
  - Compute page title from locale key with `|| ''` fallback
  - Render `<svelte:head>` with title and meta description
  - Delegate to `DocsArticle` with section markdown and label
  - _Requirements: 1, 3_

- [x] 5. Create `src/routes/docs/+layout.svelte` — sidebar layout
  - Import `base` from `$app/paths` for subpath support
  - Kicker bar: badge + Dashboard link (`{base}/dashboard`) + Source link
  - Sidebar nav: daisyUI `menu`, `aria-current="page"` on active section
  - Sidebar links use `{base}{docsSectionPath(section.slug)}`
  - Responsive: sidebar collapses to horizontal row on ≤760px
  - _Requirements: 1, 2, 5, 7, 8_

- [x] 6. Create subsection route pages
  - Each `src/routes/docs/<slug>/+page.svelte` is a thin wrapper passing
    the `DocsSectionKey` to `DocsPage`
  - Sections: getting-started, rowing-metrics, pace-splits-watts,
    charts-and-progress, workflows, faq, troubleshooting
  - _Requirements: 1_

- [x] 7. Update locale dictionaries (all 6 locales)
  - Replace `docs.guideMarkdown` with `docs.sections.<key>.navTitle` and
    `docs.sections.<key>.markdown` for each section
  - Translate all section content for en, zh, de, es, fr, ja
  - Update `nav.docs` value from "Docs" to "Help"
  - Add `docs.badge`, `docs.openDashboard`, `docs.openSource`, `docs.navLabel`
  - Add contextual help string keys (`docs.contextual.*`)
  - _Requirements: 3, 6_

- [x] 8. Update `src/lib/locales/locales.test.ts`
  - Extend key-completeness test to cover new `docs.sections.*` structure
  - Ensure all non-English locales match English keys
  - _Requirements: 3_

- [x] 9. Add contextual help links throughout the app
  - `WorkoutList.svelte`: link to `/docs/getting-started` on empty list
  - `dashboard/+page.svelte`: link to `/docs/charts-and-progress` on empty
    trends, `/docs/troubleshooting` on sync error/partial history
  - `compare/+page.svelte`: link to `/docs/troubleshooting` on no stroke data
  - `leaderboard/+page.svelte`: link to `/docs/workflows` on empty board
  - `replay/[id]/+page.svelte`: link to `/docs/pace-splits-watts` on empty
    telemetry
  - `settings/+page.svelte`: link to `/docs/troubleshooting` on token/sync
    issues
  - _Requirements: 4_

- [x] 10. Update `src/routes/docs/+page.svelte` — overview wrapper
  - Replace monolithic markdown rendering with thin `DocsPage` wrapper
  - Pass `section="overview"` to `DocsPage`
  - _Requirements: 1_

- [x] 11. Rewrite `docs/usage.md`
  - Mirror the new section structure as the repository-facing English reference
  - _Requirements: 7_

- [x] 12. Address Gemini review — subpath hosting + defensive fallbacks
  - Import `base` from `$app/paths` in `DocsArticle.svelte` and layout
  - Prepend `base` to all internal `href` values
  - Add `|| ''` fallback for `markdown` prop and `sectionTitle`
  - Remove stale `eslint-disable` comments where `base` prefix resolves them
  - _Requirements: 5_

- [x] 13. Verify quality gate
  - Run `pnpm run lint` → 0 errors
  - Run `pnpm run typecheck` → 0 errors (known `state_referenced_locally` warnings OK)
  - Run `pnpm run test` → all tests pass, count must not decrease
  - Run `pnpm run build` → succeeds
  - _Requirements: all_
