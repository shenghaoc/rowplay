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

- **Token exposure** — any path that exposes a personal Concept2 API token in
  client-side JavaScript, URLs, errors, logs, or other readable output.
- **Cookie and session security** — broken cookie encryption or authentication,
  missing httpOnly/Secure/SameSite protections, session fixation, or cross-user
  session confusion.
- **Response data leakage** — authenticated data sent with public caching
  headers, request-state leakage that returns one user's live Concept2 response
  to another user, or other cross-user disclosure.
- **Sensitive logging** — cookies, tokens, profile data, or full workout
  payloads appearing in Workers logs.
- **CSRF** — state-changing cookie-backed endpoints missing appropriate
  request validation.
- **XSS** — unsafe rendering of workout comments, upstream/imported text, or
  other user-controlled content.
- **Unsafe redirects** — redirect handling that can disclose authorization
  credentials or send users to an attacker-controlled destination.
- **Resource exhaustion** — malformed or malicious input that causes avoidable,
  disproportionate Worker CPU, memory, or upstream-request use.

## Out of scope

- Issues that require physical access to the user's device.
- Social engineering attacks against Concept2 or Cloudflare.
- Ordinary volumetric denial-of-service or traffic floods handled by Cloudflare.
  Application bugs that amplify a small request into disproportionate Worker
  resource use remain in scope.
- Vulnerabilities in third-party dependencies that don't meaningfully affect
  rowplay's attack surface (report those upstream instead).

## Disclosure timeline

- I'll acknowledge your report within **72 hours**.
- I aim to ship a fix within **7 days** for high-severity issues.
- After the fix is deployed, I'll publish a GitHub Security Advisory and credit
  you (unless you prefer to remain anonymous).

## Preferred languages

English or Chinese (中文).
