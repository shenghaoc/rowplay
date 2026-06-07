# Security policy

## Reporting a vulnerability

rowplay is a solo-maintained project. I take security seriously, especially
anything involving the handling of personal Concept2 API tokens.

**Please do not file public issues for security vulnerabilities.**

Instead, report them privately via:

👉 **[GitHub Security Advisories](https://github.com/shenghaoc/rowplay/security/advisories/new)**

This creates a private fork where we can collaborate on a fix before public
disclosure. If you can't use GitHub Advisories, email the maintainer directly
(see the commit history for contact details).

## Scope

Issues of particular interest:

- **Token exposure** — any path that leaks the Concept2 API token (plaintext in
  logs, client-side JS access, KV/D1 storage, URL query params, error messages).
- **Session hijacking** — cookie theft, missing httpOnly/Secure/SameSite flags,
  session fixation.
- **Data leakage** — one user accessing another user's cached workouts or
  personal data.
- **Injection** — SQL injection via D1, XSS via user-controlled content.
- **CSRF** — state-changing endpoints missing origin validation.

## Out of scope

- Issues that require physical access to the user's device.
- Social engineering attacks against Concept2 or Cloudflare.
- Denial-of-service against the public demo deployment (it's on a free tier;
  rate limiting is handled by Cloudflare).
- Vulnerabilities in third-party dependencies that don't meaningfully affect
  rowplay's attack surface (report those upstream instead).

## Disclosure timeline

- I'll acknowledge your report within **72 hours**.
- I aim to ship a fix within **7 days** for high-severity issues.
- After the fix is deployed, I'll publish a GitHub Security Advisory and credit
  you (unless you prefer to remain anonymous).

## Preferred languages

English or Chinese (中文).
