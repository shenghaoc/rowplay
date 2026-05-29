---
name: svelte-code-writer
description: CLI tools for Svelte 5 / SvelteKit documentation lookup and code analysis. Load this skill when creating, editing, or analyzing a Svelte component or module.
---

This skill provides three `@sveltejs/mcp` CLI commands for working on Svelte code.

## Commands

### List documentation sections

```bash
npx @sveltejs/mcp list-sections
```

Lists all available Svelte 5 and SvelteKit documentation sections with their titles and paths.

### Get documentation

```bash
npx @sveltejs/mcp get-documentation "<section1>,<section2>,..."
```

Retrieves the full documentation for the sections you identify from `list-sections`
(e.g. `"$state,$derived,$effect"`).

### Autofixer

```bash
npx @sveltejs/mcp svelte-autofixer "<code_or_path>"
```

Analyzes Svelte code and suggests fixes for common issues. Accepts either an inline
code snippet or a file path, and supports async mode and a version target (Svelte 4 or 5).

> [!IMPORTANT]
> When passing code containing runes such as `$state` or `$derived` through the terminal,
> escape the dollar sign as `\$` so the shell does not perform variable substitution.

## Recommended workflow

1. If unsure about syntax, check the documentation first with `list-sections` then `get-documentation`.
2. Run `svelte-autofixer` while reviewing or debugging code.
3. Validate every component with the autofixer before considering it complete.
