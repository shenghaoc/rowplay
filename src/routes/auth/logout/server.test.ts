import { describe, expect, it } from "vite-plus/test";
import { POST } from "./+server";
import { SESSION_COOKIE, TOKEN_COOKIE } from "$lib/server/session";

function fakeEvent(opts: { personal: boolean; user: { id: number } | null }) {
  const deleted: string[] = [];
  const event = {
    cookies: {
      get: () => "sid-123",
      delete: (name: string) => deleted.push(name),
    },
    locals: { personal: opts.personal, user: opts.user },
    platform: { env: {} },
    url: new URL("http://localhost/"),
  };
  return { event, deleted };
}

async function runLogout(event: unknown) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await POST({ ...(event as any) });
  } catch (e) {
    // redirect throw — status 303 to '/'
    expect((e as { status?: number }).status).toBe(303);
  }
}

describe("logout", () => {
  it("clears session and token cookies on logout", async () => {
    const { event, deleted } = fakeEvent({ personal: true, user: { id: 42 } });
    await runLogout(event);
    expect(deleted).toContain(SESSION_COOKIE);
    expect(deleted).toContain(TOKEN_COOKIE);
  });

  it("clears cookies for non-personal (OAuth) sessions too", async () => {
    const { event, deleted } = fakeEvent({ personal: false, user: { id: 42 } });
    await runLogout(event);
    expect(deleted).toContain(SESSION_COOKIE);
    expect(deleted).toContain(TOKEN_COOKIE);
  });
});
