# Stateless Cloudflare Storage Removal — Tasks

- [x] Remove KV/D1 bindings, runtime types, server data modules, and migrations.
- [x] Replace KV sessions with AES-GCM sealed `rp_session` cookies and retain
  sealed `rp_tok` BYOT handling.
- [x] Read complete live history for dashboard/replay/export and memoise it per
  request.
- [x] Persist OAuth refreshes back to the encrypted session cookie.
- [x] Keep athlete-scoped cookie goals, validated timezone preferences, and
  Settings export controls.
- [x] Remove storage-dependent UI/modules and retire their endpoints/pages.
- [x] Make near-live polling request only the newest API page.
- [x] Update usage documentation, locale guides, repository steering, and PR
  metadata for the stateless architecture.
- [x] Add/adjust unit and smoke coverage; pass the repository and PR checks.
