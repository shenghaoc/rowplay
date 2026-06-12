# In-App User Guide — Design

## Context

The original `/docs` page was a single SvelteKit route rendering one large
markdown blob from the locale dictionary (`docs.guideMarkdown`). This made the
guide hard to navigate, impossible to deep-link, and the monolithic markdown
string was difficult to maintain across six locales.

## Architecture

### Route structure

The single `/docs` page is replaced with a SvelteKit route section:

```
src/routes/docs/
  +layout.svelte          Sidebar nav + page chrome
  +page.svelte            Overview (delegates to DocsPage)
  getting-started/
    +page.svelte
  rowing-metrics/
    +page.svelte
  pace-splits-watts/
    +page.svelte
  charts-and-progress/
    +page.svelte
  workflows/
    +page.svelte
  faq/
    +page.svelte
  troubleshooting/
    +page.svelte
```

Each subsection page is a thin wrapper that passes its `DocsSectionKey` to the
shared `DocsPage` component.

### Component hierarchy

```
+layout.svelte (docs)
├── kicker bar (badge + Dashboard link + Source link)
├── <nav> sidebar (daisyUI menu, aria-current on active section)
└── {@render children()} → DocsPage
    └── DocsArticle (markdown renderer)
```

### `src/lib/docs.ts`

Central registry and utilities:

- `DOCS_SECTIONS` — ordered array of `{ slug, key }` entries. Drives both the
  sidebar nav and the route-to-key mapping.
- `docsSectionPath(slug)` — returns the route path for a section slug.
- `isActiveDocsSection(slug, pathname)` — determines sidebar active state.
- `parseGuideMarkdown(markdown)` — parses markdown into a typed block/inline
  AST (`MarkdownDocument`). Handles headings, paragraphs, lists, blockquotes,
  code fences, and inline formatting (bold, code, links). Unsafe relative links
  are normalized to `#`.
- Types: `DocsSectionKey`, `InlineNode`, `MarkdownBlock`, `MarkdownDocument`.

### i18n

Each section has two locale keys:

```
docs.sections.<key>.navTitle   — sidebar label (short)
docs.sections.<key>.markdown   — full markdown body
```

The old `docs.guideMarkdown` monolithic key is removed. All six locales
(en, zh, de, es, fr, ja) are updated with translated section content.

### Contextual help links

Lightweight help links are added to empty/error states throughout the app:

| Location | Link target | Condition |
|---|---|---|
| `WorkoutList.svelte` | `/docs/getting-started` | Empty workout list |
| `dashboard/+page.svelte` | `/docs/charts-and-progress` | Empty trend panel |
| `dashboard/+page.svelte` | `/docs/troubleshooting` | Sync error / partial history |
| `compare/+page.svelte` | `/docs/troubleshooting` | No stroke data |
| `leaderboard/+page.svelte` | `/docs/workflows` | Empty leaderboard |
| `replay/[id]/+page.svelte` | `/docs/pace-splits-watts` | Telemetry charts empty |
| `settings/+page.svelte` | `/docs/troubleshooting` | Token / sync issues |

### Subpath hosting

Internal links use SvelteKit's `base` path from `$app/paths` to support
subpath-hosted deployments. `base` is prepended to all internal `href` values
in `DocsArticle.svelte`, `DocsPage.svelte` (via `docsSectionPath`), and the
docs layout.

### Nav rename

The navigation entry label changes from "Docs" to "Help" (`nav.docs` locale
key value updated in all locales).

## Files changed

| File | Change |
|---|---|
| `src/lib/docs.ts` | New: registry, helpers, markdown parser |
| `src/lib/docs.test.ts` | New: tests for registry, path helpers, parser |
| `src/components/DocsArticle.svelte` | New: markdown renderer component |
| `src/components/DocsPage.svelte` | New: section page wrapper |
| `src/routes/docs/+layout.svelte` | New: sidebar layout |
| `src/routes/docs/+page.svelte` | Rewritten: thin overview wrapper |
| `src/routes/docs/*/` | New: 7 subsection routes |
| `src/lib/locales/*.ts` | Updated: section keys replace monolithic markdown |
| `src/lib/locales/locales.test.ts` | Updated: key-completeness for new structure |
| `src/routes/+layout.svelte` | Updated: nav label Docs → Help |
| `src/components/WorkoutList.svelte` | Updated: contextual help link |
| `src/routes/dashboard/+page.svelte` | Updated: contextual help links |
| `src/routes/compare/+page.svelte` | Updated: contextual help link |
| `src/routes/leaderboard/+page.svelte` | Updated: contextual help link |
| `src/routes/replay/[id]/+page.svelte` | Updated: contextual help link |
| `src/routes/settings/+page.svelte` | Updated: contextual help links |
| `docs/usage.md` | Rewritten: mirrors new section structure |
