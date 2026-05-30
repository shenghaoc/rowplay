## 2024-05-30 - Added standard security headers
**Vulnerability:** Missing security headers
**Learning:** The application was missing basic defense-in-depth security headers like X-Frame-Options, X-Content-Type-Options, and Referrer-Policy, making it more vulnerable to clickjacking, MIME-sniffing, and referrer leakage.
**Prevention:** In SvelteKit applications, adding security headers to all responses can be elegantly handled using the `handle` hook in `hooks.server.ts`.
