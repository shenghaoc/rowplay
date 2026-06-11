# Release checklist

Lightweight process for cutting a release. This is a solo project — no
elaborate branching, no version milestones. Tag, push, deploy.

## Before tagging

- [ ] `pnpm check` — zero type errors
- [ ] `pnpm test` — all tests green, count has not decreased
- [ ] `pnpm build` — production build succeeds
- [ ] `pnpm test:e2e` — Playwright smoke passes (requires `wrangler dev`)
- [ ] `pnpm validate:locales` — all i18n keys consistent across languages
- [ ] Manual smoke in demo mode: `/dashboard` → click a workout → replay plays
- [ ] If auth/sync touched, manual smoke with a real token on `pnpm preview`
- [ ] If new DB migrations added, `pnpm db:migrate:local` succeeds

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
# Apply any pending remote DB migrations first
pnpm db:migrate

# Build + deploy to Cloudflare Workers
pnpm deploy
```

## After deploy

- [ ] Visit the production URL — confirm the new version loads
- [ ] Quick demo-mode smoke: dashboard loads, replay plays
- [ ] If auth/sync changed: connect with a real token, force a sync

## Rollback

If something goes wrong:

```bash
# Roll back to the previous deploy (Workers keeps the last deployable version)
npx wrangler rollback

# Or deploy a specific tag:
git checkout <tag>
pnpm deploy
```
