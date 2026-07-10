import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { nowEpochMillis } from "$lib/datetime";
import { getConfig } from "$lib/server/config";
import { getValue } from "$lib/i18n";
import { fetchMe } from "$lib/server/concept2";
import { TOKEN_COOKIE, writeSession, type SessionUser } from "$lib/server/session";
import { sealToken } from "$lib/server/tokenCrypto";

export const load: PageServerLoad = async (event) => {
  // Already authenticated — nothing to enter.
  if (event.locals.user) throw redirect(303, "/dashboard");
  return { oauthEnabled: !!getConfig(event).clientId };
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const actions: Actions = {
  default: async (event) => {
    const data = await event.request.formData();
    const tr = (k: string) => getValue(event.locals.lang, k) ?? getValue("en", k) ?? k;
    const raw = data.get("token");
    const token = typeof raw === "string" ? raw.trim() : "";
    if (!token) return fail(400, { error: tr("token.empty") });

    const cfg = getConfig(event);
    const secret = event.platform?.env?.SESSION_SECRET;
    if (!secret) return fail(500, { error: tr("token.serverMisconfigured") });

    // Validate by fetching the owner; a bad token is rejected here.
    let user: SessionUser;
    try {
      user = await fetchMe(cfg, token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // Distinguish Concept2 API failures from invalid tokens so the user
      // gets actionable feedback instead of "token rejected" for every error.
      if (/50[023]/.test(msg) || /timeout|abort/i.test(msg)) {
        return fail(502, { error: tr("token.serverUnavailable") });
      }
      return fail(400, { error: tr("token.rejected") });
    }

    const sealed = await sealToken(secret, token);
    // Session data stored in an encrypted cookie — no server-side storage.
    await writeSession(event.cookies, event, secret, {
      user,
      personal: true,
      tokens: {
        accessToken: "",
        refreshToken: "",
        expiresAt: nowEpochMillis() + YEAR_MS,
        scope: "",
      },
    });
    event.cookies.set(TOKEN_COOKIE, sealed, {
      path: "/",
      httpOnly: true,
      secure: event.url.protocol === "https:",
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 30,
    });

    throw redirect(303, "/dashboard");
  },
};
