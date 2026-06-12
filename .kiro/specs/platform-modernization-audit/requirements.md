# Requirements: Platform & Stack Modernization Audit

## Introduction

This document records the June 2026 audit of rowplay against current library documentation (Context7 MCP), the [WHATWG HTML living standard](https://html.spec.whatwg.org/multipage/), 2026 platform capabilities (Node 26+ native Temporal, WebKit gaps), and the modernization checklist from [hdb-resale-visualizer PR #223](https://github.com/shenghaoc/hdb-resale-visualizer/pull/223). Findings live in `design.md`; remediation is tracked in `tasks.md` and implemented in the same PR.

**Scope:** `package.json` dependencies and devDependencies; configuration (`vite.config.ts`, `svelte.config.js`, `wrangler.jsonc`, Vitest/Playwright); HTML (`app.html`); CSS (`app.css` + component styles); JavaScript/TypeScript patterns in `src/`; PWA/service worker; security headers; accessibility; i18n/storage patterns.

**Out of scope:** Rebuilding completed features listed in `AGENTS.md`; production deploy credentials; OAuth registration.

## Glossary

- **Audit_Date**: June 2026 review captured in this spec
- **Context7**: MCP documentation source used to verify idiomatic library usage
- **PR_223**: hdb-resale-visualizer pull request adopting `light-dark()`, `content-visibility`, `text-box-trim`, `@property`, `@starting-style`, `prefers-contrast`, input UX hints, and related 2026 CSS
- **Runes_Mode**: Svelte 5 `$props`, `$state`, `$derived`, `$effect`, snippets — required project-wide
- **Workers_Runtime**: Cloudflare Workers via `@sveltejs/adapter-cloudflare`; distinct from `vite dev`
- **Temporal_Polyfill**: Conditional `temporal-polyfill/global` load when `globalThis.Temporal` is absent

## Requirements

### Requirement 1: Dependency Usage Must Match Installed Versions

**User Story:** As a maintainer, I want every `package.json` dependency verified against current docs, so that AI-generated or legacy syntax does not linger in the codebase.

#### Acceptance Criteria

1. THE Audit SHALL document a verdict (✅ modern, ⚠️ action needed, ❌ unused/incorrect) for each direct dependency and devDependency
2. THE Audit SHALL confirm Svelte 5 runes mode with zero Svelte 4 patterns (`export let`, `on:click`, `$:`, `createEventDispatcher`) in `src/`
3. THE Audit SHALL flag packages listed in `package.json` with zero imports in `src/`
4. THE Audit SHALL note deprecated SvelteKit APIs still in use (`$app/stores`)

### Requirement 2: HTML Must Align With WHATWG Capabilities

**User Story:** As a maintainer, I want HTML markup reviewed against the living standard, so that native platform features replace custom JS where appropriate.

#### Acceptance Criteria

1. THE Audit SHALL record current semantic HTML usage (`main`, `nav`, `section`, form controls, ARIA)
2. THE Audit SHALL list native HTML features not yet adopted (`dialog`, `details`, `search`, Popover API, Web Share, `inert`, input hints)
3. THE Audit SHALL note PWA/meta gaps (`mobile-web-app-capable`, manifest dark `theme_color`, share `og:image`)
4. THE Audit SHALL confirm absence of unsafe patterns (`@html`, `innerHTML`, `document.write`)

### Requirement 3: CSS Must Be Evaluated Against 2026 Features

**User Story:** As a maintainer, I want CSS modernization opportunities documented using the same checklist as PR_223, adapted for rowplay's daisyUI + custom token architecture.

#### Acceptance Criteria

1. THE Audit SHALL compare rowplay `app.css` against PR_223 feature list
2. THE Audit SHALL note where TanStack Virtual makes `content-visibility` redundant
3. THE Audit SHALL document `prefers-reduced-motion` gaps on component-level animations
4. THE Audit SHALL record deprecated CSS (`clip: rect` in `.sr-only`)

### Requirement 4: JavaScript Platform Usage Must Be Current

**User Story:** As a maintainer, I want JS/TS patterns checked against 2026 APIs, so polyfills are kept only where runtimes require them.

#### Acceptance Criteria

1. THE Audit SHALL document the Temporal native vs polyfill split (Node 26+, Chromium/Firefox vs WebKit + Workers SSR)
2. THE Audit SHALL list modern APIs already in use (`fetch`, `AbortController`, `ResizeObserver`, `URLSearchParams`, `replaceAll`, `Array.at`, top-level `await`)
3. THE Audit SHALL note optional APIs not yet used (`navigator.share`, `Intl.DurationFormat`, View Transitions API scoped)
4. THE Audit SHALL document cookie + localStorage dual-persistence pattern for SSR vs client prefs

### Requirement 5: Security and Performance Gaps Must Be Recorded

**User Story:** As a maintainer, I want non-style gaps captured so a follow-up implementation pass can prioritize correctly.

#### Acceptance Criteria

1. THE Audit SHALL note existing security headers in `hooks.server.ts` and missing CSP
2. THE Audit SHALL note font loading strategy (Google Fonts blocking link, `display=swap` present)
3. THE Audit SHALL note share page Open Graph tags without `og:image`
4. THE Audit SHALL produce a prioritized remediation list in `tasks.md`

### Requirement 6: Steering Docs Must Reflect Audit Findings

**User Story:** As a developer using Kiro, I want steering/spec docs to reflect audit truth, so agents do not recommend unused libraries or outdated patterns.

#### Acceptance Criteria

1. `tech.md` SHALL NOT list `bits-ui`, `clsx`, or `tailwind-merge` as active stack unless wired up or removed
2. THIS spec SHALL be the canonical reference for modernization work until tasks are completed
3. Implementation of audit tasks ships in the same PR as this spec (see `tasks.md` checkboxes)

## Audit Verdict Summary

| Area | Overall verdict |
|------|-----------------|
| Svelte 5 / runes | ✅ Modern |
| SvelteKit 2 patterns | ⚠️ `$app/stores` deprecated |
| Tailwind v4 + daisyUI v5 | ✅ Modern CSS-first setup |
| Unused npm packages | ❌ 3 dead dependencies |
| HTML semantics | ✅ Good; native overlay primitives missing |
| 2026 CSS (PR_223 set) | ❌ Not adopted in rowplay |
| Temporal strategy | ✅ Correct polyfill gating |
| Security | ⚠️ No CSP |
| E2E target (WebKit) | ✅ Appropriate for polyfill coverage |

## References

- [WHATWG HTML Standard](https://html.spec.whatwg.org/multipage/)
- [hdb-resale-visualizer PR #223](https://github.com/shenghaoc/hdb-resale-visualizer/pull/223)
- Context7 library IDs used: `/websites/svelte_dev_svelte`, `/websites/svelte_dev_kit`, `/tailwindlabs/tailwindcss.com`, `/vitest-dev/vitest`, `/mrdoob/three.js`, `/websites/playwright_dev`, `/leeoniya/uplot`, `/lucide-icons/lucide`, `/wobsoriano/svelte-sonner`, `/tanstack/virtual`, `/websites/daisyui`, `/websites/developers_cloudflare_workers`
