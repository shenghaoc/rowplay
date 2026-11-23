/** Native Worker bindings used by adapter-cloudflare 8. Keep DOM types scoped to the app. */
declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
