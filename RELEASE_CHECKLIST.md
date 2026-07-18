# Release checklist

Lightweight process for cutting a release. This is a solo project — no
elaborate branching, no version milestones. Tag, push, deploy.

## Before tagging

- [ ] `vp run check` — formatting, lint, typecheck, Vitest, and production build pass
- [ ] `vp run validate:locales` — all i18n keys are consistent across languages
- [ ] `vp run test:e2e:smoke` — Chromium smoke passes against Workers preview
- [ ] Run `vp run test:e2e` when the release affects broad browser flows
- [ ] Manual smoke in demo mode: `/dashboard` → click a workout → replay plays
- [ ] If auth, sessions, or live Concept2 reads changed, smoke BYOT on `vp run preview`
- [ ] If user-facing behavior changed, confirm README screenshots and feature claims remain accurate

## Tag and release

```bash
# Bump version in package.json (follow semver)
pnpm version patch   # or minor, or major
git push --follow-tags
```

Then create a **GitHub Release** from the tag:

1. Go to [Releases](https://github.com/shenghaoc/rowplay/releases) → **Draft a new release**.
2. Choose the tag you just pushed.
3. Click **Generate release notes** — GitHub auto-populates merged PRs since
   the last release.
4. Add a short summary of user-facing changes at the top. Keep it brief:
   new features, notable fixes, breaking changes.
5. Publish.

## Deploy

```bash
# Build + deploy to Cloudflare Workers
vp run deploy
```

## After deploy

- [ ] Visit the production URL — confirm the new version loads
- [ ] Demo dashboard loads and a bundled workout replay plays
- [ ] If auth or session handling changed, verify the authenticated BYOT flow
- [ ] If Concept2 data loading changed, verify that authenticated pages read live data

## Rollback

If something goes wrong:

```bash
# Roll back to the previous deploy (Workers keeps the last deployable version)
vp exec wrangler rollback

# Or deploy a specific tag:
git checkout <tag>
vp run deploy
```
